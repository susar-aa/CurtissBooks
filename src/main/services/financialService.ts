import { getDatabase } from '../db';
import {
  FinancialYear,
  FinancialYearDetail,
  BudgetAllocationItem,
  ReusableCategory,
  ChartOfAccount,
  BudgetCategory,
  AnnualBudget,
  BudgetRevision,
  Fund,
  FundReceipt,
  BankAccount,
  BankTransaction,
  Expense,
  CashTransaction,
  PettyCashVoucher,
  JournalEntry,
  FinancialSummaryStats,
  FundCategory,
  FundUsageTrace,
  UnifiedCashBookTransaction,
  TransferAccountType,
  FundTransfer,
  AccountBalancesSummary,
  BudgetReallocation,
  ChequeRecord,
  ChequeAuditLog,
  ChequesSummary,
  ChequeFilters,
  BankReconciliationSession,
  BankStatementImport,
  BankStatementTransaction,
  BankReconciliationMatch,
  ReconciliationSummaryCalculation,
  OutstandingChequeItem,
  DepositInTransitItem,
  ReimbursementVoucherOption,
  ReimbursementReportData,
  ReimbursementCategoryBreakdown,
  PeriodicStatementMapping,
  PeriodicStatementReportData,
  PeriodicStatementRow,
  PeriodicStatementCalculation,
} from '../../shared/types/finance';
import { AuditService } from './auditService';
import { CryptoService } from './cryptoService';

export class FinancialService {
  // ========================================================
  // 1. FINANCIAL YEARS (SINGLE-WINDOW WORKFLOW & DRAFT/APPROVAL)
  // ========================================================
  public static getFinancialYears(): FinancialYear[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT fy.id, fy.year_name, fy.start_date, fy.end_date, fy.status, fy.is_current,
             fy.approved_by, u.full_name as approver_name, fy.approved_at, fy.approval_notes,
             COALESCE(alloc.total_budget_cents, 0) as total_budget_cents,
             fy.created_at, fy.updated_at
      FROM financial_years fy
      LEFT JOIN users u ON fy.approved_by = u.id
      LEFT JOIN (
        SELECT fa.financial_year_id, SUM(fa.allocated_amount_cents) as total_budget_cents
        FROM financial_year_budget_allocations fa
        GROUP BY fa.financial_year_id
      ) alloc ON fy.id = alloc.financial_year_id
      ORDER BY fy.start_date DESC
    `).all() as any[];

    return rows.map((r) => ({
      ...r,
      is_current: Boolean(r.is_current),
      total_budget_cents: Number(r.total_budget_cents || 0),
    }));
  }

  public static getFinancialYearDetail(yearId: number): FinancialYearDetail {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT fy.id, fy.year_name, fy.start_date, fy.end_date, fy.status, fy.is_current,
             fy.approved_by, u.full_name as approver_name, fy.approved_at, fy.approval_notes,
             COALESCE(alloc.total_budget_cents, 0) as total_budget_cents,
             COALESCE(spent_total.total_spent_cents, 0) as total_spent_cents,
             fy.created_at, fy.updated_at
      FROM financial_years fy
      LEFT JOIN users u ON fy.approved_by = u.id
      LEFT JOIN (
        SELECT fa.financial_year_id, SUM(fa.allocated_amount_cents) as total_budget_cents
        FROM financial_year_budget_allocations fa
        GROUP BY fa.financial_year_id
      ) alloc ON fy.id = alloc.financial_year_id
      LEFT JOIN (
        SELECT e.financial_year_id, SUM(e.amount_cents) as total_spent_cents
        FROM expenses e
        WHERE e.status IN ('approved', 'paid')
        GROUP BY e.financial_year_id
      ) spent_total ON fy.id = spent_total.financial_year_id
      WHERE fy.id = ?
    `).get(yearId) as any;

    if (!row) throw new Error('Financial year not found.');

    const allocations = db.prepare(`
      SELECT fa.id, fa.financial_year_id, fa.category_id,
             bc.category_code,
             COALESCE(bc.name, bc.name_en) as category_name,
             bc.name_si as category_name_si,
             bc.parent_id,
             p.category_code as parent_code,
             COALESCE(p.name, p.name_en) as parent_name,
             p.name_si as parent_name_si,
             fa.allocated_amount_cents,
             COALESCE(spent.total_spent_cents, 0) as spent_amount_cents,
             fa.notes
      FROM financial_year_budget_allocations fa
      INNER JOIN budget_categories bc ON fa.category_id = bc.id
      LEFT JOIN budget_categories p ON bc.parent_id = p.id
      LEFT JOIN (
        SELECT e.category_id, SUM(e.amount_cents) as total_spent_cents
        FROM expenses e
        WHERE e.financial_year_id = ? AND e.status IN ('approved', 'paid')
        GROUP BY e.category_id
      ) spent ON fa.category_id = spent.category_id
      WHERE fa.financial_year_id = ?
      ORDER BY COALESCE(p.category_code, bc.category_code, '') ASC, COALESCE(bc.category_code, '') ASC
    `).all(yearId, yearId) as any[];

    const totalBudgetCents = Number(row.total_budget_cents || 0);
    const totalSpentCents = Number(row.total_spent_cents || 0);

    return {
      ...row,
      is_current: Boolean(row.is_current),
      total_budget_cents: totalBudgetCents,
      total_spent_cents: totalSpentCents,
      total_remaining_cents: totalBudgetCents - totalSpentCents,
      allocations: allocations.map((a) => {
        const allocated = Number(a.allocated_amount_cents || 0);
        const spent = Number(a.spent_amount_cents || 0);
        return {
          id: a.id,
          financial_year_id: a.financial_year_id,
          category_id: a.category_id,
          category_code: a.category_code || '',
          category_name: a.category_name,
          category_name_si: a.category_name_si,
          parent_id: a.parent_id || null,
          parent_code: a.parent_code || null,
          parent_name: a.parent_name || null,
          parent_name_si: a.parent_name_si || null,
          allocated_amount_cents: allocated,
          spent_amount_cents: spent,
          remaining_amount_cents: allocated - spent,
          notes: a.notes || '',
        };
      }),
    };
  }

  public static saveFinancialYearDraft(data: {
    id?: number;
    year_name: string;
    start_date: string;
    end_date: string;
    allocations: Array<{ category_id: number; allocated_amount_cents: number; notes?: string }>;
  }, userId?: number): FinancialYearDetail {
    const db = getDatabase();
    const cleanName = data.year_name.trim();

    if (!cleanName) throw new Error('Financial year name is required.');
    if (!data.start_date || !data.end_date) throw new Error('Start date and end date are required.');
    if (new Date(data.start_date) > new Date(data.end_date)) {
      throw new Error('Start date cannot be after end date.');
    }

    // Duplicate category prevention within the same year
    const categoryIds = data.allocations.map((a) => a.category_id);
    const uniqueCatIds = new Set(categoryIds);
    if (uniqueCatIds.size !== categoryIds.length) {
      throw new Error('Duplicate budget categories found in allocation list.');
    }

    // Validate allocated amounts
    for (const alloc of data.allocations) {
      if (alloc.allocated_amount_cents < 0) {
        throw new Error('Allocated amount cannot be negative.');
      }
    }

    const runTx = db.transaction(() => {
      let targetId = data.id;

      if (targetId) {
        // Enforce lock if already approved
        const existing = db.prepare('SELECT id, status FROM financial_years WHERE id = ?').get(targetId) as any;
        if (!existing) throw new Error('Financial year not found.');
        if (existing.status === 'approved' || existing.status === 'locked') {
          throw new Error('Cannot modify an approved financial year. Budget is permanently locked.');
        }

        // Case-insensitive duplicate name check
        const duplicate = db.prepare('SELECT id FROM financial_years WHERE LOWER(year_name) = LOWER(?) AND id != ?').get(cleanName, targetId) as any;
        if (duplicate) throw new Error(`A financial year with name "${cleanName}" already exists.`);

        db.prepare(`
          UPDATE financial_years
          SET year_name = ?, start_date = ?, end_date = ?, status = 'draft', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cleanName, data.start_date, data.end_date, targetId);
      } else {
        // Case-insensitive duplicate name check
        const duplicate = db.prepare('SELECT id FROM financial_years WHERE LOWER(year_name) = LOWER(?)').get(cleanName) as any;
        if (duplicate) throw new Error(`A financial year with name "${cleanName}" already exists.`);

        const insertYear = db.prepare(`
          INSERT INTO financial_years (year_name, start_date, end_date, status, is_current, updated_at)
          VALUES (?, ?, ?, 'draft', 0, CURRENT_TIMESTAMP)
        `).run(cleanName, data.start_date, data.end_date);
        targetId = Number(insertYear.lastInsertRowid);
      }

      // Upsert allocations into financial_year_budget_allocations
      db.prepare('DELETE FROM financial_year_budget_allocations WHERE financial_year_id = ?').run(targetId);
      const insertAlloc = db.prepare(`
        INSERT INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents, notes, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      // Keep annual_budgets synchronized for backward compatibility and reporting
      db.prepare('DELETE FROM annual_budgets WHERE financial_year_id = ?').run(targetId);
      const insertAnnual = db.prepare(`
        INSERT INTO annual_budgets (financial_year_id, category_id, approved_amount_cents, revised_amount_cents, status, notes, updated_at)
        VALUES (?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)
      `);

      // Identify which categories have child allocations in this draft
      const parentIdsWithChildren = new Set<number>();
      for (const alloc of data.allocations) {
        const cat = db.prepare('SELECT parent_id FROM budget_categories WHERE id = ?').get(alloc.category_id) as any;
        if (cat && cat.parent_id) {
          parentIdsWithChildren.add(cat.parent_id);
        }
      }

      for (const alloc of data.allocations) {
        // If this category is a parent of other allocated categories in this year,
        // its budget is derived from its children, so store 0 in the table to prevent double-counting
        const isParentOfChildren = parentIdsWithChildren.has(alloc.category_id);
        const effectiveAmount = isParentOfChildren ? 0 : alloc.allocated_amount_cents;

        insertAlloc.run(targetId, alloc.category_id, effectiveAmount, alloc.notes || null);
        insertAnnual.run(targetId, alloc.category_id, effectiveAmount, effectiveAmount, alloc.notes || null);
      }

      AuditService.logAuthEvent(
        userId || null,
        'system',
        'FINANCIAL_YEAR_DRAFT_SAVED',
        `financial_years:${targetId}`,
        'success',
        `Saved draft for financial year ${cleanName} with ${data.allocations.length} category allocations.`
      );

      return targetId;
    });

    const savedId = runTx();
    return this.getFinancialYearDetail(savedId);
  }

  public static approveFinancialYear(yearId: number, userId?: number, notes?: string): FinancialYearDetail {
    const db = getDatabase();
    const existing = db.prepare('SELECT id, year_name, status FROM financial_years WHERE id = ?').get(yearId) as any;
    if (!existing) throw new Error('Financial year not found.');
    if (existing.status === 'approved' || existing.status === 'locked') {
      throw new Error('Financial year is already approved.');
    }

    const allocCount = db.prepare(`
      SELECT COUNT(*) as count, SUM(allocated_amount_cents) as total_cents
      FROM financial_year_budget_allocations
      WHERE financial_year_id = ?
    `).get(yearId) as any;

    if (!allocCount || allocCount.count === 0) {
      throw new Error('Cannot approve a financial year without any budget allocations. Please add at least one category.');
    }

    if (Number(allocCount.total_cents || 0) <= 0) {
      throw new Error('Cannot approve a financial year with a total budget of zero. Please allocate budget amounts to the subcategories.');
    }

    const runTx = db.transaction(() => {
      let validUserId: number | null = null;
      if (userId) {
        const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (userExists) validUserId = userId;
      }

      // Guarantee only one financial year runs at a time: set this approved year as current
      db.prepare('UPDATE financial_years SET is_current = 0').run();

      db.prepare(`
        UPDATE financial_years
        SET status = 'approved', is_current = 1, approved_by = ?, approved_at = CURRENT_TIMESTAMP, approval_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(validUserId, notes || null, yearId);

      db.prepare(`
        UPDATE annual_budgets
        SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE financial_year_id = ?
      `).run(validUserId, yearId);

      const totalFormatted = (Number(allocCount.total_cents || 0) / 100).toFixed(2);
      AuditService.logAuthEvent(
        userId || null,
        'system',
        'FINANCIAL_YEAR_APPROVED',
        `financial_years:${yearId}`,
        'success',
        `Approved financial year ${existing.year_name}. Total locked budget: Rs. ${totalFormatted}`
      );
    });

    runTx();
    return this.getFinancialYearDetail(yearId);
  }

  public static getCurrentFinancialYear(): FinancialYear | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT fy.id, fy.year_name, fy.start_date, fy.end_date, fy.status, fy.is_current, fy.created_at, fy.updated_at
      FROM financial_years fy
      WHERE fy.is_current = 1
      LIMIT 1
    `).get() as any;

    if (!row) return null;
    return {
      ...row,
      is_current: true,
    };
  }

  public static createFinancialYear(data: {
    year_name: string;
    start_date: string;
    end_date: string;
    is_current?: boolean;
  }, userId?: number): FinancialYear {
    const db = getDatabase();
    const cleanName = data.year_name.trim();

    if (!cleanName) throw new Error('Year name is required.');
    if (!data.start_date || !data.end_date) throw new Error('Start and end dates are required.');

    const runTx = db.transaction(() => {
      if (data.is_current) {
        db.prepare('UPDATE financial_years SET is_current = 0').run();
      }

      const stmt = db.prepare(`
        INSERT INTO financial_years (year_name, start_date, end_date, status, is_current, updated_at)
        VALUES (?, ?, ?, 'open', ?, CURRENT_TIMESTAMP)
      `);
      const result = stmt.run(cleanName, data.start_date, data.end_date, data.is_current ? 1 : 0);
      const yearId = Number(result.lastInsertRowid);

      AuditService.logAuthEvent(userId || null, 'system', 'FINANCIAL_YEAR_CREATED', `financial_years:${yearId}`, 'success', `Created financial year ${cleanName}`);

      return {
        id: yearId,
        year_name: cleanName,
        start_date: data.start_date,
        end_date: data.end_date,
        status: 'open' as const,
        is_current: Boolean(data.is_current),
      };
    });

    return runTx();
  }

  public static setCurrentFinancialYear(yearId: number, userId?: number): void {
    const db = getDatabase();
    const runTx = db.transaction(() => {
      db.prepare('UPDATE financial_years SET is_current = 0').run();
      const res = db.prepare('UPDATE financial_years SET is_current = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(yearId);
      if (res.changes === 0) throw new Error('Financial year not found.');

      AuditService.logAuthEvent(userId || null, 'system', 'FINANCIAL_YEAR_SET_CURRENT', `financial_years:${yearId}`, 'success');
    });
    runTx();
  }

  public static closeFinancialYear(data: {
    yearId: number;
    adminUsername: string;
    adminPassword: string;
  }, userId?: number): void {
    const db = getDatabase();
    const fy = db.prepare('SELECT id, year_name, status, is_current FROM financial_years WHERE id = ?').get(data.yearId) as any;
    if (!fy) throw new Error('Financial year not found.');
    if (fy.status === 'closed') throw new Error(`Financial year "${fy.year_name}" is already closed.`);

    if (!data.adminUsername || !data.adminPassword) {
      throw new Error('Administrator username and password are required to end a financial year.');
    }

    const cleanUser = data.adminUsername.trim().toLowerCase();
    const userRow = db.prepare(`
      SELECT u.id, u.username, u.password_hash, u.role_id, u.status, r.role_key
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE u.username = ?
    `).get(cleanUser) as any;

    if (!userRow) {
      AuditService.logAuthEvent(null, cleanUser, 'FINANCIAL_YEAR_CLOSE_FAILED', `financial_years:${data.yearId}`, 'failure', 'User not found');
      throw new Error('Invalid administrator credentials.');
    }

    if (userRow.status !== 'active') {
      AuditService.logAuthEvent(userRow.id, cleanUser, 'FINANCIAL_YEAR_CLOSE_FAILED', `financial_years:${data.yearId}`, 'failure', 'User account not active');
      throw new Error('This administrator account is inactive or locked.');
    }

    if (userRow.role_id !== 1 && userRow.role_key !== 'admin') {
      AuditService.logAuthEvent(userRow.id, cleanUser, 'FINANCIAL_YEAR_CLOSE_FAILED', `financial_years:${data.yearId}`, 'failure', 'Insufficient role permissions');
      throw new Error('Insufficient permissions. Only an administrator can end a financial year.');
    }

    const isValid = CryptoService.verifyPassword(data.adminPassword, userRow.password_hash);
    if (!isValid) {
      AuditService.logAuthEvent(userRow.id, cleanUser, 'FINANCIAL_YEAR_CLOSE_FAILED', `financial_years:${data.yearId}`, 'failure', 'Incorrect password');
      throw new Error('Invalid administrator password.');
    }

    const runTx = db.transaction(() => {
      db.prepare("UPDATE financial_years SET status = 'closed', is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(data.yearId);
      AuditService.logAuthEvent(userRow.id, cleanUser, 'FINANCIAL_YEAR_CLOSED', `financial_years:${data.yearId}`, 'success', `Financial year ${fy.year_name} closed and locked by admin ${cleanUser}`);
    });

    runTx();
  }

  // ========================================================
  // BUDGET REALLOCATION / TRANSFER BETWEEN CATEGORIES
  // ========================================================
  public static transferBudget(data: {
    financial_year_id: number;
    source_category_id: number;
    destination_category_id: number;
    amount_cents: number;
    reason: string;
  }, userId?: number): {
    reallocation: BudgetReallocation;
    sourceAllocation: BudgetAllocationItem;
    destinationAllocation: BudgetAllocationItem;
  } {
    const db = getDatabase();

    const cleanReason = (data.reason || '').trim();
    if (!cleanReason) throw new Error('A reason or justification is required for budget reallocation.');
    if (data.amount_cents <= 0) throw new Error('Transfer amount must be greater than zero.');
    if (data.source_category_id === data.destination_category_id) {
      throw new Error('Source and destination categories must be different.');
    }

    // 1. Verify Financial Year
    const fy = db.prepare('SELECT id, year_name, status FROM financial_years WHERE id = ?').get(data.financial_year_id) as any;
    if (!fy) throw new Error('Financial year not found.');
    if (fy.status === 'closed') throw new Error('Cannot transfer budget within a closed financial year.');

    // 2. Validate categories (must be leaf subcategories)
    const srcCat = db.prepare('SELECT id, category_code, name, name_en, name_si, parent_id FROM budget_categories WHERE id = ?').get(data.source_category_id) as any;
    if (!srcCat) throw new Error('Source budget category not found.');
    const srcChildCount = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE parent_id = ?').get(data.source_category_id) as any;
    if (srcChildCount && srcChildCount.count > 0) {
      throw new Error(`Cannot transfer from parent category "${srcCat.name || srcCat.name_en}". Please select a subcategory.`);
    }

    const destCat = db.prepare('SELECT id, category_code, name, name_en, name_si, parent_id FROM budget_categories WHERE id = ?').get(data.destination_category_id) as any;
    if (!destCat) throw new Error('Destination budget category not found.');
    const destChildCount = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE parent_id = ?').get(data.destination_category_id) as any;
    if (destChildCount && destChildCount.count > 0) {
      throw new Error(`Cannot transfer into parent category "${destCat.name || destCat.name_en}". Please select a subcategory.`);
    }

    // 3. Check source allocation & available remaining budget
    const srcAlloc = db.prepare(`
      SELECT id, allocated_amount_cents
      FROM financial_year_budget_allocations
      WHERE financial_year_id = ? AND category_id = ?
    `).get(data.financial_year_id, data.source_category_id) as any;
    if (!srcAlloc) throw new Error(`Source category "${srcCat.name || srcCat.name_en}" is not allocated to this financial year.`);

    const srcSpentRow = db.prepare(`
      SELECT SUM(amount_cents) as total_spent
      FROM expenses
      WHERE financial_year_id = ? AND category_id = ? AND status IN ('approved', 'paid')
    `).get(data.financial_year_id, data.source_category_id) as any;
    const srcSpentCents = Number(srcSpentRow?.total_spent || 0);
    const srcAvailableRemaining = Number(srcAlloc.allocated_amount_cents) - srcSpentCents;

    if (data.amount_cents > srcAvailableRemaining) {
      throw new Error(
        `Transfer amount (Rs. ${(data.amount_cents / 100).toFixed(2)}) exceeds available remaining budget (Rs. ${(srcAvailableRemaining / 100).toFixed(2)}) of category "${srcCat.name || srcCat.name_en}".`
      );
    }

    // 4. Check destination allocation
    const destAlloc = db.prepare(`
      SELECT id, allocated_amount_cents
      FROM financial_year_budget_allocations
      WHERE financial_year_id = ? AND category_id = ?
    `).get(data.financial_year_id, data.destination_category_id) as any;
    if (!destAlloc) throw new Error(`Destination category "${destCat.name || destCat.name_en}" is not allocated to this financial year.`);

    // 5. Atomic transaction execution
    const runTx = db.transaction(() => {
      // Generate unique sequential reference: BRE-YYYY-XXXXX
      const year = new Date().getFullYear();
      const prefix = `BRE-${year}-`;
      const lastRow = db.prepare('SELECT reallocation_no FROM budget_reallocations WHERE reallocation_no LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`) as any;
      let nextSeq = 1;
      if (lastRow && lastRow.reallocation_no) {
        const parts = lastRow.reallocation_no.split('-');
        const parsed = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      let reallocNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      while (db.prepare('SELECT id FROM budget_reallocations WHERE reallocation_no = ?').get(reallocNo)) {
        nextSeq++;
        reallocNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      }

      // Update source allocation (deduct)
      const newSrcCents = Number(srcAlloc.allocated_amount_cents) - data.amount_cents;
      db.prepare(`
        UPDATE financial_year_budget_allocations
        SET allocated_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newSrcCents, srcAlloc.id);

      // Update destination allocation (add)
      const newDestCents = Number(destAlloc.allocated_amount_cents) + data.amount_cents;
      db.prepare(`
        UPDATE financial_year_budget_allocations
        SET allocated_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newDestCents, destAlloc.id);

      // Insert record into budget_reallocations
      const insertStmt = db.prepare(`
        INSERT INTO budget_reallocations (
          reallocation_no, financial_year_id, source_category_id, destination_category_id,
          amount_cents, reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const res = insertStmt.run(
        reallocNo,
        data.financial_year_id,
        data.source_category_id,
        data.destination_category_id,
        data.amount_cents,
        cleanReason,
        userId || null
      );
      const reallocId = Number(res.lastInsertRowid);

      // Audit log
      AuditService.logAuthEvent(
        userId || null,
        'system',
        'BUDGET_REALLOCATION',
        `budget_reallocations:${reallocId}`,
        'success',
        `Reallocated Rs. ${(data.amount_cents / 100).toFixed(2)} from ${srcCat.category_code} to ${destCat.category_code} [${reallocNo}]: ${cleanReason}`
      );

      return {
        id: reallocId,
        reallocation_no: reallocNo,
        financial_year_id: data.financial_year_id,
        source_category_id: data.source_category_id,
        source_category_code: srcCat.category_code,
        source_category_name: srcCat.name || srcCat.name_en,
        source_category_name_si: srcCat.name_si,
        destination_category_id: data.destination_category_id,
        destination_category_code: destCat.category_code,
        destination_category_name: destCat.name || destCat.name_en,
        destination_category_name_si: destCat.name_si,
        amount_cents: data.amount_cents,
        reason: cleanReason,
        created_by: userId || null,
        created_at: new Date().toISOString(),
      };
    });

    const result = runTx();

    return {
      reallocation: result,
      sourceAllocation: {
        category_id: data.source_category_id,
        category_code: srcCat.category_code,
        category_name: srcCat.name || srcCat.name_en,
        category_name_si: srcCat.name_si,
        allocated_amount_cents: Number(srcAlloc.allocated_amount_cents) - data.amount_cents,
      },
      destinationAllocation: {
        category_id: data.destination_category_id,
        category_code: destCat.category_code,
        category_name: destCat.name || destCat.name_en,
        category_name_si: destCat.name_si,
        allocated_amount_cents: Number(destAlloc.allocated_amount_cents) + data.amount_cents,
      },
    };
  }

  public static getBudgetReallocations(financialYearId: number): BudgetReallocation[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT br.id, br.reallocation_no, br.financial_year_id,
             br.source_category_id, sc.category_code as source_category_code,
             COALESCE(sc.name, sc.name_en) as source_category_name, sc.name_si as source_category_name_si,
             br.destination_category_id, dc.category_code as destination_category_code,
             COALESCE(dc.name, dc.name_en) as destination_category_name, dc.name_si as destination_category_name_si,
             br.amount_cents, br.reason, br.created_by, u.full_name as creator_name, br.created_at
      FROM budget_reallocations br
      INNER JOIN budget_categories sc ON br.source_category_id = sc.id
      INNER JOIN budget_categories dc ON br.destination_category_id = dc.id
      LEFT JOIN users u ON br.created_by = u.id
      WHERE br.financial_year_id = ?
      ORDER BY br.id DESC
    `).all(financialYearId) as any[];

    return rows.map((r) => ({
      id: r.id,
      reallocation_no: r.reallocation_no,
      financial_year_id: r.financial_year_id,
      source_category_id: r.source_category_id,
      source_category_code: r.source_category_code || '',
      source_category_name: r.source_category_name,
      source_category_name_si: r.source_category_name_si || undefined,
      destination_category_id: r.destination_category_id,
      destination_category_code: r.destination_category_code || '',
      destination_category_name: r.destination_category_name,
      destination_category_name_si: r.destination_category_name_si || undefined,
      amount_cents: Number(r.amount_cents),
      reason: r.reason,
      created_by: r.created_by,
      creator_name: r.creator_name,
      created_at: r.created_at,
    }));
  }

  // ========================================================
  // 2. CHART OF ACCOUNTS
  // ========================================================
  public static getChartOfAccounts(): ChartOfAccount[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT coa.id, coa.account_code, coa.account_name_en, coa.account_name_si, coa.account_type,
             coa.parent_id, coa.is_system, coa.is_active
      FROM chart_of_accounts coa
      ORDER BY coa.account_code ASC
    `).all() as any[];

    return rows.map((r) => ({
      ...r,
      is_system: Boolean(r.is_system),
      is_active: Boolean(r.is_active),
    }));
  }

  // ========================================================
  // 3. BUDGET CATEGORIES & ANNUAL BUDGET
  // ========================================================
  public static getBudgetCategories(financialYearId?: number): BudgetCategory[] {
    const db = getDatabase();
    let activeYearId = financialYearId;
    if (!activeYearId) {
      const currentYear = this.getCurrentFinancialYear();
      activeYearId = currentYear ? currentYear.id : undefined;
    }

    if (!activeYearId) {
      return [];
    }

    // Explicit INNER JOIN with financial_year_budget_allocations to strictly return
    // only the active categories allocated to this specific financial year.
    const rows = db.prepare(`
      SELECT bc.id, bc.category_code, COALESCE(bc.name, bc.name_en) as name_en, bc.name_si, bc.parent_id, bc.description, bc.is_active,
             p.category_code as parent_code, COALESCE(p.name, p.name_en) as parent_name_en, p.name_si as parent_name_si,
             fa.allocated_amount_cents as approved_amount_cents,
             fa.allocated_amount_cents as revised_amount_cents,
             COALESCE(spent.total_spent, 0) as spent_amount_cents
      FROM financial_year_budget_allocations fa
      INNER JOIN budget_categories bc ON fa.category_id = bc.id
      LEFT JOIN budget_categories p ON bc.parent_id = p.id
      LEFT JOIN (
        SELECT e.category_id, SUM(e.amount_cents) as total_spent
        FROM expenses e
        WHERE e.financial_year_id = ? AND e.status IN ('approved', 'paid')
        GROUP BY e.category_id
      ) spent ON bc.id = spent.category_id
      WHERE fa.financial_year_id = ? AND bc.is_active = 1
      ORDER BY bc.category_code ASC
    `).all(activeYearId, activeYearId) as any[];

    return rows.map((r) => ({
      id: r.id,
      category_code: r.category_code,
      name_en: r.name_en,
      name_si: r.name_si,
      parent_id: r.parent_id,
      parent_code: r.parent_code,
      parent_name_en: r.parent_name_en,
      parent_name_si: r.parent_name_si,
      description: r.description,
      is_active: Boolean(r.is_active),
      approved_amount_cents: Number(r.approved_amount_cents),
      revised_amount_cents: Number(r.revised_amount_cents),
      spent_amount_cents: Number(r.spent_amount_cents),
    }));
  }

  // ========================================================
  // REUSABLE CENTRAL CATEGORIES (PREVENT DUPLICATES, QUICK-CREATE)
  // ========================================================
  public static getReusableCategories(searchQuery?: string, activeOnly: boolean = false): ReusableCategory[] {
    const db = getDatabase();
    const cleanSearch = (searchQuery || '').trim();

    let sql = `
      SELECT bc.id, COALESCE(bc.name, bc.name_en) as name, bc.name_en, bc.name_si,
             bc.category_code, bc.parent_id, bc.description, bc.is_active, bc.created_at,
             p.category_code as parent_code,
             COALESCE(p.name, p.name_en) as parent_name,
             p.name_si as parent_name_si,
             (SELECT COUNT(*) FROM budget_categories children WHERE children.parent_id = bc.id) as child_count
      FROM budget_categories bc
      LEFT JOIN budget_categories p ON bc.parent_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (activeOnly) {
      sql += ' AND bc.is_active = 1';
    }

    if (cleanSearch) {
      // Index-optimized prefix matching (avoiding leading wildcards per guidelines)
      sql += ` AND (bc.name LIKE ? COLLATE NOCASE OR bc.name_si LIKE ? OR bc.name_en LIKE ? COLLATE NOCASE OR bc.category_code LIKE ? COLLATE NOCASE)`;
      params.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`);
    }

    sql += " ORDER BY COALESCE(p.category_code, bc.category_code, '') ASC, bc.category_code ASC LIMIT 100";

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      name_en: r.name_en,
      name_si: r.name_si,
      category_code: r.category_code,
      parent_id: r.parent_id || null,
      parent_code: r.parent_code || null,
      parent_name: r.parent_name || null,
      parent_name_si: r.parent_name_si || null,
      is_parent: Number(r.child_count || 0) > 0 || r.parent_id === null,
      description: r.description,
      is_active: Boolean(r.is_active),
      created_at: r.created_at,
    }));
  }

  public static suggestCategoryCode(parentId?: number | null): string {
    const db = getDatabase();
    if (parentId !== null && parentId !== undefined) {
      // Subcategory numbering under parent: e.g. 1.1, 1.2
      const parentRow = db.prepare('SELECT id, category_code FROM budget_categories WHERE id = ?').get(parentId) as any;
      const parentCode = parentRow?.category_code || String(parentId);
      const numMatch = parentCode.match(/\d+/);
      const parentNum = numMatch ? parseInt(numMatch[0], 10) : parentId;

      const childCountRow = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE parent_id = ?').get(parentId) as any;
      let seq = (childCountRow?.count || 0) + 1;
      let nextCode = `${parentNum}.${seq}`;
      while (db.prepare('SELECT id FROM budget_categories WHERE LOWER(category_code) = LOWER(?)').get(nextCode)) {
        seq++;
        nextCode = `${parentNum}.${seq}`;
      }
      return nextCode;
    } else {
      // Main category: e.g. Rex 01, Rex 02 (using configurable prefix)
      const prefixRow = db.prepare("SELECT value FROM application_settings WHERE key = 'budget_category_prefix'").get() as any;
      const prefix = prefixRow?.value || 'Rex ';
      const mainCountRow = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE parent_id IS NULL AND category_code LIKE ?').get(`${prefix}%`) as any;
      let mainSeq = (mainCountRow?.count || 0) + 1;
      let nextCode = `${prefix}${String(mainSeq).padStart(2, '0')}`;
      while (db.prepare('SELECT id FROM budget_categories WHERE LOWER(category_code) = LOWER(?)').get(nextCode)) {
        mainSeq++;
        nextCode = `${prefix}${String(mainSeq).padStart(2, '0')}`;
      }
      return nextCode;
    }
  }

  public static updateCategory(
    id: number,
    data: {
      category_code?: string;
      name?: string;
      name_en?: string;
      name_si?: string;
      description?: string;
      is_active?: boolean;
    },
    userId?: number
  ): ReusableCategory {
    const db = getDatabase();
    const existing = db.prepare('SELECT id, parent_id, category_code, name, name_en, name_si, description, is_active FROM budget_categories WHERE id = ?').get(id) as any;
    if (!existing) throw new Error('Category not found.');

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (data.category_code !== undefined) {
      const cleanCode = data.category_code.trim();
      if (!cleanCode) throw new Error('Category code cannot be empty.');

      const dup = db.prepare('SELECT id, name, name_en FROM budget_categories WHERE category_code = ? AND id != ?').get(cleanCode, id) as any;
      if (dup) {
        throw new Error(`Category code "${cleanCode}" is already in use by "${dup.name || dup.name_en}".`);
      }
      updates.push('category_code = ?');
      params.push(cleanCode);
    }

    if (data.name !== undefined || data.name_en !== undefined) {
      const cleanName = (data.name || data.name_en || '').trim();
      if (!cleanName) throw new Error('Category name cannot be empty.');

      let dupSql = 'SELECT id FROM budget_categories WHERE LOWER(COALESCE(name, name_en)) = LOWER(?) AND id != ?';
      const dupParams: any[] = [cleanName, id];
      if (existing.parent_id !== null) {
        dupSql += ' AND parent_id = ?';
        dupParams.push(existing.parent_id);
      } else {
        dupSql += ' AND parent_id IS NULL';
      }
      const dup = db.prepare(dupSql).get(...dupParams);
      if (dup) {
        throw new Error(`A category with name "${cleanName}" already exists in this scope.`);
      }

      updates.push('name = ?', 'name_en = ?');
      params.push(cleanName, cleanName);
    }

    if (data.name_si !== undefined) {
      updates.push('name_si = ?');
      params.push(data.name_si.trim());
    }

    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description.trim() || null);
    }

    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }

    params.push(id);
    db.prepare(`UPDATE budget_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    AuditService.logAuthEvent(
      userId || null,
      'system',
      'BUDGET_CATEGORY_UPDATED',
      `budget_categories:${id}`,
      'success',
      `Updated category #${id}`
    );

    const updated = db.prepare(`
      SELECT bc.id, COALESCE(bc.name, bc.name_en) as name, bc.name_en, bc.name_si,
             bc.category_code, bc.parent_id, bc.description, bc.is_active,
             p.category_code as parent_code,
             COALESCE(p.name, p.name_en) as parent_name,
             p.name_si as parent_name_si
      FROM budget_categories bc
      LEFT JOIN budget_categories p ON bc.parent_id = p.id
      WHERE bc.id = ?
    `).get(id) as any;

    return {
      ...updated,
      is_parent: updated.parent_id === null,
      is_active: Boolean(updated.is_active),
    };
  }

  public static quickCreateCategory(
    name: string,
    name_si?: string,
    parentIdOrUserId?: number | null,
    userId?: number,
    customCode?: string
  ): ReusableCategory {
    const db = getDatabase();
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Category name cannot be empty.');

    // Determine parentId vs userId
    let parentId: number | null = null;
    let effectiveUserId: number | undefined = userId;

    if (typeof parentIdOrUserId === 'number') {
      const parentCandidate = db.prepare('SELECT id, parent_id, category_code, name, name_en FROM budget_categories WHERE id = ?').get(parentIdOrUserId) as any;
      if (parentCandidate && parentCandidate.parent_id === null && userId !== undefined) {
        parentId = parentCandidate.id;
      } else if (parentCandidate && parentCandidate.parent_id === null && userId === undefined) {
        parentId = parentCandidate.id;
      } else {
        effectiveUserId = parentIdOrUserId;
      }
    }

    // Case-insensitive duplicate check within same parent scope
    let dupSql = `
      SELECT bc.id, COALESCE(bc.name, bc.name_en) as name
      FROM budget_categories bc
      WHERE LOWER(COALESCE(bc.name, bc.name_en)) = LOWER(?)
    `;
    const dupParams: any[] = [cleanName];
    if (parentId !== null) {
      dupSql += ' AND bc.parent_id = ?';
      dupParams.push(parentId);
    }
    dupSql += ' LIMIT 1';
    const existing = db.prepare(dupSql).get(...dupParams) as any;
    if (existing) {
      throw new Error(`A category with name "${cleanName}" already exists.`);
    }

    const runTx = db.transaction(() => {
      let nextCode = (customCode || '').trim();

      if (!nextCode) {
        nextCode = FinancialService.suggestCategoryCode(parentId);
      } else {
        const dup = db.prepare('SELECT id, name, name_en FROM budget_categories WHERE category_code = ?').get(nextCode) as any;
        if (dup) {
          throw new Error(`Category code "${nextCode}" is already in use by "${dup.name || dup.name_en}".`);
        }
      }

      const siName = (name_si || '').trim() || cleanName;
      const stmt = db.prepare(`
        INSERT INTO budget_categories (category_code, name, name_en, name_si, parent_id, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `);
      const result = stmt.run(nextCode, cleanName, cleanName, siName, parentId);
      const catId = Number(result.lastInsertRowid);

      AuditService.logAuthEvent(
        effectiveUserId || null,
        'system',
        'BUDGET_CATEGORY_CREATED',
        `budget_categories:${catId}`,
        'success',
        `Created category ${nextCode} - ${cleanName}`
      );

      const parentInfo = parentId ? db.prepare('SELECT category_code, name, name_en FROM budget_categories WHERE id = ?').get(parentId) as any : null;

      return {
        id: catId,
        name: cleanName,
        name_en: cleanName,
        name_si: siName,
        category_code: nextCode,
        parent_id: parentId,
        parent_code: parentInfo?.category_code || null,
        parent_name: parentInfo ? (parentInfo.name || parentInfo.name_en) : null,
        is_parent: parentId === null,
        is_active: true,
      };
    });

    return runTx();
  }

  public static toggleCategoryStatus(id: number, isActive: boolean, userId?: number): void {
    const db = getDatabase();
    const res = db.prepare('UPDATE budget_categories SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(isActive ? 1 : 0, id);
    if (res.changes === 0) throw new Error('Budget category not found.');

    AuditService.logAuthEvent(
      userId || null,
      'system',
      'BUDGET_CATEGORY_STATUS_TOGGLED',
      `budget_categories:${id}`,
      'success',
      `Category status set to ${isActive ? 'active' : 'inactive'}`
    );
  }

  public static createBudgetCategory(data: {
    category_code: string;
    name_en: string;
    name_si: string;
    parent_id?: number | null;
    description?: string;
  }): BudgetCategory {
    const db = getDatabase();
    const code = data.category_code.trim();
    if (!code) throw new Error('Category code is required.');
    if (!data.name_en.trim()) throw new Error('English name is required.');
    if (!data.name_si.trim()) throw new Error('Sinhala name is required.');

    const stmt = db.prepare(`
      INSERT INTO budget_categories (category_code, name_en, name_si, parent_id, description, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const result = stmt.run(code, data.name_en.trim(), data.name_si.trim(), data.parent_id || null, data.description || null);

    return {
      id: Number(result.lastInsertRowid),
      category_code: code,
      name_en: data.name_en.trim(),
      name_si: data.name_si.trim(),
      parent_id: data.parent_id || null,
      is_active: true,
    };
  }

  public static saveAnnualBudgetAllocation(data: {
    financial_year_id: number;
    category_id: number;
    approved_amount_cents: number;
    notes?: string;
  }, userId?: number): AnnualBudget {
    const db = getDatabase();
    // Enforce lock if parent year is approved
    const fy = db.prepare('SELECT id, status FROM financial_years WHERE id = ?').get(data.financial_year_id) as any;
    if (fy && (fy.status === 'approved' || fy.status === 'locked')) {
      throw new Error('Cannot modify budget for an approved financial year. Budget is locked.');
    }

    const runTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO annual_budgets (financial_year_id, category_id, approved_amount_cents, revised_amount_cents, status, notes, updated_at)
        VALUES (?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(financial_year_id, category_id) DO UPDATE SET
          approved_amount_cents = excluded.approved_amount_cents,
          revised_amount_cents = excluded.approved_amount_cents,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(data.financial_year_id, data.category_id, data.approved_amount_cents, data.approved_amount_cents, data.notes || null);

      // Keep financial_year_budget_allocations synchronized
      db.prepare(`
        INSERT INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents, notes, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(financial_year_id, category_id) DO UPDATE SET
          allocated_amount_cents = excluded.allocated_amount_cents,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `).run(data.financial_year_id, data.category_id, data.approved_amount_cents, data.notes || null);

      AuditService.logAuthEvent(userId || null, 'system', 'BUDGET_ALLOCATION_SAVED', `annual_budgets:${data.financial_year_id}:${data.category_id}`, 'success');

      return this.getAnnualBudgetByCategory(data.financial_year_id, data.category_id);
    });

    return runTx();
  }

  public static approveAnnualBudget(financialYearId: number, userId?: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE annual_budgets
      SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE financial_year_id = ?
    `).run(userId || null, financialYearId);

    AuditService.logAuthEvent(userId || null, 'system', 'BUDGET_APPROVED', `financial_years:${financialYearId}`, 'success', 'Annual budget approved and locked');
  }

  public static reviseBudgetAmount(data: {
    budget_id: number;
    new_amount_cents: number;
    reason: string;
  }, userId?: number): void {
    const db = getDatabase();
    const cleanReason = data.reason.trim();
    if (!cleanReason) throw new Error('Revision reason is required.');

    const runTx = db.transaction(() => {
      const current = db.prepare('SELECT revised_amount_cents, status FROM annual_budgets WHERE id = ?').get(data.budget_id) as any;
      if (!current) throw new Error('Budget record not found.');

      db.prepare(`
        INSERT INTO budget_revisions (budget_id, previous_amount_cents, new_amount_cents, reason, authorized_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.budget_id, current.revised_amount_cents, data.new_amount_cents, cleanReason, userId || null);

      db.prepare(`
        UPDATE annual_budgets
        SET revised_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(data.new_amount_cents, data.budget_id);

      AuditService.logAuthEvent(userId || null, 'system', 'BUDGET_REVISED', `annual_budgets:${data.budget_id}`, 'success', cleanReason);
    });

    runTx();
  }

  private static getAnnualBudgetByCategory(yearId: number, categoryId: number): AnnualBudget {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT ab.id, ab.financial_year_id, ab.category_id, ab.approved_amount_cents, ab.revised_amount_cents,
             ab.status, ab.approved_by, ab.approved_at, ab.notes,
             bc.category_code, bc.name_en as category_name_en, bc.name_si as category_name_si,
             COALESCE(spent.total_spent, 0) as spent_amount_cents
      FROM annual_budgets ab
      INNER JOIN budget_categories bc ON ab.category_id = bc.id
      LEFT JOIN (
        SELECT e.category_id, SUM(e.amount_cents) as total_spent
        FROM expenses e
        WHERE e.financial_year_id = ? AND e.category_id = ? AND e.status IN ('approved', 'paid')
        GROUP BY e.category_id
      ) spent ON ab.category_id = spent.category_id
      WHERE ab.financial_year_id = ? AND ab.category_id = ?
    `).get(yearId, categoryId, yearId, categoryId) as any;

    if (!row) throw new Error('Budget record not found.');
    const remaining = Number(row.revised_amount_cents) - Number(row.spent_amount_cents);

    return {
      ...row,
      spent_amount_cents: Number(row.spent_amount_cents),
      remaining_cents: remaining,
    };
  }

  // ========================================================
  // 4. FUNDS, FUND CATEGORIES & RECEIPTS
  // ========================================================
  public static getFundCategories(): FundCategory[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT fc.id, fc.category_code, fc.name_en, fc.name_si, fc.description, fc.is_active, fc.created_at, fc.updated_at,
             COUNT(DISTINCT fr.id) as receipt_count,
             COALESCE(SUM(fr.amount_cents), 0) as total_received_cents
      FROM fund_categories fc
      LEFT JOIN fund_receipts fr ON fc.id = fr.fund_category_id AND fr.status = 'posted'
      GROUP BY fc.id
      ORDER BY fc.id ASC
    `).all() as any[];

    return rows.map((r) => {
      const rcptCents = Number(r.total_received_cents || 0);
      return {
        id: r.id,
        category_code: r.category_code,
        name_en: r.name_en,
        name_si: r.name_si,
        description: r.description,
        is_active: Boolean(r.is_active),
        receipt_count: Number(r.receipt_count || 0),
        fund_count: Number(r.receipt_count || 0),
        total_received_cents: rcptCents,
        total_spent_cents: 0,
        balance_cents: rcptCents,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  }

  public static createFundCategory(data: {
    category_code?: string;
    name_en: string;
    name_si: string;
    description?: string;
  }, userId?: number): FundCategory {
    const db = getDatabase();
    const cleanEn = (data.name_en || '').trim();
    const cleanSi = (data.name_si || '').trim() || cleanEn;
    if (!cleanEn) throw new Error('Fund category English name is required.');

    // Case-insensitive duplicate check
    const existing = db.prepare(`
      SELECT id FROM fund_categories
      WHERE LOWER(name_en) = LOWER(?)
      LIMIT 1
    `).get(cleanEn) as any;
    if (existing) {
      throw new Error(`A fund category with name "${cleanEn}" already exists.`);
    }

    let code = (data.category_code || '').trim();
    if (!code) {
      const countRow = db.prepare('SELECT COUNT(*) as count FROM fund_categories').get() as any;
      let seq = (countRow?.count || 0) + 1;
      code = `FCAT-${String(seq).padStart(3, '0')}`;
      while (db.prepare('SELECT id FROM fund_categories WHERE category_code = ?').get(code)) {
        seq++;
        code = `FCAT-${String(seq).padStart(3, '0')}`;
      }
    }

    const stmt = db.prepare(`
      INSERT INTO fund_categories (category_code, name_en, name_si, description, is_active, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `);
    const res = stmt.run(code, cleanEn, cleanSi, data.description?.trim() || null);
    const catId = Number(res.lastInsertRowid);

    AuditService.logAuthEvent(userId || null, 'system', 'FUND_CATEGORY_CREATED', `fund_categories:${catId}`, 'success', `Created fund category ${code} - ${cleanEn}`);

    return {
      id: catId,
      category_code: code,
      name_en: cleanEn,
      name_si: cleanSi,
      description: data.description?.trim() || null,
      is_active: true,
      fund_count: 0,
      total_received_cents: 0,
      total_spent_cents: 0,
      balance_cents: 0,
    };
  }

  public static updateFundCategory(id: number, data: {
    name_en?: string;
    name_si?: string;
    description?: string;
    is_active?: boolean;
  }, userId?: number): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM fund_categories WHERE id = ?').get(id) as any;
    if (!existing) throw new Error('Fund category not found.');

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (data.name_en !== undefined) {
      const clean = data.name_en.trim();
      if (!clean) throw new Error('Category name cannot be empty.');
      updates.push('name_en = ?');
      params.push(clean);
    }
    if (data.name_si !== undefined) {
      updates.push('name_si = ?');
      params.push(data.name_si.trim());
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description.trim() || null);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }

    params.push(id);
    db.prepare(`UPDATE fund_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    AuditService.logAuthEvent(userId || null, 'system', 'FUND_CATEGORY_UPDATED', `fund_categories:${id}`, 'success');
  }

  public static getFundTraces(fundId?: number, expenseId?: number): FundUsageTrace[] {
    const db = getDatabase();
    let sql = `
      SELECT fut.id, fut.fund_id, fut.expense_id, fut.amount_cents, fut.amount_cents as allocated_cents, fut.trace_date, fut.notes, fut.created_at,
             f.name_en as fund_name_en, f.fund_code,
             e.voucher_no, e.description as expense_description, e.payee, e.payment_method,
             bc.category_code, COALESCE(bc.name, bc.name_en) as category_name_en
      FROM fund_usage_traces fut
      INNER JOIN funds f ON fut.fund_id = f.id
      INNER JOIN expenses e ON fut.expense_id = e.id
      LEFT JOIN budget_categories bc ON e.category_id = bc.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (fundId) {
      sql += ' AND fut.fund_id = ?';
      params.push(fundId);
    }
    if (expenseId) {
      sql += ' AND fut.expense_id = ?';
      params.push(expenseId);
    }
    sql += ' ORDER BY fut.trace_date DESC, fut.id DESC';

    return db.prepare(sql).all(...params) as FundUsageTrace[];
  }

  public static getFunds(searchQuery?: string, categoryId?: number): Fund[] {
    const db = getDatabase();
    const cleanSearch = (searchQuery || '').trim();

    let sql = `
      SELECT f.id, f.fund_code, COALESCE(f.name, f.name_en) as name_en, f.name_si, f.source_type,
             f.fund_category_id, f.is_restricted, f.intended_purpose, f.intended_purpose as description, f.status,
             COALESCE(f.opening_balance_cents, 0) as opening_balance_cents,
             fc.category_code, fc.name_en as category_name_en,
             fc.name_en as fund_category_name_en, fc.name_si as fund_category_name_si,
             COALESCE(rcpt.total_rcpt, 0) as total_received_cents,
             COALESCE(spent.total_spent, 0) as total_spent_cents
      FROM funds f
      LEFT JOIN fund_categories fc ON f.fund_category_id = fc.id
      LEFT JOIN (
        SELECT fr.fund_id, SUM(fr.amount_cents) as total_rcpt
        FROM fund_receipts fr
        WHERE fr.status = 'posted'
        GROUP BY fr.fund_id
      ) rcpt ON f.id = rcpt.fund_id
      LEFT JOIN (
        SELECT fut.fund_id, SUM(fut.amount_cents) as total_spent
        FROM fund_usage_traces fut
        GROUP BY fut.fund_id
      ) spent ON f.id = spent.fund_id
      WHERE f.status = 'active'
    `;
    const params: any[] = [];

    if (categoryId) {
      sql += ' AND f.fund_category_id = ?';
      params.push(categoryId);
    }

    if (cleanSearch) {
      sql += ` AND (f.name LIKE ? COLLATE NOCASE OR f.name_en LIKE ? COLLATE NOCASE OR f.name_si LIKE ? OR f.fund_code LIKE ? COLLATE NOCASE)`;
      params.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`);
    }
    sql += ` ORDER BY f.fund_code ASC`;

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map((r) => {
      const openCents = Number(r.opening_balance_cents || 0);
      const rcptCents = Number(r.total_received_cents || 0);
      const spentCents = Number(r.total_spent_cents || 0);
      const balance = openCents + rcptCents - spentCents;
      return {
        ...r,
        name: r.name_en,
        fund_name: r.name_en,
        category_code: r.category_code,
        category_name_en: r.category_name_en,
        description: r.description,
        is_restricted: Boolean(r.is_restricted),
        opening_balance_cents: openCents,
        current_balance_cents: balance,
        total_received_cents: rcptCents,
        total_spent_cents: spentCents,
        balance_cents: balance,
      };
    });
  }

  public static quickCreateFundingCategory(name: string, name_si?: string, userId?: number): Fund {
    const db = getDatabase();
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Funding category name is required.');

    // Check case-insensitive duplicate
    const existing = db.prepare(`
      SELECT id, fund_code, COALESCE(name, name_en) as name_en, name_si
      FROM funds
      WHERE LOWER(COALESCE(name, name_en)) = LOWER(?)
      LIMIT 1
    `).get(cleanName) as any;

    if (existing) {
      throw new Error(`A funding category with name "${cleanName}" already exists.`);
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM funds').get() as { count: number };
    const nextNum = (countRow?.count || 0) + 1;
    const fundCode = `FCAT-${String(nextNum).padStart(3, '0')}`;

    const stmt = db.prepare(`
      INSERT INTO funds (fund_code, name, name_en, name_si, fund_category_id, source_type, is_restricted, status)
      VALUES (?, ?, ?, ?, 4, 'other', 0, 'active')
    `);
    const result = stmt.run(fundCode, cleanName, cleanName, (name_si || '').trim() || cleanName);
    const fundId = Number(result.lastInsertRowid);

    AuditService.logAuthEvent(userId || null, 'system', 'FUND_CATEGORY_CREATED', `funds:${fundId}`, 'success', `Created funding category ${cleanName}`);

    return {
      id: fundId,
      fund_code: fundCode,
      name_en: cleanName,
      name_si: (name_si || '').trim() || cleanName,
      fund_category_id: 4,
      source_type: 'other',
      is_restricted: false,
      intended_purpose: null,
      opening_balance_cents: 0,
      total_received_cents: 0,
      total_spent_cents: 0,
      balance_cents: 0,
      status: 'active',
    };
  }

  public static createFund(data: {
    fund_code?: string;
    fund_name?: string;
    name?: string;
    name_en?: string;
    name_si?: string;
    fund_category_id?: number | null;
    source_type?: Fund['source_type'];
    is_restricted?: boolean;
    intended_purpose?: string;
    description?: string;
    opening_balance_cents?: number;
  }, userId?: number): Fund {
    const db = getDatabase();
    const cleanEn = (data.name_en || data.fund_name || data.name || '').trim();
    if (!cleanEn) throw new Error('Fund name is required.');
    const cleanSi = (data.name_si || cleanEn).trim();

    let code = (data.fund_code || '').trim();
    if (!code) {
      const countRow = db.prepare('SELECT COUNT(*) as count FROM funds').get() as any;
      let seq = (countRow?.count || 0) + 1;
      code = `FND-${String(seq).padStart(3, '0')}`;
      while (db.prepare('SELECT id FROM funds WHERE fund_code = ?').get(code)) {
        seq++;
        code = `FND-${String(seq).padStart(3, '0')}`;
      }
    }

    const openCents = Number(data.opening_balance_cents || 0);
    const categoryId = data.fund_category_id || 4;
    const purpose = (data.intended_purpose || data.description || '').trim() || null;

    const stmt = db.prepare(`
      INSERT INTO funds (fund_code, name, name_en, name_si, fund_category_id, source_type, is_restricted, intended_purpose, opening_balance_cents, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    const result = stmt.run(
      code,
      cleanEn,
      cleanEn,
      cleanSi,
      categoryId,
      data.source_type || 'other',
      data.is_restricted ? 1 : 0,
      purpose,
      openCents
    );
    const fundId = Number(result.lastInsertRowid);

    AuditService.logAuthEvent(userId || null, 'system', 'FUND_CREATED', `funds:${fundId}`, 'success');

    return {
      id: fundId,
      fund_code: code,
      name: cleanEn,
      fund_name: cleanEn,
      name_en: cleanEn,
      name_si: cleanSi,
      fund_category_id: categoryId,
      source_type: data.source_type || 'other',
      is_restricted: Boolean(data.is_restricted),
      intended_purpose: purpose,
      opening_balance_cents: openCents,
      current_balance_cents: openCents,
      total_received_cents: 0,
      total_spent_cents: 0,
      balance_cents: openCents,
      status: 'active',
    };
  }

  public static getFundReceipts(limit = 50, offset = 0, financialYearId?: number, categoryId?: number, searchQuery?: string): { receipts: FundReceipt[]; total: number } {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;
    const cleanSearch = (searchQuery || '').trim();

    let countSql = `
      SELECT COUNT(*) as count
      FROM fund_receipts fr
      LEFT JOIN funds f ON fr.fund_id = f.id
      WHERE fr.financial_year_id = ?
    `;
    const countParams: any[] = [yearId];
    if (categoryId) {
      countSql += ' AND (fr.fund_category_id = ? OR f.fund_category_id = ?)';
      countParams.push(categoryId, categoryId);
    }
    if (cleanSearch) {
      countSql += ' AND (fr.receipt_no LIKE ? COLLATE NOCASE OR fr.donor_or_dept LIKE ? COLLATE NOCASE OR fr.reference_no LIKE ? COLLATE NOCASE OR fr.purpose LIKE ? COLLATE NOCASE)';
      countParams.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`);
    }
    const totalRow = db.prepare(countSql).get(...countParams) as { count: number };

    let querySql = `
      SELECT fr.id, fr.receipt_no, fr.financial_year_id, fr.fund_id,
             COALESCE(fr.fund_category_id, f.fund_category_id) as fund_category_id,
             fr.receipt_date, fr.donor_or_dept,
             fr.amount_cents, fr.payment_method, fr.destination_type, fr.bank_account_id, fr.reference_no,
             fr.purpose, fr.notes, fr.status, fr.created_by, fr.created_at,
             COALESCE(f.name_en, f.name, 'General Inflow') as fund_name_en,
             COALESCE(f.name_si, f.name, 'සාමාන්‍ය ලැබීම්') as fund_name_si,
             f.fund_code,
             fc.category_code as fund_category_code,
             COALESCE(fc.name_en, 'General') as fund_category_name_en,
             COALESCE(fc.name_si, 'සාමාන්‍ය') as fund_category_name_si,
             ba.bank_name
      FROM fund_receipts fr
      LEFT JOIN funds f ON fr.fund_id = f.id
      LEFT JOIN fund_categories fc ON COALESCE(fr.fund_category_id, f.fund_category_id) = fc.id
      LEFT JOIN bank_accounts ba ON fr.bank_account_id = ba.id
      WHERE fr.financial_year_id = ?
    `;
    const queryParams: any[] = [yearId];
    if (categoryId) {
      querySql += ' AND (fr.fund_category_id = ? OR f.fund_category_id = ?)';
      queryParams.push(categoryId, categoryId);
    }
    if (cleanSearch) {
      querySql += ' AND (fr.receipt_no LIKE ? COLLATE NOCASE OR fr.donor_or_dept LIKE ? COLLATE NOCASE OR fr.reference_no LIKE ? COLLATE NOCASE OR fr.purpose LIKE ? COLLATE NOCASE)';
      queryParams.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearch}%`);
    }
    querySql += ' ORDER BY fr.receipt_date DESC, fr.id DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const rows = db.prepare(querySql).all(...queryParams) as any[];

    return {
      receipts: rows,
      total: totalRow.count,
    };
  }

  public static getFundReceiptsSummary(financialYearId?: number): {
    total_cents: number;
    bank_cents: number;
    cash_cents: number;
    petty_cash_cents: number;
    total_count: number;
  } {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id;
    let sql = `
      SELECT
        COALESCE(SUM(amount_cents), 0) as total_cents,
        COALESCE(SUM(CASE WHEN destination_type = 'bank' THEN amount_cents ELSE 0 END), 0) as bank_cents,
        COALESCE(SUM(CASE WHEN destination_type = 'cash' THEN amount_cents ELSE 0 END), 0) as cash_cents,
        COALESCE(SUM(CASE WHEN destination_type = 'petty_cash' THEN amount_cents ELSE 0 END), 0) as petty_cash_cents,
        COUNT(id) as total_count
      FROM fund_receipts
      WHERE status = 'posted'
    `;
    const params: any[] = [];
    if (yearId) {
      sql += ' AND financial_year_id = ?';
      params.push(yearId);
    }
    const row = db.prepare(sql).get(...params) as any;
    return {
      total_cents: Number(row?.total_cents || 0),
      bank_cents: Number(row?.bank_cents || 0),
      cash_cents: Number(row?.cash_cents || 0),
      petty_cash_cents: Number(row?.petty_cash_cents || 0),
      total_count: Number(row?.total_count || 0),
    };
  }

  public static createFundReceipt(data: {
    financial_year_id: number;
    fund_id?: number | null;
    fund_category_id?: number | null;
    new_fund_name?: string;
    receipt_date: string;
    donor_or_dept: string;
    amount_cents: number;
    payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'direct_deposit' | 'other';
    destination_type: 'cash' | 'bank' | 'petty_cash';
    bank_account_id?: number | null;
    reference_no?: string;
    purpose?: string;
    notes?: string;
    cheque_number?: string;
    issuing_bank_name?: string;
    issuing_bank_branch?: string;
    cheque_date?: string;
    cheque_deposit_option?: 'deposit_now' | 'hold_in_hand';
  }, userId?: number): FundReceipt {
    const db = getDatabase();
    if (data.amount_cents <= 0) throw new Error('Receipt amount must be greater than zero.');
    if (!data.donor_or_dept.trim()) throw new Error('Donor or department name is required.');
    if (data.destination_type === 'petty_cash') {
      throw new Error('Cash donations and fund receipts cannot be deposited into Petty Cash. Inflow must go to Cash in Hand or Bank.');
    }
    if (data.payment_method === 'cash') {
      data.destination_type = 'cash';
    }
    if (data.destination_type === 'bank' && !data.bank_account_id) {
      data.bank_account_id = this.getDefaultBankAccount().id;
    }

    const fy = db.prepare('SELECT id, status FROM financial_years WHERE id = ?').get(data.financial_year_id) as any;
    if (!fy) throw new Error('Financial year not found.');
    if (fy.status === 'closed') throw new Error('Cannot record fund receipt in a closed financial year.');

    const runTx = db.transaction(() => {
      // 1. Resolve Target Fund and Fund Category
      let targetFundId = data.fund_id || null;
      let targetCategoryId = data.fund_category_id || null;

      if (!targetFundId && data.new_fund_name && data.new_fund_name.trim()) {
        const catId = targetCategoryId || 1;
        const countRow = db.prepare('SELECT COUNT(*) as count FROM funds').get() as any;
        let seq = (countRow?.count || 0) + 1;
        let fundCode = `FND-${String(seq).padStart(3, '0')}`;
        while (db.prepare('SELECT id FROM funds WHERE fund_code = ?').get(fundCode)) {
          seq++;
          fundCode = `FND-${String(seq).padStart(3, '0')}`;
        }
        const cleanName = data.new_fund_name.trim();
        const insFund = db.prepare(`
          INSERT INTO funds (fund_code, name, name_en, name_si, fund_category_id, source_type, is_restricted, opening_balance_cents, status)
          VALUES (?, ?, ?, ?, ?, 'other', 0, 0, 'active')
        `).run(fundCode, cleanName, cleanName, cleanName, catId);
        targetFundId = Number(insFund.lastInsertRowid);
        targetCategoryId = catId;
      } else if (!targetFundId && targetCategoryId) {
        // Look for existing active fund under this category
        const existingFund = db.prepare(`
          SELECT id, fund_category_id FROM funds
          WHERE fund_category_id = ? AND status = 'active'
          ORDER BY id ASC LIMIT 1
        `).get(targetCategoryId) as any;

        if (existingFund) {
          targetFundId = existingFund.id;
        } else {
          // Auto-create default fund for this category
          const cat = db.prepare('SELECT name_en, name_si FROM fund_categories WHERE id = ?').get(targetCategoryId) as any;
          const fundNameEn = cat ? `${cat.name_en} General Fund` : 'General Fund';
          const fundNameSi = cat ? `${cat.name_si} සාමාන්‍ය අරමුදල` : 'සාමාන්‍ය අරමුදල';
          const countRow = db.prepare('SELECT COUNT(*) as count FROM funds').get() as any;
          let seq = (countRow?.count || 0) + 1;
          let fundCode = `FND-${String(seq).padStart(3, '0')}`;
          while (db.prepare('SELECT id FROM funds WHERE fund_code = ?').get(fundCode)) {
            seq++;
            fundCode = `FND-${String(seq).padStart(3, '0')}`;
          }
          const insFund = db.prepare(`
            INSERT INTO funds (fund_code, name, name_en, name_si, fund_category_id, source_type, is_restricted, opening_balance_cents, status)
            VALUES (?, ?, ?, ?, ?, 'other', 0, 0, 'active')
          `).run(fundCode, fundNameEn, fundNameEn, fundNameSi, targetCategoryId);
          targetFundId = Number(insFund.lastInsertRowid);
        }
      } else if (targetFundId) {
        const existingFund = db.prepare('SELECT id, fund_category_id FROM funds WHERE id = ?').get(targetFundId) as any;
        if (!existingFund) throw new Error('Selected fund does not exist.');
        if (!targetCategoryId) {
          targetCategoryId = existingFund.fund_category_id || 1;
        }
      } else {
        targetFundId = 1;
        const fund1 = db.prepare('SELECT fund_category_id FROM funds WHERE id = 1').get() as any;
        targetCategoryId = fund1?.fund_category_id || 1;
      }

      // Check if fund_category_id column exists on fund_receipts
      const cols = db.prepare("PRAGMA table_info(fund_receipts)").all() as any[];
      const hasCatCol = cols.some((c) => c.name === 'fund_category_id');

      // 2. Generate unique receipt number (e.g. RCP-YYYY-XXXXX)
      const year = new Date().getFullYear();
      const prefix = `RCP-${year}-`;
      const lastReceipt = db.prepare(`
        SELECT receipt_no FROM fund_receipts
        WHERE receipt_no LIKE ?
        ORDER BY id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { receipt_no: string } | undefined;

      let nextSeq = 1;
      if (lastReceipt && lastReceipt.receipt_no) {
        const parts = lastReceipt.receipt_no.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) {
          nextSeq = num + 1;
        }
      }
      let receiptNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      while (db.prepare('SELECT id FROM fund_receipts WHERE receipt_no = ?').get(receiptNo)) {
        nextSeq++;
        receiptNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      }

      let res: any;
      if (hasCatCol) {
        res = db.prepare(`
          INSERT INTO fund_receipts (
            receipt_no, financial_year_id, fund_id, fund_category_id, receipt_date, donor_or_dept, amount_cents,
            payment_method, destination_type, bank_account_id, reference_no, purpose, notes, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)
        `).run(
          receiptNo,
          data.financial_year_id,
          targetFundId,
          targetCategoryId,
          data.receipt_date,
          data.donor_or_dept.trim(),
          data.amount_cents,
          data.payment_method,
          data.destination_type,
          data.destination_type === 'bank' ? (data.bank_account_id || null) : null,
          data.reference_no || null,
          data.purpose || null,
          data.notes || null,
          userId || null
        );
      } else {
        res = db.prepare(`
          INSERT INTO fund_receipts (
            receipt_no, financial_year_id, fund_id, receipt_date, donor_or_dept, amount_cents,
            payment_method, destination_type, bank_account_id, reference_no, purpose, notes, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)
        `).run(
          receiptNo,
          data.financial_year_id,
          targetFundId,
          data.receipt_date,
          data.donor_or_dept.trim(),
          data.amount_cents,
          data.payment_method,
          data.destination_type,
          data.destination_type === 'bank' ? (data.bank_account_id || null) : null,
          data.reference_no || null,
          data.purpose || null,
          data.notes || null,
          userId || null
        );
      }
      const receiptId = Number(res.lastInsertRowid);

      // 3. Double-entry general ledger posting
      const entryNum = `JRN-RCP-${receiptId}`;
      const entryStmt = db.prepare(`
        INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, reference_id, description, total_amount_cents, status, created_by)
        VALUES (?, ?, ?, 'fund_receipt', ?, ?, ?, 'posted', ?)
      `);
      const journalRes = entryStmt.run(
        entryNum,
        data.receipt_date,
        data.financial_year_id,
        receiptId,
        `Fund Receipt ${receiptNo} from ${data.donor_or_dept}`,
        data.amount_cents,
        userId || null
      );
      const journalId = Number(journalRes.lastInsertRowid);

      const insertLine = db.prepare(`
        INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
        VALUES (?, ?, ?, ?, ?)
      `);

      // Debit asset account (Cash in Hand = 1, Petty Cash = 2, Bank = 3)
      const assetAccId = data.destination_type === 'cash' ? 1 : data.destination_type === 'petty_cash' ? 2 : 3;
      insertLine.run(journalId, assetAccId, data.amount_cents, 0, `Receipt into ${data.destination_type}`);

      // Credit Income account (Government = 8, Donations = 10)
      const fund = db.prepare(`
        SELECT f.id, f.fund_code, f.name, f.name_en, f.name_si, f.source_type, f.fund_category_id,
               fc.name_en as cat_name_en, fc.name_si as cat_name_si, fc.category_code as cat_code
        FROM funds f
        LEFT JOIN fund_categories fc ON f.fund_category_id = fc.id
        WHERE f.id = ?
      `).get(targetFundId) as any;
      const incomeAccId = (fund && fund.source_type && fund.source_type.includes('grant')) ? 8 : 10;
      const fundLabel = (fund && (fund.name_en || fund.name)) || data.donor_or_dept;
      insertLine.run(journalId, incomeAccId, 0, data.amount_cents, `Fund income recognized for ${fundLabel}`);

      // 4. Update destination ledger
      if (data.payment_method === 'cheque') {
        // Received cheques are logged into cheques ledger in 'received' status.
        // It will hit the receiving bank account when cleared or deposited in Cheque Management.
        const chqNo = data.cheque_number?.trim() || data.reference_no?.trim() || receiptNo;
        const chqRes = db.prepare(`
          INSERT INTO cheques (
            cheque_type, cheque_number, amount_cents, status, cheque_date,
            received_date, payer_name, issuing_bank_name, issuing_bank_branch,
            fund_receipt_id, fund_category_id, specific_fund_id,
            description, reference, created_by
          ) VALUES (
            'received', ?, ?, 'received', ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?
          )
        `).run(
          chqNo,
          data.amount_cents,
          data.cheque_date || data.receipt_date,
          data.receipt_date,
          data.donor_or_dept.trim(),
          data.issuing_bank_name?.trim() || 'Bank',
          data.issuing_bank_branch?.trim() || null,
          receiptId,
          targetCategoryId,
          targetFundId,
          data.purpose?.trim() || null,
          receiptNo,
          userId || null
        );
        const chequeId = Number(chqRes.lastInsertRowid);

        db.prepare(`
          INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
          VALUES (?, 'CREATED', NULL, 'received', ?, ?)
        `).run(chequeId, `Received cheque logged via Fund Receipt ${receiptNo}`, userId || null);
      } else if (data.destination_type === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get() as any;
        const currentBal = (lastCash ? lastCash.running_balance_cents : 0) + data.amount_cents;

        db.prepare(`
          INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
          VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?)
        `).run(data.financial_year_id, data.receipt_date, data.amount_cents, currentBal, receiptNo, `Fund receipt: ${data.purpose || fundLabel}`, userId || null);
      } else if (data.destination_type === 'petty_cash') {
        db.prepare(`
          INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, type, amount_cents, payee, description, receipt_attached, status, created_by)
          VALUES (?, ?, ?, 'replenishment', ?, ?, ?, 1, 'approved', ?)
        `).run(receiptNo, data.receipt_date, data.financial_year_id, data.amount_cents, data.donor_or_dept, `Funding receipt: ${data.purpose || fundLabel}`, userId || null);
      } else if (data.destination_type === 'bank' && data.bank_account_id) {
        const txType = 'deposit';

        const btRes = db.prepare(`
          INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(
          data.bank_account_id,
          data.receipt_date,
          txType,
          data.amount_cents,
          receiptNo,
          null,
          data.donor_or_dept.trim(),
          `Fund receipt: ${data.purpose || fundLabel}`,
          userId || null
        );

        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(data.amount_cents, data.bank_account_id);
      }

      AuditService.logAuthEvent(userId || null, 'system', 'FUND_RECEIPT_POSTED', `fund_receipts:${receiptId}`, 'success', `Posted ${receiptNo} for ${data.amount_cents} cents`);

      return {
        id: receiptId,
        receipt_no: receiptNo,
        financial_year_id: data.financial_year_id,
        fund_id: targetFundId,
        fund_category_id: targetCategoryId,
        fund_category_name_en: fund?.cat_name_en || null,
        fund_category_name_si: fund?.cat_name_si || null,
        fund_category_code: fund?.cat_code || null,
        fund_code: fund?.fund_code || null,
        fund_name_en: fund?.name_en || fund?.name || 'General Funding',
        fund_name_si: fund?.name_si || fund?.name_en || fund?.name || 'සාමාන්‍ය අරමුදල්',
        receipt_date: data.receipt_date,
        donor_or_dept: data.donor_or_dept,
        amount_cents: data.amount_cents,
        payment_method: data.payment_method,
        destination_type: data.destination_type,
        bank_account_id: data.destination_type === 'bank' ? (data.bank_account_id || null) : null,
        reference_no: data.reference_no || null,
        purpose: data.purpose || null,
        notes: data.notes || null,
        status: 'posted' as const,
      };
    });

    return runTx();
  }

  // ========================================================
  // 5. EXPENSE MANAGEMENT
  // ========================================================
  public static getExpenses(
    limit = 50,
    offset = 0,
    financialYearId?: number,
    categoryId?: number,
    searchQuery?: string,
    paymentMethod?: string,
    statusFilter?: string,
    dateFrom?: string,
    dateTo?: string
  ): {
    expenses: Expense[];
    total: number;
    summary: {
      total_cents: number;
      cash_cents: number;
      bank_cents: number;
      cheque_cents: number;
      total_count: number;
    };
  } {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;

    // 1. Efficient single-query summary aggregates for the financial year
    const summaryRow = db.prepare(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN e.status != 'reversed' THEN e.amount_cents ELSE 0 END), 0) as total_cents,
        COALESCE(SUM(CASE WHEN e.status != 'reversed' AND e.payment_method = 'cash' THEN e.amount_cents ELSE 0 END), 0) as cash_cents,
        COALESCE(SUM(CASE WHEN e.status != 'reversed' AND e.payment_method = 'bank' AND chq.id IS NULL THEN e.amount_cents ELSE 0 END), 0) as bank_cents,
        COALESCE(SUM(CASE WHEN e.status != 'reversed' AND (e.payment_method = 'cheque' OR chq.id IS NOT NULL) THEN e.amount_cents ELSE 0 END), 0) as cheque_cents
      FROM expenses e
      LEFT JOIN cheques chq ON chq.expense_id = e.id AND chq.cheque_type = 'issued'
      WHERE e.financial_year_id = ?
    `).get(yearId) as any;

    const summary = {
      total_count: Number(summaryRow?.total_count || 0),
      total_cents: Number(summaryRow?.total_cents || 0),
      cash_cents: Number(summaryRow?.cash_cents || 0),
      bank_cents: Number(summaryRow?.bank_cents || 0),
      cheque_cents: Number(summaryRow?.cheque_cents || 0),
    };

    // 2. Build filtered query with explicit joins
    const whereClauses: string[] = ['e.financial_year_id = ?'];
    const params: any[] = [yearId];

    if (categoryId) {
      whereClauses.push('e.category_id = ?');
      params.push(categoryId);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'cheque') {
        whereClauses.push("(e.payment_method = 'cheque' OR chq.id IS NOT NULL)");
      } else {
        whereClauses.push("e.payment_method = ? AND chq.id IS NULL");
        params.push(paymentMethod);
      }
    }

    if (statusFilter && statusFilter !== 'all') {
      whereClauses.push('e.status = ?');
      params.push(statusFilter);
    }

    if (dateFrom) {
      whereClauses.push('e.expense_date >= ?');
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClauses.push('e.expense_date <= ?');
      params.push(dateTo);
    }

    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.trim()}%`;
      whereClauses.push(`(
        e.voucher_no LIKE ? OR
        e.payee LIKE ? OR
        e.description LIKE ? OR
        e.bill_no LIKE ? OR
        e.reference_no LIKE ? OR
        chq.cheque_number LIKE ? OR
        bc.category_code LIKE ? OR
        bc.name LIKE ? OR
        bc.name_en LIKE ? OR
        bc.name_si LIKE ?
      )`);
      params.push(q, q, q, q, q, q, q, q, q, q);
    }

    const whereStr = whereClauses.join(' AND ');

    const countSql = `
      SELECT COUNT(*) as count
      FROM expenses e
      INNER JOIN budget_categories bc ON e.category_id = bc.id
      LEFT JOIN cheques chq ON chq.expense_id = e.id AND chq.cheque_type = 'issued'
      WHERE ${whereStr}
    `;

    const querySql = `
      SELECT e.id, e.voucher_no, e.expense_date, e.financial_year_id, e.category_id, e.fund_id,
             e.payee, e.description, e.amount_cents, e.payment_method, e.bank_account_id,
             e.reference_no, e.bill_no, COALESCE(chq.cheque_number, '') as cheque_number, chq.cheque_date, e.status, e.approved_by, e.approved_at, e.rejection_reason,
             e.created_by, e.created_at,
             bc.category_code, COALESCE(bc.name, bc.name_en) as category_name_en, bc.name_si as category_name_si,
             f.name_en as fund_name_en,
             ba.bank_name,
             u.full_name as creator_name
      FROM expenses e
      INNER JOIN budget_categories bc ON e.category_id = bc.id
      LEFT JOIN funds f ON e.fund_id = f.id
      LEFT JOIN bank_accounts ba ON e.bank_account_id = ba.id
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN cheques chq ON chq.expense_id = e.id AND chq.cheque_type = 'issued'
      WHERE ${whereStr}
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT ? OFFSET ?
    `;

    const countRow = db.prepare(countSql).get(...params) as { count: number };
    const rows = db.prepare(querySql).all(...params, limit, offset) as any[];

    return {
      expenses: rows,
      total: countRow ? countRow.count : 0,
      summary,
    };
  }

  public static quickCreateExpenseBudgetCategory(data: {
    financial_year_id: number;
    name_en: string;
    name_si: string;
    parent_id?: number | null;
    category_code?: string;
    allocated_amount_cents?: number;
    description?: string;
  }, userId?: number): BudgetCategory {
    const db = getDatabase();
    return db.transaction(() => {
      const cleanName = data.name_en.trim();
      const cleanSi = (data.name_si || '').trim() || cleanName;
      if (!cleanName) throw new Error('Category English name is required.');
      if (!cleanSi) throw new Error('Sinhala name is required.');

      let categoryId: number;
      let categoryCode: string;

      // Duplicate check under same parent
      let existing: any;
      if (data.parent_id) {
        existing = db.prepare('SELECT id, category_code FROM budget_categories WHERE LOWER(COALESCE(name, name_en)) = LOWER(?) AND parent_id = ?').get(cleanName, data.parent_id);
      } else {
        existing = db.prepare('SELECT id, category_code FROM budget_categories WHERE LOWER(COALESCE(name, name_en)) = LOWER(?)').get(cleanName);
      }

      if (existing) {
        categoryId = existing.id;
        categoryCode = existing.category_code;
      } else {
        let code = (data.category_code || '').trim();
        if (!code) {
          code = this.suggestCategoryCode(data.parent_id);
        }
        const ins = db.prepare(`
          INSERT INTO budget_categories (category_code, name, name_en, name_si, parent_id, description, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(code, cleanName, cleanName, cleanSi, data.parent_id || null, data.description?.trim() || null);
        categoryId = Number(ins.lastInsertRowid);
        categoryCode = code;

        AuditService.logAuthEvent(
          userId || null,
          'system',
          'BUDGET_CATEGORY_CREATED',
          `budget_categories:${categoryId}`,
          'success',
          `Created budget category "${cleanName}" (${categoryCode}) from Expense Management`
        );
      }

      // Ensure allocation to active financial year
      const allocCents = data.allocated_amount_cents && data.allocated_amount_cents > 0 ? Math.round(data.allocated_amount_cents) : 0;
      const existingAlloc = db.prepare(`
        SELECT id, allocated_amount_cents FROM financial_year_budget_allocations
        WHERE financial_year_id = ? AND category_id = ?
      `).get(data.financial_year_id, categoryId) as any;

      if (!existingAlloc) {
        db.prepare(`
          INSERT INTO financial_year_budget_allocations (financial_year_id, category_id, allocated_amount_cents, notes, updated_at)
          VALUES (?, ?, ?, 'Quick-created from Expense Management', CURRENT_TIMESTAMP)
        `).run(data.financial_year_id, categoryId, allocCents);

        db.prepare(`
          INSERT INTO annual_budgets (financial_year_id, category_id, approved_amount_cents, revised_amount_cents, status, notes, updated_at)
          VALUES (?, ?, ?, ?, 'approved', 'Quick-created from Expense Management', CURRENT_TIMESTAMP)
        `).run(data.financial_year_id, categoryId, allocCents, allocCents);
      } else if (allocCents > 0 && existingAlloc.allocated_amount_cents === 0) {
        db.prepare(`
          UPDATE financial_year_budget_allocations SET allocated_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
          WHERE financial_year_id = ? AND category_id = ?
        `).run(allocCents, data.financial_year_id, categoryId);

        db.prepare(`
          UPDATE annual_budgets SET approved_amount_cents = ?, revised_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
          WHERE financial_year_id = ? AND category_id = ?
        `).run(allocCents, allocCents, data.financial_year_id, categoryId);
      }

      const cat = db.prepare(`
        SELECT bc.id, bc.category_code, COALESCE(bc.name, bc.name_en) as name_en, bc.name_si, bc.parent_id, bc.description, bc.is_active,
               p.category_code as parent_code, COALESCE(p.name, p.name_en) as parent_name_en, p.name_si as parent_name_si,
               fa.allocated_amount_cents as approved_amount_cents,
               fa.allocated_amount_cents as revised_amount_cents,
               COALESCE(spent.total_spent, 0) as spent_amount_cents
        FROM financial_year_budget_allocations fa
        INNER JOIN budget_categories bc ON fa.category_id = bc.id
        LEFT JOIN budget_categories p ON bc.parent_id = p.id
        LEFT JOIN (
          SELECT e.category_id, SUM(e.amount_cents) as total_spent
          FROM expenses e
          WHERE e.financial_year_id = ? AND e.status IN ('approved', 'paid')
          GROUP BY e.category_id
        ) spent ON bc.id = spent.category_id
        WHERE fa.financial_year_id = ? AND bc.id = ?
      `).get(data.financial_year_id, data.financial_year_id, categoryId) as any;

      return {
        id: cat.id,
        category_code: cat.category_code,
        name_en: cat.name_en,
        name_si: cat.name_si,
        parent_id: cat.parent_id,
        parent_code: cat.parent_code,
        parent_name_en: cat.parent_name_en,
        parent_name_si: cat.parent_name_si,
        description: cat.description,
        is_active: Boolean(cat.is_active),
        approved_amount_cents: Number(cat.approved_amount_cents || 0),
        revised_amount_cents: Number(cat.revised_amount_cents || 0),
        spent_amount_cents: Number(cat.spent_amount_cents || 0),
      };
    })();
  }

  public static createExpense(data: {
    financial_year_id: number;
    category_id: number;
    fund_id?: number | null;
    expense_date: string;
    payee: string;
    description: string;
    amount_cents: number;
    payment_method: 'cash' | 'bank' | 'petty_cash' | 'unpaid' | 'cheque';
    bank_account_id?: number | null;
    reference_no?: string;
    bill_no?: string;
    cheque_number?: string;
    cheque_date?: string;
    expected_presentation_date?: string;
  }, userId?: number): Expense {
    const db = getDatabase();
    if (data.amount_cents <= 0) throw new Error('Expense amount must be greater than zero.');
    if (!data.payee.trim()) throw new Error('Payee name is required.');
    if (!data.description.trim()) throw new Error('Description is required.');

    if (data.payment_method === 'petty_cash') {
      throw new Error('Petty cash payments must be recorded directly through the dedicated Petty Cash management module.');
    }

    const isCheque = data.payment_method === 'cheque' || Boolean(data.cheque_number && data.cheque_number.trim());
    const effectivePaymentMethod = isCheque ? 'bank' : data.payment_method;

    if (effectivePaymentMethod === 'bank' && !data.bank_account_id) {
      data.bank_account_id = this.getDefaultBankAccount().id;
    }

    const chqNum = data.cheque_number?.trim() || (data.payment_method === 'cheque' ? data.reference_no?.trim() : undefined);
    if (isCheque && chqNum && data.bank_account_id) {
      const dup = db.prepare(`
        SELECT id, status FROM cheques
        WHERE cheque_type = 'issued'
          AND issuing_bank_account_id = ?
          AND cheque_number = ?
          AND status != 'cancelled'
      `).get(data.bank_account_id, chqNum) as any;
      if (dup) {
        throw new Error(`Cheque #${chqNum} has already been issued from this bank account (Status: ${dup.status}).`);
      }
    }

    // Validate financial year
    const fy = db.prepare('SELECT id, status, is_current FROM financial_years WHERE id = ?').get(data.financial_year_id) as any;
    if (!fy) throw new Error('Financial year not found.');
    if (fy.status === 'closed') throw new Error('Cannot record expenses in a closed financial year.');

    // Validate category: must be a subcategory (leaf category) and allocated to this financial year
    const cat = db.prepare('SELECT id, parent_id, category_code, name, name_en FROM budget_categories WHERE id = ?').get(data.category_id) as any;
    if (!cat) throw new Error('Budget category not found.');

    const childCountRow = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE parent_id = ?').get(data.category_id) as any;
    if (childCountRow && childCountRow.count > 0) {
      throw new Error(`Cannot record expense against parent category "${cat.name || cat.name_en}". Please select an approved subcategory.`);
    }

    const alloc = db.prepare(`
      SELECT fa.id, fa.allocated_amount_cents
      FROM financial_year_budget_allocations fa
      WHERE fa.financial_year_id = ? AND fa.category_id = ?
    `).get(data.financial_year_id, data.category_id) as any;
    if (!alloc) {
      throw new Error('Selected budget category is not allocated to this financial year.');
    }

    // Validate budget remaining
    const spentRow = db.prepare(`
      SELECT SUM(amount_cents) as total_spent
      FROM expenses
      WHERE financial_year_id = ? AND category_id = ? AND status IN ('approved', 'paid')
    `).get(data.financial_year_id, data.category_id) as any;
    const spentCents = Number(spentRow?.total_spent || 0);
    const remainingCents = Number(alloc.allocated_amount_cents) - spentCents;
    if (data.amount_cents > remainingCents) {
      throw new Error(`Expense amount (Rs. ${(data.amount_cents / 100).toFixed(2)}) exceeds remaining budget allocation (Rs. ${(remainingCents / 100).toFixed(2)}) for category "${cat.name || cat.name_en}".`);
    }

    // Optional fund tagging (purely informational)
    if (data.fund_id) {
      const fund = db.prepare('SELECT id, fund_code, name, name_en, status FROM funds WHERE id = ?').get(data.fund_id) as any;
      if (!fund) throw new Error('Selected fund not found.');
      if (fund.status !== 'active') throw new Error('Selected fund is inactive.');
    }

    const runTx = db.transaction(() => {
      // 1. Generate unique voucher number (e.g. EXP-YYYY-XXXXX)
      const year = new Date().getFullYear();
      const prefix = `EXP-${year}-`;
      const lastExp = db.prepare(`
        SELECT voucher_no FROM expenses
        WHERE voucher_no LIKE ?
        ORDER BY id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { voucher_no: string } | undefined;

      let nextSeq = 1;
      if (lastExp && lastExp.voucher_no) {
        const parts = lastExp.voucher_no.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) {
          nextSeq = num + 1;
        }
      }
      let voucherNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      while (db.prepare('SELECT id FROM expenses WHERE voucher_no = ?').get(voucherNo)) {
        nextSeq++;
        voucherNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      }

      const stmt = db.prepare(`
        INSERT INTO expenses (
          voucher_no, expense_date, financial_year_id, category_id, fund_id, payee, description,
          amount_cents, payment_method, bank_account_id, reference_no, bill_no, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
      `);
      const res = stmt.run(
        voucherNo,
        data.expense_date,
        data.financial_year_id,
        data.category_id,
        data.fund_id || null,
        data.payee.trim(),
        data.description.trim(),
        data.amount_cents,
        effectivePaymentMethod,
        data.bank_account_id || null,
        data.reference_no || (chqNum ? `CHQ-${chqNum}` : null),
        data.bill_no || null,
        userId || null
      );
      const expenseId = Number(res.lastInsertRowid);

      // Record fund usage trace if fund_id attached
      if (data.fund_id) {
        db.prepare(`
          INSERT INTO fund_usage_traces (fund_id, expense_id, amount_cents, trace_date, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(data.fund_id, expenseId, data.amount_cents, data.expense_date, `Expense ${voucherNo}: ${data.description}`, userId || null);
      }

      // 2. Post double-entry journal if not unpaid
      if (data.payment_method !== 'unpaid') {
        const entryNum = `JRN-EXP-${expenseId}`;
        const entryStmt = db.prepare(`
          INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, reference_id, description, total_amount_cents, status, created_by)
          VALUES (?, ?, ?, 'expense', ?, ?, ?, 'posted', ?)
        `);
        const journalRes = entryStmt.run(
          entryNum,
          data.expense_date,
          data.financial_year_id,
          expenseId,
          `Expense ${voucherNo} to ${data.payee}: ${data.description}`,
          data.amount_cents,
          userId || null
        );
        const journalId = Number(journalRes.lastInsertRowid);

        const insertLine = db.prepare(`
          INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
          VALUES (?, ?, ?, ?, ?)
        `);

        // Debit Expense Account (e.g. 5010 = 12)
        insertLine.run(journalId, 12, data.amount_cents, 0, `Expense recognized for ${data.payee}`);

        // Credit Asset / Cash Account
        if (data.payment_method === 'cash') {
          insertLine.run(journalId, 1, 0, data.amount_cents, 'Cash paid');
          const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get() as any;
          const currentBal = (lastCash ? lastCash.running_balance_cents : 0) - data.amount_cents;

          db.prepare(`
            INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
            VALUES (?, ?, 'payment', ?, ?, ?, ?, ?)
          `).run(data.financial_year_id, data.expense_date, -data.amount_cents, currentBal, voucherNo, `Expense payment to ${data.payee}`, userId || null);
        } else if (effectivePaymentMethod === 'bank' && data.bank_account_id) {
          if (isCheque) {
            // CHEQUE PAYMENT:
            // Do NOT hit bank account immediately! The cheque is in 'issued' (outstanding) status.
            // Bank account will be debited when the cheque is cleared from Cheque Management page.
            insertLine.run(journalId, 3, 0, data.amount_cents, `Cheque payment authorized for ${data.payee} (#${chqNum || 'Pending'})`);

            if (chqNum) {
              const refNo = `CHQ-${chqNum}`;
              const chqRes = db.prepare(`
                INSERT INTO cheques (
                  cheque_type, cheque_number, amount_cents, status, cheque_date,
                  issue_date, payee_name, issuing_bank_account_id, issuing_bank_transaction_id,
                  expense_id, budget_category_id, financial_year_id, expected_presentation_date,
                  description, reference, created_by
                ) VALUES (
                  'issued', ?, ?, 'issued', ?,
                  ?, ?, ?, NULL,
                  ?, ?, ?, ?,
                  ?, ?, ?
                )
              `).run(
                chqNum,
                data.amount_cents,
                data.cheque_date || data.expense_date,
                data.expense_date,
                data.payee.trim(),
                data.bank_account_id,
                expenseId,
                data.category_id,
                data.financial_year_id,
                data.expected_presentation_date || null,
                data.description.trim(),
                refNo,
                userId || null
              );
              const chequeId = Number(chqRes.lastInsertRowid);

              db.prepare(`
                INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
                VALUES (?, 'ISSUED', NULL, 'issued', ?, ?)
              `).run(chequeId, `Issued via Expense Voucher ${voucherNo} (Pending Bank Clearance)`, userId || null);
            }
          } else {
            // Direct bank withdrawal / transfer: hit bank immediately
            insertLine.run(journalId, 3, 0, data.amount_cents, 'Bank payment');

            const refNo = data.reference_no || voucherNo;
            const btRes = db.prepare(`
              INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by)
              VALUES (?, ?, 'withdrawal', ?, ?, NULL, ?, ?, 0, ?)
            `).run(
              data.bank_account_id,
              data.expense_date,
              -data.amount_cents,
              refNo,
              data.payee.trim(),
              `Expense: ${data.description}`,
              userId || null
            );
            const bankTxId = Number(btRes.lastInsertRowid);

            db.prepare(`
              UPDATE bank_accounts
              SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(data.amount_cents, data.bank_account_id);
          }
        }
      }

      AuditService.logAuthEvent(userId || null, 'system', 'EXPENSE_RECORDED', `expenses:${expenseId}`, 'success', `Voucher ${voucherNo} for ${data.amount_cents} cents`);

      return {
        id: expenseId,
        voucher_no: voucherNo,
        expense_date: data.expense_date,
        financial_year_id: data.financial_year_id,
        category_id: data.category_id,
        fund_id: data.fund_id || null,
        payee: data.payee,
        description: data.description,
        amount_cents: data.amount_cents,
        payment_method: data.payment_method,
        bank_account_id: data.bank_account_id || null,
        cheque_number: chqNum || null,
        status: 'approved' as const,
      };
    });

    return runTx();
  }

  public static recordPettyCashExpense(data: {
    financial_year_id: number;
    voucher_date?: string;
    expense_date?: string;
    category_id: number;
    amount_cents: number;
    payee: string;
    description: string;
    receipt_no?: string;
    receipt_attached?: boolean;
    notes?: string;
    fund_id?: number | null;
  }, userId?: number): PettyCashVoucher {
    const db = getDatabase();
    const effectiveDate = (data.voucher_date || data.expense_date || new Date().toISOString().split('T')[0]).trim();
    if (data.amount_cents <= 0) throw new Error('Expense amount must be greater than zero.');
    if (!data.payee?.trim()) throw new Error('Payee name is required.');
    if (!data.description?.trim()) throw new Error('Description is required.');

    const fy = db.prepare('SELECT id, status FROM financial_years WHERE id = ?').get(data.financial_year_id) as any;
    if (!fy) throw new Error('Financial year not found.');
    if (fy.status === 'closed') throw new Error('Cannot record expenses in a closed financial year.');

    // Validate category: must be a subcategory (leaf category) and allocated to this financial year
    const cat = db.prepare('SELECT id, parent_id, category_code, name, name_en FROM budget_categories WHERE id = ?').get(data.category_id) as any;
    if (!cat) throw new Error('Budget category not found.');

    const childCountRow = db.prepare('SELECT COUNT(*) as count FROM budget_categories WHERE parent_id = ?').get(data.category_id) as any;
    if (childCountRow && childCountRow.count > 0) {
      throw new Error(`Cannot record petty cash expense against parent category "${cat.name || cat.name_en}". Please select an approved subcategory.`);
    }

    const alloc = db.prepare(`
      SELECT fa.id, fa.allocated_amount_cents
      FROM financial_year_budget_allocations fa
      WHERE fa.financial_year_id = ? AND fa.category_id = ?
    `).get(data.financial_year_id, data.category_id) as any;
    if (!alloc) {
      throw new Error('Selected budget category is not allocated to this financial year.');
    }

    // Check remaining allocation
    const spentRow = db.prepare(`
      SELECT SUM(amount_cents) as total_spent
      FROM expenses
      WHERE financial_year_id = ? AND category_id = ? AND status IN ('approved', 'paid')
    `).get(data.financial_year_id, data.category_id) as any;
    const spentCents = Number(spentRow?.total_spent || 0);
    const remainingCents = Number(alloc.allocated_amount_cents) - spentCents;
    if (data.amount_cents > remainingCents) {
      throw new Error(`Petty cash expense (Rs. ${(data.amount_cents / 100).toFixed(2)}) exceeds remaining budget allocation (Rs. ${(remainingCents / 100).toFixed(2)}) for category "${cat.name || cat.name_en}".`);
    }

    // Check available petty cash balance
    const balRow = db.prepare(`
      SELECT SUM(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN pcv.amount_cents ELSE -pcv.amount_cents END) as balance
      FROM petty_cash_vouchers pcv
      WHERE pcv.financial_year_id = ? AND pcv.status = 'approved'
    `).get(data.financial_year_id) as any;
    const availablePettyCash = Number(balRow?.balance || 0);
    if (data.amount_cents > availablePettyCash) {
      throw new Error(`Expense amount (Rs. ${(data.amount_cents / 100).toFixed(2)}) exceeds available petty cash balance (Rs. ${(availablePettyCash / 100).toFixed(2)}).`);
    }

    // Optional fund tagging (purely informational)
    if (data.fund_id) {
      const fund = db.prepare('SELECT id, fund_code, name, name_en, status FROM funds WHERE id = ?').get(data.fund_id) as any;
      if (!fund) throw new Error('Selected fund not found.');
      if (fund.status !== 'active') throw new Error('Selected fund is inactive.');
    }

    const runTx = db.transaction(() => {
      // Generate voucher number (e.g. PC-EXP-YYYY-XXXXX)
      const year = new Date().getFullYear();
      const prefix = `PC-EXP-${year}-`;
      const lastVoucher = db.prepare('SELECT voucher_no FROM petty_cash_vouchers WHERE voucher_no LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`) as any;
      let nextSeq = 1;
      if (lastVoucher && lastVoucher.voucher_no) {
        const parts = lastVoucher.voucher_no.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) nextSeq = num + 1;
      }
      let voucherNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      while (db.prepare('SELECT id FROM petty_cash_vouchers WHERE voucher_no = ?').get(voucherNo)) {
        nextSeq++;
        voucherNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      }

      // 1. Insert into petty_cash_vouchers
      const pcvStmt = db.prepare(`
        INSERT INTO petty_cash_vouchers (
          voucher_no, voucher_date, financial_year_id, category_id, type, amount_cents,
          payee, description, receipt_attached, status, created_by
        ) VALUES (?, ?, ?, ?, 'expense', ?, ?, ?, ?, 'approved', ?)
      `);
      const pcvRes = pcvStmt.run(
        voucherNo,
        effectiveDate,
        data.financial_year_id,
        data.category_id,
        data.amount_cents,
        data.payee.trim(),
        data.description.trim(),
        data.receipt_attached ? 1 : 0,
        userId || null
      );
      const pcvId = Number(pcvRes.lastInsertRowid);

      // 2. Insert into expenses for unified budget reporting and audit
      const expStmt = db.prepare(`
        INSERT INTO expenses (
          voucher_no, expense_date, financial_year_id, category_id, fund_id, payee, description,
          amount_cents, payment_method, petty_cash_voucher_id, reference_no, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'petty_cash', ?, ?, 'approved', ?)
      `);
      const expRes = expStmt.run(
        voucherNo,
        effectiveDate,
        data.financial_year_id,
        data.category_id,
        data.fund_id || null,
        data.payee.trim(),
        data.description.trim(),
        data.amount_cents,
        pcvId,
        data.receipt_no || null,
        userId || null
      );
      const expenseId = Number(expRes.lastInsertRowid);

      // 3. Fund trace if fund_id
      if (data.fund_id) {
        db.prepare(`
          INSERT INTO fund_usage_traces (fund_id, expense_id, amount_cents, trace_date, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(data.fund_id, expenseId, data.amount_cents, effectiveDate, `Petty cash voucher ${voucherNo}: ${data.description}`, userId || null);
      }

      // 4. Double entry journal: Dr Expense (12), Cr Petty Cash (2)
      const entryNum = `JRN-PC-${pcvId}`;
      const entryStmt = db.prepare(`
        INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, reference_id, description, total_amount_cents, status, created_by)
        VALUES (?, ?, ?, 'petty_cash', ?, ?, ?, 'posted', ?)
      `);
      const journalRes = entryStmt.run(
        entryNum,
        effectiveDate,
        data.financial_year_id,
        pcvId,
        `Petty Cash Expense ${voucherNo} to ${data.payee}: ${data.description}`,
        data.amount_cents,
        userId || null
      );
      const journalId = Number(journalRes.lastInsertRowid);

      const insLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents, description) VALUES (?, ?, ?, ?, ?)');
      insLine.run(journalId, 12, data.amount_cents, 0, `Petty cash expense for ${data.payee}`);
      insLine.run(journalId, 2, 0, data.amount_cents, 'Petty cash deduction');

      AuditService.logAuthEvent(
        userId || null,
        'system',
        'PETTY_CASH_EXPENSE_RECORDED',
        `petty_cash_vouchers:${pcvId}`,
        'success',
        `Petty cash expense ${voucherNo} for ${data.amount_cents} cents`
      );

      return {
        id: pcvId,
        voucher_no: voucherNo,
        voucher_date: effectiveDate,
        financial_year_id: data.financial_year_id,
        category_id: data.category_id,
        type: 'expense' as const,
        amount_cents: data.amount_cents,
        payee: data.payee.trim(),
        description: data.description.trim(),
        receipt_attached: Boolean(data.receipt_attached),
        status: 'approved' as const,
      };
    });

    return runTx();
  }

  public static cancelExpense(expenseId: number, reason: string, userId?: number): void {
    const db = getDatabase();
    const cleanReason = (reason || '').trim();
    if (!cleanReason) throw new Error('Cancellation reason is required.');

    const exp = db.prepare(`
      SELECT id, voucher_no, expense_date, financial_year_id, category_id, fund_id,
             amount_cents, payment_method, bank_account_id, petty_cash_voucher_id, status
      FROM expenses
      WHERE id = ?
    `).get(expenseId) as any;

    if (!exp) throw new Error('Expense record not found.');
    if (exp.status === 'reversed') throw new Error('Expense is already reversed.');
    if (exp.status === 'rejected') throw new Error('Expense is already rejected.');

    const runTx = db.transaction(() => {
      // 1. Restore balances depending on payment method
      if (exp.payment_method === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get() as any;
        const currentBal = (lastCash ? lastCash.running_balance_cents : 0) + exp.amount_cents;

        db.prepare(`
          INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
          VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?)
        `).run(
          exp.financial_year_id,
          new Date().toISOString().split('T')[0],
          exp.amount_cents,
          currentBal,
          `REV-${exp.voucher_no}`,
          `Reversal of expense ${exp.voucher_no}: ${cleanReason}`,
          userId || null
        );
      } else if (exp.payment_method === 'bank' && exp.bank_account_id) {
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(exp.amount_cents, exp.bank_account_id);

        db.prepare(`
          INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, payee_or_payer, description, created_by)
          VALUES (?, ?, 'adjustment', ?, ?, 'Reversal Refund', ?, ?)
        `).run(
          exp.bank_account_id,
          new Date().toISOString().split('T')[0],
          exp.amount_cents,
          `REV-${exp.voucher_no}`,
          `Reversal of expense ${exp.voucher_no}: ${cleanReason}`,
          userId || null
        );
      } else if (exp.payment_method === 'petty_cash') {
        if (exp.petty_cash_voucher_id) {
          db.prepare("UPDATE petty_cash_vouchers SET status = 'cancelled' WHERE id = ?").run(exp.petty_cash_voucher_id);
        } else {
          db.prepare("UPDATE petty_cash_vouchers SET status = 'cancelled' WHERE voucher_no = ?").run(exp.voucher_no);
        }
      }

      // 2. Remove fund usage trace if attached
      if (exp.fund_id) {
        db.prepare('DELETE FROM fund_usage_traces WHERE expense_id = ?').run(exp.id);
      }

      // 3. Reverse journal entry
      const entryNum = `REV-JRN-EXP-${exp.id}`;
      const revJournal = db.prepare(`
        INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, reference_id, description, total_amount_cents, status, created_by)
        VALUES (?, ?, ?, 'expense_reversal', ?, ?, ?, 'posted', ?)
      `).run(
        entryNum,
        new Date().toISOString().split('T')[0],
        exp.financial_year_id,
        exp.id,
        `Reversal of expense ${exp.voucher_no}: ${cleanReason}`,
        exp.amount_cents,
        userId || null
      );
      const revJournalId = Number(revJournal.lastInsertRowid);
      const insLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents, description) VALUES (?, ?, ?, ?, ?)');

      const assetAccId = exp.payment_method === 'petty_cash' ? 2 : exp.payment_method === 'bank' ? 3 : 1;
      insLine.run(revJournalId, assetAccId, exp.amount_cents, 0, `Refund for cancelled expense ${exp.voucher_no}`);
      insLine.run(revJournalId, 12, 0, exp.amount_cents, `Expense reversal: ${cleanReason}`);

      // 4. Update expense status
      db.prepare(`
        UPDATE expenses
        SET status = 'reversed', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanReason, exp.id);

      AuditService.logAuthEvent(
        userId || null,
        'system',
        'EXPENSE_CANCELLED',
        `expenses:${exp.id}`,
        'success',
        `Reversed expense ${exp.voucher_no} (${exp.amount_cents} cents): ${cleanReason}`
      );
    });

    runTx();
  }

  // ========================================================
  // 6. UNIFIED CASH BOOK & PETTY CASH
  // ========================================================
  public static getUnifiedCashBook(params?: {
    financialYearId?: number;
    search?: string;
    sourceFilter?: 'all' | 'cash' | 'bank' | number;
    dateFrom?: string;
    dateTo?: string;
    typeFilter?: string;
    limit?: number;
    offset?: number;
  }): {
    transactions: UnifiedCashBookTransaction[];
    total: number;
    cashBalanceCents: number;
    bankBalanceCents: number;
    totalLiquidCents: number;
    totalCashInCents: number;
    totalCashOutCents: number;
    totalBankInCents: number;
    totalBankOutCents: number;
    kpi: {
      cashBalanceCents: number;
      bankBalanceCents: number;
      totalLiquidBalanceCents: number;
      totalInflowCents: number;
      totalOutflowCents: number;
    };
    bankAccounts: Array<{
      id: number;
      account_code: string;
      bank_name: string;
      branch_name: string;
      account_number: string;
      current_balance_cents: number;
    }>;
  } {
    const db = getDatabase();
    const yearId = params?.financialYearId || this.getCurrentFinancialYear()?.id || 1;

    // Active bank accounts
    const bankAccounts = db.prepare(`
      SELECT id, account_code, bank_name, branch_name, account_number, current_balance_cents
      FROM bank_accounts
      WHERE status = 'active'
      ORDER BY bank_name ASC
    `).all() as any[];

    const totalBankBalance = bankAccounts.reduce((sum, b) => sum + Number(b.current_balance_cents || 0), 0);

    // Latest cash balance
    const lastCashRow = db.prepare(`
      SELECT running_balance_cents
      FROM cash_transactions
      WHERE financial_year_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(yearId) as any;
    const cashBalance = Number(lastCashRow?.running_balance_cents || 0);

    const unifiedList: UnifiedCashBookTransaction[] = [];
    const sourceFilter = params?.sourceFilter !== undefined ? params.sourceFilter : 'all';

    // 1. Fetch cash transactions if 'all' or 'cash'
    if (sourceFilter === 'all' || sourceFilter === 'cash') {
      let cashSql = `
        SELECT ct.id, ct.financial_year_id, ct.transaction_date, ct.transaction_type,
               ct.amount_cents, ct.running_balance_cents, ct.reference_no, ct.description, ct.created_at
        FROM cash_transactions ct
        WHERE ct.financial_year_id = ?
      `;
      const cashParams: any[] = [yearId];
      if (params?.search && params.search.trim()) {
        const term = `%${params.search.trim()}%`;
        cashSql += ' AND (ct.reference_no LIKE ? OR ct.description LIKE ?)';
        cashParams.push(term, term);
      }
      if (params?.dateFrom) {
        cashSql += ' AND ct.transaction_date >= ?';
        cashParams.push(params.dateFrom);
      }
      if (params?.dateTo) {
        cashSql += ' AND ct.transaction_date <= ?';
        cashParams.push(params.dateTo);
      }
      if (params?.typeFilter && params.typeFilter !== 'all') {
        if (params.typeFilter === 'receipt' || params.typeFilter === 'inflow') {
          cashSql += ' AND ct.amount_cents > 0';
        } else if (params.typeFilter === 'payment' || params.typeFilter === 'disbursement') {
          cashSql += ' AND ct.amount_cents < 0';
        } else {
          cashSql += ' AND ct.transaction_type = ?';
          cashParams.push(params.typeFilter);
        }
      }
      cashSql += ' ORDER BY ct.transaction_date ASC, ct.id ASC';

      const cashRows = db.prepare(cashSql).all(...cashParams) as any[];
      for (const r of cashRows) {
        const amt = Number(r.amount_cents || 0);
        unifiedList.push({
          id: `cash-${r.id}`,
          raw_id: r.id,
          source_type: 'cash',
          payment_source: 'Cash in Hand',
          account_name: 'Cash in Hand',
          date: r.transaction_date,
          transaction_date: r.transaction_date,
          transaction_type: r.transaction_type,
          reference: r.reference_no,
          reference_no: r.reference_no,
          cheque_number: null,
          payee_or_payer: null,
          description: r.description,
          cash_in_cents: amt > 0 ? amt : 0,
          cash_out_cents: amt < 0 ? Math.abs(amt) : 0,
          cash_received_cents: amt > 0 ? amt : 0,
          cash_paid_cents: amt < 0 ? Math.abs(amt) : 0,
          bank_in_cents: 0,
          bank_out_cents: 0,
          bank_received_cents: 0,
          bank_paid_cents: 0,
          amount_cents: amt,
          running_balance_cents: 0,
          created_at: r.created_at,
        } as any);
      }
    }

    // 2. Fetch bank transactions if 'all' or 'bank' or numeric bank account id
    if (sourceFilter === 'all' || sourceFilter === 'bank' || typeof sourceFilter === 'number') {
      let bankSql = `
        SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.transaction_type,
               bt.amount_cents, bt.reference_no, bt.cheque_number, bt.payee_or_payer, bt.description, bt.created_at,
               ba.bank_name, ba.branch_name, ba.account_number, ba.account_code
        FROM bank_transactions bt
        INNER JOIN bank_accounts ba ON bt.bank_account_id = ba.id
        WHERE 1=1
      `;
      const bankParams: any[] = [];
      if (typeof sourceFilter === 'number') {
        bankSql += ' AND bt.bank_account_id = ?';
        bankParams.push(sourceFilter);
      }
      if (params?.search && params.search.trim()) {
        const term = `%${params.search.trim()}%`;
        bankSql += ' AND (bt.reference_no LIKE ? OR bt.cheque_number LIKE ? OR bt.payee_or_payer LIKE ? OR bt.description LIKE ?)';
        bankParams.push(term, term, term, term);
      }
      if (params?.dateFrom) {
        bankSql += ' AND bt.transaction_date >= ?';
        bankParams.push(params.dateFrom);
      }
      if (params?.dateTo) {
        bankSql += ' AND bt.transaction_date <= ?';
        bankParams.push(params.dateTo);
      }
      if (params?.typeFilter && params.typeFilter !== 'all') {
        if (params.typeFilter === 'receipt' || params.typeFilter === 'inflow') {
          bankSql += ' AND bt.amount_cents > 0';
        } else if (params.typeFilter === 'payment' || params.typeFilter === 'disbursement') {
          bankSql += ' AND bt.amount_cents < 0';
        } else {
          bankSql += ' AND bt.transaction_type = ?';
          bankParams.push(params.typeFilter);
        }
      }
      bankSql += ' ORDER BY bt.transaction_date ASC, bt.id ASC';

      const bankRows = db.prepare(bankSql).all(...bankParams) as any[];
      for (const r of bankRows) {
        const amt = Number(r.amount_cents || 0);
        unifiedList.push({
          id: `bank-${r.id}`,
          raw_id: r.id,
          source_type: 'bank',
          bank_account_id: r.bank_account_id,
          bank_name: r.bank_name,
          account_number: r.account_number,
          payment_source: `${r.bank_name} (${r.account_number})`,
          account_name: `${r.bank_name} (${r.account_number})`,
          date: r.transaction_date,
          transaction_date: r.transaction_date,
          transaction_type: r.transaction_type,
          reference: r.reference_no,
          reference_no: r.reference_no,
          cheque_number: r.cheque_number || null,
          payee_or_payer: r.payee_or_payer || null,
          description: r.description,
          cash_in_cents: 0,
          cash_out_cents: 0,
          cash_received_cents: 0,
          cash_paid_cents: 0,
          bank_in_cents: amt > 0 ? amt : 0,
          bank_out_cents: amt < 0 ? Math.abs(amt) : 0,
          bank_received_cents: amt > 0 ? amt : 0,
          bank_paid_cents: amt < 0 ? Math.abs(amt) : 0,
          amount_cents: amt,
          running_balance_cents: 0,
          created_at: r.created_at,
        } as any);
      }
    }

    // 3. Chronological sorting to compute running balance
    unifiedList.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || (a.raw_id - b.raw_id));

    let runBal = 0;
    let totalCashIn = 0;
    let totalCashOut = 0;
    let totalBankIn = 0;
    let totalBankOut = 0;

    for (const item of unifiedList) {
      runBal += item.amount_cents;
      item.running_balance_cents = runBal;
      totalCashIn += item.cash_in_cents;
      totalCashOut += item.cash_out_cents;
      totalBankIn += item.bank_in_cents;
      totalBankOut += item.bank_out_cents;
    }

    // 4. Sort descending for display (most recent first)
    unifiedList.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || (b.raw_id - a.raw_id));

    const totalCount = unifiedList.length;
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    const paginated = unifiedList.slice(offset, offset + limit);

    return {
      transactions: paginated,
      total: totalCount,
      cashBalanceCents: cashBalance,
      bankBalanceCents: totalBankBalance,
      totalLiquidCents: cashBalance + totalBankBalance,
      totalCashInCents: totalCashIn,
      totalCashOutCents: totalCashOut,
      totalBankInCents: totalBankIn,
      totalBankOutCents: totalBankOut,
      kpi: {
        cashBalanceCents: cashBalance,
        bankBalanceCents: totalBankBalance,
        totalLiquidBalanceCents: cashBalance + totalBankBalance,
        totalInflowCents: totalCashIn + totalBankIn,
        totalOutflowCents: totalCashOut + totalBankOut,
      },
      bankAccounts: bankAccounts.map((b) => ({
        id: b.id,
        account_code: b.account_code,
        bank_name: b.bank_name,
        branch_name: b.branch_name,
        account_number: b.account_number,
        current_balance_cents: Number(b.current_balance_cents || 0),
      })),
    };
  }
  public static getCashTransactions(limit = 50, offset = 0, financialYearId?: number): { transactions: CashTransaction[]; total: number; balanceCents: number } {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;

    const countRow = db.prepare('SELECT COUNT(*) as count FROM cash_transactions WHERE financial_year_id = ?').get(yearId) as { count: number };
    const lastRow = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;

    const rows = db.prepare(`
      SELECT ct.id, ct.financial_year_id, ct.transaction_date, ct.transaction_type, ct.amount_cents,
             ct.running_balance_cents, ct.reference_no, ct.description, ct.created_at
      FROM cash_transactions ct
      WHERE ct.financial_year_id = ?
      ORDER BY ct.transaction_date DESC, ct.id DESC
      LIMIT ? OFFSET ?
    `).all(yearId, limit, offset) as any[];

    return {
      transactions: rows,
      total: countRow.count,
      balanceCents: lastRow ? lastRow.running_balance_cents : 0,
    };
  }

  public static getPettyCashVouchers(
    limit = 50,
    offset = 0,
    financialYearId?: number,
    filters?: {
      search?: string;
      type?: 'all' | 'expense' | 'replenishment';
      startDate?: string;
      endDate?: string;
    }
  ): {
    vouchers: PettyCashVoucher[];
    total: number;
    balanceCents: number;
    totalReplenishedCents: number;
    totalDisbursedCents: number;
    expenseCount: number;
    replenishCount: number;
  } {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;

    // Build KPI metrics for this financial year
    const kpiRow = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') AND pcv.status = 'approved' THEN pcv.amount_cents ELSE 0 END), 0) as total_replenished,
        COALESCE(SUM(CASE WHEN pcv.type IN ('expense', 'transfer_out') AND pcv.status = 'approved' THEN pcv.amount_cents ELSE 0 END), 0) as total_disbursed,
        COALESCE(COUNT(CASE WHEN pcv.type = 'expense' THEN 1 END), 0) as expense_count,
        COALESCE(COUNT(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN 1 END), 0) as replenish_count
      FROM petty_cash_vouchers pcv
      WHERE pcv.financial_year_id = ?
    `).get(yearId) as any;

    const totalReplenished = Number(kpiRow?.total_replenished || 0);
    const totalDisbursed = Number(kpiRow?.total_disbursed || 0);
    const balanceCents = totalReplenished - totalDisbursed;

    // Build filtered query
    let whereClause = `WHERE pcv.financial_year_id = ?`;
    const params: any[] = [yearId];

    if (filters?.type === 'expense') {
      whereClause += ` AND pcv.type IN ('expense', 'transfer_out')`;
    } else if (filters?.type === 'replenishment') {
      whereClause += ` AND pcv.type IN ('replenishment', 'transfer_in')`;
    }

    if (filters?.startDate) {
      whereClause += ` AND pcv.voucher_date >= ?`;
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClause += ` AND pcv.voucher_date <= ?`;
      params.push(filters.endDate);
    }

    if (filters?.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      whereClause += ` AND (
        pcv.voucher_no LIKE ?
        OR pcv.payee LIKE ?
        OR pcv.description LIKE ?
        OR bc.category_code LIKE ?
        OR bc.name LIKE ?
        OR bc.name_en LIKE ?
        OR bc.name_si LIKE ?
        OR e.reference_no LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term, term);
    }

    // Count matching rows
    const countQuery = `
      SELECT COUNT(DISTINCT pcv.id) as count
      FROM petty_cash_vouchers pcv
      LEFT JOIN budget_categories bc ON pcv.category_id = bc.id
      LEFT JOIN expenses e ON e.petty_cash_voucher_id = pcv.id
      ${whereClause}
    `;
    const countRow = db.prepare(countQuery).get(...params) as { count: number };

    // Fetch paginated rows with full relational context
    const dataQuery = `
      SELECT pcv.id, pcv.voucher_no, pcv.voucher_date, pcv.financial_year_id, pcv.category_id,
             pcv.type, pcv.amount_cents, pcv.payee, pcv.description, pcv.receipt_attached, pcv.status, pcv.created_by, pcv.created_at,
             bc.category_code, COALESCE(bc.name, bc.name_en) as category_name_en, bc.name_si as category_name_si,
             u.full_name as creator_name,
             COALESCE(e.reference_no, NULL) as receipt_no
      FROM petty_cash_vouchers pcv
      LEFT JOIN budget_categories bc ON pcv.category_id = bc.id
      LEFT JOIN users u ON pcv.created_by = u.id
      LEFT JOIN expenses e ON e.petty_cash_voucher_id = pcv.id
      ${whereClause}
      GROUP BY pcv.id
      ORDER BY pcv.voucher_date DESC, pcv.id DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...params, limit, offset) as any[];

    return {
      vouchers: rows.map((r) => ({
        ...r,
        receipt_attached: Boolean(r.receipt_attached),
      })),
      total: countRow ? countRow.count : 0,
      balanceCents,
      totalReplenishedCents: totalReplenished,
      totalDisbursedCents: totalDisbursed,
      expenseCount: Number(kpiRow?.expense_count || 0),
      replenishCount: Number(kpiRow?.replenish_count || 0),
    };
  }

  public static replenishPettyCash(data: {
    financial_year_id: number;
    voucher_date: string;
    amount_cents: number;
    description: string;
    source_type?: 'cash' | 'bank';
    bank_account_id?: number | null;
    reference_no?: string;
  }, userId?: number): void {
    const db = getDatabase();
    if (data.amount_cents <= 0) throw new Error('Replenishment amount must be greater than zero.');

    const sourceType = data.source_type || 'bank';
    if (sourceType === 'bank' && !data.bank_account_id) {
      data.bank_account_id = this.getDefaultBankAccount().id;
    }

    const runTx = db.transaction(() => {
      const prefix = 'PC-REP-';
      const lastRep = db.prepare(`
        SELECT voucher_no FROM petty_cash_vouchers
        WHERE voucher_no LIKE ?
        ORDER BY id DESC
        LIMIT 1
      `).get(`${prefix}%`) as { voucher_no: string } | undefined;

      let nextSeq = 1;
      if (lastRep && lastRep.voucher_no) {
        const parts = lastRep.voucher_no.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) {
          nextSeq = num + 1;
        }
      }
      let voucherNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      while (db.prepare('SELECT id FROM petty_cash_vouchers WHERE voucher_no = ?').get(voucherNo)) {
        nextSeq++;
        voucherNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      }

      let payeeName = 'Main Cash in Hand';
      let bankInfo: any = null;

      if (sourceType === 'bank') {
        bankInfo = db.prepare('SELECT id, bank_name, branch_name, account_number, current_balance_cents FROM bank_accounts WHERE id = ?').get(data.bank_account_id) as any;
        if (!bankInfo) throw new Error('Selected bank account not found.');
        payeeName = `Bank: ${bankInfo.bank_name} (${bankInfo.account_number})`;
      }

      // Insert into petty cash ledger
      db.prepare(`
        INSERT INTO petty_cash_vouchers (voucher_no, voucher_date, financial_year_id, type, amount_cents, payee, description, receipt_attached, status, created_by)
        VALUES (?, ?, ?, 'replenishment', ?, ?, ?, 1, 'approved', ?)
      `).run(voucherNo, data.voucher_date, data.financial_year_id, data.amount_cents, payeeName, data.description || 'Replenishment of petty cash float', userId || null);

      if (sourceType === 'bank') {
        // Deduct from Bank Account
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(data.amount_cents, data.bank_account_id);

        // Record withdrawal in bank_transactions
        db.prepare(`
          INSERT INTO bank_transactions (bank_account_id, transaction_date, transaction_type, amount_cents, reference_no, payee_or_payer, description, created_by)
          VALUES (?, ?, 'withdrawal', ?, ?, 'Petty Cash Float', ?, ?)
        `).run(
          data.bank_account_id,
          data.voucher_date,
          data.amount_cents,
          voucherNo,
          data.description || 'Petty cash replenishment withdrawal',
          userId || null
        );

        // Journal entry: Dr Petty Cash (2), Cr Bank (3)
        const entryStmt = db.prepare(`
          INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, description, total_amount_cents, status, created_by)
          VALUES (?, ?, ?, 'petty_cash', 'Petty Cash Float Replenishment from Bank', ?, 'posted', ?)
        `);
        const jRes = entryStmt.run(`JRN-PC-${voucherNo}`, data.voucher_date, data.financial_year_id, data.amount_cents, userId || null);
        const jId = Number(jRes.lastInsertRowid);

        const insLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents, description) VALUES (?, ?, ?, ?, ?)');
        insLine.run(jId, 2, data.amount_cents, 0, 'Petty Cash Impress increase');
        insLine.run(jId, 3, 0, data.amount_cents, `Bank Account (${bankInfo.bank_name}) transferred`);
      } else {
        // Deduct from Main Cash Book
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions ORDER BY id DESC LIMIT 1').get() as any;
        const currentBal = (lastCash ? lastCash.running_balance_cents : 0) - data.amount_cents;

        db.prepare(`
          INSERT INTO cash_transactions (financial_year_id, transaction_date, transaction_type, amount_cents, running_balance_cents, reference_no, description, created_by)
          VALUES (?, ?, 'petty_cash_transfer', ?, ?, ?, ?, ?)
        `).run(data.financial_year_id, data.voucher_date, -data.amount_cents, currentBal, voucherNo, 'Petty cash replenishment transfer', userId || null);

        // Journal entry: Dr Petty Cash (2), Cr Cash in Hand (1)
        const entryStmt = db.prepare(`
          INSERT INTO journal_entries (entry_number, entry_date, financial_year_id, reference_type, description, total_amount_cents, status, created_by)
          VALUES (?, ?, ?, 'petty_cash', 'Petty Cash Float Replenishment', ?, 'posted', ?)
        `);
        const jRes = entryStmt.run(`JRN-PC-${voucherNo}`, data.voucher_date, data.financial_year_id, data.amount_cents, userId || null);
        const jId = Number(jRes.lastInsertRowid);

        const insLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents, description) VALUES (?, ?, ?, ?, ?)');
        insLine.run(jId, 2, data.amount_cents, 0, 'Petty Cash Impress increase');
        insLine.run(jId, 1, 0, data.amount_cents, 'Cash in hand transferred');
      }

      AuditService.logAuthEvent(userId || null, 'system', 'PETTY_CASH_REPLENISHED', `petty_cash:${voucherNo}`, 'success');
    });

    runTx();
  }

  // ========================================================
  // 7. BANK MANAGEMENT
  // ========================================================
  public static getBankAccounts(): BankAccount[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT ba.id, ba.account_code, ba.bank_name, ba.branch_name, ba.account_number,
             ba.account_type, ba.opening_balance_cents, ba.current_balance_cents, ba.status
      FROM bank_accounts ba
      ORDER BY ba.bank_name ASC
    `).all() as any[];

    return rows;
  }

  public static getDefaultBankAccount(): BankAccount {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM bank_accounts WHERE status = 'active' ORDER BY id ASC LIMIT 1`).get() as any;
    if (!row) {
      const anyRow = db.prepare(`SELECT * FROM bank_accounts ORDER BY id ASC LIMIT 1`).get() as any;
      if (!anyRow) throw new Error('No active bank account configured in the system.');
      return anyRow;
    }
    return row;
  }

  public static createBankAccount(data: {
    account_code?: string;
    bank_name: string;
    branch_name?: string;
    account_number: string;
    account_type: BankAccount['account_type'];
    opening_balance_cents: number;
  }, userId?: number): BankAccount {
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as c FROM bank_accounts').get() as any;
    if ((countRow?.c || 0) >= 1) {
      throw new Error('Only 1 institutional bank account is allowed. Additional bank accounts cannot be registered.');
    }
    const code = (data.account_code || `BA-0${(countRow?.c || 0) + 1}`).trim();
    const branch = (data.branch_name || 'Main Branch').trim();
    if (!data.bank_name.trim()) throw new Error('Bank name is required.');
    if (!data.account_number.trim()) throw new Error('Account number is required.');

    const stmt = db.prepare(`
      INSERT INTO bank_accounts (account_code, bank_name, branch_name, account_number, account_type, opening_balance_cents, current_balance_cents, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    const res = stmt.run(code, data.bank_name.trim(), branch, data.account_number.trim(), data.account_type, data.opening_balance_cents, data.opening_balance_cents);
    const bankId = Number(res.lastInsertRowid);

    AuditService.logAuthEvent(userId || null, 'system', 'BANK_ACCOUNT_CREATED', `bank_accounts:${bankId}`, 'success');

    return {
      id: bankId,
      account_code: code,
      bank_name: data.bank_name.trim(),
      branch_name: branch,
      account_number: data.account_number.trim(),
      account_type: data.account_type,
      opening_balance_cents: data.opening_balance_cents,
      current_balance_cents: data.opening_balance_cents,
      status: 'active',
    };
  }

  public static getBankTransactions(bankAccountId: number, limit = 50, offset = 0): { transactions: BankTransaction[]; total: number } {
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM bank_transactions WHERE bank_account_id = ?').get(bankAccountId) as { count: number };

    const rows = db.prepare(`
      SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.transaction_type, bt.amount_cents,
             bt.reference_no, bt.cheque_number, bt.payee_or_payer, bt.description, bt.is_reconciled,
             bt.reconciled_at, bt.created_at,
             ba.bank_name, ba.account_number
      FROM bank_transactions bt
      INNER JOIN bank_accounts ba ON bt.bank_account_id = ba.id
      WHERE bt.bank_account_id = ?
      ORDER BY bt.transaction_date DESC, bt.id DESC
      LIMIT ? OFFSET ?
    `).all(bankAccountId, limit, offset) as any[];

    return {
      transactions: rows.map((r) => ({ ...r, is_reconciled: Boolean(r.is_reconciled) })),
      total: countRow.count,
    };
  }

  // ========================================================
  // 8. FINANCIAL SUMMARY & METRICS
  // ========================================================
  public static getSummaryStats(financialYearId?: number): FinancialSummaryStats {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;

    // 1. Cash Balance
    const cashRow = db.prepare(`
      SELECT running_balance_cents FROM cash_transactions
      WHERE financial_year_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(yearId) as any;
    const cashBal = cashRow ? cashRow.running_balance_cents : 0;

    // 2. Bank Balance (sum across accounts)
    const bankRow = db.prepare(`
      SELECT SUM(current_balance_cents) as total_bank FROM bank_accounts WHERE status = 'active'
    `).get() as any;
    const bankBal = bankRow?.total_bank || 0;

    // 3. Petty Cash Balance
    const pettyRow = db.prepare(`
      SELECT SUM(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN pcv.amount_cents ELSE -pcv.amount_cents END) as petty_bal
      FROM petty_cash_vouchers pcv
      WHERE pcv.financial_year_id = ? AND pcv.status = 'approved'
    `).get(yearId) as any;
    const pettyBal = pettyRow?.petty_bal || 0;

    // 4. Annual Budget & Expenses
    const budgetRow = db.prepare(`
      SELECT SUM(revised_amount_cents) as total_budget FROM annual_budgets WHERE financial_year_id = ?
    `).get(yearId) as any;
    const annualBudget = budgetRow?.total_budget || 0;

    const expRow = db.prepare(`
      SELECT SUM(amount_cents) as total_exp FROM expenses WHERE financial_year_id = ? AND status IN ('approved', 'paid')
    `).get(yearId) as any;
    const totalExpenses = expRow?.total_exp || 0;

    // 5. Total Funds Received
    const fundsRow = db.prepare(`
      SELECT SUM(amount_cents) as total_rcpt FROM fund_receipts WHERE financial_year_id = ? AND status = 'posted'
    `).get(yearId) as any;
    const fundsRcpt = fundsRow?.total_rcpt || 0;

    // 6. Pending Approvals
    const pendingRow = db.prepare(`
      SELECT COUNT(*) as pending_count FROM expenses WHERE financial_year_id = ? AND status = 'submitted'
    `).get(yearId) as any;

    return {
      cashBalanceCents: cashBal,
      bankBalanceCents: bankBal,
      pettyCashBalanceCents: pettyBal,
      annualBudgetCents: annualBudget,
      totalExpensesCents: totalExpenses,
      remainingBudgetCents: annualBudget - totalExpenses,
      totalFundsReceivedCents: fundsRcpt,
      pendingApprovalsCount: pendingRow?.pending_count || 0,
    };
  }

  // ========================================================
  // 9. TRIAL BALANCE & GENERAL LEDGER
  // ========================================================
  public static getTrialBalance(financialYearId?: number): { lines: any[]; totalDebitCents: number; totalCreditCents: number } {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;

    // Explicit JOIN between chart_of_accounts, journal_lines, and journal_entries
    const rows = db.prepare(`
      SELECT coa.id, coa.account_code, coa.account_name_en, coa.account_name_si, coa.account_type,
             COALESCE(SUM(jl.debit_cents), 0) as total_debit_cents,
             COALESCE(SUM(jl.credit_cents), 0) as total_credit_cents
      FROM chart_of_accounts coa
      LEFT JOIN journal_lines jl ON coa.id = jl.account_id
      LEFT JOIN journal_entries je ON jl.entry_id = je.id AND je.financial_year_id = ? AND je.status = 'posted'
      GROUP BY coa.id, coa.account_code, coa.account_name_en, coa.account_name_si, coa.account_type
      HAVING total_debit_cents > 0 OR total_credit_cents > 0
      ORDER BY coa.account_code ASC
    `).all(yearId) as any[];

    let totalDebit = 0;
    let totalCredit = 0;

    const lines = rows.map((r) => {
      totalDebit += Number(r.total_debit_cents);
      totalCredit += Number(r.total_credit_cents);
      return {
        ...r,
        total_debit_cents: Number(r.total_debit_cents),
        total_credit_cents: Number(r.total_credit_cents),
      };
    });

    return {
      lines,
      totalDebitCents: totalDebit,
      totalCreditCents: totalCredit,
    };
  }

  // ========================================================
  // 9B. REIMBURSEMENT REPORT MODULE
  // ========================================================
  public static getReimbursementVouchers(financialYearId?: number): ReimbursementVoucherOption[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT pcv.id, pcv.voucher_no, pcv.voucher_date, pcv.amount_cents, pcv.payee, pcv.description
      FROM petty_cash_vouchers pcv
      WHERE pcv.type IN ('replenishment', 'transfer_in')
        AND (? IS NULL OR pcv.financial_year_id = ?)
      ORDER BY pcv.voucher_date ASC, pcv.id ASC
    `).all(financialYearId || null, financialYearId || null) as any[];

    return rows.map((r) => ({
      id: r.id,
      voucher_no: r.voucher_no,
      voucher_date: r.voucher_date,
      amount_cents: Number(r.amount_cents || 0),
      payee: r.payee,
      description: r.description,
    }));
  }

  public static getReimbursementReport(params: {
    yearId?: number;
    fromVoucherId?: number;
    toVoucherId?: number;
    startDate?: string;
    endDate?: string;
  }): ReimbursementReportData {
    const db = getDatabase();
    const yearId = params.yearId || this.getCurrentFinancialYear()?.id || null;

    let filterMode: 'reimbursements' | 'date_range' = 'date_range';
    let fromVoucher: ReimbursementVoucherOption | null = null;
    let toVoucher: ReimbursementVoucherOption | null = null;
    let effStartDate: string = params.startDate || '';
    let effEndDate: string = params.endDate || '';

    if (params.fromVoucherId) {
      filterMode = 'reimbursements';
      const fv = db.prepare(`
        SELECT id, voucher_no, voucher_date, amount_cents, payee, description
        FROM petty_cash_vouchers
        WHERE id = ?
      `).get(params.fromVoucherId) as any;

      if (fv) {
        fromVoucher = {
          id: fv.id,
          voucher_no: fv.voucher_no,
          voucher_date: fv.voucher_date,
          amount_cents: Number(fv.amount_cents || 0),
          payee: fv.payee,
          description: fv.description,
        };
        effStartDate = fv.voucher_date;
      }
    }

    if (params.toVoucherId) {
      filterMode = 'reimbursements';
      const tv = db.prepare(`
        SELECT id, voucher_no, voucher_date, amount_cents, payee, description
        FROM petty_cash_vouchers
        WHERE id = ?
      `).get(params.toVoucherId) as any;

      if (tv) {
        toVoucher = {
          id: tv.id,
          voucher_no: tv.voucher_no,
          voucher_date: tv.voucher_date,
          amount_cents: Number(tv.amount_cents || 0),
          payee: tv.payee,
          description: tv.description,
        };
        effEndDate = tv.voucher_date;
      }
    }

    // Default dates if still undefined
    if (!effStartDate) {
      const firstRow = db.prepare(`
        SELECT MIN(voucher_date) as min_date
        FROM petty_cash_vouchers
        WHERE (? IS NULL OR financial_year_id = ?)
      `).get(yearId, yearId) as any;
      effStartDate = firstRow?.min_date || '2026-01-01';
    }

    if (!effEndDate) {
      effEndDate = new Date().toISOString().split('T')[0];
    }

    // 1. Calculate opening float prior to effStartDate
    const openingRow = db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN pcv.amount_cents
             ELSE -pcv.amount_cents END
      ), 0) as opening_float
      FROM petty_cash_vouchers pcv
      WHERE (? IS NULL OR pcv.financial_year_id = ?)
        AND pcv.voucher_date < ?
        AND pcv.status = 'approved'
    `).get(yearId, yearId, effStartDate) as any;
    const openingFloatCents = Number(openingRow?.opening_float || 0);

    // 2. Fetch all petty cash vouchers in the period using explicit LEFT JOIN
    const txRows = db.prepare(`
      SELECT pcv.id, pcv.voucher_no, pcv.voucher_date, pcv.financial_year_id,
             pcv.category_id, pcv.type, pcv.amount_cents, pcv.payee, pcv.description,
             pcv.receipt_attached, pcv.status, pcv.created_at,
             bc.category_code, bc.name_en as category_name_en, bc.name_si as category_name_si
      FROM petty_cash_vouchers pcv
      LEFT JOIN budget_categories bc ON bc.id = pcv.category_id
      WHERE (? IS NULL OR pcv.financial_year_id = ?)
        AND pcv.voucher_date >= ?
        AND pcv.voucher_date <= ?
        AND pcv.status = 'approved'
      ORDER BY pcv.voucher_date ASC, pcv.id ASC
    `).all(yearId, yearId, effStartDate, effEndDate) as any[];

    let totalReplenishedCents = 0;
    let totalDisbursedCents = 0;

    const transactions = txRows.map((r) => {
      const amt = Number(r.amount_cents || 0);
      if (r.type === 'replenishment' || r.type === 'transfer_in') {
        totalReplenishedCents += amt;
      } else {
        totalDisbursedCents += amt;
      }
      return {
        id: r.id,
        voucher_no: r.voucher_no,
        voucher_date: r.voucher_date,
        financial_year_id: r.financial_year_id,
        category_id: r.category_id,
        category_code: r.category_code,
        category_name_en: r.category_name_en,
        category_name_si: r.category_name_si,
        type: r.type,
        amount_cents: amt,
        payee: r.payee,
        description: r.description,
        receipt_attached: Boolean(r.receipt_attached),
        status: r.status,
        created_at: r.created_at,
      };
    });

    const closingFloatCents = openingFloatCents + totalReplenishedCents - totalDisbursedCents;

    // 3. Category Spending Breakdown using explicit INNER JOIN
    const categoryRows = db.prepare(`
      SELECT bc.id as category_id, bc.category_code, bc.name_en as category_name_en, bc.name_si as category_name_si,
             COUNT(pcv.id) as voucher_count,
             SUM(pcv.amount_cents) as total_spent_cents
      FROM petty_cash_vouchers pcv
      INNER JOIN budget_categories bc ON bc.id = pcv.category_id
      WHERE pcv.type = 'expense'
        AND (? IS NULL OR pcv.financial_year_id = ?)
        AND pcv.voucher_date >= ?
        AND pcv.voucher_date <= ?
        AND pcv.status = 'approved'
      GROUP BY bc.id, bc.category_code, bc.name_en, bc.name_si
      ORDER BY total_spent_cents DESC
    `).all(yearId, yearId, effStartDate, effEndDate) as any[];

    const categoryBreakdown: ReimbursementCategoryBreakdown[] = categoryRows.map((c) => ({
      category_id: c.category_id,
      category_code: c.category_code,
      category_name_en: c.category_name_en,
      category_name_si: c.category_name_si,
      voucher_count: Number(c.voucher_count || 0),
      total_spent_cents: Number(c.total_spent_cents || 0),
    }));

    return {
      filterMode,
      financial_year_id: yearId || undefined,
      fromVoucher,
      toVoucher,
      startDate: effStartDate,
      endDate: effEndDate,
      openingFloatCents,
      totalReplenishedCents,
      totalDisbursedCents,
      closingFloatCents,
      voucherCount: transactions.length,
      transactions,
      categoryBreakdown,
    };
  }

  // ========================================================
  // 10. FUND TRANSFERS MANAGEMENT MODULE
  // ========================================================
  public static getAccountBalances(financialYearId?: number): AccountBalancesSummary {
    const db = getDatabase();
    const yearId = financialYearId || this.getCurrentFinancialYear()?.id || 1;

    // Cash balance
    const lastCash = db.prepare(`
      SELECT running_balance_cents
      FROM cash_transactions
      WHERE financial_year_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(yearId) as any;
    const cashBalanceCents = Number(lastCash?.running_balance_cents || 0);

    // Petty cash balance
    const pettyRow = db.prepare(`
      SELECT SUM(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN pcv.amount_cents ELSE -pcv.amount_cents END) as balance
      FROM petty_cash_vouchers pcv
      WHERE pcv.financial_year_id = ? AND pcv.status = 'approved'
    `).get(yearId) as any;
    const pettyCashBalanceCents = Number(pettyRow?.balance || 0);

    // Bank accounts
    const bankAccounts = db.prepare(`
      SELECT id, account_code, bank_name, branch_name, account_number, account_type, current_balance_cents
      FROM bank_accounts
      WHERE status = 'active'
      ORDER BY bank_name ASC
    `).all() as any[];

    const totalBankBalance = bankAccounts.reduce((sum, b) => sum + Number(b.current_balance_cents || 0), 0);

    return {
      cashBalanceCents,
      pettyCashBalanceCents,
      bankAccounts: bankAccounts.map((b) => ({
        id: b.id,
        account_code: b.account_code,
        bank_name: b.bank_name,
        branch_name: b.branch_name,
        account_number: b.account_number,
        account_type: b.account_type,
        current_balance_cents: Number(b.current_balance_cents || 0),
      })),
      totalLiquidCents: cashBalanceCents + pettyCashBalanceCents + totalBankBalance,
    };
  }

  public static createFundTransfer(data: {
    financial_year_id?: number;
    transfer_date: string;
    source_account_type: TransferAccountType;
    source_bank_account_id?: number | null;
    destination_account_type: TransferAccountType;
    destination_bank_account_id?: number | null;
    amount_cents: number;
    reference_no?: string;
    description: string;
  }, userId?: number): FundTransfer {
    const db = getDatabase();
    const yearId = data.financial_year_id || this.getCurrentFinancialYear()?.id || 1;

    // 1. Validation: Amount
    if (!Number.isInteger(data.amount_cents) || data.amount_cents <= 0) {
      throw new Error('Transfer amount must be greater than zero.');
    }

    // 2. Validation: Account types & Same Account
    if (data.source_account_type === 'petty_cash' || data.destination_account_type === 'petty_cash') {
      throw new Error('Petty cash is not allowed in internal fund transfers. Transfers are only permitted between Cash in Hand and the institutional Bank Account.');
    }

    const validTypes: TransferAccountType[] = ['cash', 'bank'];
    if (!validTypes.includes(data.source_account_type) || !validTypes.includes(data.destination_account_type)) {
      throw new Error('Invalid source or destination account type. Only "cash" and "bank" are permitted.');
    }

    if (data.source_account_type === data.destination_account_type) {
      throw new Error(`Cannot transfer from ${data.source_account_type} to ${data.destination_account_type}.`);
    }

    if (data.source_account_type === 'bank' && !data.source_bank_account_id) {
      data.source_bank_account_id = this.getDefaultBankAccount().id;
    }
    if (data.destination_account_type === 'bank' && !data.destination_bank_account_id) {
      data.destination_bank_account_id = this.getDefaultBankAccount().id;
    }

    // Check Financial Year status
    const fy = db.prepare('SELECT id, year_name, status FROM financial_years WHERE id = ?').get(yearId) as any;
    if (!fy) throw new Error('Financial year not found.');
    if (fy.status === 'closed') throw new Error(`Cannot execute transfers in closed financial year ${fy.year_name}.`);

    let transferResult: FundTransfer | null = null;

    const executeTx = db.transaction(() => {
      // 3. Balance verification on Source Account
      let sourceLabel = '';
      if (data.source_account_type === 'cash') {
        sourceLabel = 'Cash in Hand';
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;
        const currentBal = Number(lastCash?.running_balance_cents || 0);
        if (currentBal < data.amount_cents) {
          throw new Error(`Insufficient Cash in Hand balance. Available: Rs. ${(currentBal / 100).toFixed(2)}, Requested: Rs. ${(data.amount_cents / 100).toFixed(2)}.`);
        }
      } else if (data.source_account_type === 'bank') {
        const bank = db.prepare('SELECT id, bank_name, account_number, current_balance_cents, status FROM bank_accounts WHERE id = ?').get(data.source_bank_account_id) as any;
        if (!bank || bank.status !== 'active') throw new Error('Source bank account not found or inactive.');
        sourceLabel = `${bank.bank_name} (${bank.account_number})`;
        if (bank.current_balance_cents < data.amount_cents) {
          throw new Error(`Insufficient balance in ${sourceLabel}. Available: Rs. ${(bank.current_balance_cents / 100).toFixed(2)}, Requested: Rs. ${(data.amount_cents / 100).toFixed(2)}.`);
        }
      } else if (data.source_account_type === 'petty_cash') {
        sourceLabel = 'Petty Cash Float';
        const pettyRow = db.prepare(`
          SELECT SUM(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN pcv.amount_cents ELSE -pcv.amount_cents END) as balance
          FROM petty_cash_vouchers pcv
          WHERE pcv.financial_year_id = ? AND pcv.status = 'approved'
        `).get(yearId) as any;
        const currentBal = Number(pettyRow?.balance || 0);
        if (currentBal < data.amount_cents) {
          throw new Error(`Insufficient Petty Cash balance. Available: Rs. ${(currentBal / 100).toFixed(2)}, Requested: Rs. ${(data.amount_cents / 100).toFixed(2)}.`);
        }
      }

      // Verify destination bank if applicable
      let destLabel = '';
      if (data.destination_account_type === 'cash') {
        destLabel = 'Cash in Hand';
      } else if (data.destination_account_type === 'bank') {
        const destBank = db.prepare('SELECT id, bank_name, account_number, status FROM bank_accounts WHERE id = ?').get(data.destination_bank_account_id) as any;
        if (!destBank || destBank.status !== 'active') throw new Error('Destination bank account not found or inactive.');
        destLabel = `${destBank.bank_name} (${destBank.account_number})`;
      } else if (data.destination_account_type === 'petty_cash') {
        destLabel = 'Petty Cash Float';
      }

      // 4. Generate unique sequential Transfer Reference: TRF-YYYY-XXXXX
      const yearStr = (data.transfer_date || new Date().toISOString()).slice(0, 4);
      const prefix = `TRF-${yearStr}-`;
      const lastTransfer = db.prepare(`
        SELECT transfer_reference FROM fund_transfers
        WHERE transfer_reference LIKE ?
        ORDER BY id DESC LIMIT 1
      `).get(`${prefix}%`) as { transfer_reference: string } | undefined;

      let nextSeq = 1;
      if (lastTransfer?.transfer_reference) {
        const parts = lastTransfer.transfer_reference.split('-');
        const n = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(n)) nextSeq = n + 1;
      }
      let transferRef = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      while (db.prepare('SELECT id FROM fund_transfers WHERE transfer_reference = ?').get(transferRef)) {
        nextSeq++;
        transferRef = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      }

      const cleanDesc = (data.description || `Transfer from ${sourceLabel} to ${destLabel}`).trim();
      const cleanRefNo = (data.reference_no || '').trim() || null;

      // 5. Insert into fund_transfers
      const insRes = db.prepare(`
        INSERT INTO fund_transfers (
          transfer_reference, financial_year_id, transfer_date,
          source_account_type, source_bank_account_id,
          destination_account_type, destination_bank_account_id,
          amount_cents, reference_no, description, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(
        transferRef,
        yearId,
        data.transfer_date,
        data.source_account_type,
        data.source_bank_account_id || null,
        data.destination_account_type,
        data.destination_bank_account_id || null,
        data.amount_cents,
        cleanRefNo,
        cleanDesc,
        userId || null
      );
      const transferId = Number(insRes.lastInsertRowid);

      // 6. Deduct from Source
      if (data.source_account_type === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;
        const currentBal = Number(lastCash?.running_balance_cents || 0);
        const newBal = currentBal - data.amount_cents;
        db.prepare(`
          INSERT INTO cash_transactions (
            financial_year_id, transaction_date, transaction_type,
            amount_cents, running_balance_cents, reference_no, description, created_by
          ) VALUES (?, ?, 'transfer_out', ?, ?, ?, ?, ?)
        `).run(
          yearId,
          data.transfer_date,
          -data.amount_cents,
          newBal,
          transferRef,
          `Transfer to ${destLabel}: ${cleanDesc}`,
          userId || null
        );
      } else if (data.source_account_type === 'bank') {
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(data.amount_cents, data.source_bank_account_id);

        db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type,
            amount_cents, reference_no, payee_or_payer, description, created_by
          ) VALUES (?, ?, 'transfer_out', ?, ?, ?, ?, ?)
        `).run(
          data.source_bank_account_id,
          data.transfer_date,
          -data.amount_cents,
          transferRef,
          destLabel,
          `Transfer to ${destLabel}: ${cleanDesc}`,
          userId || null
        );
      } else if (data.source_account_type === 'petty_cash') {
        const pcRef = `PC-TRF-${String(transferId).padStart(4, '0')}`;
        db.prepare(`
          INSERT INTO petty_cash_vouchers (
            voucher_no, voucher_date, financial_year_id, type,
            amount_cents, payee, description, receipt_attached, status, created_by
          ) VALUES (?, ?, ?, 'transfer_out', ?, ?, ?, 1, 'approved', ?)
        `).run(
          pcRef,
          data.transfer_date,
          yearId,
          data.amount_cents,
          destLabel,
          `Transfer to ${destLabel}: ${cleanDesc}`,
          userId || null
        );
      }

      // 7. Add to Destination
      if (data.destination_account_type === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;
        const currentBal = Number(lastCash?.running_balance_cents || 0);
        const newBal = currentBal + data.amount_cents;
        db.prepare(`
          INSERT INTO cash_transactions (
            financial_year_id, transaction_date, transaction_type,
            amount_cents, running_balance_cents, reference_no, description, created_by
          ) VALUES (?, ?, 'transfer_in', ?, ?, ?, ?, ?)
        `).run(
          yearId,
          data.transfer_date,
          data.amount_cents,
          newBal,
          transferRef,
          `Transfer from ${sourceLabel}: ${cleanDesc}`,
          userId || null
        );
      } else if (data.destination_account_type === 'bank') {
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(data.amount_cents, data.destination_bank_account_id);

        db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type,
            amount_cents, reference_no, payee_or_payer, description, created_by
          ) VALUES (?, ?, 'transfer_in', ?, ?, ?, ?, ?)
        `).run(
          data.destination_bank_account_id,
          data.transfer_date,
          data.amount_cents,
          transferRef,
          sourceLabel,
          `Transfer from ${sourceLabel}: ${cleanDesc}`,
          userId || null
        );
      } else if (data.destination_account_type === 'petty_cash') {
        const pcRef = `PC-REP-${String(transferId).padStart(4, '0')}`;
        db.prepare(`
          INSERT INTO petty_cash_vouchers (
            voucher_no, voucher_date, financial_year_id, type,
            amount_cents, payee, description, receipt_attached, status, created_by
          ) VALUES (?, ?, ?, 'replenishment', ?, ?, ?, 1, 'approved', ?)
        `).run(
          pcRef,
          data.transfer_date,
          yearId,
          data.amount_cents,
          sourceLabel,
          `Transfer from ${sourceLabel}: ${cleanDesc}`,
          userId || null
        );
      }

      AuditService.logAuthEvent(
        userId || null,
        'system',
        'FUND_TRANSFERRED',
        `fund_transfers:${transferId}`,
        'success',
        `Transferred Rs. ${(data.amount_cents / 100).toFixed(2)} from ${sourceLabel} to ${destLabel} [${transferRef}]`
      );

      transferResult = {
        id: transferId,
        transfer_reference: transferRef,
        financial_year_id: yearId,
        transfer_date: data.transfer_date,
        source_account_type: data.source_account_type,
        source_bank_account_id: data.source_bank_account_id || null,
        source_account_label: sourceLabel,
        destination_account_type: data.destination_account_type,
        destination_bank_account_id: data.destination_bank_account_id || null,
        destination_account_label: destLabel,
        amount_cents: data.amount_cents,
        reference_no: cleanRefNo,
        description: cleanDesc,
        status: 'completed',
        created_by: userId || null,
        created_at: new Date().toISOString(),
      };
    });

    executeTx();
    return transferResult!;
  }

  public static reverseFundTransfer(data: { transferId: number; reason: string }, userId?: number): boolean {
    const db = getDatabase();
    if (!data.transferId) throw new Error('Transfer ID is required.');
    const cleanReason = (data.reason || '').trim();
    if (!cleanReason) throw new Error('Please provide a reason for reversing this transfer.');

    const executeTx = db.transaction(() => {
      const transfer = db.prepare(`
        SELECT ft.id, ft.transfer_reference, ft.financial_year_id, ft.transfer_date,
               ft.source_account_type, ft.source_bank_account_id,
               ft.destination_account_type, ft.destination_bank_account_id,
               ft.amount_cents, ft.reference_no, ft.description, ft.status
        FROM fund_transfers ft
        WHERE ft.id = ?
      `).get(data.transferId) as any;

      if (!transfer) throw new Error('Fund transfer record not found.');
      if (transfer.status === 'reversed') throw new Error('This fund transfer has already been reversed.');

      const yearId = transfer.financial_year_id;
      const amount = transfer.amount_cents;
      const revRef = `REV-${transfer.transfer_reference}`;

      // Check balance at the DESTINATION account before reversing (since destination must be debited back)
      if (transfer.destination_account_type === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;
        const currentBal = Number(lastCash?.running_balance_cents || 0);
        if (currentBal < amount) {
          throw new Error(`Cannot reverse: Insufficient Cash in Hand balance. Available: Rs. ${(currentBal / 100).toFixed(2)}, Required: Rs. ${(amount / 100).toFixed(2)}.`);
        }
      } else if (transfer.destination_account_type === 'bank') {
        const bank = db.prepare('SELECT id, bank_name, account_number, current_balance_cents FROM bank_accounts WHERE id = ?').get(transfer.destination_bank_account_id) as any;
        if (!bank || bank.current_balance_cents < amount) {
          throw new Error(`Cannot reverse: Insufficient balance in ${bank?.bank_name || 'Destination Bank'}.`);
        }
      } else if (transfer.destination_account_type === 'petty_cash') {
        const pettyRow = db.prepare(`
          SELECT SUM(CASE WHEN pcv.type IN ('replenishment', 'transfer_in') THEN pcv.amount_cents ELSE -pcv.amount_cents END) as balance
          FROM petty_cash_vouchers pcv
          WHERE pcv.financial_year_id = ? AND pcv.status = 'approved'
        `).get(yearId) as any;
        const currentBal = Number(pettyRow?.balance || 0);
        if (currentBal < amount) {
          throw new Error(`Cannot reverse: Insufficient Petty Cash balance to refund.`);
        }
      }

      // 1. Deduct back from Destination
      if (transfer.destination_account_type === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;
        const newBal = Number(lastCash?.running_balance_cents || 0) - amount;
        db.prepare(`
          INSERT INTO cash_transactions (
            financial_year_id, transaction_date, transaction_type,
            amount_cents, running_balance_cents, reference_no, description, created_by
          ) VALUES (?, ?, 'transfer_out', ?, ?, ?, ?, ?)
        `).run(
          yearId,
          new Date().toISOString().split('T')[0],
          -amount,
          newBal,
          revRef,
          `Reversal refund: ${cleanReason}`,
          userId || null
        );
      } else if (transfer.destination_account_type === 'bank') {
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(amount, transfer.destination_bank_account_id);

        db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type,
            amount_cents, reference_no, payee_or_payer, description, created_by
          ) VALUES (?, ?, 'transfer_out', ?, ?, 'Transfer Reversal', ?, ?)
        `).run(
          transfer.destination_bank_account_id,
          new Date().toISOString().split('T')[0],
          -amount,
          revRef,
          `Reversal refund: ${cleanReason}`,
          userId || null
        );
      } else if (transfer.destination_account_type === 'petty_cash') {
        db.prepare(`
          INSERT INTO petty_cash_vouchers (
            voucher_no, voucher_date, financial_year_id, type,
            amount_cents, payee, description, receipt_attached, status, created_by
          ) VALUES (?, ?, ?, 'transfer_out', ?, 'Transfer Reversal', ?, 1, 'approved', ?)
        `).run(
          `PC-${revRef}`,
          new Date().toISOString().split('T')[0],
          yearId,
          amount,
          `Reversal refund: ${cleanReason}`,
          userId || null
        );
      }

      // 2. Credit back to Source
      if (transfer.source_account_type === 'cash') {
        const lastCash = db.prepare('SELECT running_balance_cents FROM cash_transactions WHERE financial_year_id = ? ORDER BY id DESC LIMIT 1').get(yearId) as any;
        const newBal = Number(lastCash?.running_balance_cents || 0) + amount;
        db.prepare(`
          INSERT INTO cash_transactions (
            financial_year_id, transaction_date, transaction_type,
            amount_cents, running_balance_cents, reference_no, description, created_by
          ) VALUES (?, ?, 'transfer_in', ?, ?, ?, ?, ?)
        `).run(
          yearId,
          new Date().toISOString().split('T')[0],
          amount,
          newBal,
          revRef,
          `Reversal restitution: ${cleanReason}`,
          userId || null
        );
      } else if (transfer.source_account_type === 'bank') {
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(amount, transfer.source_bank_account_id);

        db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type,
            amount_cents, reference_no, payee_or_payer, description, created_by
          ) VALUES (?, ?, 'transfer_in', ?, ?, 'Transfer Reversal', ?, ?)
        `).run(
          transfer.source_bank_account_id,
          new Date().toISOString().split('T')[0],
          amount,
          revRef,
          `Reversal restitution: ${cleanReason}`,
          userId || null
        );
      } else if (transfer.source_account_type === 'petty_cash') {
        db.prepare(`
          INSERT INTO petty_cash_vouchers (
            voucher_no, voucher_date, financial_year_id, type,
            amount_cents, payee, description, receipt_attached, status, created_by
          ) VALUES (?, ?, ?, 'replenishment', ?, 'Transfer Reversal', ?, 1, 'approved', ?)
        `).run(
          `PC-${revRef}`,
          new Date().toISOString().split('T')[0],
          yearId,
          amount,
          `Reversal restitution: ${cleanReason}`,
          userId || null
        );
      }

      // 3. Update transfer status
      db.prepare(`
        UPDATE fund_transfers
        SET status = 'reversed', reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
        WHERE id = ?
      `).run(userId || null, cleanReason, data.transferId);

      AuditService.logAuthEvent(
        userId || null,
        'system',
        'FUND_TRANSFER_REVERSED',
        `fund_transfers:${data.transferId}`,
        'success',
        `Reversed transfer ${transfer.transfer_reference}: ${cleanReason}`
      );
    });

    executeTx();
    return true;
  }

  public static getFundTransfers(params?: {
    financialYearId?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sourceFilter?: string;
    destFilter?: string;
    typeFilter?: string;
    limit?: number;
    offset?: number;
  }): { transfers: FundTransfer[]; total: number } {
    const db = getDatabase();
    const yearId = params?.financialYearId || this.getCurrentFinancialYear()?.id || 1;

    let whereClause = 'WHERE ft.financial_year_id = ?';
    const queryParams: any[] = [yearId];

    if (params?.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      whereClause += ' AND (ft.transfer_reference LIKE ? OR ft.reference_no LIKE ? OR ft.description LIKE ?)';
      queryParams.push(term, term, term);
    }

    if (params?.dateFrom) {
      whereClause += ' AND ft.transfer_date >= ?';
      queryParams.push(params.dateFrom);
    }
    if (params?.dateTo) {
      whereClause += ' AND ft.transfer_date <= ?';
      queryParams.push(params.dateTo);
    }
    if (params?.sourceFilter && params.sourceFilter !== 'all') {
      if (params.sourceFilter === 'cash' || params.sourceFilter === 'petty_cash') {
        whereClause += ' AND ft.source_account_type = ?';
        queryParams.push(params.sourceFilter);
      } else if (!isNaN(Number(params.sourceFilter))) {
        whereClause += ' AND ft.source_account_type = "bank" AND ft.source_bank_account_id = ?';
        queryParams.push(Number(params.sourceFilter));
      }
    }
    if (params?.destFilter && params.destFilter !== 'all') {
      if (params.destFilter === 'cash' || params.destFilter === 'petty_cash') {
        whereClause += ' AND ft.destination_account_type = ?';
        queryParams.push(params.destFilter);
      } else if (!isNaN(Number(params.destFilter))) {
        whereClause += ' AND ft.destination_account_type = "bank" AND ft.destination_bank_account_id = ?';
        queryParams.push(Number(params.destFilter));
      }
    }
    if (params?.typeFilter && params.typeFilter !== 'all') {
      const parts = params.typeFilter.split('_to_');
      if (parts.length === 2) {
        whereClause += ' AND ft.source_account_type = ? AND ft.destination_account_type = ?';
        queryParams.push(parts[0], parts[1]);
      }
    }

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM fund_transfers ft ${whereClause}`).get(...queryParams) as { count: number };

    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const rows = db.prepare(`
      SELECT ft.id, ft.transfer_reference, ft.financial_year_id, ft.transfer_date,
             ft.source_account_type, ft.source_bank_account_id,
             ft.destination_account_type, ft.destination_bank_account_id,
             ft.amount_cents, ft.reference_no, ft.description, ft.status,
             ft.reversed_at, ft.reversed_by, ft.reversal_reason, ft.created_by, ft.created_at,
             sba.bank_name as source_bank_name, sba.account_number as source_account_number,
             dba.bank_name as dest_bank_name, dba.account_number as dest_account_number,
             u.full_name as creator_name,
             ru.full_name as reverser_name
      FROM fund_transfers ft
      LEFT JOIN bank_accounts sba ON ft.source_bank_account_id = sba.id
      LEFT JOIN bank_accounts dba ON ft.destination_bank_account_id = dba.id
      LEFT JOIN users u ON ft.created_by = u.id
      LEFT JOIN users ru ON ft.reversed_by = ru.id
      ${whereClause}
      ORDER BY ft.transfer_date DESC, ft.id DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset) as any[];

    const transfers: FundTransfer[] = rows.map((r) => {
      let sourceLabel = 'Cash in Hand';
      if (r.source_account_type === 'bank') {
        sourceLabel = r.source_bank_name ? `${r.source_bank_name} (${r.source_account_number})` : `Bank Account #${r.source_bank_account_id}`;
      } else if (r.source_account_type === 'petty_cash') {
        sourceLabel = 'Petty Cash Float';
      }

      let destLabel = 'Cash in Hand';
      if (r.destination_account_type === 'bank') {
        destLabel = r.dest_bank_name ? `${r.dest_bank_name} (${r.dest_account_number})` : `Bank Account #${r.destination_bank_account_id}`;
      } else if (r.destination_account_type === 'petty_cash') {
        destLabel = 'Petty Cash Float';
      }

      return {
        id: r.id,
        transfer_reference: r.transfer_reference,
        financial_year_id: r.financial_year_id,
        transfer_date: r.transfer_date,
        source_account_type: r.source_account_type,
        source_bank_account_id: r.source_bank_account_id,
        source_account_label: sourceLabel,
        destination_account_type: r.destination_account_type,
        destination_bank_account_id: r.destination_bank_account_id,
        destination_account_label: destLabel,
        amount_cents: r.amount_cents,
        reference_no: r.reference_no,
        description: r.description,
        status: r.status,
        reversed_at: r.reversed_at,
        reversed_by: r.reversed_by,
        reversal_reason: r.reversal_reason,
        created_by: r.created_by,
        creator_name: r.creator_name,
        reverser_name: r.reverser_name,
        created_at: r.created_at,
      };
    });

    return {
      transfers,
      total: countRow.count,
    };
  }

  // ========================================================
  // 14. CHEQUE MANAGEMENT MODULE
  // ========================================================

  public static getCheques(filters?: ChequeFilters): { cheques: ChequeRecord[]; total: number } {
    const db = getDatabase();
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 50;
    const offset = filters?.offset && filters.offset >= 0 ? filters.offset : 0;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (filters?.cheque_type) {
      whereClause += ' AND c.cheque_type = ?';
      params.push(filters.cheque_type);
    }

    if (filters?.status && filters.status !== 'all') {
      whereClause += ' AND c.status = ?';
      params.push(filters.status);
    }

    if (filters?.bank_account_id) {
      whereClause += ' AND (c.deposit_bank_account_id = ? OR c.issuing_bank_account_id = ?)';
      params.push(filters.bank_account_id, filters.bank_account_id);
    }

    if (filters?.date_from) {
      whereClause += ' AND c.cheque_date >= ?';
      params.push(filters.date_from);
    }

    if (filters?.date_to) {
      whereClause += ' AND c.cheque_date <= ?';
      params.push(filters.date_to);
    }

    if (filters?.search && filters.search.trim()) {
      const s = filters.search.trim() + '%';
      whereClause += ' AND (c.cheque_number LIKE ? OR c.payer_name LIKE ? OR c.payee_name LIKE ? OR c.issuing_bank_name LIKE ? OR c.reference LIKE ?)';
      params.push(s, s, s, s, s);
    }

    const countSql = `SELECT COUNT(*) as count FROM cheques c ${whereClause}`;
    const countRow = db.prepare(countSql).get(...params) as { count: number };

    const querySql = `
      SELECT
        c.id, c.cheque_type, c.cheque_number, c.amount_cents, c.status, c.cheque_date,
        c.received_date, c.payer_name, c.issuing_bank_name, c.issuing_bank_branch,
        c.expected_deposit_date, c.actual_deposit_date, c.deposit_bank_account_id,
        c.deposit_bank_transaction_id, c.fund_receipt_id, c.fund_category_id, c.specific_fund_id,
        c.issue_date, c.payee_name, c.issuing_bank_account_id, c.issuing_bank_transaction_id,
        c.expense_id, c.budget_category_id, c.financial_year_id,
        c.expected_presentation_date, c.actual_presentation_date,
        c.actual_clearance_date, c.bounce_date, c.bounce_reason, c.bounce_bank_transaction_id,
        c.cancellation_date, c.cancellation_reason, c.description, c.reference,
        c.created_by, c.created_at, c.updated_at,
        dba.bank_name as deposit_bank_name, dba.account_number as deposit_account_number,
        iba.bank_name as issuing_bank_name, iba.account_number as issuing_account_number,
        fr.receipt_no as fund_receipt_no,
        fc.name_en as fund_category_name,
        f.name_en as specific_fund_name,
        e.voucher_no as expense_voucher_no,
        bc.name_en as budget_category_name,
        u.full_name as creator_name
      FROM cheques c
      LEFT JOIN bank_accounts dba ON c.deposit_bank_account_id = dba.id
      LEFT JOIN bank_accounts iba ON c.issuing_bank_account_id = iba.id
      LEFT JOIN fund_receipts fr ON c.fund_receipt_id = fr.id
      LEFT JOIN fund_categories fc ON c.fund_category_id = fc.id
      LEFT JOIN funds f ON c.specific_fund_id = f.id
      LEFT JOIN expenses e ON c.expense_id = e.id
      LEFT JOIN budget_categories bc ON c.budget_category_id = bc.id
      LEFT JOIN users u ON c.created_by = u.id
      ${whereClause}
      ORDER BY c.cheque_date DESC, c.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(querySql).all(...params, limit, offset) as any[];

    return {
      cheques: rows,
      total: countRow ? countRow.count : 0,
    };
  }

  public static getChequesSummary(financialYearId?: number): ChequesSummary {
    const db = getDatabase();

    const summaryRow = db.prepare(`
      SELECT
        -- Received
        COUNT(CASE WHEN cheque_type = 'received' THEN 1 END) as received_total_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'received' THEN amount_cents ELSE 0 END), 0) as received_total_amount_cents,
        COUNT(CASE WHEN cheque_type = 'received' AND status = 'received' THEN 1 END) as received_pending_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'received' AND status = 'received' THEN amount_cents ELSE 0 END), 0) as received_pending_amount_cents,
        COUNT(CASE WHEN cheque_type = 'received' AND status = 'deposited' THEN 1 END) as received_deposited_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'received' AND status = 'deposited' THEN amount_cents ELSE 0 END), 0) as received_deposited_amount_cents,
        COUNT(CASE WHEN cheque_type = 'received' AND status = 'cleared' THEN 1 END) as received_cleared_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'received' AND status = 'cleared' THEN amount_cents ELSE 0 END), 0) as received_cleared_amount_cents,
        COUNT(CASE WHEN cheque_type = 'received' AND status = 'bounced' THEN 1 END) as received_bounced_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'received' AND status = 'bounced' THEN amount_cents ELSE 0 END), 0) as received_bounced_amount_cents,
        -- Issued
        COUNT(CASE WHEN cheque_type = 'issued' THEN 1 END) as issued_total_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'issued' THEN amount_cents ELSE 0 END), 0) as issued_total_amount_cents,
        COUNT(CASE WHEN cheque_type = 'issued' AND status = 'issued' THEN 1 END) as issued_outstanding_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'issued' AND status = 'issued' THEN amount_cents ELSE 0 END), 0) as issued_outstanding_amount_cents,
        COUNT(CASE WHEN cheque_type = 'issued' AND status = 'presented' THEN 1 END) as issued_presented_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'issued' AND status = 'presented' THEN amount_cents ELSE 0 END), 0) as issued_presented_amount_cents,
        COUNT(CASE WHEN cheque_type = 'issued' AND status = 'cleared' THEN 1 END) as issued_cleared_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'issued' AND status = 'cleared' THEN amount_cents ELSE 0 END), 0) as issued_cleared_amount_cents,
        COUNT(CASE WHEN cheque_type = 'issued' AND status = 'bounced' THEN 1 END) as issued_bounced_count,
        COALESCE(SUM(CASE WHEN cheque_type = 'issued' AND status = 'bounced' THEN amount_cents ELSE 0 END), 0) as issued_bounced_amount_cents
      FROM cheques
    `).get() as any;

    return {
      received_total_count: Number(summaryRow?.received_total_count || 0),
      received_total_amount_cents: Number(summaryRow?.received_total_amount_cents || 0),
      received_pending_count: Number(summaryRow?.received_pending_count || 0),
      received_pending_amount_cents: Number(summaryRow?.received_pending_amount_cents || 0),
      received_deposited_count: Number(summaryRow?.received_deposited_count || 0),
      received_deposited_amount_cents: Number(summaryRow?.received_deposited_amount_cents || 0),
      received_cleared_count: Number(summaryRow?.received_cleared_count || 0),
      received_cleared_amount_cents: Number(summaryRow?.received_cleared_amount_cents || 0),
      received_bounced_count: Number(summaryRow?.received_bounced_count || 0),
      received_bounced_amount_cents: Number(summaryRow?.received_bounced_amount_cents || 0),
      issued_total_count: Number(summaryRow?.issued_total_count || 0),
      issued_total_amount_cents: Number(summaryRow?.issued_total_amount_cents || 0),
      issued_outstanding_count: Number(summaryRow?.issued_outstanding_count || 0),
      issued_outstanding_amount_cents: Number(summaryRow?.issued_outstanding_amount_cents || 0),
      issued_presented_count: Number(summaryRow?.issued_presented_count || 0),
      issued_presented_amount_cents: Number(summaryRow?.issued_presented_amount_cents || 0),
      issued_cleared_count: Number(summaryRow?.issued_cleared_count || 0),
      issued_cleared_amount_cents: Number(summaryRow?.issued_cleared_amount_cents || 0),
      issued_bounced_count: Number(summaryRow?.issued_bounced_count || 0),
      issued_bounced_amount_cents: Number(summaryRow?.issued_bounced_amount_cents || 0),
    };
  }

  public static getChequeDetail(id: number): { cheque: ChequeRecord; auditLogs: ChequeAuditLog[] } {
    const db = getDatabase();

    const chequeRow = db.prepare(`
      SELECT
        c.id, c.cheque_type, c.cheque_number, c.amount_cents, c.status, c.cheque_date,
        c.received_date, c.payer_name, c.issuing_bank_name, c.issuing_bank_branch,
        c.expected_deposit_date, c.actual_deposit_date, c.deposit_bank_account_id,
        c.deposit_bank_transaction_id, c.fund_receipt_id, c.fund_category_id, c.specific_fund_id,
        c.issue_date, c.payee_name, c.issuing_bank_account_id, c.issuing_bank_transaction_id,
        c.expense_id, c.budget_category_id, c.financial_year_id,
        c.expected_presentation_date, c.actual_presentation_date,
        c.actual_clearance_date, c.bounce_date, c.bounce_reason, c.bounce_bank_transaction_id,
        c.cancellation_date, c.cancellation_reason, c.description, c.reference,
        c.created_by, c.created_at, c.updated_at,
        dba.bank_name as deposit_bank_name, dba.account_number as deposit_account_number,
        iba.bank_name as issuing_bank_name, iba.account_number as issuing_account_number,
        fr.receipt_no as fund_receipt_no,
        fc.name_en as fund_category_name,
        f.name_en as specific_fund_name,
        e.voucher_no as expense_voucher_no,
        bc.name_en as budget_category_name,
        u.full_name as creator_name
      FROM cheques c
      LEFT JOIN bank_accounts dba ON c.deposit_bank_account_id = dba.id
      LEFT JOIN bank_accounts iba ON c.issuing_bank_account_id = iba.id
      LEFT JOIN fund_receipts fr ON c.fund_receipt_id = fr.id
      LEFT JOIN fund_categories fc ON c.fund_category_id = fc.id
      LEFT JOIN funds f ON c.specific_fund_id = f.id
      LEFT JOIN expenses e ON c.expense_id = e.id
      LEFT JOIN budget_categories bc ON c.budget_category_id = bc.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!chequeRow) throw new Error('Cheque record not found.');

    const auditRows = db.prepare(`
      SELECT l.id, l.cheque_id, l.action, l.from_status, l.to_status, l.notes, l.created_by, l.created_at,
             u.full_name as creator_name
      FROM cheque_audit_logs l
      LEFT JOIN users u ON l.created_by = u.id
      WHERE l.cheque_id = ?
      ORDER BY l.created_at DESC, l.id DESC
    `).all(id) as any[];

    return {
      cheque: chequeRow,
      auditLogs: auditRows,
    };
  }

  public static recordReceivedCheque(data: {
    cheque_number: string;
    payer_name: string;
    issuing_bank_name: string;
    issuing_bank_branch?: string;
    cheque_date: string;
    received_date?: string;
    expected_deposit_date?: string;
    amount_cents: number;
    fund_category_id?: number;
    specific_fund_id?: number;
    description?: string;
    reference?: string;
    allow_duplicate_warning?: boolean;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const chqNum = data.cheque_number.trim();
    const payer = data.payer_name.trim();
    const issuingBank = data.issuing_bank_name.trim();
    const branch = data.issuing_bank_branch?.trim() || '';
    const chqDate = data.cheque_date.trim();
    const rcvDate = (data.received_date || chqDate).trim();
    const amt = Math.round(data.amount_cents);

    if (!chqNum) throw new Error('Cheque number is required.');
    if (!payer) throw new Error('Payer name is required.');
    if (!issuingBank) throw new Error('Issuing bank name is required.');
    if (!chqDate) throw new Error('Cheque date is required.');
    if (amt <= 0) throw new Error('Amount must be greater than zero.');

    // Check potential duplicate received cheque
    const dup = db.prepare(`
      SELECT id, cheque_number, payer_name, issuing_bank_name, amount_cents, status
      FROM cheques
      WHERE cheque_type = 'received'
        AND cheque_number = ?
        AND issuing_bank_name = ?
        AND payer_name = ?
        AND amount_cents = ?
        AND status NOT IN ('bounced', 'cancelled')
    `).get(chqNum, issuingBank, payer, amt) as any;

    if (dup && !data.allow_duplicate_warning) {
      throw new Error(`A received cheque #${chqNum} from "${payer}" for Rs. ${(amt / 100).toFixed(2)} already exists (Status: ${dup.status}). Confirm if this is an intentional override.`);
    }

    const runTx = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO cheques (
          cheque_type, cheque_number, amount_cents, status, cheque_date,
          received_date, payer_name, issuing_bank_name, issuing_bank_branch,
          expected_deposit_date, fund_category_id, specific_fund_id,
          description, reference, created_by
        ) VALUES (
          'received', ?, ?, 'received', ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `).run(
        chqNum,
        amt,
        chqDate,
        rcvDate,
        payer,
        issuingBank,
        branch,
        data.expected_deposit_date || null,
        data.fund_category_id || null,
        data.specific_fund_id || null,
        data.description?.trim() || null,
        data.reference?.trim() || null,
        userId || null
      );

      const chequeId = Number(res.lastInsertRowid);

      // Audit log
      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'CREATED', NULL, 'received', ?, ?)
      `).run(chequeId, `Received cheque #${chqNum} for Rs. ${(amt / 100).toFixed(2)} from ${payer}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_RECEIVED_RECORDED', `cheques:${chequeId}`, 'success', `Cheque #${chqNum} from ${payer}`);

      return chequeId;
    });

    const newId = runTx();
    return this.getChequeDetail(newId).cheque;
  }

  public static depositReceivedCheque(data: {
    cheque_id: number;
    deposit_bank_account_id: number;
    actual_deposit_date: string;
    deposit_reference?: string;
    financial_year_id?: number;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`
      SELECT * FROM cheques WHERE id = ? AND cheque_type = 'received'
    `).get(data.cheque_id) as any;

    if (!cheque) throw new Error('Received cheque record not found.');
    if (cheque.status !== 'received' && cheque.status !== 'bounced') {
      throw new Error(`Cheque cannot be deposited from status "${cheque.status}". Only "received" or "bounced" cheques can be deposited.`);
    }

    const bankId = data.deposit_bank_account_id || this.getDefaultBankAccount().id;
    const bankAcc = db.prepare(`
      SELECT id, bank_name, account_number, status, current_balance_cents
      FROM bank_accounts WHERE id = ?
    `).get(bankId) as any;

    if (!bankAcc) throw new Error('Selected bank account not found.');
    if (bankAcc.status !== 'active') throw new Error('Selected bank account is inactive.');

    const depositDate = data.actual_deposit_date?.trim();
    if (!depositDate) throw new Error('Actual deposit date is required.');

    const runTx = db.transaction(() => {
      const depositRef = data.deposit_reference?.trim() || `CHQ-${cheque.cheque_number}`;

      // Link or create fund receipt if category is specified
      let fundReceiptId = cheque.fund_receipt_id;
      if (!fundReceiptId && cheque.fund_category_id) {
        const fy = data.financial_year_id || this.getCurrentFinancialYear()?.id || 1;
        const year = new Date().getFullYear();
        const prefix = `RCP-${year}-`;
        const lastReceipt = db.prepare(`
          SELECT receipt_no FROM fund_receipts WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1
        `).get(`${prefix}%`) as { receipt_no: string } | undefined;

        let nextSeq = 1;
        if (lastReceipt && lastReceipt.receipt_no) {
          const parts = lastReceipt.receipt_no.split('-');
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num)) nextSeq = num + 1;
        }
        let receiptNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
        while (db.prepare('SELECT id FROM fund_receipts WHERE receipt_no = ?').get(receiptNo)) {
          nextSeq++;
          receiptNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
        }

        const frRes = db.prepare(`
          INSERT INTO fund_receipts (
            receipt_no, financial_year_id, fund_id, fund_category_id, receipt_date, donor_or_dept,
            amount_cents, payment_method, destination_type, bank_account_id, reference_no, purpose, notes, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'cheque', 'bank', ?, ?, ?, ?, 'posted', ?)
        `).run(
          receiptNo,
          fy,
          cheque.specific_fund_id || 1,
          cheque.fund_category_id,
          depositDate,
          cheque.payer_name,
          cheque.amount_cents,
          bankAcc.id,
          cheque.cheque_number,
          cheque.description || `Cheque #${cheque.cheque_number}`,
          `Deposited to ${bankAcc.bank_name} (${bankAcc.account_number}) (Pending Bank Clearance)`,
          userId || null
        );
        fundReceiptId = Number(frRes.lastInsertRowid);
      }

      // Update cheque status to 'deposited' (DO NOT credit bank account yet! Bank is credited on clearance)
      db.prepare(`
        UPDATE cheques
        SET status = 'deposited',
            actual_deposit_date = ?,
            deposit_bank_account_id = ?,
            deposit_bank_transaction_id = NULL,
            fund_receipt_id = ?,
            reference = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        depositDate,
        bankAcc.id,
        fundReceiptId || null,
        depositRef,
        cheque.id
      );

      // Audit log
      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'DEPOSITED', ?, 'deposited', ?, ?)
      `).run(
        cheque.id,
        cheque.status,
        `Deposited into ${bankAcc.bank_name} (${bankAcc.account_number}) on ${depositDate} (Pending Bank Clearance)`,
        userId || null
      );

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_DEPOSITED', `cheques:${cheque.id}`, 'success', `Deposit to bank_account:${bankAcc.id}`);
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  public static clearReceivedCheque(data: {
    cheque_id: number;
    actual_clearance_date: string;
    deposit_bank_account_id?: number;
    notes?: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'received'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Received cheque record not found.');
    if (cheque.status !== 'deposited' && cheque.status !== 'received') {
      throw new Error(`Cheque cannot be marked cleared from status "${cheque.status}". It must be "received" or "deposited".`);
    }

    const clearanceDate = data.actual_clearance_date?.trim();
    if (!clearanceDate) throw new Error('Actual clearance date is required.');

    const runTx = db.transaction(() => {
      let bankTxId = cheque.deposit_bank_transaction_id;
      let bankAccId = cheque.deposit_bank_account_id;

      // If bank has not been credited yet (deposit_bank_transaction_id is null), deposit & credit bank now upon clearance
      if (!cheque.deposit_bank_transaction_id) {
        bankAccId = cheque.deposit_bank_account_id || data.deposit_bank_account_id;
        if (!bankAccId) {
          const firstBank = db.prepare("SELECT id FROM bank_accounts WHERE status = 'active' ORDER BY id ASC LIMIT 1").get() as any;
          bankAccId = firstBank?.id;
        }
        if (!bankAccId) throw new Error('Receiving bank account is required to clear cheque.');

        const bankAcc = db.prepare('SELECT id, bank_name, account_number FROM bank_accounts WHERE id = ?').get(bankAccId) as any;
        if (!bankAcc) throw new Error('Selected bank account not found.');

        const btDesc = `Cleared Cheque Deposit #${cheque.cheque_number} from ${cheque.payer_name}`;
        const btRes = db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type, amount_cents,
            reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by
          ) VALUES (?, ?, 'cheque_deposit', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          bankAccId,
          clearanceDate,
          cheque.amount_cents,
          cheque.reference || `CHQ-${cheque.cheque_number}`,
          cheque.cheque_number,
          cheque.payer_name,
          btDesc,
          userId || null
        );
        bankTxId = Number(btRes.lastInsertRowid);

        // Credit bank account current balance
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.amount_cents, bankAccId);

        // If linked to a fund receipt, link the bank account
        if (cheque.fund_receipt_id) {
          db.prepare(`
            UPDATE fund_receipts
            SET destination_type = 'bank', bank_account_id = ?
            WHERE id = ?
          `).run(bankAccId, cheque.fund_receipt_id);
        }
      }

      // Update status to cleared
      db.prepare(`
        UPDATE cheques
        SET status = 'cleared',
            actual_clearance_date = ?,
            actual_deposit_date = COALESCE(actual_deposit_date, ?),
            deposit_bank_account_id = COALESCE(deposit_bank_account_id, ?),
            deposit_bank_transaction_id = COALESCE(deposit_bank_transaction_id, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clearanceDate, clearanceDate, bankAccId, bankTxId, cheque.id);

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'CLEARED', ?, 'cleared', ?, ?)
      `).run(cheque.id, cheque.status, data.notes || `Cleared on ${clearanceDate} (Credited to bank)`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_CLEARED', `cheques:${cheque.id}`, 'success');
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  public static bounceReceivedCheque(data: {
    cheque_id: number;
    bounce_date: string;
    bounce_reason: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'received'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Received cheque record not found.');
    if (cheque.status !== 'deposited' && cheque.status !== 'received' && cheque.status !== 'cleared') {
      throw new Error(`Cannot record bounce for cheque in "${cheque.status}" status.`);
    }

    const bounceDate = data.bounce_date?.trim();
    const reason = data.bounce_reason?.trim();
    if (!bounceDate) throw new Error('Bounce date is required.');
    if (!reason) throw new Error('Bounce reason is required.');

    const runTx = db.transaction(() => {
      let revBtId: number | null = null;

      // If the cheque was actually credited to the bank account (deposit_bank_transaction_id exists), reverse the bank balance & transaction
      if (cheque.deposit_bank_transaction_id && cheque.deposit_bank_account_id) {
        const revRes = db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type, amount_cents,
            reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by
          ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          cheque.deposit_bank_account_id,
          bounceDate,
          -cheque.amount_cents,
          `REV-CHQ-${cheque.cheque_number}`,
          cheque.cheque_number,
          cheque.payer_name,
          `Bounced cheque #${cheque.cheque_number}: ${reason}`,
          userId || null
        );
        revBtId = Number(revRes.lastInsertRowid);

        // Deduct bank account current balance
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.amount_cents, cheque.deposit_bank_account_id);
      }

      // If a fund receipt was recorded, mark it as reversed/cancelled
      if (cheque.fund_receipt_id) {
        db.prepare(`
          UPDATE fund_receipts
          SET status = 'cancelled', notes = COALESCE(notes, '') || ' [BOUNCED CHEQUE: ' || ? || ']'
          WHERE id = ?
        `).run(reason, cheque.fund_receipt_id);
      }

      // Update cheque
      db.prepare(`
        UPDATE cheques
        SET status = 'bounced',
            bounce_date = ?,
            bounce_reason = ?,
            bounce_bank_transaction_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bounceDate, reason, revBtId, cheque.id);

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'BOUNCED', ?, 'bounced', ?, ?)
      `).run(cheque.id, cheque.status, `Bounced on ${bounceDate}. Reason: ${reason}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_BOUNCED', `cheques:${cheque.id}`, 'success', reason);
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  public static cancelReceivedCheque(data: {
    cheque_id: number;
    cancellation_reason: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'received'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Received cheque record not found.');
    if (cheque.status === 'cancelled') throw new Error('Cheque is already cancelled.');

    const reason = data.cancellation_reason?.trim();
    if (!reason) throw new Error('Cancellation reason is required.');
    const cancelDate = new Date().toISOString().split('T')[0];

    const runTx = db.transaction(() => {
      // If was deposited, reverse bank
      if (cheque.status === 'deposited' && cheque.deposit_bank_account_id) {
        db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type, amount_cents,
            reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by
          ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          cheque.deposit_bank_account_id,
          cancelDate,
          -cheque.amount_cents,
          `VOID-CHQ-${cheque.cheque_number}`,
          cheque.cheque_number,
          cheque.payer_name,
          `Cancelled received cheque #${cheque.cheque_number}: ${reason}`,
          userId || null
        );

        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.amount_cents, cheque.deposit_bank_account_id);

        if (cheque.fund_receipt_id) {
          db.prepare(`
            UPDATE fund_receipts SET status = 'cancelled' WHERE id = ?
          `).run(cheque.fund_receipt_id);
        }
      }

      db.prepare(`
        UPDATE cheques
        SET status = 'cancelled',
            cancellation_date = ?,
            cancellation_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cancelDate, reason, cheque.id);

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'CANCELLED', ?, 'cancelled', ?, ?)
      `).run(cheque.id, cheque.status, `Cancelled: ${reason}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_CANCELLED', `cheques:${cheque.id}`, 'success', reason);
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  // ========================================================
  // 15. CHEQUES ISSUED WORKFLOW
  // ========================================================

  public static recordIssuedCheque(data: {
    issue_date: string;
    payee_name: string;
    cheque_number: string;
    issuing_bank_account_id: number;
    cheque_date: string;
    expected_presentation_date?: string;
    amount_cents: number;
    expense_id?: number;
    budget_category_id?: number;
    financial_year_id?: number;
    description?: string;
    reference?: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const chqNum = data.cheque_number.trim();
    const payee = data.payee_name.trim();
    const issueDate = data.issue_date.trim();
    const chqDate = data.cheque_date.trim();
    const amt = Math.round(data.amount_cents);

    if (!chqNum) throw new Error('Cheque number is required.');
    if (!payee) throw new Error('Payee name is required.');
    if (!issueDate) throw new Error('Issue date is required.');
    if (!chqDate) throw new Error('Cheque date is required.');
    if (amt <= 0) throw new Error('Amount must be greater than zero.');

    const bankId = data.issuing_bank_account_id || this.getDefaultBankAccount().id;
    const bankAcc = db.prepare(`
      SELECT id, bank_name, account_number, status, current_balance_cents
      FROM bank_accounts WHERE id = ?
    `).get(bankId) as any;

    if (!bankAcc) throw new Error('Issuing bank account not found.');
    if (bankAcc.status !== 'active') throw new Error('Issuing bank account is inactive.');

    // Check duplicate cheque number on this bank account
    const existing = db.prepare(`
      SELECT id, status FROM cheques
      WHERE cheque_type = 'issued'
        AND issuing_bank_account_id = ?
        AND cheque_number = ?
        AND status != 'cancelled'
    `).get(bankAcc.id, chqNum) as any;

    if (existing) {
      throw new Error(`Cheque #${chqNum} has already been issued from ${bankAcc.bank_name} (${bankAcc.account_number}) [Status: ${existing.status}].`);
    }

    const runTx = db.transaction(() => {
      let expenseId = data.expense_id || null;
      let budgetCatId = data.budget_category_id || null;
      const fy = data.financial_year_id || this.getCurrentFinancialYear()?.id || 1;

      // If linking to an existing expense
      if (expenseId) {
        const exp = db.prepare(`
          SELECT id, voucher_no, amount_cents, status, payment_method
          FROM expenses WHERE id = ?
        `).get(expenseId) as any;

        if (!exp) throw new Error('Linked expense not found.');
        if (exp.status === 'paid' && exp.payment_method === 'bank') {
          throw new Error(`Expense ${exp.voucher_no} is already paid via bank.`);
        }

        db.prepare(`
          UPDATE expenses
          SET status = 'paid', payment_method = 'bank', bank_account_id = ?, reference_no = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(bankAcc.id, chqNum, expenseId);
      } else if (budgetCatId) {
        // Create an approved and paid expense record
        const year = new Date().getFullYear();
        const prefix = `EXP-${year}-`;
        const lastExp = db.prepare(`
          SELECT voucher_no FROM expenses WHERE voucher_no LIKE ? ORDER BY id DESC LIMIT 1
        `).get(`${prefix}%`) as { voucher_no: string } | undefined;

        let nextSeq = 1;
        if (lastExp && lastExp.voucher_no) {
          const parts = lastExp.voucher_no.split('-');
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num)) nextSeq = num + 1;
        }
        let voucherNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
        while (db.prepare('SELECT id FROM expenses WHERE voucher_no = ?').get(voucherNo)) {
          nextSeq++;
          voucherNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
        }

        const expRes = db.prepare(`
          INSERT INTO expenses (
            voucher_no, expense_date, financial_year_id, category_id, payee, description,
            amount_cents, payment_method, bank_account_id, reference_no, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'bank', ?, ?, 'approved', ?)
        `).run(
          voucherNo,
          issueDate,
          fy,
          budgetCatId,
          payee,
          data.description || `Issued Cheque #${chqNum} to ${payee}`,
          amt,
          bankAcc.id,
          chqNum,
          userId || null
        );
        expenseId = Number(expRes.lastInsertRowid);
      }

      // Create cheque record in 'issued' status (DO NOT hit bank account immediately! Bank is debited upon clearance)
      const res = db.prepare(`
        INSERT INTO cheques (
          cheque_type, cheque_number, amount_cents, status, cheque_date,
          issue_date, payee_name, issuing_bank_account_id, issuing_bank_transaction_id,
          expense_id, budget_category_id, financial_year_id, expected_presentation_date,
          description, reference, created_by
        ) VALUES (
          'issued', ?, ?, 'issued', ?,
          ?, ?, ?, NULL,
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `).run(
        chqNum,
        amt,
        chqDate,
        issueDate,
        payee,
        bankAcc.id,
        expenseId || null,
        budgetCatId || null,
        fy,
        data.expected_presentation_date || null,
        data.description?.trim() || null,
        data.reference?.trim() || null,
        userId || null
      );
      const chequeId = Number(res.lastInsertRowid);

      // Audit log
      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'ISSUED', NULL, 'issued', ?, ?)
      `).run(
        chequeId,
        `Issued cheque #${chqNum} for Rs. ${(amt / 100).toFixed(2)} to ${payee} from ${bankAcc.bank_name} (Pending Bank Clearance)`,
        userId || null
      );

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_ISSUED', `cheques:${chequeId}`, 'success', `Cheque #${chqNum} to ${payee}`);
      return chequeId;
    });

    const newId = runTx();
    return this.getChequeDetail(newId).cheque;
  }

  public static presentIssuedCheque(data: {
    cheque_id: number;
    actual_presentation_date: string;
    notes?: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'issued'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Issued cheque record not found.');
    if (cheque.status !== 'issued') {
      throw new Error(`Cheque cannot be marked presented from status "${cheque.status}". It must be in "issued" status.`);
    }

    const presentDate = data.actual_presentation_date?.trim();
    if (!presentDate) throw new Error('Actual presentation date is required.');

    const runTx = db.transaction(() => {
      // Update status only (DO NOT deduct bank balance again!)
      db.prepare(`
        UPDATE cheques
        SET status = 'presented',
            actual_presentation_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(presentDate, cheque.id);

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'PRESENTED', 'issued', 'presented', ?, ?)
      `).run(cheque.id, data.notes || `Presented at bank on ${presentDate}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_PRESENTED', `cheques:${cheque.id}`, 'success');
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  public static clearIssuedCheque(data: {
    cheque_id: number;
    actual_clearance_date: string;
    notes?: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'issued'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Issued cheque record not found.');
    if (cheque.status !== 'issued' && cheque.status !== 'presented') {
      throw new Error(`Cheque cannot be marked cleared from status "${cheque.status}". Only "issued" or "presented" cheques can be cleared.`);
    }

    const clearanceDate = data.actual_clearance_date?.trim();
    if (!clearanceDate) throw new Error('Actual clearance date is required.');

    const runTx = db.transaction(() => {
      let issuingBankTxId = cheque.issuing_bank_transaction_id;
      let bankAccId = cheque.issuing_bank_account_id;
      if (!bankAccId) {
        const firstBank = db.prepare("SELECT id FROM bank_accounts WHERE status = 'active' ORDER BY id ASC LIMIT 1").get() as any;
        bankAccId = firstBank?.id;
      }
      if (!bankAccId) throw new Error('Bank account is required to clear issued cheque.');

      // Hit bank account upon clearance if not previously debited
      if (!issuingBankTxId) {
        const btRes = db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type, amount_cents,
            reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by
          ) VALUES (?, ?, 'cheque_payment', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          bankAccId,
          clearanceDate,
          -cheque.amount_cents,
          `CHQ-${cheque.cheque_number}`,
          cheque.cheque_number,
          cheque.payee_name,
          `Cleared Issued Cheque #${cheque.cheque_number} to ${cheque.payee_name}`,
          userId || null
        );
        issuingBankTxId = Number(btRes.lastInsertRowid);

        // Deduct bank account current balance
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.amount_cents, bankAccId);
      }

      // Update status to cleared
      db.prepare(`
        UPDATE cheques
        SET status = 'cleared',
            actual_clearance_date = ?,
            issuing_bank_account_id = ?,
            issuing_bank_transaction_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clearanceDate, bankAccId, issuingBankTxId, cheque.id);

      // If linked to an expense, ensure it is marked paid
      if (cheque.expense_id) {
        db.prepare(`
          UPDATE expenses
          SET status = 'paid', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.expense_id);
      }

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'CLEARED', ?, 'cleared', ?, ?)
      `).run(cheque.id, cheque.status, data.notes || `Cleared by bank on ${clearanceDate}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_CLEARED', `cheques:${cheque.id}`, 'success');
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  public static bounceIssuedCheque(data: {
    cheque_id: number;
    bounce_date: string;
    bounce_reason: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'issued'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Issued cheque record not found.');
    if (cheque.status === 'bounced' || cheque.status === 'cancelled') {
      throw new Error(`Cheque is already in "${cheque.status}" status.`);
    }

    const bounceDate = data.bounce_date?.trim();
    const reason = data.bounce_reason?.trim();
    if (!bounceDate) throw new Error('Bounce date is required.');
    if (!reason) throw new Error('Bounce reason is required.');

    const runTx = db.transaction(() => {
      let revBtId: number | null = null;

      // 1. Only reverse bank payment deduction if bank was debited (issuing_bank_transaction_id exists)
      if (cheque.issuing_bank_transaction_id && cheque.issuing_bank_account_id) {
        const revRes = db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type, amount_cents,
            reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by
          ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          cheque.issuing_bank_account_id,
          bounceDate,
          cheque.amount_cents,
          `REV-CHQ-${cheque.cheque_number}`,
          cheque.cheque_number,
          cheque.payee_name,
          `Bounced issued cheque #${cheque.cheque_number}: ${reason}`,
          userId || null
        );
        revBtId = Number(revRes.lastInsertRowid);

        // Restore bank account balance
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.amount_cents, cheque.issuing_bank_account_id);
      }

      // 2. Restore linked expense to unpaid status so liability is restored without duplication
      if (cheque.expense_id) {
        db.prepare(`
          UPDATE expenses
          SET status = 'approved', payment_method = 'unpaid', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.expense_id);
      }

      // 3. Update cheque status to 'bounced'
      db.prepare(`
        UPDATE cheques
        SET status = 'bounced',
            bounce_date = ?,
            bounce_reason = ?,
            bounce_bank_transaction_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bounceDate, reason, revBtId, cheque.id);

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'BOUNCED', ?, 'bounced', ?, ?)
      `).run(cheque.id, cheque.status, `Bounced on ${bounceDate}. Reason: ${reason}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_BOUNCED', `cheques:${cheque.id}`, 'success', reason);
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  public static cancelIssuedCheque(data: {
    cheque_id: number;
    cancellation_reason: string;
  }, userId?: number): ChequeRecord {
    const db = getDatabase();

    const cheque = db.prepare(`SELECT * FROM cheques WHERE id = ? AND cheque_type = 'issued'`).get(data.cheque_id) as any;
    if (!cheque) throw new Error('Issued cheque record not found.');
    if (cheque.status === 'cancelled') throw new Error('Cheque is already cancelled.');

    const reason = data.cancellation_reason?.trim();
    if (!reason) throw new Error('Cancellation reason is required.');
    const cancelDate = new Date().toISOString().split('T')[0];

    const runTx = db.transaction(() => {
      // Reverse bank payment only if bank was debited (issuing_bank_transaction_id exists)
      if (cheque.issuing_bank_transaction_id && cheque.issuing_bank_account_id) {
        db.prepare(`
          INSERT INTO bank_transactions (
            bank_account_id, transaction_date, transaction_type, amount_cents,
            reference_no, cheque_number, payee_or_payer, description, is_reconciled, created_by
          ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, 0, ?)
        `).run(
          cheque.issuing_bank_account_id,
          cancelDate,
          cheque.amount_cents,
          `VOID-CHQ-${cheque.cheque_number}`,
          cheque.cheque_number,
          cheque.payee_name,
          `Cancelled issued cheque #${cheque.cheque_number}: ${reason}`,
          userId || null
        );

        // Restore bank account balance
        db.prepare(`
          UPDATE bank_accounts
          SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.amount_cents, cheque.issuing_bank_account_id);
      }

      // Restore expense
      if (cheque.expense_id) {
        db.prepare(`
          UPDATE expenses
          SET status = 'approved', payment_method = 'unpaid', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cheque.expense_id);
      }

      // Update cheque
      db.prepare(`
        UPDATE cheques
        SET status = 'cancelled',
            cancellation_date = ?,
            cancellation_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cancelDate, reason, cheque.id);

      db.prepare(`
        INSERT INTO cheque_audit_logs (cheque_id, action, from_status, to_status, notes, created_by)
        VALUES (?, 'CANCELLED', ?, 'cancelled', ?, ?)
      `).run(cheque.id, cheque.status, `Cancelled: ${reason}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'CHEQUE_CANCELLED', `cheques:${cheque.id}`, 'success', reason);
    });

    runTx();
    return this.getChequeDetail(cheque.id).cheque;
  }

  // ========================================================
  // 15. BANK RECONCILIATION ENGINE & WORKFLOWS
  // ========================================================

  public static createReconciliationSession(
    data: {
      bank_account_id?: number;
      period_start_date: string;
      period_end_date: string;
      reconciliation_date: string;
      statement_opening_balance_cents: number;
      statement_closing_balance_cents: number;
      notes?: string;
    },
    userId?: number
  ): BankReconciliationSession {
    const db = getDatabase();
    const bankAccId = data.bank_account_id || this.getDefaultBankAccount().id;
    const bank = db.prepare('SELECT id, bank_name, account_number, opening_balance_cents, current_balance_cents FROM bank_accounts WHERE id = ?').get(bankAccId) as any;
    if (!bank) throw new Error('Bank account not found.');

    if (data.period_start_date > data.period_end_date) {
      throw new Error('Period start date cannot be later than period end date.');
    }

    // Check for overlapping completed reconciliation
    const overlap = db.prepare(`
      SELECT id, session_code, period_start_date, period_end_date
      FROM bank_reconciliation_sessions
      WHERE bank_account_id = ? AND status = 'completed'
        AND NOT (period_end_date < ? OR period_start_date > ?)
      LIMIT 1
    `).get(bankAccId, data.period_start_date, data.period_end_date) as any;

    if (overlap) {
      throw new Error(`An overlapping completed reconciliation (${overlap.session_code}: ${overlap.period_start_date} to ${overlap.period_end_date}) exists for this period.`);
    }

    const fy = this.getCurrentFinancialYear();

    // Determine system opening balance: last completed session's statement closing, or opening balance on start date
    const prevSession = db.prepare(`
      SELECT statement_closing_balance_cents, period_end_date
      FROM bank_reconciliation_sessions
      WHERE bank_account_id = ? AND status = 'completed' AND period_end_date <= ?
      ORDER BY period_end_date DESC, id DESC
      LIMIT 1
    `).get(bankAccId, data.period_start_date) as any;

    const systemOpeningBalanceCents = prevSession
      ? prevSession.statement_closing_balance_cents
      : this.calculateSystemBankBalanceAsOf(bankAccId, data.period_start_date, true);

    const systemClosingBalanceCents = this.calculateSystemBankBalanceAsOf(bankAccId, data.period_end_date, false);

    // Generate Session Code e.g. REC-2026-03-BOC-0001
    const parts = data.period_end_date.split('-');
    const yearMonth = `${parts[0]}-${parts[1]}`;
    const prefix = `REC-${yearMonth}-BOC-`;
    const lastSession = db.prepare('SELECT session_code FROM bank_reconciliation_sessions WHERE session_code LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`) as any;
    let nextSeq = 1;
    if (lastSession && lastSession.session_code) {
      const p = lastSession.session_code.split('-');
      const num = parseInt(p[p.length - 1], 10);
      if (!isNaN(num)) nextSeq = num + 1;
    }
    let sessionCode = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    while (db.prepare('SELECT id FROM bank_reconciliation_sessions WHERE session_code = ?').get(sessionCode)) {
      nextSeq++;
      sessionCode = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    }

    let createdId = 0;
    const runTx = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO bank_reconciliation_sessions (
          session_code, bank_account_id, financial_year_id,
          period_start_date, period_end_date, reconciliation_date,
          statement_opening_balance_cents, statement_closing_balance_cents,
          system_opening_balance_cents, system_closing_balance_cents,
          status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `).run(
        sessionCode,
        bankAccId,
        fy?.id || null,
        data.period_start_date,
        data.period_end_date,
        data.reconciliation_date,
        data.statement_opening_balance_cents,
        data.statement_closing_balance_cents,
        systemOpeningBalanceCents,
        systemClosingBalanceCents,
        data.notes || null,
        userId || null
      );
      createdId = Number(res.lastInsertRowid);

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'CREATED', ?, ?)
      `).run(createdId, `Reconciliation session ${sessionCode} created for period ${data.period_start_date} to ${data.period_end_date}`, userId || null);

      AuditService.logAuthEvent(userId || null, 'system', 'RECONCILIATION_SESSION_CREATED', `recon:${sessionCode}`, 'success');
    });

    runTx();
    this.calculateReconciliationSummary(createdId);
    return this.getReconciliationSessionDetail(createdId).session;
  }

  public static calculateSystemBankBalanceAsOf(bankAccountId: number, asOfDate: string, exclusive = false): number {
    const db = getDatabase();
    const bank = db.prepare('SELECT opening_balance_cents FROM bank_accounts WHERE id = ?').get(bankAccountId) as any;
    if (!bank) return 0;

    const op = `transaction_date ${exclusive ? '<' : '<='} ?`;
    const rows = db.prepare(`
      SELECT amount_cents
      FROM bank_transactions
      WHERE bank_account_id = ? AND ${op}
    `).all(bankAccountId, asOfDate) as any[];

    let bal = Number(bank.opening_balance_cents || 0);
    for (const r of rows) {
      bal += Number(r.amount_cents || 0);
    }
    return bal;
  }

  public static getReconciliationSessions(bankAccountId?: number): BankReconciliationSession[] {
    const db = getDatabase();
    const bankAccId = bankAccountId || this.getDefaultBankAccount().id;

    const rows = db.prepare(`
      SELECT s.*,
             ba.bank_name, ba.account_number,
             u1.full_name as creator_name,
             u2.full_name as completer_name
      FROM bank_reconciliation_sessions s
      JOIN bank_accounts ba ON s.bank_account_id = ba.id
      LEFT JOIN users u1 ON s.created_by = u1.id
      LEFT JOIN users u2 ON s.completed_by = u2.id
      WHERE s.bank_account_id = ?
      ORDER BY s.period_end_date DESC, s.id DESC
    `).all(bankAccId) as any[];

    return rows;
  }

  public static getReconciliationSessionDetail(sessionId: number): {
    session: BankReconciliationSession;
    summary: ReconciliationSummaryCalculation;
    statementCount: number;
    matchedCount: number;
  } {
    const db = getDatabase();
    const session = db.prepare(`
      SELECT s.*,
             ba.bank_name, ba.account_number,
             u1.full_name as creator_name,
             u2.full_name as completer_name
      FROM bank_reconciliation_sessions s
      JOIN bank_accounts ba ON s.bank_account_id = ba.id
      LEFT JOIN users u1 ON s.created_by = u1.id
      LEFT JOIN users u2 ON s.completed_by = u2.id
      WHERE s.id = ?
    `).get(sessionId) as any;

    if (!session) throw new Error('Reconciliation session not found.');

    const summary = this.calculateReconciliationSummary(sessionId);

    const stCount = db.prepare('SELECT COUNT(*) as count FROM bank_statement_transactions WHERE session_id = ?').get(sessionId) as any;
    const mCount = db.prepare('SELECT COUNT(*) as count FROM bank_reconciliation_matches WHERE session_id = ?').get(sessionId) as any;

    return {
      session,
      summary,
      statementCount: Number(stCount?.count || 0),
      matchedCount: Number(mCount?.count || 0),
    };
  }

  public static importBankStatement(
    sessionId: number,
    rows: Array<{
      transaction_date: string;
      value_date?: string;
      description: string;
      reference_no?: string;
      cheque_number?: string;
      debit_cents: number;
      credit_cents: number;
      balance_cents?: number;
    }>,
    filename = 'Bank_Statement_Import',
    fileFormat: 'xlsx' | 'csv' | 'manual' = 'manual',
    userId?: number
  ): { importedCount: number; importId: number } {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status, bank_account_id FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot import into a completed reconciliation session.');

    if (!rows || rows.length === 0) throw new Error('Statement rows cannot be empty.');

    let importId = 0;
    let validCount = 0;

    const runTx = db.transaction(() => {
      const impRes = db.prepare(`
        INSERT INTO bank_statement_imports (session_id, bank_account_id, filename, file_format, total_rows, imported_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, session.bank_account_id, filename, fileFormat, rows.length, userId || null);
      importId = Number(impRes.lastInsertRowid);

      const insStmt = db.prepare(`
        INSERT INTO bank_statement_transactions (
          session_id, import_id, transaction_date, value_date,
          description, reference_no, cheque_number,
          debit_cents, credit_cents, balance_cents, is_matched
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `);

      for (const r of rows) {
        if (!r.transaction_date) continue;
        const deb = Math.max(0, Math.round(r.debit_cents || 0));
        const cred = Math.max(0, Math.round(r.credit_cents || 0));
        if (deb === 0 && cred === 0) continue;

        insStmt.run(
          sessionId,
          importId,
          r.transaction_date,
          r.value_date || null,
          (r.description || 'Statement transaction').trim(),
          r.reference_no ? r.reference_no.trim() : null,
          r.cheque_number ? r.cheque_number.trim() : null,
          deb,
          cred,
          r.balance_cents !== undefined ? Math.round(r.balance_cents) : null
        );
        validCount++;
      }

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'IMPORTED', ?, ?)
      `).run(sessionId, `Imported ${validCount} statement rows from "${filename}" (${fileFormat})`, userId || null);
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
    return { importedCount: validCount, importId };
  }

  public static getStatementTransactions(sessionId: number): BankStatementTransaction[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT st.*,
             m.id as match_id,
             m.bank_transaction_id as matched_system_tx_id,
             m.match_rule as matched_rule
      FROM bank_statement_transactions st
      LEFT JOIN bank_reconciliation_matches m ON m.statement_transaction_id = st.id
      WHERE st.session_id = ?
      ORDER BY st.transaction_date ASC, st.id ASC
    `).all(sessionId) as any[];

    return rows.map(r => ({
      ...r,
      is_matched: Boolean(r.is_matched),
    }));
  }

  public static getSystemTransactionsForReconciliation(sessionId: number): {
    transactions: any[];
    outstandingCheques: OutstandingChequeItem[];
    depositsInTransit: DepositInTransitItem[];
  } {
    const db = getDatabase();
    const session = db.prepare('SELECT id, bank_account_id, period_start_date, period_end_date FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');

    // Fetch system bank transactions within period or un-reconciled prior to period_end_date
    const txRows = db.prepare(`
      SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.transaction_type, bt.amount_cents,
             bt.reference_no, bt.cheque_number, bt.payee_or_payer, bt.description,
             bt.is_reconciled, bt.reconciled_at,
             m.id as match_id,
             m.statement_transaction_id as matched_statement_tx_id
      FROM bank_transactions bt
      LEFT JOIN bank_reconciliation_matches m ON m.bank_transaction_id = bt.id AND m.session_id = ?
      WHERE bt.bank_account_id = ?
        AND bt.transaction_date <= ?
        AND (bt.is_reconciled = 0 OR m.id IS NOT NULL)
      ORDER BY bt.transaction_date ASC, bt.id ASC
    `).all(sessionId, session.bank_account_id, session.period_end_date) as any[];

    // Outstanding Issued Cheques (issued on or before period_end_date, not cleared or cleared after period_end_date)
    const outCheques = db.prepare(`
      SELECT c.id, c.cheque_number, c.cheque_date, c.issue_date, c.payee_name, c.amount_cents, c.status, c.description
      FROM cheques c
      WHERE c.cheque_type = 'issued'
        AND c.issuing_bank_account_id = ?
        AND c.cheque_date <= ?
        AND (
          c.status IN ('issued', 'presented')
          OR (c.status = 'cleared' AND c.actual_clearance_date > ?)
        )
      ORDER BY c.cheque_date ASC, c.id ASC
    `).all(session.bank_account_id, session.period_end_date, session.period_end_date) as any[];

    // Deposits in Transit (received cheques deposited on or before period_end_date, not cleared or cleared after period_end_date)
    const inTransit = db.prepare(`
      SELECT c.id, c.cheque_number, c.cheque_date, c.actual_deposit_date as deposit_date, c.payer_name, c.amount_cents, c.status, c.description
      FROM cheques c
      WHERE c.cheque_type = 'received'
        AND c.deposit_bank_account_id = ?
        AND c.actual_deposit_date IS NOT NULL
        AND c.actual_deposit_date <= ?
        AND (
          c.status IN ('deposited')
          OR (c.status = 'cleared' AND c.actual_clearance_date > ?)
        )
      ORDER BY c.actual_deposit_date ASC, c.id ASC
    `).all(session.bank_account_id, session.period_end_date, session.period_end_date) as any[];

    return {
      transactions: txRows.map(r => ({
        ...r,
        is_reconciled: Boolean(r.is_reconciled),
        is_matched: Boolean(r.match_id),
      })),
      outstandingCheques: outCheques,
      depositsInTransit: inTransit,
    };
  }

  public static autoMatchTransactions(
    sessionId: number,
    toleranceDays = 3,
    userId?: number
  ): { matchedCount: number } {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status, bank_account_id, period_end_date FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot match in a completed reconciliation session.');

    const stmtTx = db.prepare(`
      SELECT st.*
      FROM bank_statement_transactions st
      LEFT JOIN bank_reconciliation_matches m ON m.statement_transaction_id = st.id
      WHERE st.session_id = ? AND st.is_matched = 0 AND m.id IS NULL
      ORDER BY st.transaction_date ASC, st.id ASC
    `).all(sessionId) as any[];

    const sysTx = db.prepare(`
      SELECT bt.*
      FROM bank_transactions bt
      LEFT JOIN bank_reconciliation_matches m ON m.bank_transaction_id = bt.id AND m.session_id = ?
      WHERE bt.bank_account_id = ?
        AND bt.transaction_date <= ?
        AND bt.is_reconciled = 0
        AND m.id IS NULL
      ORDER BY bt.transaction_date ASC, bt.id ASC
    `).all(sessionId, session.bank_account_id, session.period_end_date) as any[];

    const matchedSysIds = new Set<number>();
    let matchCount = 0;

    const runTx = db.transaction(() => {
      const insMatch = db.prepare(`
        INSERT INTO bank_reconciliation_matches (
          session_id, statement_transaction_id, bank_transaction_id,
          matched_amount_cents, match_type, confidence_score, match_rule, matched_by
        ) VALUES (?, ?, ?, ?, 'auto', ?, ?, ?)
      `);

      const updStmt = db.prepare('UPDATE bank_statement_transactions SET is_matched = 1, matched_at = CURRENT_TIMESTAMP WHERE id = ?');

      for (const st of stmtTx) {
        // Effective signed statement amount: credit is positive, debit is negative
        const stNet = st.credit_cents > 0 ? st.credit_cents : -st.debit_cents;
        const stAbs = Math.abs(stNet);

        let candidate: any = null;
        let rule = '';
        let confidence = 1.0;

        // Rule 1: Match by Cheque Number + Amount
        if (st.cheque_number) {
          candidate = sysTx.find(s =>
            !matchedSysIds.has(s.id) &&
            Math.abs(s.amount_cents) === stAbs &&
            ((s.amount_cents > 0 && stNet > 0) || (s.amount_cents < 0 && stNet < 0)) &&
            s.cheque_number && s.cheque_number.trim() === st.cheque_number.trim()
          );
          if (candidate) {
            rule = 'exact_cheque_and_amount';
            confidence = 1.0;
          }
        }

        // Rule 2: Match by Reference No + Amount
        if (!candidate && st.reference_no) {
          candidate = sysTx.find(s =>
            !matchedSysIds.has(s.id) &&
            Math.abs(s.amount_cents) === stAbs &&
            ((s.amount_cents > 0 && stNet > 0) || (s.amount_cents < 0 && stNet < 0)) &&
            s.reference_no && s.reference_no.trim() === st.reference_no.trim()
          );
          if (candidate) {
            rule = 'exact_ref_and_amount';
            confidence = 0.95;
          }
        }

        // Rule 3: Match by Exact Date + Exact Amount
        if (!candidate) {
          candidate = sysTx.find(s =>
            !matchedSysIds.has(s.id) &&
            Math.abs(s.amount_cents) === stAbs &&
            ((s.amount_cents > 0 && stNet > 0) || (s.amount_cents < 0 && stNet < 0)) &&
            s.transaction_date === st.transaction_date
          );
          if (candidate) {
            rule = 'exact_date_and_amount';
            confidence = 0.90;
          }
        }

        // Rule 4: Match by Date within Tolerance Window (+/- toleranceDays) + Exact Amount
        if (!candidate && toleranceDays > 0) {
          candidate = sysTx.find(s => {
            if (matchedSysIds.has(s.id)) return false;
            if (Math.abs(s.amount_cents) !== stAbs) return false;
            if ((s.amount_cents > 0 && stNet < 0) || (s.amount_cents < 0 && stNet > 0)) return false;

            const stDate = new Date(st.transaction_date).getTime();
            const sysDate = new Date(s.transaction_date).getTime();
            const diffDays = Math.abs(stDate - sysDate) / (1000 * 60 * 60 * 24);
            return diffDays <= toleranceDays;
          });
          if (candidate) {
            rule = `date_tolerance_${toleranceDays}d_and_amount`;
            confidence = 0.80;
          }
        }

        if (candidate) {
          matchedSysIds.add(candidate.id);
          insMatch.run(sessionId, st.id, candidate.id, stAbs, confidence, rule, userId || null);
          updStmt.run(st.id);
          matchCount++;
        }
      }

      if (matchCount > 0) {
        db.prepare("UPDATE bank_reconciliation_sessions SET status = 'matched', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
        db.prepare(`
          INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
          VALUES (?, 'AUTO_MATCHED', ?, ?)
        `).run(sessionId, `Auto-matched ${matchCount} transactions with tolerance window ${toleranceDays} days`, userId || null);
      }
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
    return { matchedCount: matchCount };
  }

  public static manualMatchTransaction(
    sessionId: number,
    statementTransactionId: number,
    bankTransactionId?: number,
    chequeId?: number,
    userId?: number
  ): void {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot match in a completed reconciliation session.');

    const st = db.prepare('SELECT id, debit_cents, credit_cents, is_matched FROM bank_statement_transactions WHERE id = ? AND session_id = ?').get(statementTransactionId, sessionId) as any;
    if (!st) throw new Error('Statement transaction not found in this session.');
    if (st.is_matched) throw new Error('Statement transaction is already matched.');

    const stNet = st.credit_cents > 0 ? st.credit_cents : -st.debit_cents;
    const stAbs = Math.abs(stNet);

    let matchedAmount = stAbs;

    if (bankTransactionId) {
      const bt = db.prepare('SELECT id, amount_cents FROM bank_transactions WHERE id = ?').get(bankTransactionId) as any;
      if (!bt) throw new Error('System bank transaction not found.');

      // Check if already matched
      const existing = db.prepare('SELECT id FROM bank_reconciliation_matches WHERE session_id = ? AND bank_transaction_id = ?').get(sessionId, bankTransactionId);
      if (existing) throw new Error('System bank transaction is already matched in this session.');

      matchedAmount = Math.abs(bt.amount_cents);
    }

    const runTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO bank_reconciliation_matches (
          session_id, statement_transaction_id, bank_transaction_id, cheque_id,
          matched_amount_cents, match_type, confidence_score, match_rule, matched_by
        ) VALUES (?, ?, ?, ?, ?, 'manual', 1.0, 'manual_verification', ?)
      `).run(sessionId, statementTransactionId, bankTransactionId || null, chequeId || null, matchedAmount, userId || null);

      db.prepare('UPDATE bank_statement_transactions SET is_matched = 1, matched_at = CURRENT_TIMESTAMP WHERE id = ?').run(statementTransactionId);
      db.prepare("UPDATE bank_reconciliation_sessions SET status = 'matched', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'MANUAL_MATCH', ?, ?)
      `).run(sessionId, `Manually matched statement #${statementTransactionId} to system #${bankTransactionId || chequeId}`, userId || null);
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
  }

  public static unmatchTransaction(sessionId: number, matchId: number, userId?: number): void {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot modify matches in a completed reconciliation session.');

    const match = db.prepare('SELECT id, statement_transaction_id, bank_transaction_id FROM bank_reconciliation_matches WHERE id = ? AND session_id = ?').get(matchId, sessionId) as any;
    if (!match) throw new Error('Match record not found.');

    const runTx = db.transaction(() => {
      db.prepare('DELETE FROM bank_reconciliation_matches WHERE id = ?').run(matchId);
      db.prepare('UPDATE bank_statement_transactions SET is_matched = 0, matched_at = NULL WHERE id = ?').run(match.statement_transaction_id);

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'UNMATCHED', ?, ?)
      `).run(sessionId, `Unmatched statement #${match.statement_transaction_id}`, userId || null);
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
  }

  public static recordReconciliationAdjustment(
    sessionId: number,
    data: {
      type: 'bank_charge' | 'interest' | 'deposit' | 'withdrawal';
      date: string;
      amount_cents: number;
      description: string;
      reference_no?: string;
      statementTxId?: number;
    },
    userId?: number
  ): { transactionId: number } {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status, bank_account_id, financial_year_id FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot add adjustments to a completed session.');

    if (data.amount_cents <= 0) throw new Error('Adjustment amount must be positive.');

    let newTxId = 0;
    const runTx = db.transaction(() => {
      // Signed amount: interest & deposit are positive; bank_charge & withdrawal are negative
      const signedAmount = (data.type === 'interest' || data.type === 'deposit')
        ? data.amount_cents
        : -data.amount_cents;

      // Update Bank Account balance
      db.prepare(`
        UPDATE bank_accounts
        SET current_balance_cents = current_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(signedAmount, session.bank_account_id);

      // Insert Bank Transaction
      const btRes = db.prepare(`
        INSERT INTO bank_transactions (
          bank_account_id, transaction_date, transaction_type, amount_cents,
          reference_no, payee_or_payer, description, is_reconciled, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        session.bank_account_id,
        data.date,
        data.type,
        signedAmount,
        data.reference_no || `ADJ-${sessionId}-${Date.now().toString().slice(-4)}`,
        data.type === 'bank_charge' ? 'Bank Service Charges' : (data.type === 'interest' ? 'Bank Interest Earned' : 'Reconciliation Adjustment'),
        data.description || 'Reconciliation Adjustment',
        userId || null
      );
      newTxId = Number(btRes.lastInsertRowid);

      // Auto-match to statement line if statementTxId provided, else direct tick
      if (data.statementTxId) {
        db.prepare(`
          INSERT INTO bank_reconciliation_matches (
            session_id, statement_transaction_id, bank_transaction_id,
            matched_amount_cents, match_type, confidence_score, match_rule, matched_by
          ) VALUES (?, ?, ?, ?, 'adjustment', 1.0, 'adjustment_creation', ?)
        `).run(sessionId, data.statementTxId, newTxId, data.amount_cents, userId || null);

        db.prepare('UPDATE bank_statement_transactions SET is_matched = 1, matched_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.statementTxId);
      } else {
        db.prepare(`
          INSERT INTO bank_reconciliation_matches (
            session_id, statement_transaction_id, bank_transaction_id,
            matched_amount_cents, match_type, confidence_score, match_rule, matched_by
          ) VALUES (?, NULL, ?, ?, 'tick', 1.0, 'new_fee_ticked', ?)
        `).run(sessionId, newTxId, data.amount_cents, userId || null);
      }

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'ADJUSTMENT_POSTED', ?, ?)
      `).run(sessionId, `Posted ${data.type} adjustment of Rs. ${(data.amount_cents / 100).toFixed(2)}`, userId || null);
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
    return { transactionId: newTxId };
  }

  public static toggleTickTransaction(
    sessionId: number,
    bankTransactionId: number,
    isTicked: boolean,
    userId?: number
  ): void {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status, bank_account_id FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot modify a completed reconciliation session.');

    const runTx = db.transaction(() => {
      if (isTicked) {
        const tx = db.prepare('SELECT id, amount_cents FROM bank_transactions WHERE id = ?').get(bankTransactionId) as any;
        if (!tx) throw new Error('Transaction not found.');

        const existing = db.prepare('SELECT id FROM bank_reconciliation_matches WHERE session_id = ? AND bank_transaction_id = ?').get(sessionId, bankTransactionId);
        if (!existing) {
          db.prepare(`
            INSERT INTO bank_reconciliation_matches (
              session_id, statement_transaction_id, bank_transaction_id, cheque_id,
              matched_amount_cents, match_type, confidence_score, match_rule, matched_by
            ) VALUES (?, NULL, ?, NULL, ?, 'tick', 1.0, 'user_tick', ?)
          `).run(sessionId, bankTransactionId, Math.abs(tx.amount_cents), userId || null);
        }
      } else {
        db.prepare('DELETE FROM bank_reconciliation_matches WHERE session_id = ? AND bank_transaction_id = ?').run(sessionId, bankTransactionId);
      }
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
  }

  public static batchTickTransactions(
    sessionId: number,
    bankTransactionIds: number[],
    isTicked: boolean,
    userId?: number
  ): void {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status, bank_account_id FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Cannot modify a completed reconciliation session.');

    const runTx = db.transaction(() => {
      if (isTicked) {
        const insStmt = db.prepare(`
          INSERT OR IGNORE INTO bank_reconciliation_matches (
            session_id, statement_transaction_id, bank_transaction_id, cheque_id,
            matched_amount_cents, match_type, confidence_score, match_rule, matched_by
          ) VALUES (?, NULL, ?, ?, ?, 'tick', 1.0, 'user_tick', ?)
        `);
        for (const id of bankTransactionIds) {
          const tx = db.prepare('SELECT id, amount_cents FROM bank_transactions WHERE id = ?').get(id) as any;
          if (tx) {
            insStmt.run(sessionId, id, Math.abs(tx.amount_cents), userId || null);
          }
        }
      } else {
        if (bankTransactionIds.length > 0) {
          db.prepare(`
            DELETE FROM bank_reconciliation_matches
            WHERE session_id = ? AND bank_transaction_id IN (${bankTransactionIds.map(() => '?').join(',')})
          `).run(sessionId, ...bankTransactionIds);
        }
      }
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
  }

  public static updateReconciliationSessionBalances(
    sessionId: number,
    statementClosingBalanceCents: number,
    statementOpeningBalanceCents?: number
  ): void {
    const db = getDatabase();
    const session = db.prepare('SELECT id, status FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Session not found.');
    if (session.status === 'completed') throw new Error('Cannot update balances of a completed session.');

    if (statementOpeningBalanceCents !== undefined) {
      db.prepare(`
        UPDATE bank_reconciliation_sessions
        SET statement_closing_balance_cents = ?, statement_opening_balance_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(statementClosingBalanceCents, statementOpeningBalanceCents, sessionId);
    } else {
      db.prepare(`
        UPDATE bank_reconciliation_sessions
        SET statement_closing_balance_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(statementClosingBalanceCents, sessionId);
    }

    this.calculateReconciliationSummary(sessionId);
  }

  public static calculateReconciliationSummary(sessionId: number): ReconciliationSummaryCalculation {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Session not found.');

    const sysDetails = this.getSystemTransactionsForReconciliation(sessionId);
    const statementTx = this.getStatementTransactions(sessionId);

    // Sum matched statement debits & credits
    let matchedStmtDebits = 0;
    let matchedStmtCredits = 0;
    let unmatchedStmtDebits = 0;
    let unmatchedStmtCredits = 0;

    for (const st of statementTx) {
      if (st.is_matched) {
        matchedStmtDebits += Number(st.debit_cents || 0);
        matchedStmtCredits += Number(st.credit_cents || 0);
      } else {
        unmatchedStmtDebits += Number(st.debit_cents || 0);
        unmatchedStmtCredits += Number(st.credit_cents || 0);
      }
    }

    // Sum system matched & unmatched
    let matchedSysDebits = 0; // withdrawals / expenses (negative in bank_transactions)
    let matchedSysCredits = 0; // deposits / receipts (positive in bank_transactions)
    let unmatchedSysDebits = 0;
    let unmatchedSysCredits = 0;

    for (const tx of sysDetails.transactions) {
      const amt = Number(tx.amount_cents || 0);
      if (tx.is_matched) {
        if (amt >= 0) matchedSysCredits += amt;
        else matchedSysDebits += Math.abs(amt);
      } else {
        if (amt >= 0) unmatchedSysCredits += amt;
        else unmatchedSysDebits += Math.abs(amt);
      }
    }

    // Outstanding Cheques (Total LKR cents)
    const outChequesTotal = sysDetails.outstandingCheques.reduce((sum, c) => sum + Number(c.amount_cents || 0), 0);

    // Deposits in Transit (Total LKR cents)
    const depTransitTotal = sysDetails.depositsInTransit.reduce((sum, c) => sum + Number(c.amount_cents || 0), 0);

    // Unrecorded Bank Charges & Interest (from unmatched statement items)
    // Debit on bank statement = unrecorded fee/charge; Credit on bank statement = unrecorded interest/deposit
    const unrecordedCharges = unmatchedStmtDebits;
    const unrecordedInterest = unmatchedStmtCredits;

    // Direct manual tick workflow when no external statement rows were imported:
    if (statementTx.length === 0) {
      const stmtOpening = Number(session.statement_opening_balance_cents || 0);
      const stmtClosing = Number(session.statement_closing_balance_cents || 0);
      const clearedBalance = stmtOpening + matchedSysCredits - matchedSysDebits;
      const differenceCents = stmtClosing - clearedBalance;
      const isBalanced = differenceCents === 0;

      // Current Dynamic System Book Balance as of statement end date
      const sysClosing = this.calculateSystemBankBalanceAsOf(session.bank_account_id, session.period_end_date, false);

      // Update session table with the direct tick snapshot
      db.prepare(`
        UPDATE bank_reconciliation_sessions
        SET system_closing_balance_cents = ?,
            matched_statement_amount_cents = ?,
            matched_system_amount_cents = ?,
            deposits_in_transit_cents = ?,
            outstanding_cheques_cents = ?,
            unrecorded_bank_charges_cents = 0,
            unrecorded_bank_interest_cents = 0,
            adjusted_statement_balance_cents = ?,
            adjusted_book_balance_cents = ?,
            difference_cents = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        sysClosing,
        0,
        matchedSysCredits - matchedSysDebits,
        unmatchedSysCredits,
        unmatchedSysDebits,
        stmtClosing,
        clearedBalance,
        differenceCents,
        sessionId
      );

      return {
        statement_opening_balance_cents: stmtOpening,
        statement_closing_balance_cents: stmtClosing,
        system_opening_balance_cents: Number(session.system_opening_balance_cents || 0),
        system_closing_balance_cents: sysClosing,
        total_matched_statement_debits: 0,
        total_matched_statement_credits: 0,
        total_matched_system_debits: matchedSysDebits,
        total_matched_system_credits: matchedSysCredits,
        deposits_in_transit_cents: unmatchedSysCredits,
        deposits_in_transit_count: sysDetails.transactions.filter(t => !t.is_matched && t.amount_cents > 0).length,
        deposits_in_transit_items: sysDetails.transactions.filter(t => !t.is_matched && t.amount_cents > 0),
        outstanding_cheques_cents: unmatchedSysDebits,
        outstanding_cheques_count: sysDetails.transactions.filter(t => !t.is_matched && t.amount_cents < 0).length,
        outstanding_cheques_items: sysDetails.transactions.filter(t => !t.is_matched && t.amount_cents < 0),
        unmatched_statement_debits_cents: 0,
        unmatched_statement_credits_cents: 0,
        unmatched_system_debits_cents: unmatchedSysDebits,
        unmatched_system_credits_cents: unmatchedSysCredits,
        unrecorded_bank_charges_cents: 0,
        unrecorded_bank_interest_cents: 0,
        adjusted_statement_balance_cents: stmtClosing,
        adjusted_book_balance_cents: clearedBalance,
        difference_cents: differenceCents,
        is_balanced: isBalanced,
      };
    }

    // Mathematical Reconciliation Formula:
    // Adjusted Statement Balance = Statement Closing Balance + Deposits in Transit - Outstanding Issued Cheques
    const stmtClosing = Number(session.statement_closing_balance_cents || 0);
    const adjustedStatementBalance = stmtClosing + depTransitTotal - outChequesTotal;

    // Current Dynamic System Book Balance as of statement end date
    const sysClosing = this.calculateSystemBankBalanceAsOf(session.bank_account_id, session.period_end_date, false);

    // Adjusted Book Balance = System Book Balance + Unrecorded Interest - Unrecorded Charges
    const adjustedBookBalance = sysClosing + unrecordedInterest - unrecordedCharges;

    // Variance Difference = Adjusted Statement Balance - Adjusted Book Balance
    const differenceCents = adjustedStatementBalance - adjustedBookBalance;
    const isBalanced = differenceCents === 0;

    // Update session table with the computed snapshot
    db.prepare(`
      UPDATE bank_reconciliation_sessions
      SET system_closing_balance_cents = ?,
          matched_statement_amount_cents = ?,
          matched_system_amount_cents = ?,
          deposits_in_transit_cents = ?,
          outstanding_cheques_cents = ?,
          unrecorded_bank_charges_cents = ?,
          unrecorded_bank_interest_cents = ?,
          adjusted_statement_balance_cents = ?,
          adjusted_book_balance_cents = ?,
          difference_cents = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      sysClosing,
      matchedStmtCredits - matchedStmtDebits,
      matchedSysCredits - matchedSysDebits,
      depTransitTotal,
      outChequesTotal,
      unrecordedCharges,
      unrecordedInterest,
      adjustedStatementBalance,
      adjustedBookBalance,
      differenceCents,
      sessionId
    );

    return {
      statement_opening_balance_cents: Number(session.statement_opening_balance_cents || 0),
      statement_closing_balance_cents: stmtClosing,
      system_opening_balance_cents: Number(session.system_opening_balance_cents || 0),
      system_closing_balance_cents: sysClosing,
      total_matched_statement_debits: matchedStmtDebits,
      total_matched_statement_credits: matchedStmtCredits,
      total_matched_system_debits: matchedSysDebits,
      total_matched_system_credits: matchedSysCredits,
      deposits_in_transit_cents: depTransitTotal,
      deposits_in_transit_count: sysDetails.depositsInTransit.length,
      deposits_in_transit_items: sysDetails.depositsInTransit,
      outstanding_cheques_cents: outChequesTotal,
      outstanding_cheques_count: sysDetails.outstandingCheques.length,
      outstanding_cheques_items: sysDetails.outstandingCheques,
      unmatched_statement_debits_cents: unmatchedStmtDebits,
      unmatched_statement_credits_cents: unmatchedStmtCredits,
      unmatched_system_debits_cents: unmatchedSysDebits,
      unmatched_system_credits_cents: unmatchedSysCredits,
      unrecorded_bank_charges_cents: unrecordedCharges,
      unrecorded_bank_interest_cents: unrecordedInterest,
      adjusted_statement_balance_cents: adjustedStatementBalance,
      adjusted_book_balance_cents: adjustedBookBalance,
      difference_cents: differenceCents,
      is_balanced: isBalanced,
    };
  }

  public static completeReconciliation(sessionId: number, userId: number, notes?: string): BankReconciliationSession {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status === 'completed') throw new Error('Reconciliation is already completed.');

    const summary = this.calculateReconciliationSummary(sessionId);

    if (summary.difference_cents !== 0) {
      throw new Error(`Cannot complete reconciliation with an active variance of Rs. ${(Math.abs(summary.difference_cents) / 100).toFixed(2)}. Difference must be zero.`);
    }

    if (summary.unmatched_statement_debits_cents > 0 || summary.unmatched_statement_credits_cents > 0) {
      throw new Error('All statement transactions must be matched or posted as adjustments before completion.');
    }

    const runTx = db.transaction(() => {
      // Lock matched system bank transactions
      db.prepare(`
        UPDATE bank_transactions
        SET is_reconciled = 1, reconciled_at = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT bank_transaction_id FROM bank_reconciliation_matches WHERE session_id = ? AND bank_transaction_id IS NOT NULL
        )
      `).run(sessionId);

      // Lock session
      db.prepare(`
        UPDATE bank_reconciliation_sessions
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            completed_by = ?,
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, notes || null, sessionId);

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'COMPLETED', ?, ?)
      `).run(sessionId, `Reconciliation completed and locked with zero variance. Reconciled balance: Rs. ${(summary.adjusted_statement_balance_cents / 100).toFixed(2)}`, userId);

      AuditService.logAuthEvent(userId, 'system', 'RECONCILIATION_COMPLETED', `recon:${session.session_code}`, 'success');
    });

    runTx();
    return this.getReconciliationSessionDetail(sessionId).session;
  }

  public static reopenReconciliation(sessionId: number, userId: number, reason: string): BankReconciliationSession {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM bank_reconciliation_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new Error('Reconciliation session not found.');
    if (session.status !== 'completed') throw new Error('Only completed reconciliation sessions can be reopened.');

    const cleanReason = (reason || '').trim();
    if (!cleanReason) throw new Error('Reopen reason is mandatory for audit compliance.');

    // Ensure no later session is already completed
    const later = db.prepare(`
      SELECT session_code FROM bank_reconciliation_sessions
      WHERE bank_account_id = ? AND status = 'completed' AND period_start_date > ?
      LIMIT 1
    `).get(session.bank_account_id, session.period_end_date) as any;

    if (later) {
      throw new Error(`Cannot reopen session ${session.session_code} because a subsequent session (${later.session_code}) is already completed.`);
    }

    const runTx = db.transaction(() => {
      // Revert reconciled flag on system transactions
      db.prepare(`
        UPDATE bank_transactions
        SET is_reconciled = 0, reconciled_at = NULL
        WHERE id IN (
          SELECT bank_transaction_id FROM bank_reconciliation_matches WHERE session_id = ? AND bank_transaction_id IS NOT NULL
        )
      `).run(sessionId);

      // Reopen session to 'matched'
      db.prepare(`
        UPDATE bank_reconciliation_sessions
        SET status = 'matched',
            completed_at = NULL,
            completed_by = NULL,
            reopened_at = CURRENT_TIMESTAMP,
            reopened_by = ?,
            reopen_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, cleanReason, sessionId);

      db.prepare(`
        INSERT INTO bank_reconciliation_audit_logs (session_id, action, details, performed_by)
        VALUES (?, 'REOPENED', ?, ?)
      `).run(sessionId, `Reopened session. Reason: ${cleanReason}`, userId);

      AuditService.logAuthEvent(userId, 'system', 'RECONCILIATION_REOPENED', `recon:${session.session_code}`, 'success', cleanReason);
    });

    runTx();
    this.calculateReconciliationSummary(sessionId);
    return this.getReconciliationSessionDetail(sessionId).session;
  }

  // ========================================================
  // 16. PERIODIC FINANCIAL STATEMENT (ANNEXURE 19)
  // ========================================================
  public static getPeriodicStatementMappings(financialYearId: number): PeriodicStatementMapping[] {
    const db = getDatabase();
    // Auto-seed if none exist for this financial year
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM periodic_statement_mappings WHERE financial_year_id = ?').get(financialYearId) as { cnt: number };
    if (!existing || existing.cnt === 0) {
      this.seedDefaultPeriodicStatementMappings(financialYearId);
      this.autoAssignStatementMappingsFromTransactions(financialYearId);
    } else {
      // Auto-assign any newly discovered categories with transactions that haven't been mapped yet
      this.autoSyncActiveTransactionCategories(financialYearId);
    }

    const rows = db.prepare(`
      SELECT m.id, m.financial_year_id, m.section, m.report_code, m.display_order,
             m.label_si, m.label_en, m.estimated_amount_cents,
             m.fund_category_id, fc.category_code as fund_category_code,
             COALESCE(fc.name_si, fc.name_en) as fund_category_name,
             m.budget_category_id, bc.category_code as budget_category_code,
             COALESCE(bc.name_si, bc.name_en) as budget_category_name
      FROM periodic_statement_mappings m
      LEFT JOIN fund_categories fc ON m.fund_category_id = fc.id
      LEFT JOIN budget_categories bc ON m.budget_category_id = bc.id
      WHERE m.financial_year_id = ?
      ORDER BY CASE m.section
                 WHEN 'receipt' THEN 1
                 WHEN 'recurrent_expense' THEN 2
                 WHEN 'capital_expense' THEN 3
                 ELSE 4
               END, m.display_order ASC
    `).all(financialYearId) as PeriodicStatementMapping[];

    return rows;
  }

  /**
   * Auto-syncs any category with transactions into available unassigned or inactive slots
   * so users never have to manually map accounts or categories.
   */
  public static autoSyncActiveTransactionCategories(financialYearId: number): void {
    const db = getDatabase();

    // 1. Check for unmapped recurrent categories with expenses or allocations
    // (Only categories whose parent is also not mapped need a new slot; child categories roll into mapped parents)
    const unmappedRecurrent = db.prepare(`
      SELECT bc.id, bc.category_code, COALESCE(bc.name_si, bc.name, bc.name_en) as name_si,
             COALESCE(bc.name, bc.name_en) as name_en,
             COALESCE(spent.total_spent, 0) as total_spent,
             COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
      FROM budget_categories bc
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) as total_spent
        FROM expenses
        WHERE financial_year_id = ? AND status NOT IN ('reversed', 'cancelled')
        GROUP BY category_id
      ) spent ON bc.id = spent.category_id
      LEFT JOIN financial_year_budget_allocations fa ON bc.id = fa.category_id AND fa.financial_year_id = ?
      LEFT JOIN periodic_statement_mappings psm_direct
        ON bc.id = psm_direct.budget_category_id AND psm_direct.financial_year_id = ?
      LEFT JOIN periodic_statement_mappings psm_parent
        ON bc.parent_id = psm_parent.budget_category_id AND psm_parent.financial_year_id = ?
      WHERE (COALESCE(spent.total_spent, 0) > 0 OR COALESCE(fa.allocated_amount_cents, 0) > 0)
        AND psm_direct.id IS NULL
        AND psm_parent.id IS NULL
        AND NOT (bc.category_code LIKE '20%' OR bc.category_code = '200' OR bc.name LIKE '%Capital%' OR bc.name_si LIKE '%ප්‍රාග්ධන%')
      ORDER BY spent.total_spent DESC, fa.allocated_amount_cents DESC, bc.category_code ASC
    `).all(financialYearId, financialYearId, financialYearId, financialYearId) as any[];

    if (unmappedRecurrent.length > 0) {
      // Find empty or zero-activity recurrent slots (REX1..REX8)
      const reusableSlots = db.prepare(`
        SELECT psm.id, psm.report_code, psm.budget_category_id,
               COALESCE(spent.total_spent, 0) as total_spent,
               COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
        FROM periodic_statement_mappings psm
        LEFT JOIN (
          SELECT category_id, SUM(amount_cents) as total_spent
          FROM expenses
          WHERE financial_year_id = ? AND status NOT IN ('reversed', 'cancelled')
          GROUP BY category_id
        ) spent ON psm.budget_category_id = spent.category_id
        LEFT JOIN financial_year_budget_allocations fa
          ON psm.budget_category_id = fa.category_id AND fa.financial_year_id = ?
        WHERE psm.financial_year_id = ? AND psm.section = 'recurrent_expense' AND psm.report_code != 'වෙනත්'
          AND (psm.budget_category_id IS NULL OR (COALESCE(spent.total_spent, 0) = 0 AND COALESCE(fa.allocated_amount_cents, 0) = 0))
        ORDER BY psm.display_order ASC
      `).all(financialYearId, financialYearId, financialYearId) as any[];

      const updateStmt = db.prepare(`
        UPDATE periodic_statement_mappings
        SET budget_category_id = ?, label_si = ?, label_en = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (let i = 0; i < Math.min(unmappedRecurrent.length, reusableSlots.length); i++) {
        const cat = unmappedRecurrent[i];
        const slot = reusableSlots[i];
        updateStmt.run(cat.id, cat.name_si, cat.name_en, slot.id);
      }
    }

    // 2. Check for unmapped capital categories with expenses or allocations
    const unmappedCapital = db.prepare(`
      SELECT bc.id, bc.category_code, COALESCE(bc.name_si, bc.name, bc.name_en) as name_si,
             COALESCE(bc.name, bc.name_en) as name_en,
             COALESCE(spent.total_spent, 0) as total_spent,
             COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
      FROM budget_categories bc
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) as total_spent
        FROM expenses
        WHERE financial_year_id = ? AND status NOT IN ('reversed', 'cancelled')
        GROUP BY category_id
      ) spent ON bc.id = spent.category_id
      LEFT JOIN financial_year_budget_allocations fa ON bc.id = fa.category_id AND fa.financial_year_id = ?
      LEFT JOIN periodic_statement_mappings psm_direct
        ON bc.id = psm_direct.budget_category_id AND psm_direct.financial_year_id = ?
      LEFT JOIN periodic_statement_mappings psm_parent
        ON bc.parent_id = psm_parent.budget_category_id AND psm_parent.financial_year_id = ?
      WHERE (COALESCE(spent.total_spent, 0) > 0 OR COALESCE(fa.allocated_amount_cents, 0) > 0)
        AND psm_direct.id IS NULL
        AND psm_parent.id IS NULL
        AND (bc.category_code LIKE '20%' OR bc.category_code = '200' OR bc.name LIKE '%Capital%' OR bc.name_si LIKE '%ප්‍රාග්ධන%')
      ORDER BY spent.total_spent DESC, fa.allocated_amount_cents DESC, bc.category_code ASC
    `).all(financialYearId, financialYearId, financialYearId, financialYearId) as any[];

    if (unmappedCapital.length > 0) {
      const reusableSlots = db.prepare(`
        SELECT psm.id, psm.report_code, psm.budget_category_id,
               COALESCE(spent.total_spent, 0) as total_spent,
               COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
        FROM periodic_statement_mappings psm
        LEFT JOIN (
          SELECT category_id, SUM(amount_cents) as total_spent
          FROM expenses
          WHERE financial_year_id = ? AND status NOT IN ('reversed', 'cancelled')
          GROUP BY category_id
        ) spent ON psm.budget_category_id = spent.category_id
        LEFT JOIN financial_year_budget_allocations fa
          ON psm.budget_category_id = fa.category_id AND fa.financial_year_id = ?
        WHERE psm.financial_year_id = ? AND psm.section = 'capital_expense' AND psm.report_code != 'වෙනත්'
          AND (psm.budget_category_id IS NULL OR (COALESCE(spent.total_spent, 0) = 0 AND COALESCE(fa.allocated_amount_cents, 0) = 0))
        ORDER BY psm.display_order ASC
      `).all(financialYearId, financialYearId, financialYearId) as any[];

      const updateStmt = db.prepare(`
        UPDATE periodic_statement_mappings
        SET budget_category_id = ?, label_si = ?, label_en = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (let i = 0; i < Math.min(unmappedCapital.length, reusableSlots.length); i++) {
        const cat = unmappedCapital[i];
        const slot = reusableSlots[i];
        updateStmt.run(cat.id, cat.name_si, cat.name_en, slot.id);
      }
    }

    // 3. Check for unmapped fund categories with receipts
    const unmappedReceipts = db.prepare(`
      SELECT fc.id, fc.category_code, COALESCE(fc.name_si, fc.name_en) as name_si,
             fc.name_en as name_en,
             COALESCE(rcpt.total_receipts, 0) as total_receipts
      FROM fund_categories fc
      INNER JOIN (
        SELECT COALESCE(fr.fund_category_id, f.fund_category_id) as fcat_id, SUM(fr.amount_cents) as total_receipts
        FROM fund_receipts fr
        LEFT JOIN funds f ON fr.fund_id = f.id
        WHERE fr.financial_year_id = ? AND fr.status != 'cancelled'
        GROUP BY fcat_id
      ) rcpt ON fc.id = rcpt.fcat_id
      LEFT JOIN periodic_statement_mappings psm
        ON fc.id = psm.fund_category_id AND psm.financial_year_id = ?
      WHERE psm.id IS NULL AND COALESCE(rcpt.total_receipts, 0) > 0
      ORDER BY rcpt.total_receipts DESC, fc.id ASC
    `).all(financialYearId, financialYearId) as any[];

    if (unmappedReceipts.length > 0) {
      const reusableSlots = db.prepare(`
        SELECT psm.id, psm.report_code, psm.fund_category_id
        FROM periodic_statement_mappings psm
        LEFT JOIN fund_receipts fr
          ON psm.fund_category_id = fr.fund_category_id AND fr.financial_year_id = ? AND fr.status != 'cancelled'
        WHERE psm.financial_year_id = ? AND psm.section = 'receipt' AND psm.report_code != 'වෙනත්'
          AND (psm.fund_category_id IS NULL OR fr.id IS NULL)
        GROUP BY psm.id
        ORDER BY psm.display_order ASC
      `).all(financialYearId, financialYearId) as any[];

      const updateStmt = db.prepare(`
        UPDATE periodic_statement_mappings
        SET fund_category_id = ?, label_si = ?, label_en = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      for (let i = 0; i < Math.min(unmappedReceipts.length, reusableSlots.length); i++) {
        const cat = unmappedReceipts[i];
        const slot = reusableSlots[i];
        updateStmt.run(cat.id, cat.name_si, cat.name_en, slot.id);
      }
    }
  }

  /**
   * Complete auto-assignment of all S, REX, CEX codes from actual transactions.
   */
  public static autoAssignStatementMappingsFromTransactions(financialYearId: number, userId?: number): PeriodicStatementMapping[] {
    const db = getDatabase();

    const existing = db.prepare('SELECT COUNT(*) as cnt FROM periodic_statement_mappings WHERE financial_year_id = ?').get(financialYearId) as { cnt: number };
    if (!existing || existing.cnt === 0) {
      this.seedDefaultPeriodicStatementMappings(financialYearId);
    }

    // Query active recurrent categories
    const recurrentActive = db.prepare(`
      SELECT bc.id, bc.category_code, COALESCE(bc.name_si, bc.name, bc.name_en) as name_si,
             COALESCE(bc.name, bc.name_en) as name_en,
             COALESCE(spent.total_spent, 0) as total_spent,
             COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
      FROM budget_categories bc
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) as total_spent
        FROM expenses
        WHERE financial_year_id = ? AND status NOT IN ('reversed', 'cancelled')
        GROUP BY category_id
      ) spent ON bc.id = spent.category_id
      LEFT JOIN financial_year_budget_allocations fa ON bc.id = fa.category_id AND fa.financial_year_id = ?
      WHERE (COALESCE(spent.total_spent, 0) > 0 OR COALESCE(fa.allocated_amount_cents, 0) > 0)
        AND NOT (bc.category_code LIKE '20%' OR bc.category_code = '200' OR bc.name LIKE '%Capital%' OR bc.name_si LIKE '%ප්‍රාග්ධන%')
      ORDER BY spent.total_spent DESC, fa.allocated_amount_cents DESC, bc.category_code ASC
    `).all(financialYearId, financialYearId) as any[];

    // Query active capital categories
    const capitalActive = db.prepare(`
      SELECT bc.id, bc.category_code, COALESCE(bc.name_si, bc.name, bc.name_en) as name_si,
             COALESCE(bc.name, bc.name_en) as name_en,
             COALESCE(spent.total_spent, 0) as total_spent,
             COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
      FROM budget_categories bc
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) as total_spent
        FROM expenses
        WHERE financial_year_id = ? AND status NOT IN ('reversed', 'cancelled')
        GROUP BY category_id
      ) spent ON bc.id = spent.category_id
      LEFT JOIN financial_year_budget_allocations fa ON bc.id = fa.category_id AND fa.financial_year_id = ?
      WHERE (COALESCE(spent.total_spent, 0) > 0 OR COALESCE(fa.allocated_amount_cents, 0) > 0)
        AND (bc.category_code LIKE '20%' OR bc.category_code = '200' OR bc.name LIKE '%Capital%' OR bc.name_si LIKE '%ප්‍රාග්ධන%')
      ORDER BY spent.total_spent DESC, fa.allocated_amount_cents DESC, bc.category_code ASC
    `).all(financialYearId, financialYearId) as any[];

    // Query active fund categories
    const receiptActive = db.prepare(`
      SELECT fc.id, fc.category_code, COALESCE(fc.name_si, fc.name_en) as name_si,
             fc.name_en as name_en,
             COALESCE(rcpt.total_receipts, 0) as total_receipts
      FROM fund_categories fc
      INNER JOIN (
        SELECT COALESCE(fr.fund_category_id, f.fund_category_id) as fcat_id, SUM(fr.amount_cents) as total_receipts
        FROM fund_receipts fr
        LEFT JOIN funds f ON fr.fund_id = f.id
        WHERE fr.financial_year_id = ? AND fr.status != 'cancelled'
        GROUP BY fcat_id
      ) rcpt ON fc.id = rcpt.fcat_id
      WHERE COALESCE(rcpt.total_receipts, 0) > 0
      ORDER BY rcpt.total_receipts DESC, fc.id ASC
    `).all(financialYearId) as any[];

    // Fallbacks
    const allFundCats = db.prepare('SELECT id, category_code, name_si, name_en FROM fund_categories ORDER BY id ASC').all() as any[];
    const allBudgetCats = db.prepare('SELECT id, category_code, name_si, name_en FROM budget_categories ORDER BY id ASC').all() as any[];
    const fallbackRecurrent = allBudgetCats.filter((b) => !b.category_code?.startsWith('20') && b.category_code !== '200' && !b.name?.includes('Capital') && !b.name_si?.includes('ප්‍රාග්ධන'));
    const fallbackCapital = allBudgetCats.filter((b) => b.category_code?.startsWith('20') || b.category_code === '200' || b.name?.includes('Capital') || b.name_si?.includes('ප්‍රාග්ධන'));

    const updateMapStmt = db.prepare(`
      UPDATE periodic_statement_mappings
      SET budget_category_id = ?, fund_category_id = ?, label_si = ?, label_en = ?, updated_at = CURRENT_TIMESTAMP
      WHERE financial_year_id = ? AND section = ? AND report_code = ?
    `);

    const tx = db.transaction(() => {
      // Recurrent: REX1..REX8
      const usedRecurrent = new Set<number>();
      for (let i = 1; i <= 8; i++) {
        const code = `REX${i}`;
        const activeCat = recurrentActive[i - 1] || null;
        if (activeCat) {
          usedRecurrent.add(activeCat.id);
          updateMapStmt.run(activeCat.id, null, activeCat.name_si, activeCat.name_en, financialYearId, 'recurrent_expense', code);
        } else {
          const fallback = fallbackRecurrent.find((c) => !usedRecurrent.has(c.id));
          if (fallback) {
            usedRecurrent.add(fallback.id);
            updateMapStmt.run(fallback.id, null, fallback.name_si, fallback.name_en, financialYearId, 'recurrent_expense', code);
          } else {
            updateMapStmt.run(null, null, `පුනරාවර්තන වියදම ${i}`, `Recurrent Expenditure ${i}`, financialYearId, 'recurrent_expense', code);
          }
        }
      }

      // Capital: CEX1..CEX6
      const usedCapital = new Set<number>();
      for (let i = 1; i <= 6; i++) {
        const code = `CEX${i}`;
        const activeCat = capitalActive[i - 1] || null;
        if (activeCat) {
          usedCapital.add(activeCat.id);
          updateMapStmt.run(activeCat.id, null, activeCat.name_si, activeCat.name_en, financialYearId, 'capital_expense', code);
        } else {
          const fallback = fallbackCapital.find((c) => !usedCapital.has(c.id));
          if (fallback) {
            usedCapital.add(fallback.id);
            updateMapStmt.run(fallback.id, null, fallback.name_si, fallback.name_en, financialYearId, 'capital_expense', code);
          } else {
            updateMapStmt.run(null, null, `ප්‍රාග්ධන වියදම ${i}`, `Capital Expenditure ${i}`, financialYearId, 'capital_expense', code);
          }
        }
      }

      // Receipts: S1..S10
      const usedReceipts = new Set<number>();
      for (let i = 1; i <= 10; i++) {
        const code = `S${i}`;
        const activeCat = receiptActive[i - 1] || null;
        if (activeCat) {
          usedReceipts.add(activeCat.id);
          updateMapStmt.run(null, activeCat.id, activeCat.name_si, activeCat.name_en, financialYearId, 'receipt', code);
        } else {
          const fallback = allFundCats.find((c) => !usedReceipts.has(c.id));
          if (fallback) {
            usedReceipts.add(fallback.id);
            updateMapStmt.run(null, fallback.id, fallback.name_si, fallback.name_en, financialYearId, 'receipt', code);
          } else {
            updateMapStmt.run(null, null, `ලැබීම් ශීර්ෂය ${i}`, `Receipt Category ${i}`, financialYearId, 'receipt', code);
          }
        }
      }
    });

    tx();
    AuditService.logAuthEvent(userId || null, 'system', 'PERIODIC_STATEMENT_AUTO_ASSIGNED', `fy:${financialYearId}`, 'success', 'Auto-assigned active categories from transactions');
    return this.getPeriodicStatementMappings(financialYearId);
  }

  public static seedDefaultPeriodicStatementMappings(financialYearId: number): void {
    const db = getDatabase();
    const fundCats = db.prepare('SELECT id, category_code, name_si, name_en FROM fund_categories ORDER BY id ASC').all() as any[];
    const budgetCats = db.prepare('SELECT id, category_code, name_si, name_en FROM budget_categories ORDER BY id ASC').all() as any[];

    const recurrentCats = budgetCats.filter((b) => !b.category_code?.startsWith('20') && b.category_code !== '200');
    const capitalCats = budgetCats.filter((b) => b.category_code?.startsWith('20') || b.category_code === '200');

    const insertMap = db.prepare(`
      INSERT INTO periodic_statement_mappings (
        financial_year_id, section, report_code, display_order, label_si, label_en,
        fund_category_id, budget_category_id, estimated_amount_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      // S1 to S10 and වෙනත්
      for (let i = 1; i <= 10; i++) {
        const code = `S${i}`;
        const matchedFcat = fundCats[i - 1] || null;
        insertMap.run(
          financialYearId,
          'receipt',
          code,
          i,
          matchedFcat ? matchedFcat.name_si : `ලැබීම් ශීර්ෂය ${i}`,
          matchedFcat ? matchedFcat.name_en : `Receipt Category ${i}`,
          matchedFcat ? matchedFcat.id : null,
          null,
          0
        );
      }
      insertMap.run(financialYearId, 'receipt', 'වෙනත්', 11, 'වෙනත් ලැබීම්', 'Other Receipts', null, null, 0);

      // REX1 to REX8
      for (let i = 1; i <= 8; i++) {
        const code = `REX${i}`;
        const matchedBcat = recurrentCats[i - 1] || null;
        insertMap.run(
          financialYearId,
          'recurrent_expense',
          code,
          i,
          matchedBcat ? matchedBcat.name_si : `පුනරාවර්තන වියදම ${i}`,
          matchedBcat ? matchedBcat.name_en : `Recurrent Expenditure ${i}`,
          null,
          matchedBcat ? matchedBcat.id : null,
          0
        );
      }

      // CEX1 to CEX6 and වෙනත්
      for (let i = 1; i <= 6; i++) {
        const code = `CEX${i}`;
        const matchedBcat = capitalCats[i - 1] || null;
        insertMap.run(
          financialYearId,
          'capital_expense',
          code,
          i,
          matchedBcat ? matchedBcat.name_si : `ප්‍රාග්ධන වියදම ${i}`,
          matchedBcat ? matchedBcat.name_en : `Capital Expenditure ${i}`,
          null,
          matchedBcat ? matchedBcat.id : null,
          0
        );
      }
      insertMap.run(financialYearId, 'capital_expense', 'වෙනත්', 7, 'වෙනත් ප්‍රාග්ධන වියදම්', 'Other Capital Expenses', null, null, 0);
    });

    tx();
  }

  public static savePeriodicStatementMappings(financialYearId: number, mappings: any[], userId?: number): void {
    const db = getDatabase();
    const updateStmt = db.prepare(`
      UPDATE periodic_statement_mappings
      SET label_si = ?, label_en = ?, fund_category_id = ?, budget_category_id = ?,
          estimated_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND financial_year_id = ?
    `);

    const tx = db.transaction(() => {
      for (const m of mappings) {
        if (!m.id) continue;
        updateStmt.run(
          (m.label_si || '').trim() || m.report_code,
          (m.label_en || '').trim() || m.report_code,
          m.fund_category_id || null,
          m.budget_category_id || null,
          Math.max(0, Math.round(Number(m.estimated_amount_cents || 0))),
          m.id,
          financialYearId
        );
      }
      AuditService.logAuthEvent(userId || null, 'system', 'PERIODIC_STATEMENT_MAPPINGS_UPDATED', `fy:${financialYearId}`, 'success', `Updated ${mappings.length} mapping rows`);
    });

    tx();
  }

  public static savePeriodicStatementAdjustments(
    financialYearId: number,
    startDate: string,
    endDate: string,
    adjustments: any,
    userId?: number
  ): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO periodic_statement_adjustments (
        financial_year_id, period_start_date, period_end_date,
        opening_balance_override_cents, other_additions_cents,
        canteen_refund_cents, cheque_reissue_cents, bank_charges_cents,
        petty_cash_balance_cents, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(financial_year_id, period_start_date, period_end_date) DO UPDATE SET
        opening_balance_override_cents = excluded.opening_balance_override_cents,
        other_additions_cents = excluded.other_additions_cents,
        canteen_refund_cents = excluded.canteen_refund_cents,
        cheque_reissue_cents = excluded.cheque_reissue_cents,
        bank_charges_cents = excluded.bank_charges_cents,
        petty_cash_balance_cents = excluded.petty_cash_balance_cents,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      financialYearId,
      startDate,
      endDate,
      adjustments.opening_balance_override_cents !== undefined && adjustments.opening_balance_override_cents !== null
        ? Math.round(Number(adjustments.opening_balance_override_cents))
        : null,
      Math.round(Number(adjustments.other_additions_cents || 0)),
      Math.round(Number(adjustments.canteen_refund_cents || 0)),
      Math.round(Number(adjustments.cheque_reissue_cents || 0)),
      Math.round(Number(adjustments.bank_charges_cents || 0)),
      Math.round(Number(adjustments.petty_cash_balance_cents || 0)),
      adjustments.notes || null
    );

    AuditService.logAuthEvent(userId || null, 'system', 'PERIODIC_STATEMENT_ADJUSTMENTS_SAVED', `fy:${financialYearId}:${startDate}_${endDate}`, 'success', 'Saved statement adjustments');
  }

  public static getPeriodicStatementReport(params: {
    financialYearId: number;
    periodType: '1st' | '2nd' | '3rd' | 'custom';
    startDate: string;
    endDate: string;
  }): PeriodicStatementReportData {
    const db = getDatabase();
    const fy = db.prepare('SELECT id, year_name, start_date, end_date FROM financial_years WHERE id = ?').get(params.financialYearId) as any;
    if (!fy) throw new Error('Selected financial year not found.');

    const schoolProfile = db.prepare('SELECT name_si, name_en FROM school_profile LIMIT 1').get() as any;
    const schoolNameSi = schoolProfile?.name_si || 'කු/ එස්.ඩබ්.ආර්.ඩී. බණ්ඩාරනායක මහා විද්‍යාලය';
    const schoolNameEn = schoolProfile?.name_en || 'S.W.R.D. Bandaranaike Maha Vidyalaya';

    const startDate = params.startDate || fy.start_date;
    const endDate = params.endDate || fy.end_date;

    // Format As-of date e.g. "2026/ 04/ 30"
    const asOfParts = endDate.split('-');
    const asOfDateLabel = asOfParts.length === 3 ? `${asOfParts[0]}/ ${asOfParts[1]}/ ${asOfParts[2]}` : endDate;

    // Load Mappings
    const mappings = this.getPeriodicStatementMappings(params.financialYearId);
    const receiptMappings = mappings.filter((m) => m.section === 'receipt');
    const recurrentMappings = mappings.filter((m) => m.section === 'recurrent_expense');
    const capitalMappings = mappings.filter((m) => m.section === 'capital_expense');

    // Load Saved Adjustments (if any)
    const adjRow = db.prepare(`
      SELECT * FROM periodic_statement_adjustments
      WHERE financial_year_id = ? AND period_start_date = ? AND period_end_date = ?
    `).get(params.financialYearId, startDate, endDate) as any;

    // 1. Calculate Opening Balance as of startDate
    let openingBalanceCents = 0;
    if (adjRow && adjRow.opening_balance_override_cents !== null && adjRow.opening_balance_override_cents !== undefined) {
      openingBalanceCents = Number(adjRow.opening_balance_override_cents);
    } else {
      // Sum bank opening balance + prior bank net cash flows + prior cashbook running balance
      const banks = db.prepare('SELECT id, opening_balance_cents FROM bank_accounts').all() as any[];
      for (const b of banks) {
        openingBalanceCents += Number(b.opening_balance_cents || 0);
      }
      const bankPrior = db.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as net_amt
        FROM bank_transactions
        WHERE transaction_date < ?
      `).get(startDate) as any;
      openingBalanceCents += Number(bankPrior?.net_amt || 0);

      const cashLast = db.prepare(`
        SELECT running_balance_cents
        FROM cash_transactions
        WHERE transaction_date < ?
        ORDER BY id DESC LIMIT 1
      `).get(startDate) as any;
      if (cashLast) {
        openingBalanceCents += Number(cashLast.running_balance_cents || 0);
      }
    }

    // 2. Receipts Rows (Left Section)
    const receiptRows: PeriodicStatementRow[] = [];
    let totalReceiptEstimateCents = 0;
    let totalReceiptPriorCents = 0;
    let totalReceiptCurrCents = 0;

    // Load active fund categories from transactions or mappings
    const activeFundCategories = db.prepare(`
      SELECT fc.id, fc.category_code,
             COALESCE(fc.name_si, fc.name_en) as label_si,
             fc.name_en as label_en
      FROM fund_categories fc
      INNER JOIN (
        SELECT COALESCE(fr.fund_category_id, f.fund_category_id) as fcat_id
        FROM fund_receipts fr
        LEFT JOIN funds f ON fr.fund_id = f.id
        WHERE fr.financial_year_id = ?
          AND fr.status NOT IN ('cancelled', 'reversed')
        GROUP BY fcat_id
      ) active_rcpt ON fc.id = active_rcpt.fcat_id
      ORDER BY fc.category_code ASC
    `).all(params.financialYearId) as any[];

    const allFundCatIds = new Set<number>();
    activeFundCategories.forEach((c) => allFundCatIds.add(c.id));
    receiptMappings.forEach((m) => {
      if (m.fund_category_id && m.report_code !== 'වෙනත්') {
        allFundCatIds.add(m.fund_category_id);
      }
    });

    for (const fcatId of allFundCatIds) {
      const fcat = db.prepare(`SELECT id, category_code, COALESCE(name_si, name_en) as label_si, name_en as label_en FROM fund_categories WHERE id = ?`).get(fcatId) as any;
      if (!fcat) continue;

      const mapping = receiptMappings.find((m) => m.fund_category_id === fcatId);

      const priorRes = db.prepare(`
        SELECT COALESCE(SUM(fr.amount_cents), 0) as prior_sum
        FROM fund_receipts fr
        LEFT JOIN funds f ON fr.fund_id = f.id
        WHERE COALESCE(fr.fund_category_id, f.fund_category_id) = ?
          AND fr.financial_year_id = ?
          AND fr.status NOT IN ('cancelled', 'reversed')
          AND fr.receipt_date >= ?
          AND fr.receipt_date < ?
      `).get(fcatId, params.financialYearId, fy.start_date, startDate) as any;
      const priorCents = Number(priorRes?.prior_sum || 0);

      const currRes = db.prepare(`
        SELECT COALESCE(SUM(fr.amount_cents), 0) as curr_sum
        FROM fund_receipts fr
        LEFT JOIN funds f ON fr.fund_id = f.id
        WHERE COALESCE(fr.fund_category_id, f.fund_category_id) = ?
          AND fr.financial_year_id = ?
          AND fr.status NOT IN ('cancelled', 'reversed')
          AND fr.receipt_date >= ?
          AND fr.receipt_date <= ?
      `).get(fcatId, params.financialYearId, startDate, endDate) as any;
      const currCents = Number(currRes?.curr_sum || 0);

      const estimateCents = Number(mapping?.estimated_amount_cents || 0);
      const totalCumulativeCents = priorCents + currCents;

      if (estimateCents > 0 || totalCumulativeCents > 0) {
        totalReceiptEstimateCents += estimateCents;
        totalReceiptPriorCents += priorCents;
        totalReceiptCurrCents += currCents;

        receiptRows.push({
          report_code: mapping?.report_code || fcat.category_code || '',
          label_si: mapping?.label_si || fcat.label_si,
          label_en: mapping?.label_en || fcat.label_en,
          category_id: fcat.id,
          category_code: fcat.category_code || null,
          annual_estimate_cents: estimateCents,
          prior_cumulative_cents: priorCents,
          current_period_cents: currCents,
          total_cumulative_cents: totalCumulativeCents,
        });
      }
    }

    // Check unclassified receipts (not in any fund category)
    const unclassRcpt = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN fr.receipt_date >= ? AND fr.receipt_date < ? THEN fr.amount_cents ELSE 0 END), 0) as prior_sum,
        COALESCE(SUM(CASE WHEN fr.receipt_date >= ? AND fr.receipt_date <= ? THEN fr.amount_cents ELSE 0 END), 0) as curr_sum
      FROM fund_receipts fr
      LEFT JOIN funds f ON fr.fund_id = f.id
      LEFT JOIN fund_categories fc ON COALESCE(fr.fund_category_id, f.fund_category_id) = fc.id
      WHERE fr.financial_year_id = ?
        AND fr.status NOT IN ('cancelled', 'reversed')
        AND fc.id IS NULL
    `).get(fy.start_date, startDate, startDate, endDate, params.financialYearId) as any;

    const unclassPrior = Number(unclassRcpt?.prior_sum || 0);
    const unclassCurr = Number(unclassRcpt?.curr_sum || 0);
    if (unclassPrior > 0 || unclassCurr > 0) {
      totalReceiptPriorCents += unclassPrior;
      totalReceiptCurrCents += unclassCurr;
      receiptRows.push({
        report_code: 'වෙනත්',
        label_si: 'වෙනත් ලැබීම්',
        label_en: 'Other Receipts',
        category_id: null,
        category_code: 'OTHER',
        annual_estimate_cents: 0,
        prior_cumulative_cents: unclassPrior,
        current_period_cents: unclassCurr,
        total_cumulative_cents: unclassPrior + unclassCurr,
      });
    }

    // 3. Payments Rows (Right Section: Recurrent & Capital Expenses directly from Actual Budget Page)
    const recurrentExpenseRows: PeriodicStatementRow[] = [];
    const capitalExpenseRows: PeriodicStatementRow[] = [];

    let totalPaymentAllocCents = 0;
    let totalPaymentPriorCents = 0;
    let totalPaymentCurrCents = 0;

    // Directly query budget categories from Actual Budget Page that have allocations or transactions
    const budgetCategories = db.prepare(`
      SELECT bc.id, bc.category_code,
             COALESCE(bc.name_si, bc.name, bc.name_en) as label_si,
             COALESCE(bc.name, bc.name_en) as label_en,
             bc.parent_id,
             p.category_code as parent_code,
             COALESCE(fa.allocated_amount_cents, 0) as allocated_amount_cents
      FROM budget_categories bc
      LEFT JOIN budget_categories p ON bc.parent_id = p.id
      LEFT JOIN financial_year_budget_allocations fa ON bc.id = fa.category_id AND fa.financial_year_id = ?
      LEFT JOIN (
        SELECT e.category_id, COUNT(*) as tx_count
        FROM expenses e
        WHERE e.financial_year_id = ?
          AND e.status IN ('approved', 'paid')
        GROUP BY e.category_id
      ) active_tx ON bc.id = active_tx.category_id
      WHERE (fa.id IS NOT NULL OR active_tx.tx_count > 0)
      ORDER BY COALESCE(p.category_code, bc.category_code, '') ASC, COALESCE(bc.category_code, '') ASC
    `).all(params.financialYearId, params.financialYearId) as any[];

    for (const cat of budgetCategories) {
      const customMap = mappings.find((m) => m.budget_category_id === cat.id);

      const allocCents = Number(cat.allocated_amount_cents || 0);

      const priorRes = db.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as prior_sum
        FROM expenses
        WHERE category_id = ?
          AND financial_year_id = ?
          AND status IN ('approved', 'paid')
          AND expense_date >= ?
          AND expense_date < ?
      `).get(cat.id, params.financialYearId, fy.start_date, startDate) as any;
      const priorCents = Number(priorRes?.prior_sum || 0);

      const currRes = db.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as curr_sum
        FROM expenses
        WHERE category_id = ?
          AND financial_year_id = ?
          AND status IN ('approved', 'paid')
          AND expense_date >= ?
          AND expense_date <= ?
      `).get(cat.id, params.financialYearId, startDate, endDate) as any;
      const currCents = Number(currRes?.curr_sum || 0);

      const totalCumulativeCents = priorCents + currCents;

      totalPaymentAllocCents += allocCents;
      totalPaymentPriorCents += priorCents;
      totalPaymentCurrCents += currCents;

      const isCapital =
        cat.parent_id === 5 ||
        cat.id === 5 ||
        (cat.category_code && cat.category_code.startsWith('20')) ||
        (cat.label_en && cat.label_en.toLowerCase().includes('capital')) ||
        (cat.label_si && cat.label_si.includes('ප්‍රාග්ධන'));

      const rowObj: PeriodicStatementRow = {
        report_code: customMap?.report_code || cat.category_code || '',
        label_si: customMap?.label_si || cat.label_si,
        label_en: customMap?.label_en || cat.label_en,
        category_id: cat.id,
        category_code: cat.category_code || null,
        annual_estimate_cents: allocCents,
        prior_cumulative_cents: priorCents,
        current_period_cents: currCents,
        total_cumulative_cents: totalCumulativeCents,
      };

      if (isCapital) {
        capitalExpenseRows.push(rowObj);
      } else {
        recurrentExpenseRows.push(rowObj);
      }
    }

    // Check unclassified expenses
    const unclassExp = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN e.expense_date >= ? AND e.expense_date < ? THEN e.amount_cents ELSE 0 END), 0) as prior_sum,
        COALESCE(SUM(CASE WHEN e.expense_date >= ? AND e.expense_date <= ? THEN e.amount_cents ELSE 0 END), 0) as curr_sum
      FROM expenses e
      LEFT JOIN budget_categories bc ON e.category_id = bc.id
      WHERE e.financial_year_id = ?
        AND e.status IN ('approved', 'paid')
        AND (e.category_id IS NULL OR bc.id IS NULL)
    `).get(fy.start_date, startDate, startDate, endDate, params.financialYearId) as any;

    const unclassExpPrior = Number(unclassExp?.prior_sum || 0);
    const unclassExpCurr = Number(unclassExp?.curr_sum || 0);
    if (unclassExpPrior > 0 || unclassExpCurr > 0) {
      totalPaymentPriorCents += unclassExpPrior;
      totalPaymentCurrCents += unclassExpCurr;
      recurrentExpenseRows.push({
        report_code: 'වෙනත්',
        label_si: 'වෙනත් ගෙවීම්',
        label_en: 'Other Payments',
        category_id: null,
        category_code: 'OTHER',
        annual_estimate_cents: 0,
        prior_cumulative_cents: unclassExpPrior,
        current_period_cents: unclassExpCurr,
        total_cumulative_cents: unclassExpPrior + unclassExpCurr,
      });
    }

    // 4. Closing Balance Calculation Arithmetic (Section Below Table)
    // Formula from original document:
    //   Opening Balance + Receipts to Date + Other Additions = Subtotal
    // - Payments to Date - Canteen Refund - Cheque Reissue - Bank Charges - Petty Cash Balance = Final Closing Balance
    const totalReceiptsCents = totalReceiptPriorCents + totalReceiptCurrCents;
    const totalPaymentsCents = totalPaymentPriorCents + totalPaymentCurrCents;

    let otherAdditionsCents = 0;
    let canteenRefundCents = 0;
    let chequeReissueCents = 0;
    let bankChargesCents = 0;
    let pettyCashBalanceCents = 0;
    let notes = '';

    if (adjRow) {
      otherAdditionsCents = Number(adjRow.other_additions_cents || 0);
      canteenRefundCents = Number(adjRow.canteen_refund_cents || 0);
      chequeReissueCents = Number(adjRow.cheque_reissue_cents || 0);
      bankChargesCents = Number(adjRow.bank_charges_cents || 0);
      pettyCashBalanceCents = Number(adjRow.petty_cash_balance_cents || 0);
      notes = adjRow.notes || '';
    } else {
      // Auto-detect bank charges during the period
      const chargesRes = db.prepare(`
        SELECT COALESCE(SUM(ABS(amount_cents)), 0) as charges
        FROM bank_transactions
        WHERE transaction_date >= ? AND transaction_date <= ?
          AND (transaction_type = 'bank_charge' OR description LIKE 'Bank Charge%' OR description LIKE 'Bank Fee%')
      `).get(startDate, endDate) as any;
      bankChargesCents = Number(chargesRes?.charges || 0);

      // Auto-detect petty cash balance remaining at period end
      const pcBalRes = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN type IN ('replenishment', 'transfer_in') THEN amount_cents ELSE -amount_cents END), 0) as bal
        FROM petty_cash_vouchers
        WHERE voucher_date <= ? AND status = 'approved'
      `).get(endDate) as any;
      pettyCashBalanceCents = Math.max(0, Number(pcBalRes?.bal || 0));
    }

    const subtotalReceiptsCents = openingBalanceCents + totalReceiptsCents + otherAdditionsCents;
    const closingBalanceCents =
      subtotalReceiptsCents -
      totalPaymentsCents -
      canteenRefundCents -
      chequeReissueCents -
      bankChargesCents -
      pettyCashBalanceCents;

    // Total for Col 5 on receipts side in Annexure 19 is Opening Balance + Receipts to date
    const grandTotalReceiptsCol5 = openingBalanceCents + totalReceiptsCents;

    return {
      school_name_si: schoolNameSi,
      school_name_en: schoolNameEn,
      financial_year_id: fy.id,
      financial_year_name: fy.year_name,
      period_type: params.periodType,
      period_start_date: startDate,
      period_end_date: endDate,
      as_of_date_label: asOfDateLabel,
      opening_balance_cents: openingBalanceCents,
      receipt_rows: receiptRows,
      recurrent_expense_rows: recurrentExpenseRows,
      capital_expense_rows: capitalExpenseRows,
      receipt_totals: {
        annual_estimate_cents: totalReceiptEstimateCents,
        prior_cumulative_cents: totalReceiptPriorCents,
        current_period_cents: totalReceiptCurrCents,
        total_cumulative_cents: grandTotalReceiptsCol5,
      },
      payment_totals: {
        annual_allocation_cents: totalPaymentAllocCents,
        prior_cumulative_cents: totalPaymentPriorCents,
        current_period_cents: totalPaymentCurrCents,
        total_cumulative_cents: totalPaymentsCents,
      },
      calculation: {
        period_start_date: startDate,
        period_end_date: endDate,
        opening_balance_cents: openingBalanceCents,
        total_receipts_cents: totalReceiptsCents,
        other_additions_cents: otherAdditionsCents,
        subtotal_receipts_cents: subtotalReceiptsCents,
        total_payments_cents: totalPaymentsCents,
        canteen_refund_cents: canteenRefundCents,
        cheque_reissue_cents: chequeReissueCents,
        bank_charges_cents: bankChargesCents,
        petty_cash_balance_cents: pettyCashBalanceCents,
        closing_balance_cents: closingBalanceCents,
        notes,
      },
    };
  }
}
