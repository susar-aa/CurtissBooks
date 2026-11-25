import { AppInfo } from './settings';
import { User, Role, Permission, AuthSession, AuditLogItem } from './auth';
import {
  SchoolProfile,
  AcademicYear,
  Grade,
  ClassRoom,
  PaginatedResult,
} from './school';
import {
  ChequeRecord,
  ChequesSummary,
  ChequeFilters,
  ChequeAuditLog,
  PeriodicStatementMapping,
  PeriodicStatementReportData,
} from './finance';

export interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void;
  };
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
  };
  settings: {
    getAll: () => Promise<IpcResult<Record<string, string>>>;
    get: (key: string) => Promise<IpcResult<string | null>>;
    set: (key: string, value: string) => Promise<IpcResult<boolean>>;
  };
  auth: {
    checkSetup: () => Promise<IpcResult<{ setupRequired: boolean }>>;
    setupInitialAdmin: (data: {
      fullName: string;
      username: string;
      password: string;
    }) => Promise<IpcResult<AuthSession>>;
    login: (credentials: {
      username: string;
      password: string;
    }) => Promise<IpcResult<AuthSession>>;
    logout: () => Promise<IpcResult<boolean>>;
    getCurrentSession: () => Promise<IpcResult<AuthSession | null>>;
    lockSession: () => Promise<IpcResult<boolean>>;
    unlockSession: (password: string) => Promise<IpcResult<boolean>>;
  };
  users: {
    getAll: () => Promise<IpcResult<User[]>>;
    create: (data: {
      fullName: string;
      username: string;
      password: string;
      roleId: number;
    }) => Promise<IpcResult<User>>;
    update: (id: number, data: {
      fullName: string;
      roleId: number;
    }) => Promise<IpcResult<User>>;
    setStatus: (id: number, status: 'active' | 'inactive') => Promise<IpcResult<boolean>>;
    resetPassword: (id: number, newPassword: string) => Promise<IpcResult<boolean>>;
  };
  roles: {
    getAll: () => Promise<IpcResult<Role[]>>;
    updatePermissions: (roleId: number, permissionKeys: string[]) => Promise<IpcResult<boolean>>;
    getPermissions: () => Promise<IpcResult<Permission[]>>;
  };
  audit: {
    getLogs: (limit?: number, offset?: number) => Promise<IpcResult<AuditLogItem[]>>;
  };
  school: {
    getProfile: () => Promise<IpcResult<SchoolProfile>>;
    updateProfile: (profile: Partial<SchoolProfile>) => Promise<IpcResult<SchoolProfile>>;
    saveLogo: (fileData: { base64: string; mimeType: string }) => Promise<IpcResult<string>>;
  };
  academic: {
    getYears: () => Promise<IpcResult<AcademicYear[]>>;
    createYear: (data: { code: string; name_en: string; name_si: string; start_date: string; end_date: string; is_current?: boolean }) => Promise<IpcResult<AcademicYear>>;
    updateYear: (id: number, data: Partial<AcademicYear>) => Promise<IpcResult<AcademicYear>>;
    setCurrentYear: (id: number) => Promise<IpcResult<AcademicYear>>;
    getGrades: () => Promise<IpcResult<Grade[]>>;
    createGrade: (data: { grade_code: string; name_en: string; name_si: string; order_index: number }) => Promise<IpcResult<Grade>>;
    updateGrade: (id: number, data: Partial<Grade>) => Promise<IpcResult<Grade>>;
    getClasses: (gradeId?: number) => Promise<IpcResult<ClassRoom[]>>;
    createClass: (data: { grade_id: number; class_name: string; section: string; class_teacher_name?: string }) => Promise<IpcResult<ClassRoom>>;
    updateClass: (id: number, data: Partial<ClassRoom>) => Promise<IpcResult<ClassRoom>>;
  };
  financial: {
    getYears: () => Promise<IpcResult<any[]>>;
    getFinancialYears: () => Promise<IpcResult<any[]>>;
    getYearDetail: (yearId: number) => Promise<IpcResult<any>>;
    createYear: (data: { year_name: string; start_date: string; end_date: string; is_current?: boolean }) => Promise<IpcResult<any>>;
    saveYearDraft: (data: {
      id?: number;
      year_name: string;
      start_date: string;
      end_date: string;
      allocations: Array<{ category_id: number; allocated_amount_cents: number; notes?: string }>;
    }) => Promise<IpcResult<any>>;
    approveYear: (yearId: number, notes?: string) => Promise<IpcResult<any>>;
    setCurrentYear: (id: number) => Promise<IpcResult<boolean>>;
    closeYear: (data: { yearId: number; adminUsername: string; adminPassword: string } | number) => Promise<IpcResult<boolean>>;
    getReusableCategories: (search?: string, activeOnly?: boolean) => Promise<IpcResult<any[]>>;
    suggestCategoryCode: (parentId?: number | null) => Promise<IpcResult<string>>;
    quickCreateCategory: (name: string, name_si?: string, parentId?: number | null, customCode?: string) => Promise<IpcResult<any>>;
    updateCategory: (id: number, data: { category_code?: string; name?: string; name_en?: string; name_si?: string; description?: string; is_active?: boolean }) => Promise<IpcResult<any>>;
    toggleCategoryStatus: (id: number, isActive: boolean) => Promise<IpcResult<boolean>>;
    getAccounts: () => Promise<IpcResult<any[]>>;
    getBudgetCategories: (yearId?: number) => Promise<IpcResult<any[]>>;
    createBudgetCategory: (data: any) => Promise<IpcResult<any>>;
    saveBudgetAllocation: (data: any) => Promise<IpcResult<any>>;
    approveBudget: (yearId: number) => Promise<IpcResult<boolean>>;
    reviseBudget: (data: any) => Promise<IpcResult<boolean>>;
    getFunds: (searchQuery?: string, categoryId?: number) => Promise<IpcResult<any[]>>;
    createFund: (data: any) => Promise<IpcResult<any>>;
    quickCreateFundingCategory: (name: string, name_si?: string) => Promise<IpcResult<any>>;
    getFundCategories: () => Promise<IpcResult<any[]>>;
    createFundCategory: (data: { category_code?: string; name_en: string; name_si: string; description?: string }) => Promise<IpcResult<any>>;
    updateFundCategory: (id: number, data: { name_en?: string; name_si?: string; description?: string; is_active?: boolean }) => Promise<IpcResult<boolean>>;
    getFundTraces: (fundId?: number, expenseId?: number) => Promise<IpcResult<any[]>>;
    getFundReceipts: (limit?: number, offset?: number, yearId?: number, categoryId?: number, searchQuery?: string) => Promise<IpcResult<any>>;
    getFundReceiptsSummary: (yearId?: number) => Promise<IpcResult<{ total_cents: number; bank_cents: number; cash_cents: number; petty_cash_cents: number; total_count: number }>>;
    createFundReceipt: (data: any) => Promise<IpcResult<any>>;
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
    ) => Promise<IpcResult<any>>;
    quickCreateExpenseBudgetCategory: (data: {
      financial_year_id: number;
      name_en: string;
      name_si: string;
      parent_id?: number | null;
      category_code?: string;
      allocated_amount_cents?: number;
      description?: string;
    }) => Promise<IpcResult<any>>;
    createExpense: (data: any) => Promise<IpcResult<any>>;
    cancelExpense: (data: { expenseId: number; reason: string }) => Promise<IpcResult<boolean>>;
    getCashTransactions: (limit?: number, offset?: number, yearId?: number) => Promise<IpcResult<any>>;
    getUnifiedCashBook: (params?: { financialYearId?: number; sourceFilter?: 'all' | 'cash' | number; dateFrom?: string; dateTo?: string; typeFilter?: string; limit?: number; offset?: number }) => Promise<IpcResult<any>>;
    getPettyCash: (limit?: number, offset?: number, yearId?: number) => Promise<IpcResult<any>>;
    recordPettyCashExpense: (data: any) => Promise<IpcResult<any>>;
    replenishPettyCash: (data: any) => Promise<IpcResult<boolean>>;
    getBankAccounts: () => Promise<IpcResult<any[]>>;
    createBankAccount: (data: any) => Promise<IpcResult<any>>;
    getBankTransactions: (bankAccountId: number, limit?: number, offset?: number) => Promise<IpcResult<any>>;
    getSummaryStats: (yearId?: number) => Promise<IpcResult<any>>;
    getTrialBalance: (yearId?: number) => Promise<IpcResult<any>>;
    getReimbursementVouchers: (yearId?: number) => Promise<IpcResult<any[]>>;
    getReimbursementReport: (params: { yearId?: number; fromVoucherId?: number; toVoucherId?: number; startDate?: string; endDate?: string }) => Promise<IpcResult<any>>;
    getAccountBalances: (yearId?: number) => Promise<IpcResult<any>>;
    createFundTransfer: (data: any) => Promise<IpcResult<any>>;
    reverseFundTransfer: (data: { transferId: number; reason: string }) => Promise<IpcResult<boolean>>;
    getFundTransfers: (params?: any) => Promise<IpcResult<any>>;
    transferBudget: (data: {
      financial_year_id: number;
      source_category_id: number;
      destination_category_id: number;
      amount_cents: number;
      reason: string;
    }) => Promise<IpcResult<any>>;
    getBudgetReallocations: (financialYearId: number) => Promise<IpcResult<any[]>>;
    getCheques: (filters?: ChequeFilters) => Promise<IpcResult<{ cheques: ChequeRecord[]; total: number }>>;
    getChequesSummary: (financialYearId?: number) => Promise<IpcResult<ChequesSummary>>;
    getChequeDetail: (id: number) => Promise<IpcResult<{ cheque: ChequeRecord; auditLogs: ChequeAuditLog[] }>>;
    recordReceivedCheque: (data: any) => Promise<IpcResult<ChequeRecord>>;
    depositReceivedCheque: (data: { cheque_id: number; deposit_bank_account_id: number; actual_deposit_date: string; deposit_reference?: string; financial_year_id?: number }) => Promise<IpcResult<ChequeRecord>>;
    clearReceivedCheque: (data: { cheque_id: number; actual_clearance_date: string; notes?: string }) => Promise<IpcResult<ChequeRecord>>;
    bounceReceivedCheque: (data: { cheque_id: number; bounce_date: string; bounce_reason: string }) => Promise<IpcResult<ChequeRecord>>;
    cancelReceivedCheque: (data: { cheque_id: number; cancellation_reason: string }) => Promise<IpcResult<ChequeRecord>>;
    recordIssuedCheque: (data: any) => Promise<IpcResult<ChequeRecord>>;
    presentIssuedCheque: (data: { cheque_id: number; actual_presentation_date: string; notes?: string }) => Promise<IpcResult<ChequeRecord>>;
    clearIssuedCheque: (data: { cheque_id: number; actual_clearance_date: string; notes?: string }) => Promise<IpcResult<ChequeRecord>>;
    bounceIssuedCheque: (data: { cheque_id: number; bounce_date: string; bounce_reason: string }) => Promise<IpcResult<ChequeRecord>>;
    cancelIssuedCheque: (data: { cheque_id: number; cancellation_reason: string }) => Promise<IpcResult<ChequeRecord>>;

    // Bank Reconciliation
    createReconciliationSession: (data: any) => Promise<IpcResult<any>>;
    getReconciliationSessions: (bankAccountId?: number) => Promise<IpcResult<any[]>>;
    getReconciliationSessionDetail: (sessionId: number) => Promise<IpcResult<any>>;
    importBankStatement: (params: { sessionId: number; rows: any[]; filename?: string; fileFormat?: string }) => Promise<IpcResult<any>>;
    getStatementTransactions: (sessionId: number) => Promise<IpcResult<any[]>>;
    getSystemTransactionsForRecon: (sessionId: number) => Promise<IpcResult<any>>;
    autoMatchTransactions: (params: { sessionId: number; toleranceDays?: number }) => Promise<IpcResult<any>>;
    manualMatchTransaction: (params: { sessionId: number; statementTransactionId: number; bankTransactionId?: number; chequeId?: number }) => Promise<IpcResult<any>>;
    unmatchTransaction: (params: { sessionId: number; matchId: number }) => Promise<IpcResult<any>>;
    recordReconAdjustment: (params: { sessionId: number; data: any }) => Promise<IpcResult<any>>;
    toggleReconTick: (params: { sessionId: number; bankTransactionId: number; isTicked: boolean }) => Promise<IpcResult<any>>;
    batchReconTick: (params: { sessionId: number; bankTransactionIds: number[]; isTicked: boolean }) => Promise<IpcResult<any>>;
    updateReconBalances: (params: { sessionId: number; statementClosingCents: number; statementOpeningCents?: number }) => Promise<IpcResult<any>>;
    getReconciliationSummary: (sessionId: number) => Promise<IpcResult<any>>;
    completeReconciliation: (params: { sessionId: number; notes?: string }) => Promise<IpcResult<any>>;
    reopenReconciliation: (params: { sessionId: number; reason: string }) => Promise<IpcResult<any>>;

    // Periodic Financial Statement (Annexure 19)
    getPeriodicStatementMappings: (financialYearId: number) => Promise<IpcResult<PeriodicStatementMapping[]>>;
    savePeriodicStatementMappings: (params: { financialYearId: number; mappings: any[] }) => Promise<IpcResult<boolean>>;
    autoAssignPeriodicStatementMappings: (financialYearId: number) => Promise<IpcResult<PeriodicStatementMapping[]>>;
    getPeriodicStatementReport: (params: { financialYearId: number; periodType: '1st' | '2nd' | '3rd' | 'custom'; startDate: string; endDate: string }) => Promise<IpcResult<PeriodicStatementReportData>>;
    savePeriodicStatementAdjustments: (params: { financialYearId: number; startDate: string; endDate: string; adjustments: any }) => Promise<IpcResult<boolean>>;
  };
}
