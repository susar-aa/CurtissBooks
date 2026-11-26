export interface FinancialYear {
  id: number;
  year_name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'approved' | 'closed' | 'open' | 'locked';
  is_current: boolean;
  total_budget_cents?: number;
  approved_by?: number | null;
  approver_name?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReusableCategory {
  id: number;
  name: string;
  name_en?: string;
  name_si?: string;
  category_code?: string;
  parent_id?: number | null;
  parent_code?: string | null;
  parent_name?: string | null;
  is_parent?: boolean;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface BudgetAllocationItem {
  id?: number;
  financial_year_id?: number;
  category_id: number;
  category_code?: string;
  category_name: string;
  category_name_si?: string;
  parent_id?: number | null;
  parent_code?: string | null;
  parent_name?: string | null;
  allocated_amount_cents: number;
  spent_amount_cents?: number;
  remaining_amount_cents?: number;
  notes?: string;
}

export interface FinancialYearDetail {
  id: number;
  year_name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'approved' | 'closed' | 'open' | 'locked';
  is_current: boolean;
  total_budget_cents: number;
  total_spent_cents?: number;
  total_remaining_cents?: number;
  approved_by?: number | null;
  approver_name?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  created_at?: string;
  updated_at?: string;
  allocations: BudgetAllocationItem[];
}

export interface ChartOfAccount {
  id: number;
  account_code: string;
  account_name_en: string;
  account_name_si: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parent_id?: number | null;
  is_system: boolean;
  is_active: boolean;
}

export interface BudgetCategory {
  id: number;
  name?: string;
  category_code: string;
  name_en: string;
  name_si: string;
  parent_id?: number | null;
  parent_code?: string | null;
  parent_name_en?: string | null;
  parent_name_si?: string | null;
  description?: string | null;
  is_active: boolean;
  approved_amount_cents?: number;
  revised_amount_cents?: number;
  spent_amount_cents?: number;
}

export interface AnnualBudget {
  id: number;
  financial_year_id: number;
  category_id: number;
  category_code: string;
  category_name_en: string;
  category_name_si: string;
  approved_amount_cents: number;
  revised_amount_cents: number;
  spent_amount_cents: number;
  remaining_cents: number;
  status: 'draft' | 'submitted' | 'approved' | 'locked';
  approved_by?: number | null;
  approved_at?: string | null;
  notes?: string | null;
}

export interface BudgetRevision {
  id: number;
  budget_id: number;
  previous_amount_cents: number;
  new_amount_cents: number;
  reason: string;
  authorized_by?: number | null;
  authorizer_name?: string | null;
  created_at: string;
}

export interface FundCategory {
  id: number;
  category_code: string;
  name_en: string;
  name_si: string;
  description?: string | null;
  is_active: boolean;
  fund_count?: number;
  total_received_cents?: number;
  total_spent_cents?: number;
  balance_cents?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FundUsageTrace {
  id: number;
  fund_id: number;
  fund_name_en?: string;
  fund_code?: string;
  expense_id: number;
  voucher_no?: string;
  payee?: string;
  payment_method?: string;
  category_code?: string;
  category_name_en?: string;
  expense_description?: string;
  amount_cents: number;
  allocated_cents?: number;
  trace_date: string;
  notes?: string | null;
  created_at?: string;
}

export interface Fund {
  id: number;
  fund_code: string;
  name?: string;
  fund_name?: string;
  name_en: string;
  name_si?: string;
  category_code?: string;
  category_name_en?: string;
  description?: string | null;
  fund_category_id?: number | null;
  fund_category_name_en?: string | null;
  fund_category_name_si?: string | null;
  source_type: 'government_grant' | 'provincial_grant' | 'individual_donation' | 'corporate_donation' | 'development_fund' | 'community_contribution' | 'other' | string;
  is_restricted?: boolean;
  intended_purpose?: string | null;
  opening_balance_cents?: number;
  current_balance_cents?: number;
  total_received_cents: number;
  total_spent_cents: number;
  balance_cents: number;
  status: 'active' | 'inactive';
}

export interface FundReceipt {
  id: number;
  receipt_no: string;
  financial_year_id: number;
  fund_id?: number | null;
  fund_name_en?: string;
  fund_name_si?: string;
  fund_code?: string;
  fund_category_id?: number | null;
  fund_category_name_en?: string | null;
  fund_category_name_si?: string | null;
  fund_category_code?: string | null;
  receipt_date: string;
  donor_or_dept: string;
  amount_cents: number;
  payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'direct_deposit' | 'other';
  destination_type: 'cash' | 'bank' | 'petty_cash';
  bank_account_id?: number | null;
  bank_name?: string | null;
  reference_no?: string | null;
  purpose?: string | null;
  notes?: string | null;
  status: 'draft' | 'posted' | 'cancelled';
  created_by?: number | null;
  created_at?: string;
}

export interface BankAccount {
  id: number;
  account_code: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  account_type: 'current' | 'savings' | 'development';
  opening_balance_cents: number;
  current_balance_cents: number;
  status: 'active' | 'inactive';
}

export interface BankTransaction {
  id: number;
  bank_account_id: number;
  bank_name?: string;
  account_number?: string;
  transaction_date: string;
  transaction_type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'cheque_deposit' | 'cheque_payment' | 'bank_charge' | 'interest' | 'adjustment';
  amount_cents: number;
  reference_no?: string | null;
  cheque_number?: string | null;
  payee_or_payer?: string | null;
  description: string;
  is_reconciled: boolean;
  reconciled_at?: string | null;
  created_at?: string;
}

export interface Expense {
  id: number;
  voucher_no: string;
  expense_date: string;
  financial_year_id: number;
  category_id: number;
  category_code?: string;
  category_name_en?: string;
  category_name_si?: string;
  fund_id?: number | null;
  fund_name_en?: string | null;
  payee: string;
  description: string;
  amount_cents: number;
  payment_method: 'cash' | 'bank' | 'petty_cash' | 'unpaid' | 'cheque';
  bank_account_id?: number | null;
  bank_name?: string | null;
  reference_no?: string | null;
  bill_no?: string | null;
  petty_cash_voucher_id?: number | null;
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' | 'reversed';
  approved_by?: number | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  created_by?: number | null;
  creator_name?: string;
  created_at?: string;
}

export interface CashTransaction {
  id: number;
  financial_year_id: number;
  transaction_date: string;
  transaction_type: 'receipt' | 'payment' | 'bank_deposit' | 'petty_cash_transfer' | 'adjustment';
  amount_cents: number; // positive = inflow, negative = outflow
  running_balance_cents: number;
  reference_no?: string | null;
  description: string;
  created_at?: string;
}

export interface PettyCashVoucher {
  id: number;
  voucher_no: string;
  voucher_date: string;
  financial_year_id: number;
  category_id?: number | null;
  category_code?: string | null;
  category_name_en?: string | null;
  category_name_si?: string | null;
  type: 'expense' | 'replenishment';
  amount_cents: number;
  payee: string;
  description: string;
  receipt_no?: string | null;
  notes?: string | null;
  receipt_attached: boolean;
  status: 'approved' | 'rejected' | 'cancelled';
  created_by?: number | null;
  creator_name?: string | null;
  created_at?: string;
}

export interface UnifiedCashBookTransaction {
  id: string; // e.g. "cash-1" or "bank-5"
  raw_id: number;
  source_type: 'cash' | 'bank';
  bank_account_id?: number | null;
  bank_name?: string | null;
  account_number?: string | null;
  payment_source: string;
  transaction_date: string;
  transaction_type: string;
  reference_no?: string | null;
  description: string;
  cash_in_cents: number;
  cash_out_cents: number;
  bank_in_cents: number;
  bank_out_cents: number;
  amount_cents: number; // net change
  running_balance_cents: number;
  cheque_number?: string | null;
  payee_or_payer?: string | null;
  created_at?: string;
}

export interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  financial_year_id: number;
  reference_type?: string | null;
  reference_id?: number | null;
  description: string;
  total_amount_cents: number;
  status: 'draft' | 'posted' | 'reversed';
  lines?: JournalLine[];
  created_at?: string;
}

export interface JournalLine {
  id: number;
  entry_id: number;
  account_id: number;
  account_code: string;
  account_name_en: string;
  account_name_si: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
}

export interface FinancialSummaryStats {
  cashBalanceCents: number;
  bankBalanceCents: number;
  pettyCashBalanceCents: number;
  annualBudgetCents: number;
  totalExpensesCents: number;
  remainingBudgetCents: number;
  totalFundsReceivedCents: number;
  pendingApprovalsCount: number;
}

export type TransferAccountType = 'cash' | 'bank' | 'petty_cash';

export interface FundTransfer {
  id: number;
  transfer_reference: string;
  financial_year_id: number;
  transfer_date: string;
  source_account_type: TransferAccountType;
  source_bank_account_id?: number | null;
  source_account_label?: string;
  destination_account_type: TransferAccountType;
  destination_bank_account_id?: number | null;
  destination_account_label?: string;
  amount_cents: number;
  reference_no?: string | null;
  description: string;
  status: 'completed' | 'reversed';
  reversed_at?: string | null;
  reversed_by?: number | null;
  reversal_reason?: string | null;
  created_by?: number | null;
  creator_name?: string | null;
  reverser_name?: string | null;
  created_at: string;
}

export interface AccountBalancesSummary {
  cashBalanceCents: number;
  pettyCashBalanceCents: number;
  bankAccounts: Array<{
    id: number;
    account_code: string;
    bank_name: string;
    branch_name: string;
    account_number: string;
    account_type: string;
    current_balance_cents: number;
  }>;
  totalLiquidCents: number;
}

export interface BudgetReallocation {
  id: number;
  reallocation_no: string;
  financial_year_id: number;
  source_category_id: number;
  source_category_code?: string;
  source_category_name: string;
  source_category_name_si?: string;
  destination_category_id: number;
  destination_category_code?: string;
  destination_category_name: string;
  destination_category_name_si?: string;
  amount_cents: number;
  reason: string;
  created_by?: number | null;
  creator_name?: string | null;
  created_at: string;
}

export type ChequeType = 'received' | 'issued';
export type ChequeStatus = 'received' | 'deposited' | 'issued' | 'presented' | 'cleared' | 'bounced' | 'cancelled';

export interface ChequeRecord {
  id: number;
  cheque_type: ChequeType;
  cheque_number: string;
  amount_cents: number;
  status: ChequeStatus;
  cheque_date: string;

  // Received Cheque Fields
  received_date?: string | null;
  payer_name?: string | null;
  issuing_bank_name?: string | null;
  issuing_bank_branch?: string | null;
  expected_deposit_date?: string | null;
  actual_deposit_date?: string | null;
  deposit_bank_account_id?: number | null;
  deposit_bank_name?: string | null;
  deposit_account_number?: string | null;
  deposit_bank_transaction_id?: number | null;
  fund_receipt_id?: number | null;
  fund_receipt_no?: string | null;
  fund_category_id?: number | null;
  fund_category_name?: string | null;
  specific_fund_id?: number | null;
  specific_fund_name?: string | null;

  // Issued Cheque Fields
  issue_date?: string | null;
  payee_name?: string | null;
  issuing_bank_account_id?: number | null;
  issuing_account_number?: string | null;
  issuing_bank_transaction_id?: number | null;
  expense_id?: number | null;
  expense_voucher_no?: string | null;
  budget_category_id?: number | null;
  budget_category_name?: string | null;
  financial_year_id?: number | null;
  expected_presentation_date?: string | null;
  actual_presentation_date?: string | null;

  // Lifecycle
  actual_clearance_date?: string | null;
  bounce_date?: string | null;
  bounce_reason?: string | null;
  bounce_fee_cents?: number | null;
  cancellation_date?: string | null;
  cancellation_reason?: string | null;

  // General
  description?: string | null;
  reference?: string | null;
  created_by?: number | null;
  creator_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChequeAuditLog {
  id: number;
  cheque_id: number;
  action: string;
  from_status?: string | null;
  to_status?: string | null;
  notes?: string | null;
  created_by?: number | null;
  creator_name?: string | null;
  created_at: string;
}

export interface ChequesSummary {
  // Received
  received_total_count: number;
  received_total_amount_cents: number;
  received_pending_count: number;
  received_pending_amount_cents: number;
  received_deposited_count: number;
  received_deposited_amount_cents: number;
  received_cleared_count: number;
  received_cleared_amount_cents: number;
  received_bounced_count: number;
  received_bounced_amount_cents: number;
  // Issued
  issued_total_count: number;
  issued_total_amount_cents: number;
  issued_outstanding_count: number;
  issued_outstanding_amount_cents: number;
  issued_presented_count: number;
  issued_presented_amount_cents: number;
  issued_cleared_count: number;
  issued_cleared_amount_cents: number;
  issued_bounced_count: number;
  issued_bounced_amount_cents: number;
}

export interface ChequeFilters {
  cheque_type?: ChequeType;
  status?: string;
  bank_account_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ========================================================
// BANK RECONCILIATION TYPES
// ========================================================

export type ReconciliationSessionStatus = 'draft' | 'matched' | 'completed' | 'cancelled';
export type ReconciliationMatchType = 'auto' | 'manual' | 'adjustment';

export interface BankReconciliationSession {
  id: number;
  session_code: string;
  bank_account_id: number;
  financial_year_id?: number | null;
  period_start_date: string;
  period_end_date: string;
  reconciliation_date: string;
  statement_opening_balance_cents: number;
  statement_closing_balance_cents: number;
  system_opening_balance_cents: number;
  system_closing_balance_cents: number;
  matched_statement_amount_cents: number;
  matched_system_amount_cents: number;
  deposits_in_transit_cents: number;
  outstanding_cheques_cents: number;
  unrecorded_bank_charges_cents: number;
  unrecorded_bank_interest_cents: number;
  adjusted_statement_balance_cents: number;
  adjusted_book_balance_cents: number;
  difference_cents: number;
  status: ReconciliationSessionStatus;
  completed_at?: string | null;
  completed_by?: number | null;
  completer_name?: string | null;
  reopened_at?: string | null;
  reopened_by?: number | null;
  reopen_reason?: string | null;
  notes?: string | null;
  created_by?: number | null;
  creator_name?: string | null;
  created_at: string;
  updated_at: string;
  bank_name?: string;
  account_number?: string;
}

export interface BankStatementImport {
  id: number;
  session_id: number;
  bank_account_id: number;
  filename: string;
  file_format: 'xlsx' | 'csv' | 'manual';
  import_date: string;
  total_rows: number;
  imported_by?: number | null;
  created_at: string;
}

export interface BankStatementTransaction {
  id: number;
  session_id: number;
  import_id?: number | null;
  transaction_date: string;
  value_date?: string | null;
  description: string;
  reference_no?: string | null;
  cheque_number?: string | null;
  debit_cents: number;
  credit_cents: number;
  balance_cents?: number | null;
  is_matched: boolean;
  matched_at?: string | null;
  match_id?: number | null;
  matched_system_tx_id?: number | null;
  matched_rule?: string | null;
  created_at: string;
}

export interface BankReconciliationMatch {
  id: number;
  session_id: number;
  statement_transaction_id: number;
  bank_transaction_id?: number | null;
  cheque_id?: number | null;
  matched_amount_cents: number;
  match_type: ReconciliationMatchType;
  confidence_score: number;
  match_rule?: string | null;
  matched_by?: number | null;
  created_at: string;
  // Hydrated attributes
  statement_desc?: string;
  statement_date?: string;
  system_desc?: string;
  system_date?: string;
  cheque_number?: string;
  reference_no?: string;
}

export interface OutstandingChequeItem {
  id: number;
  cheque_number: string;
  cheque_date: string;
  issue_date?: string;
  payee_name: string;
  amount_cents: number;
  status: string;
  description?: string;
}

export interface DepositInTransitItem {
  id: number;
  cheque_number: string;
  cheque_date: string;
  deposit_date?: string;
  payer_name: string;
  amount_cents: number;
  status: string;
  description?: string;
}

export interface ReconciliationSummaryCalculation {
  statement_opening_balance_cents: number;
  statement_closing_balance_cents: number;
  system_opening_balance_cents: number;
  system_closing_balance_cents: number;
  total_matched_statement_debits: number;
  total_matched_statement_credits: number;
  total_matched_system_debits: number;
  total_matched_system_credits: number;
  deposits_in_transit_cents: number;
  deposits_in_transit_count: number;
  deposits_in_transit_items: DepositInTransitItem[];
  outstanding_cheques_cents: number;
  outstanding_cheques_count: number;
  outstanding_cheques_items: OutstandingChequeItem[];
  unmatched_statement_debits_cents: number;
  unmatched_statement_credits_cents: number;
  unmatched_system_debits_cents: number;
  unmatched_system_credits_cents: number;
  unrecorded_bank_charges_cents: number;
  unrecorded_bank_interest_cents: number;
  adjusted_statement_balance_cents: number;
  adjusted_book_balance_cents: number;
  difference_cents: number;
  is_balanced: boolean;
}

export interface ReimbursementVoucherOption {
  id: number;
  voucher_no: string;
  voucher_date: string;
  amount_cents: number;
  payee: string;
  description: string;
}

export interface ReimbursementCategoryBreakdown {
  category_id: number;
  category_code: string;
  category_name_en: string;
  category_name_si?: string;
  voucher_count: number;
  total_spent_cents: number;
}

export interface ReimbursementReportData {
  filterMode: 'reimbursements' | 'date_range';
  financial_year_id?: number;
  fromVoucher?: ReimbursementVoucherOption | null;
  toVoucher?: ReimbursementVoucherOption | null;
  startDate: string;
  endDate: string;
  openingFloatCents: number;
  totalReplenishedCents: number;
  totalDisbursedCents: number;
  closingFloatCents: number;
  voucherCount: number;
  transactions: PettyCashVoucher[];
  categoryBreakdown: ReimbursementCategoryBreakdown[];
}

export interface PeriodicStatementMapping {
  id: number;
  financial_year_id: number;
  section: 'receipt' | 'recurrent_expense' | 'capital_expense';
  report_code: string;
  display_order: number;
  label_si: string;
  label_en: string;
  fund_category_id: number | null;
  fund_category_code?: string;
  fund_category_name?: string;
  budget_category_id: number | null;
  budget_category_code?: string;
  budget_category_name?: string;
  estimated_amount_cents: number;
}

export interface PeriodicStatementRow {
  report_code: string;
  label_si: string;
  label_en: string;
  category_id?: number | null;
  category_code?: string | null;
  annual_estimate_cents: number;
  prior_cumulative_cents: number;
  current_period_cents: number;
  total_cumulative_cents: number;
}

export interface PeriodicStatementCalculation {
  period_start_date: string;
  period_end_date: string;
  opening_balance_cents: number;
  total_receipts_cents: number;
  other_additions_cents: number;
  subtotal_receipts_cents: number;
  total_payments_cents: number;
  canteen_refund_cents: number;
  cheque_reissue_cents: number;
  bank_charges_cents: number;
  petty_cash_balance_cents: number;
  closing_balance_cents: number;
  notes?: string;
}

export interface PeriodicStatementReportData {
  school_name_si: string;
  school_name_en: string;
  financial_year_id: number;
  financial_year_name: string;
  period_type: '1st' | '2nd' | '3rd' | 'custom';
  period_start_date: string;
  period_end_date: string;
  as_of_date_label: string;
  opening_balance_cents: number;
  receipt_rows: PeriodicStatementRow[];
  recurrent_expense_rows: PeriodicStatementRow[];
  capital_expense_rows: PeriodicStatementRow[];
  receipt_totals: {
    annual_estimate_cents: number;
    prior_cumulative_cents: number;
    current_period_cents: number;
    total_cumulative_cents: number;
  };
  payment_totals: {
    annual_allocation_cents: number;
    prior_cumulative_cents: number;
    current_period_cents: number;
    total_cumulative_cents: number;
  };
  calculation: PeriodicStatementCalculation;
}





