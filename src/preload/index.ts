import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/channels';
import { ElectronAPI, IpcResult, OpeningBalancesData } from '../shared/types/ipc';
import { AppInfo } from '../shared/types/settings';
import { AuthSession, User, Role, Permission, AuditLogItem } from '../shared/types/auth';
import {
  SchoolProfile,
  AcademicYear,
  Grade,
  ClassRoom,
  PaginatedResult,
} from '../shared/types/school';

const api: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      const handler = (_event: any, isMax: boolean) => callback(isMax);
      ipcRenderer.on('window:maximized-change', handler);
      return () => {
        ipcRenderer.removeListener('window:maximized-change', handler);
      };
    },
  },
  app: {
    getInfo: (): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
  },
  settings: {
    getAll: (): Promise<IpcResult<Record<string, string>>> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
    get: (key: string): Promise<IpcResult<string | null>> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    factoryReset: (adminPin: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_FACTORY_RESET, adminPin),
    getOpeningBalances: (financialYearId?: number): Promise<IpcResult<OpeningBalancesData>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_OPENING_BALANCES, financialYearId),
    updateOpeningBalances: (data: {
      financialYearId?: number;
      cashOpeningBalanceCents: number;
      pettyCashOpeningBalanceCents: number;
      bankAccounts: Array<{ id: number; opening_balance_cents: number }>;
    }): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE_OPENING_BALANCES, data),
  },
  auth: {
    checkSetup: (): Promise<IpcResult<{ setupRequired: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_SETUP),
    verifyDeveloperPin: (developerPin: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_VERIFY_DEVELOPER_PIN, developerPin),
    setupInitialAdmin: (data): Promise<IpcResult<AuthSession>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_SETUP_INITIAL_ADMIN, data),
    login: (credentials): Promise<IpcResult<AuthSession>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, credentials),
    loginWithPin: (pin: string): Promise<IpcResult<AuthSession>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN_PIN, pin),
    logout: (): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
    getCurrentSession: (): Promise<IpcResult<AuthSession | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_CURRENT_SESSION),
    lockSession: (): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOCK_SESSION),
    unlockSession: (password: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_UNLOCK_SESSION, password),
    unlockSessionWithPin: (pin: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_UNLOCK_SESSION_PIN, pin),
  },
  users: {
    getAll: (): Promise<IpcResult<User[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_GET_ALL),
    create: (data): Promise<IpcResult<User>> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_CREATE, data),
    update: (id: number, data): Promise<IpcResult<User>> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_UPDATE, id, data),
    setStatus: (id: number, status): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_SET_STATUS, id, status),
    resetPassword: (id: number, newPassword: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_RESET_PASSWORD, id, newPassword),
    resetPin: (id: number, newPin: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_RESET_PIN, id, newPin),
  },
  roles: {
    getAll: (): Promise<IpcResult<Role[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLES_GET_ALL),
    updatePermissions: (roleId: number, permissionKeys: string[]): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLES_UPDATE_PERMISSIONS, roleId, permissionKeys),
    getPermissions: (): Promise<IpcResult<Permission[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_GET_ALL),
  },
  audit: {
    getLogs: (limit?: number, offset?: number): Promise<IpcResult<AuditLogItem[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIT_GET_LOGS, limit, offset),
  },
  school: {
    getProfile: (): Promise<IpcResult<SchoolProfile>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCHOOL_GET_PROFILE),
    updateProfile: (profile): Promise<IpcResult<SchoolProfile>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCHOOL_UPDATE_PROFILE, profile),
    saveLogo: (fileData): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCHOOL_SAVE_LOGO, fileData),
  },
  academic: {
    getYears: (): Promise<IpcResult<AcademicYear[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_GET_YEARS),
    createYear: (data): Promise<IpcResult<AcademicYear>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_CREATE_YEAR, data),
    updateYear: (id, data): Promise<IpcResult<AcademicYear>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_UPDATE_YEAR, id, data),
    setCurrentYear: (id): Promise<IpcResult<AcademicYear>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_SET_CURRENT_YEAR, id),
    getGrades: (): Promise<IpcResult<Grade[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_GET_GRADES),
    createGrade: (data): Promise<IpcResult<Grade>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_CREATE_GRADE, data),
    updateGrade: (id, data): Promise<IpcResult<Grade>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_UPDATE_GRADE, id, data),
    getClasses: (gradeId?: number): Promise<IpcResult<ClassRoom[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_GET_CLASSES, gradeId),
    createClass: (data): Promise<IpcResult<ClassRoom>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_CREATE_CLASS, data),
    updateClass: (id, data): Promise<IpcResult<ClassRoom>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACADEMIC_UPDATE_CLASS, id, data),
  },
  financial: {
    getYears: (): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_YEARS),
    getFinancialYears: (): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_YEARS),
    getYearDetail: (yearId: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_YEAR_DETAIL, yearId),
    createYear: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_YEAR, data),
    saveYearDraft: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SAVE_YEAR_DRAFT, data),
    approveYear: (yearId: number, notes?: string): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_APPROVE_YEAR, yearId, notes),
    setCurrentYear: (id: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SET_CURRENT_YEAR, id),
    closeYear: (data: { yearId: number; adminUsername: string; adminPassword: string } | number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CLOSE_YEAR, data),
    getReusableCategories: (search?: string, activeOnly?: boolean): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_REUSABLE_CATEGORIES, search, activeOnly),
    suggestCategoryCode: (parentId?: number | null): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SUGGEST_CATEGORY_CODE, parentId),
    quickCreateCategory: (name: string, name_si?: string, parentId?: number | null, customCode?: string): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_QUICK_CREATE_CATEGORY, name, name_si, parentId, customCode),
    updateCategory: (id: number, data: { category_code?: string; name?: string; name_en?: string; name_si?: string; description?: string; is_active?: boolean }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_UPDATE_CATEGORY, id, data),
    toggleCategoryStatus: (id: number, isActive: boolean): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_TOGGLE_CATEGORY_STATUS, id, isActive),
    getAccounts: (): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_ACCOUNTS),
    getBudgetCategories: (yearId?: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_BUDGET_CATEGORIES, yearId),
    createBudgetCategory: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_BUDGET_CATEGORY, data),
    saveBudgetAllocation: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SAVE_BUDGET_ALLOCATION, data),
    approveBudget: (yearId: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_APPROVE_BUDGET, yearId),
    reviseBudget: (data): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_REVISE_BUDGET, data),
    getFunds: (searchQuery?: string, categoryId?: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_FUNDS, searchQuery, categoryId),
    createFund: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_FUND, data),
    quickCreateFundingCategory: (name: string, name_si?: string): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_QUICK_CREATE_FUND_CATEGORY, name, name_si),
    getFundCategories: (activeOnly?: boolean): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_FUND_CATEGORIES, activeOnly),
    suggestFundCategoryCode: (parentId?: number | null): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SUGGEST_FUND_CATEGORY_CODE, parentId),
    createFundCategory: (data: { category_code?: string; name_en: string; name_si?: string; parent_id?: number | null; description?: string }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_FUND_CATEGORY, data),
    updateFundCategory: (id: number, data: any): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_UPDATE_FUND_CATEGORY, id, data),
    deleteFundCategory: (id: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_DELETE_FUND_CATEGORY, id),
    getFundTraces: (fundId?: number, expenseId?: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_FUND_TRACES, fundId, expenseId),
    getFundReceipts: (limit?: number, offset?: number, yearId?: number, categoryId?: number, searchQuery?: string): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_FUND_RECEIPTS, limit, offset, yearId, categoryId, searchQuery),
    getFundReceiptsSummary: (yearId?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_FUND_RECEIPTS_SUMMARY, yearId),
    createFundReceipt: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_FUND_RECEIPT, data),
    getExpenses: (
      limit?: number,
      offset?: number,
      yearId?: number,
      categoryId?: number,
      searchQuery?: string,
      paymentMethod?: string,
      statusFilter?: string,
      dateFrom?: string,
      dateTo?: string
    ): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.FINANCIAL_GET_EXPENSES,
        limit,
        offset,
        yearId,
        categoryId,
        searchQuery,
        paymentMethod,
        statusFilter,
        dateFrom,
        dateTo
      ),
    quickCreateExpenseBudgetCategory: (data: {
      financial_year_id: number;
      name_en: string;
      name_si: string;
      parent_id?: number | null;
      category_code?: string;
      allocated_amount_cents?: number;
      description?: string;
    }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_QUICK_CREATE_EXPENSE_BUDGET_CATEGORY, data),
    createExpense: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_EXPENSE, data),
    cancelExpense: (data): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CANCEL_EXPENSE, data),
    getCashTransactions: (limit?: number, offset?: number, yearId?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_CASH_TRANSACTIONS, limit, offset, yearId),
    getUnifiedCashBook: (params?: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_UNIFIED_CASH_BOOK, params),
    getPettyCash: (limit?: any, offset?: number, yearId?: number, filters?: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_PETTY_CASH, limit, offset, yearId, filters),
    recordPettyCashExpense: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_RECORD_PETTY_CASH_EXPENSE, data),
    replenishPettyCash: (data): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_REPLENISH_PETTY_CASH, data),
    getBankAccounts: (): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_BANK_ACCOUNTS),
    createBankAccount: (data): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_BANK_ACCOUNT, data),
    getBankTransactions: (bankAccountId: number, limit?: number, offset?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_BANK_TRANSACTIONS, bankAccountId, limit, offset),
    getSummaryStats: (yearId?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_SUMMARY_STATS, yearId),
    getTrialBalance: (yearId?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_TRIAL_BALANCE, yearId),
    getReimbursementVouchers: (yearId?: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_REIMBURSEMENT_VOUCHERS, yearId),
    getReimbursementReport: (params: { yearId?: number; fromVoucherId?: number; toVoucherId?: number; startDate?: string; endDate?: string }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_REIMBURSEMENT_REPORT, params),
    getAccountBalances: (yearId?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_ACCOUNT_BALANCES, yearId),
    createFundTransfer: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_FUND_TRANSFER, data),
    reverseFundTransfer: (data: { transferId: number; reason: string }): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_REVERSE_FUND_TRANSFER, data),
    getFundTransfers: (params?: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_FUND_TRANSFERS, params),
    transferBudget: (data: {
      financial_year_id: number;
      source_category_id: number;
      destination_category_id: number;
      amount_cents: number;
      reason: string;
    }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_TRANSFER_BUDGET, data),
    getBudgetReallocations: (financialYearId: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_BUDGET_REALLOCATIONS, financialYearId),

    // Cheque Management
    getCheques: (filters?: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_CHEQUES, filters),
    getChequesSummary: (financialYearId?: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_CHEQUES_SUMMARY, financialYearId),
    getChequeDetail: (id: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_CHEQUE_DETAIL, id),
    recordReceivedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_RECORD_RECEIVED_CHEQUE, data),
    depositReceivedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_DEPOSIT_RECEIVED_CHEQUE, data),
    clearReceivedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CLEAR_RECEIVED_CHEQUE, data),
    bounceReceivedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_BOUNCE_RECEIVED_CHEQUE, data),
    cancelReceivedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CANCEL_RECEIVED_CHEQUE, data),
    recordIssuedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_RECORD_ISSUED_CHEQUE, data),
    presentIssuedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_PRESENT_ISSUED_CHEQUE, data),
    clearIssuedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CLEAR_ISSUED_CHEQUE, data),
    bounceIssuedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_BOUNCE_ISSUED_CHEQUE, data),
    cancelIssuedCheque: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CANCEL_ISSUED_CHEQUE, data),

    // Bank Reconciliation
    createReconciliationSession: (data: any): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_CREATE_RECONCILIATION_SESSION, data),
    getReconciliationSessions: (bankAccountId?: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_RECONCILIATION_SESSIONS, bankAccountId),
    getReconciliationSessionDetail: (sessionId: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_RECONCILIATION_SESSION_DETAIL, sessionId),
    importBankStatement: (params: { sessionId: number; rows: any[]; filename?: string; fileFormat?: string }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_IMPORT_BANK_STATEMENT, params),
    getStatementTransactions: (sessionId: number): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_STATEMENT_TRANSACTIONS, sessionId),
    getSystemTransactionsForRecon: (sessionId: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_SYSTEM_TRANSACTIONS_FOR_RECON, sessionId),
    autoMatchTransactions: (params: { sessionId: number; toleranceDays?: number }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_AUTO_MATCH_TRANSACTIONS, params),
    manualMatchTransaction: (params: { sessionId: number; statementTransactionId: number; bankTransactionId?: number; chequeId?: number }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_MANUAL_MATCH_TRANSACTION, params),
    unmatchTransaction: (params: { sessionId: number; matchId: number }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_UNMATCH_TRANSACTION, params),
    recordReconAdjustment: (params: { sessionId: number; data: any }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_RECORD_RECON_ADJUSTMENT, params),
    toggleReconTick: (params: { sessionId: number; bankTransactionId: number; isTicked: boolean }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_TOGGLE_RECON_TICK, params),
    batchReconTick: (params: { sessionId: number; bankTransactionIds: number[]; isTicked: boolean }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_BATCH_RECON_TICK, params),
    updateReconBalances: (params: { sessionId: number; statementClosingCents: number; statementOpeningCents?: number }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_UPDATE_RECON_BALANCES, params),
    getReconciliationSummary: (sessionId: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_RECONCILIATION_SUMMARY, sessionId),
    completeReconciliation: (params: { sessionId: number; notes?: string }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_COMPLETE_RECONCILIATION, params),
    reopenReconciliation: (params: { sessionId: number; reason: string }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_REOPEN_RECONCILIATION, params),

    // Periodic Financial Statement (Annexure 19)
    getPeriodicStatementMappings: (financialYearId: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_PERIODIC_STATEMENT_MAPPINGS, financialYearId),
    savePeriodicStatementMappings: (params: { financialYearId: number; mappings: any[] }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SAVE_PERIODIC_STATEMENT_MAPPINGS, params),
    autoAssignPeriodicStatementMappings: (financialYearId: number): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_AUTO_ASSIGN_PERIODIC_STATEMENT_MAPPINGS, { financialYearId }),
    getPeriodicStatementReport: (params: { financialYearId: number; periodType: '1st' | '2nd' | '3rd' | 'custom'; startDate: string; endDate: string }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_GET_PERIODIC_STATEMENT_REPORT, params),
    savePeriodicStatementAdjustments: (params: { financialYearId: number; startDate: string; endDate: string; adjustments: any }): Promise<IpcResult<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.FINANCIAL_SAVE_PERIODIC_STATEMENT_ADJUSTMENTS, params),
  },
};

contextBridge.exposeInMainWorld('curtissApi', api);
