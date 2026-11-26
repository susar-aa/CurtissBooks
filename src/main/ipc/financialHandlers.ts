import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { FinancialService } from '../services/financialService';
import { IpcResult } from '../../shared/types/ipc';
import { assertAuthorized } from './authGuard';

export function registerFinancialHandlers(): void {
  // Financial Years
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_YEARS, async (): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('financialYear.view');
      const data = FinancialService.getFinancialYears();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_YEAR_DETAIL, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('financialYear.view');
      const data = FinancialService.getFinancialYearDetail(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SAVE_YEAR_DRAFT, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      const res = FinancialService.saveFinancialYearDraft(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_APPROVE_YEAR, async (_event, yearId, notes): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('budget.approve');
      const res = FinancialService.approveFinancialYear(yearId, session.user.id, notes);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_REUSABLE_CATEGORIES, async (_event, search, activeOnly): Promise<IpcResult<any>> => {
    try {
      assertAuthorized();
      const data = FinancialService.getReusableCategories(search, activeOnly);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SUGGEST_CATEGORY_CODE, async (_event, parentId): Promise<IpcResult<string>> => {
    try {
      assertAuthorized();
      const code = FinancialService.suggestCategoryCode(parentId);
      return { success: true, data: code };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_QUICK_CREATE_CATEGORY, async (_event, name, name_si, parentId, customCode): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      const data = FinancialService.quickCreateCategory(name, name_si, parentId, session.user.id, customCode);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_UPDATE_CATEGORY, async (_event, id, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      const updated = FinancialService.updateCategory(id, data, session.user.id);
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_TOGGLE_CATEGORY_STATUS, async (_event, id, isActive): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      FinancialService.toggleCategoryStatus(id, isActive, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_YEAR, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      const res = FinancialService.createFinancialYear(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SET_CURRENT_YEAR, async (_event, id): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      FinancialService.setCurrentFinancialYear(id, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CLOSE_YEAR, async (_event, payload): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financialYear.manage');
      const data = typeof payload === 'number' ? { yearId: payload, adminUsername: '', adminPassword: '' } : payload;
      FinancialService.closeFinancialYear(data, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Chart of Accounts
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_ACCOUNTS, async (): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getChartOfAccounts();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Budgets
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_BUDGET_CATEGORIES, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getBudgetCategories(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_BUDGET_CATEGORY, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const res = FinancialService.createBudgetCategory(data);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SAVE_BUDGET_ALLOCATION, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const res = FinancialService.saveAnnualBudgetAllocation(data);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_APPROVE_BUDGET, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      FinancialService.approveAnnualBudget(yearId);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_REVISE_BUDGET, async (_event, data): Promise<IpcResult<any>> => {
    try {
      FinancialService.reviseBudgetAmount(data);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Funds & Funding Categories
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_FUNDS, async (_event, searchQuery, categoryId): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getFunds(searchQuery, categoryId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_FUND_CATEGORIES, async (_event, activeOnly): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getFundCategories(Boolean(activeOnly));
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SUGGEST_FUND_CATEGORY_CODE, async (_event, parentId): Promise<IpcResult<string>> => {
    try {
      assertAuthorized('funds.view');
      const code = FinancialService.suggestFundCategoryCode(parentId);
      return { success: true, data: code };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_FUND_CATEGORY, async (event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('funds.create');
      const res = FinancialService.createFundCategory(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_UPDATE_FUND_CATEGORY, async (event, id, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('funds.edit');
      FinancialService.updateFundCategory(id, data, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_DELETE_FUND_CATEGORY, async (_event, id): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('funds.edit');
      FinancialService.deleteFundCategory(id, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_FUND_TRACES, async (_event, fundId, expenseId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('funds.view');
      const data = FinancialService.getFundTraces(fundId, expenseId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_FUND, async (_event, data): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('funds.create');
      const res = FinancialService.createFund(data);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_QUICK_CREATE_FUND_CATEGORY, async (_event, name, name_si): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('funds.create');
      const res = FinancialService.quickCreateFundingCategory(name, name_si);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_FUND_RECEIPTS, async (_event, limit, offset, yearId, categoryId, searchQuery): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('funds.view');
      const data = FinancialService.getFundReceipts(limit, offset, yearId, categoryId, searchQuery);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_FUND_RECEIPTS_SUMMARY, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('funds.view');
      const data = FinancialService.getFundReceiptsSummary(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_FUND_RECEIPT, async (_event, data): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('funds.create');
      const res = FinancialService.createFundReceipt(data);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Expenses
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_EXPENSES, async (
    _event, limit, offset, yearId, categoryId, searchQuery, paymentMethod, statusFilter, dateFrom, dateTo
  ): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('expense.view');
      const data = FinancialService.getExpenses(limit, offset, yearId, categoryId, searchQuery, paymentMethod, statusFilter, dateFrom, dateTo);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_QUICK_CREATE_EXPENSE_BUDGET_CATEGORY, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('expense.manage');
      const res = FinancialService.quickCreateExpenseBudgetCategory(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_EXPENSE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('expense.manage');
      const res = FinancialService.createExpense(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CANCEL_EXPENSE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('expense.manage');
      FinancialService.cancelExpense(data.expenseId, data.reason, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Cash Book & Unified Cash Book
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_CASH_TRANSACTIONS, async (_event, limit, offset, yearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('cashBook.view');
      const data = FinancialService.getCashTransactions(limit, offset, yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_UNIFIED_CASH_BOOK, async (_event, params): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('cashBook.view');
      const data = FinancialService.getUnifiedCashBook(params);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Petty Cash
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_PETTY_CASH, async (_event, limit, offset, yearId, filters): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('pettyCash.view');
      let optLimit = 50;
      let optOffset = 0;
      let optYearId: number | undefined;
      let optFilters: any = {};

      if (typeof limit === 'object' && limit !== null) {
        optLimit = limit.limit ?? 50;
        optOffset = limit.offset ?? 0;
        optYearId = limit.yearId;
        optFilters = limit;
      } else {
        optLimit = typeof limit === 'number' ? limit : 50;
        optOffset = typeof offset === 'number' ? offset : 0;
        optYearId = typeof yearId === 'number' ? yearId : undefined;
        optFilters = typeof filters === 'object' && filters !== null ? filters : {};
      }

      const data = FinancialService.getPettyCashVouchers(optLimit, optOffset, optYearId, optFilters);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_RECORD_PETTY_CASH_EXPENSE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('pettyCash.manage');
      const res = FinancialService.recordPettyCashExpense(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_REPLENISH_PETTY_CASH, async (_event, data): Promise<IpcResult<any>> => {
    try {
      FinancialService.replenishPettyCash(data);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Bank
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_BANK_ACCOUNTS, async (): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getBankAccounts();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_BANK_ACCOUNT, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const res = FinancialService.createBankAccount(data);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_BANK_TRANSACTIONS, async (_event, bankAccountId, limit, offset): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getBankTransactions(bankAccountId, limit, offset);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Summary & Reports
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_SUMMARY_STATS, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getSummaryStats(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_TRIAL_BALANCE, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getTrialBalance(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_REIMBURSEMENT_VOUCHERS, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('reports.view');
      const data = FinancialService.getReimbursementVouchers(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_REIMBURSEMENT_REPORT, async (_event, params): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('reports.view');
      const data = FinancialService.getReimbursementReport(params);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Fund Transfers Management
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_ACCOUNT_BALANCES, async (_event, yearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('fundTransfer.view');
      const data = FinancialService.getAccountBalances(yearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_FUND_TRANSFER, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('fundTransfer.create');
      const res = FinancialService.createFundTransfer(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_REVERSE_FUND_TRANSFER, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('fundTransfer.reverse');
      const res = FinancialService.reverseFundTransfer(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_FUND_TRANSFERS, async (_event, params): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('fundTransfer.view');
      const data = FinancialService.getFundTransfers(params);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_TRANSFER_BUDGET, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('budget.edit');
      const res = FinancialService.transferBudget(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_BUDGET_REALLOCATIONS, async (_event, financialYearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('budget.view');
      const data = FinancialService.getBudgetReallocations(financialYearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // ========================================================
  // Cheque Management Handlers
  // ========================================================

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_CHEQUES, async (_event, filters): Promise<IpcResult<any>> => {
    try {
      if (filters?.cheque_type === 'issued') {
        assertAuthorized('cheques.issued_view');
      } else if (filters?.cheque_type === 'received') {
        assertAuthorized('cheques.received_view');
      } else {
        try {
          assertAuthorized('cheques.received_view');
        } catch {
          assertAuthorized('cheques.issued_view');
        }
      }
      const data = FinancialService.getCheques(filters);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_CHEQUES_SUMMARY, async (_event, financialYearId): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getChequesSummary(financialYearId);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_CHEQUE_DETAIL, async (_event, id): Promise<IpcResult<any>> => {
    try {
      const data = FinancialService.getChequeDetail(id);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_RECORD_RECEIVED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.received_create');
      const res = FinancialService.recordReceivedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_DEPOSIT_RECEIVED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.received_deposit');
      const res = FinancialService.depositReceivedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CLEAR_RECEIVED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.received_clear');
      const res = FinancialService.clearReceivedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_BOUNCE_RECEIVED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.received_bounce');
      const res = FinancialService.bounceReceivedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CANCEL_RECEIVED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.cancel_reverse');
      const res = FinancialService.cancelReceivedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_RECORD_ISSUED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.issued_create');
      const res = FinancialService.recordIssuedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_PRESENT_ISSUED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.issued_present_clear');
      const res = FinancialService.presentIssuedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CLEAR_ISSUED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.issued_present_clear');
      const res = FinancialService.clearIssuedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_BOUNCE_ISSUED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.cancel_reverse');
      const res = FinancialService.bounceIssuedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CANCEL_ISSUED_CHEQUE, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('cheques.cancel_reverse');
      const res = FinancialService.cancelIssuedCheque(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // ========================================================
  // BANK RECONCILIATION IPC HANDLERS
  // ========================================================

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_CREATE_RECONCILIATION_SESSION, async (_event, data): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      const res = FinancialService.createReconciliationSession(data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_RECONCILIATION_SESSIONS, async (_event, bankAccountId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('bank.view');
      const res = FinancialService.getReconciliationSessions(bankAccountId);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_RECONCILIATION_SESSION_DETAIL, async (_event, sessionId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('bank.view');
      const res = FinancialService.getReconciliationSessionDetail(sessionId);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_IMPORT_BANK_STATEMENT, async (_event, { sessionId, rows, filename, fileFormat }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      const res = FinancialService.importBankStatement(sessionId, rows, filename, fileFormat, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_STATEMENT_TRANSACTIONS, async (_event, sessionId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('bank.view');
      const res = FinancialService.getStatementTransactions(sessionId);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_SYSTEM_TRANSACTIONS_FOR_RECON, async (_event, sessionId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('bank.view');
      const res = FinancialService.getSystemTransactionsForReconciliation(sessionId);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_AUTO_MATCH_TRANSACTIONS, async (_event, { sessionId, toleranceDays }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      const res = FinancialService.autoMatchTransactions(sessionId, toleranceDays, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_MANUAL_MATCH_TRANSACTION, async (_event, { sessionId, statementTransactionId, bankTransactionId, chequeId }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      FinancialService.manualMatchTransaction(sessionId, statementTransactionId, bankTransactionId, chequeId, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_UNMATCH_TRANSACTION, async (_event, { sessionId, matchId }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      FinancialService.unmatchTransaction(sessionId, matchId, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_RECORD_RECON_ADJUSTMENT, async (_event, { sessionId, data }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      const res = FinancialService.recordReconciliationAdjustment(sessionId, data, session.user.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_TOGGLE_RECON_TICK, async (_event, { sessionId, bankTransactionId, isTicked }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      FinancialService.toggleTickTransaction(sessionId, bankTransactionId, isTicked, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_BATCH_RECON_TICK, async (_event, { sessionId, bankTransactionIds, isTicked }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      FinancialService.batchTickTransactions(sessionId, bankTransactionIds, isTicked, session.user.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_UPDATE_RECON_BALANCES, async (_event, { sessionId, statementClosingCents, statementOpeningCents }): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('bank.manage');
      FinancialService.updateReconciliationSessionBalances(sessionId, statementClosingCents, statementOpeningCents);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_RECONCILIATION_SUMMARY, async (_event, sessionId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('bank.view');
      const res = FinancialService.calculateReconciliationSummary(sessionId);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_COMPLETE_RECONCILIATION, async (_event, { sessionId, notes }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      const res = FinancialService.completeReconciliation(sessionId, session.user.id, notes);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_REOPEN_RECONCILIATION, async (_event, { sessionId, reason }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('bank.manage');
      const res = FinancialService.reopenReconciliation(sessionId, session.user.id, reason);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Periodic Financial Statement (Annexure 19)
  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_PERIODIC_STATEMENT_MAPPINGS, async (_event, financialYearId): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('reports.view');
      const res = FinancialService.getPeriodicStatementMappings(financialYearId);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SAVE_PERIODIC_STATEMENT_MAPPINGS, async (_event, { financialYearId, mappings }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financial.manage');
      FinancialService.savePeriodicStatementMappings(financialYearId, mappings, session?.user?.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_AUTO_ASSIGN_PERIODIC_STATEMENT_MAPPINGS, async (_event, { financialYearId }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financial.manage');
      const res = FinancialService.autoAssignStatementMappingsFromTransactions(financialYearId, session?.user?.id);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_GET_PERIODIC_STATEMENT_REPORT, async (_event, params): Promise<IpcResult<any>> => {
    try {
      assertAuthorized('reports.view');
      const res = FinancialService.getPeriodicStatementReport(params);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FINANCIAL_SAVE_PERIODIC_STATEMENT_ADJUSTMENTS, async (_event, { financialYearId, startDate, endDate, adjustments }): Promise<IpcResult<any>> => {
    try {
      const session = assertAuthorized('financial.manage');
      FinancialService.savePeriodicStatementAdjustments(financialYearId, startDate, endDate, adjustments, session?.user?.id);
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });
}

