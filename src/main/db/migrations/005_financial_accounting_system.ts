import type Database from 'better-sqlite3';
import { Migration } from './001_initial_settings';

export const migration005: Migration = {
  id: 5,
  name: '005_financial_accounting_system',
  up: (db: Database.Database) => {
    // 1. Financial Years
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_name TEXT NOT NULL UNIQUE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
        is_current INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_financial_years_is_current ON financial_years(is_current);
      CREATE INDEX IF NOT EXISTS idx_financial_years_status ON financial_years(status);
    `);

    // 2. Chart of Accounts (Double-Entry General Ledger Structure)
    db.exec(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name_en TEXT NOT NULL,
        account_name_si TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
        parent_id INTEGER REFERENCES chart_of_accounts(id),
        is_system INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);
      CREATE INDEX IF NOT EXISTS idx_coa_active ON chart_of_accounts(is_active);
      CREATE INDEX IF NOT EXISTS idx_coa_parent ON chart_of_accounts(parent_id);
    `);

    // 3. Budget Categories & Annual Budgets
    db.exec(`
      CREATE TABLE IF NOT EXISTS budget_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        parent_id INTEGER REFERENCES budget_categories(id),
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_budget_cats_parent ON budget_categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_budget_cats_code ON budget_categories(category_code);

      CREATE TABLE IF NOT EXISTS annual_budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE RESTRICT,
        approved_amount_cents INTEGER NOT NULL DEFAULT 0,
        revised_amount_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'locked')),
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(financial_year_id, category_id)
      );

      CREATE INDEX IF NOT EXISTS idx_annual_budgets_year ON annual_budgets(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_annual_budgets_cat ON annual_budgets(category_id);
      CREATE INDEX IF NOT EXISTS idx_annual_budgets_status ON annual_budgets(status);

      CREATE TABLE IF NOT EXISTS budget_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id INTEGER NOT NULL REFERENCES annual_budgets(id) ON DELETE CASCADE,
        previous_amount_cents INTEGER NOT NULL,
        new_amount_cents INTEGER NOT NULL,
        reason TEXT NOT NULL,
        authorized_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_budget_rev_budget ON budget_revisions(budget_id);
    `);

    // 4. Funds & Grants Management
    db.exec(`
      CREATE TABLE IF NOT EXISTS funds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fund_code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_si TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN (
          'government_grant', 'provincial_grant', 'individual_donation',
          'corporate_donation', 'development_fund', 'community_contribution', 'other'
        )),
        is_restricted INTEGER NOT NULL DEFAULT 0,
        intended_purpose TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_funds_source ON funds(source_type);
      CREATE INDEX IF NOT EXISTS idx_funds_status ON funds(status);

      CREATE TABLE IF NOT EXISTS fund_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_no TEXT NOT NULL UNIQUE,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
        receipt_date TEXT NOT NULL,
        donor_or_dept TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'direct_deposit')),
        destination_type TEXT NOT NULL CHECK (destination_type IN ('cash', 'bank')),
        bank_account_id INTEGER REFERENCES bank_accounts(id),
        reference_no TEXT,
        purpose TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_fund_receipts_year ON fund_receipts(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_fund ON fund_receipts(fund_id);
      CREATE INDEX IF NOT EXISTS idx_fund_receipts_date ON fund_receipts(receipt_date);
    `);

    // 5. Bank Accounts & Transactions
    db.exec(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        bank_name TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        account_number TEXT NOT NULL UNIQUE,
        account_type TEXT NOT NULL DEFAULT 'savings' CHECK (account_type IN ('current', 'savings', 'development')),
        opening_balance_cents INTEGER NOT NULL DEFAULT 0,
        current_balance_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_bank_acc_status ON bank_accounts(status);

      CREATE TABLE IF NOT EXISTS bank_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN (
          'deposit', 'withdrawal', 'transfer_in', 'transfer_out',
          'cheque_deposit', 'cheque_payment', 'bank_charge', 'interest', 'adjustment'
        )),
        amount_cents INTEGER NOT NULL,
        reference_no TEXT,
        cheque_number TEXT,
        payee_or_payer TEXT,
        description TEXT NOT NULL,
        is_reconciled INTEGER NOT NULL DEFAULT 0,
        reconciled_at TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON bank_transactions(bank_account_id);
      CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciled ON bank_transactions(is_reconciled);

      CREATE TABLE IF NOT EXISTS bank_reconciliations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
        statement_date TEXT NOT NULL,
        statement_balance_cents INTEGER NOT NULL,
        book_balance_cents INTEGER NOT NULL,
        reconciled_balance_cents INTEGER NOT NULL,
        difference_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed')),
        notes TEXT,
        reconciled_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_bank_recon_acc ON bank_reconciliations(bank_account_id);
    `);

    // 6. Expense Management
    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_no TEXT NOT NULL UNIQUE,
        expense_date TEXT NOT NULL,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE RESTRICT,
        fund_id INTEGER REFERENCES funds(id),
        payee TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank', 'petty_cash', 'unpaid')),
        bank_account_id INTEGER REFERENCES bank_accounts(id),
        reference_no TEXT,
        bill_no TEXT,
        status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'rejected', 'reversed')),
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        rejection_reason TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_year ON expenses(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses(category_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_fund ON expenses(fund_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    `);

    // 7. Cash Book & Petty Cash Ledgers
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receipt', 'payment', 'bank_deposit', 'petty_cash_transfer', 'adjustment')),
        amount_cents INTEGER NOT NULL,
        running_balance_cents INTEGER NOT NULL DEFAULT 0,
        reference_no TEXT,
        description TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cash_tx_year ON cash_transactions(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_cash_tx_date ON cash_transactions(transaction_date);

      CREATE TABLE IF NOT EXISTS petty_cash_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_no TEXT NOT NULL UNIQUE,
        voucher_date TEXT NOT NULL,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        category_id INTEGER REFERENCES budget_categories(id),
        type TEXT NOT NULL CHECK (type IN ('expense', 'replenishment')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        payee TEXT NOT NULL,
        description TEXT NOT NULL,
        receipt_attached INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'rejected')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_petty_cash_year ON petty_cash_vouchers(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_petty_cash_date ON petty_cash_vouchers(voucher_date);
    `);

    // 8. General Ledger Double-Entry Engine (Balanced Journals)
    db.exec(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_number TEXT NOT NULL UNIQUE,
        entry_date TEXT NOT NULL,
        financial_year_id INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE RESTRICT,
        reference_type TEXT,
        reference_id INTEGER,
        description TEXT NOT NULL,
        total_amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'reversed')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_journal_entries_year ON journal_entries(financial_year_id);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON journal_entries(reference_type, reference_id);

      CREATE TABLE IF NOT EXISTS journal_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
        debit_cents INTEGER NOT NULL DEFAULT 0,
        credit_cents INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        CHECK (debit_cents >= 0 AND credit_cents >= 0 AND (debit_cents > 0 OR credit_cents > 0))
      );

      CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_acc ON journal_lines(account_id);
    `);

    // Seed Initial Chart of Accounts
    const insertCoa = db.prepare(`
      INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name_en, account_name_si, account_type, is_system, is_active)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `);

    insertCoa.run(1, '1010', 'Cash in Hand (Main Cashier)', 'අතැති මුදල් (ප්‍රධාන මුදල් අයකැමි)', 'asset');
    insertCoa.run(2, '1020', 'Petty Cash Impress', 'සුළු මුදල් ප්‍රතිපාදන', 'asset');
    insertCoa.run(3, '1030', 'Bank Operational Accounts', 'බැංකු මෙහෙයුම් ගිණුම්', 'asset');
    insertCoa.run(4, '2010', 'Accounts Payable & Commitments', 'ගෙවිය යුතු බැඳීම් සහ ගිණුම්', 'liability');
    insertCoa.run(5, '3010', 'School Capital & Accumulated Fund', 'පාසල් සංවර්ධන හා සමුච්චිත අරමුදල', 'equity');
    insertCoa.run(6, '3020', 'Government Grants Reserve', 'රජයේ ප්‍රතිපාදන සංචිතය', 'equity');
    insertCoa.run(7, '3030', 'Donations & Sponsorships Reserve', 'පරිත්‍යාග සහ අනුග්‍රාහක සංචිතය', 'equity');
    insertCoa.run(8, '4010', 'Government Grants & Allocation Income', 'රජයේ ප්‍රදාන සහ ප්‍රතිපාදන ආදායම', 'income');
    insertCoa.run(9, '4020', 'Provincial Council Funding', 'පළාත් සභා ප්‍රතිපාදන ආදායම', 'income');
    insertCoa.run(10, '4030', 'General Donations & Contributions', 'පොදු පරිත්‍යාග සහ දායකත්වයන්', 'income');
    insertCoa.run(11, '4040', 'School Facilities & Development Fees', 'පාසල් පහසුකම් හා සේවා ගාස්තු', 'income');
    insertCoa.run(12, '5010', 'Educational & Academic Supplies', 'අධ්‍යාපනික හා විෂය සමගාමී ද්‍රව්‍ය', 'expense');
    insertCoa.run(13, '5020', 'Infrastructure & Repairs Maintenance', 'යටිතල පහසුකම් සහ නඩත්තු වියදම්', 'expense');
    insertCoa.run(14, '5030', 'Utilities (Electricity & Water)', 'උපයෝගිතා (විදුලිය සහ ජලය)', 'expense');
    insertCoa.run(15, '5040', 'Student Welfare, Sports & First Aid', 'සිසු සුබසාධන, ක්‍රීඩා සහ ප්‍රථමාධාර', 'expense');
    insertCoa.run(16, '5050', 'Administration & Office Stationeries', 'පරිපාලන සහ කාර්යාල ලිපිද්‍රව්‍ය', 'expense');

    // Seed Current Financial Year
    const insertYear = db.prepare(`
      INSERT OR IGNORE INTO financial_years (id, year_name, start_date, end_date, status, is_current)
      VALUES (1, 'FY-2026', '2026-01-01', '2026-12-31', 'open', 1)
    `);
    insertYear.run();

    // Seed Standard School Budget Categories (Hierarchical: Parent and Subcategories)
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO budget_categories (id, category_code, name_en, name_si, parent_id, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Main 1: Recurrent Expenditure
    insertCat.run(1, '100', 'Recurrent Educational Expenditure', 'පුනරාවර්තන අධ්‍යාපන වියදම්', null, 'Daily operational expenses for education');
    insertCat.run(2, '101', 'Classroom Learning Materials', 'පන්ති කාමර ඉගෙනුම් ආධාරක', 1, 'Stationery, chalk, printing, educational kits');
    insertCat.run(3, '102', 'Utilities & Sanitation Services', 'උපයෝගිතා සහ සනීපාරක්ෂක සේවා', 1, 'Electricity, water supply, hygiene supplies');
    insertCat.run(4, '103', 'Administrative & Office Stationeries', 'පරිපාලන සහ කාර්යාල ලිපිද්‍රව්‍ය', 1, 'Official documents, forms, record files');

    // Main 2: Capital Expenditure
    insertCat.run(5, '200', 'Capital Infrastructure & Assets', 'ප්‍රාග්ධන යටිතල පහසුකම් සහ වත්කම්', null, 'Long term physical and structural investments');
    insertCat.run(6, '201', 'Science & Technology Lab Equipment', 'විද්‍යා හා තාක්ෂණ විද්‍යාගාර උපකරණ', 5, 'Laboratory apparatus, scientific supplies');
    insertCat.run(7, '202', 'Library Books & Reference Materials', 'පුස්තකාල පොත් සහ විමර්ශන කෘති', 5, 'Curriculum textbooks, periodicals, references');
    insertCat.run(8, '203', 'Building Renovations & Grounds', 'ගොඩනැගිලි ප්‍රතිසංස්කරණ සහ භූමි නඩත්තුව', 5, 'Roof repairs, painting, grounds maintenance');

    // Main 3: Student Welfare & Co-Curricular
    insertCat.run(9, '300', 'Student Welfare & Sports Development', 'සිසු සුබසාධන සහ ක්‍රීඩා සංවර්ධනය', null, 'Extracurricular and student wellness activities');
    insertCat.run(10, '301', 'Annual Sports Meet & Athletics', 'වාර්ෂික ක්‍රීඩා උළෙල සහ මලල ක්‍රීඩා', 9, 'Track events, equipment, tournament expenses');
    insertCat.run(11, '302', 'Aesthetics, Music & Cultural Events', 'සෞන්දර්ය, සංගීත සහ සංස්කෘතික වැඩසටහන්', 9, 'Art exhibitions, music competitions, festivals');
    insertCat.run(12, '303', 'First Aid & Student Health Clinic', 'ප්‍රථමාධාර සහ ශිෂ්‍ය සෞඛ්‍ය සායනය', 9, 'Medical supplies, basic pharmaceuticals');

    // Seed Standard Funds
    const insertFund = db.prepare(`
      INSERT OR IGNORE INTO funds (id, fund_code, name_en, name_si, source_type, is_restricted, intended_purpose, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    insertFund.run(1, 'FND-GOVT', 'Government Educational Allocation', 'රජයේ අධ්‍යාපන ප්‍රතිපාදන අරමුදල', 'government_grant', 0, 'General operational & maintenance allocations');
    insertFund.run(2, 'FND-SDS', 'School Development Society (SDS)', 'පාසල් සංවර්ධන සමිති අරමුදල', 'development_fund', 1, 'School development infrastructure and student activities');
    insertFund.run(3, 'FND-ALUMNI', 'Alumni & Philanthropic Donations', 'ආදි ශිෂ්‍ය සහ සුබපතන්නන්ගේ පරිත්‍යාග', 'individual_donation', 0, 'General enhancements and special educational projects');
    insertFund.run(4, 'FND-PROV', 'Provincial Council Specific Grant', 'පළාත් සභා විශේෂිත ප්‍රදානය', 'provincial_grant', 1, 'Provincial ministry educational enhancement projects');

    // Seed Primary Institutional Bank Account
    const insertBank = db.prepare(`
      INSERT OR IGNORE INTO bank_accounts (id, account_code, bank_name, branch_name, account_number, account_type, opening_balance_cents, current_balance_cents, status)
      VALUES (1, 'BNK-001', 'Bank of Ceylon', 'City Central Branch', '1004829104', 'current', 0, 0, 'active')
    `);
    insertBank.run();
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS journal_lines;
      DROP TABLE IF EXISTS journal_entries;
      DROP TABLE IF EXISTS petty_cash_vouchers;
      DROP TABLE IF EXISTS cash_transactions;
      DROP TABLE IF EXISTS expenses;
      DROP TABLE IF EXISTS bank_reconciliations;
      DROP TABLE IF EXISTS bank_transactions;
      DROP TABLE IF EXISTS bank_accounts;
      DROP TABLE IF EXISTS fund_receipts;
      DROP TABLE IF EXISTS funds;
      DROP TABLE IF EXISTS budget_revisions;
      DROP TABLE IF EXISTS annual_budgets;
      DROP TABLE IF EXISTS budget_categories;
      DROP TABLE IF EXISTS chart_of_accounts;
      DROP TABLE IF EXISTS financial_years;
    `);
  },
};
