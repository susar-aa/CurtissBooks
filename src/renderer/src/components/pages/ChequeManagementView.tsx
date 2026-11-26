import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Landmark,
  Calendar,
  Layers,
  History,
  Eye,
  FileCheck,
  Send,
  X,
  FileText,
  Printer,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import {
  ChequeRecord,
  ChequeAuditLog,
  ChequesSummary,
  ChequeType,
  ChequeStatus,
  BankAccount,
  FundCategory,
  FinancialYear,
  BudgetAllocationItem,
  Expense,
} from '../../../shared/types/finance';

interface ChequeManagementViewProps {
  permissions?: string[];
  initialTab?: ChequeType;
}

export const ChequeManagementView: React.FC<ChequeManagementViewProps> = ({
  permissions = [],
  initialTab = 'received',
}) => {
  const { t } = useTranslation('finance');
  const { t: tCommon } = useTranslation('common');
  const { success, error: toastError } = useToast();

  // Active Tab
  const [activeTab, setActiveTab] = useState<ChequeType>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Cheque Data
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<ChequesSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Aux Data
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [fundCategories, setFundCategories] = useState<FundCategory[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetAllocationItem[]>([]);
  const [unpaidExpenses, setUnpaidExpenses] = useState<Expense[]>([]);
  const [activeYear, setActiveYear] = useState<FinancialYear | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [bankFilter, setBankFilter] = useState<number | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Modals
  const [recordReceivedModalOpen, setRecordReceivedModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [recordIssuedModalOpen, setRecordIssuedModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Modal Context / Selected Record
  const [selectedCheque, setSelectedCheque] = useState<ChequeRecord | null>(null);
  const [selectedChequeDetail, setSelectedChequeDetail] = useState<{ cheque: ChequeRecord; auditLogs: ChequeAuditLog[] } | null>(null);
  const [actionType, setActionType] = useState<'cleared' | 'bounced' | 'cancelled'>('cleared');
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [actionReason, setActionReason] = useState('');
  const [actionBounceFee, setActionBounceFee] = useState('');
  const [actionBankId, setActionBankId] = useState<number | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Form States - Received Cheque
  const [recvChequeNumber, setRecvChequeNumber] = useState('');
  const [recvPayerName, setRecvPayerName] = useState('');
  const [recvIssuingBank, setRecvIssuingBank] = useState('');
  const [recvIssuingBranch, setRecvIssuingBranch] = useState('');
  const [recvChequeDate, setRecvChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [recvReceivedDate, setRecvReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [recvExpectedDepositDate, setRecvExpectedDepositDate] = useState('');
  const [recvAmount, setRecvAmount] = useState('');
  const [recvCategoryId, setRecvCategoryId] = useState<number | null>(null);
  const [recvDescription, setRecvDescription] = useState('');
  const [recvReference, setRecvReference] = useState('');

  // Form States - Deposit Cheque
  const [depBankId, setDepBankId] = useState<number | null>(null);
  const [depDate, setDepDate] = useState(new Date().toISOString().split('T')[0]);
  const [depReference, setDepReference] = useState('');

  // Form States - Issued Cheque
  const [issuePayeeName, setIssuePayeeName] = useState('');
  const [issueChequeNumber, setIssueChequeNumber] = useState('');
  const [issueBankId, setIssueBankId] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueChequeDate, setIssueChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueAmount, setIssueAmount] = useState('');
  const [issueExpenseMode, setIssueExpenseMode] = useState<'new' | 'existing'>('new');
  const [issueExpenseId, setIssueExpenseId] = useState<number | null>(null);
  const [issueBudgetCatId, setIssueBudgetCatId] = useState<number | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issueReference, setIssueReference] = useState('');

  // Load Auxiliary Data
  const loadAuxData = async () => {
    try {
      if (!window.curtissApi?.financial) return;

      const [banksRes, yearsRes, catRes] = await Promise.all([
        window.curtissApi.financial.getBankAccounts(),
        window.curtissApi.financial.getYears(),
        window.curtissApi.financial.getFundCategories(),
      ]);

      if (banksRes.success && banksRes.data) {
        setBankAccounts(banksRes.data.filter((b: BankAccount) => b.status === 'active'));
      }
      if (catRes.success && catRes.data) {
        setFundCategories(catRes.data);
      }
      if (yearsRes.success && yearsRes.data) {
        const active = yearsRes.data.find((y: FinancialYear) => y.is_current) || yearsRes.data[0];
        setActiveYear(active);

        if (active && window.curtissApi.financial.getYearDetail) {
          const detailRes = await window.curtissApi.financial.getYearDetail(active.id);
          if (detailRes.success && detailRes.data?.allocations) {
            setBudgetCategories(detailRes.data.allocations);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load aux data for cheques:', err);
    }
  };

  // Load Cheques Ledger & Summary
  const loadCheques = async () => {
    setLoading(true);
    try {
      if (!window.curtissApi?.financial) return;

      const [listRes, summaryRes] = await Promise.all([
        window.curtissApi.financial.getCheques({
          cheque_type: activeTab,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          bank_account_id: bankFilter !== 'all' ? bankFilter : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          search: searchQuery || undefined,
          limit: pageSize,
          offset: page * pageSize,
        }),
        window.curtissApi.financial.getChequesSummary(activeYear?.id),
      ]);

      if (listRes.success && listRes.data) {
        setCheques(listRes.data.cheques);
        setTotalCount(listRes.data.total);
      }
      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data);
      }
    } catch (err: any) {
      toastError('Error', err.message || 'Failed to load cheques.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuxData();
  }, []);

  useEffect(() => {
    loadCheques();
  }, [activeTab, statusFilter, bankFilter, dateFrom, dateTo, searchQuery, page, activeYear?.id]);

  // Handle Record Received Cheque Submit
  const handleRecordReceived = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = parseFloat(recvAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      toastError('Validation Error', 'Please enter a valid positive amount.');
      return;
    }
    if (!recvChequeNumber.trim() || !recvPayerName.trim() || !recvIssuingBank.trim()) {
      toastError('Validation Error', 'Cheque number, payer name, and issuing bank are required.');
      return;
    }

    setSubmittingAction(true);
    try {
      if (window.curtissApi?.financial?.recordReceivedCheque) {
        const res = await window.curtissApi.financial.recordReceivedCheque({
          cheque_number: recvChequeNumber.trim(),
          payer_name: recvPayerName.trim(),
          issuing_bank_name: recvIssuingBank.trim(),
          issuing_bank_branch: recvIssuingBranch.trim() || undefined,
          cheque_date: recvChequeDate,
          received_date: recvReceivedDate,
          expected_deposit_date: recvExpectedDepositDate || undefined,
          amount_cents: Math.round(amtNum * 100),
          fund_category_id: recvCategoryId || undefined,
          description: recvDescription.trim() || undefined,
          reference: recvReference.trim() || undefined,
        });

        if (res.success) {
          success('Cheque Recorded', `Received cheque #${recvChequeNumber} recorded successfully.`);
          setRecordReceivedModalOpen(false);
          resetReceivedForm();
          await loadCheques();
        } else {
          toastError('Error', res.error || 'Failed to record cheque.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const resetReceivedForm = () => {
    setRecvChequeNumber('');
    setRecvPayerName('');
    setRecvIssuingBank('');
    setRecvIssuingBranch('');
    setRecvAmount('');
    setRecvCategoryId(null);
    setRecvDescription('');
    setRecvReference('');
    setRecvExpectedDepositDate('');
  };

  // Open Deposit Modal
  const handleOpenDeposit = (cheque: ChequeRecord) => {
    setSelectedCheque(cheque);
    if (bankAccounts.length > 0) {
      setDepBankId(bankAccounts[0].id);
    }
    setDepDate(new Date().toISOString().split('T')[0]);
    setDepReference(`DEP-${cheque.cheque_number}`);
    setDepositModalOpen(true);
  };

  // Handle Deposit Submit
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheque || !depBankId) {
      toastError('Validation Error', 'Please select a receiving bank account.');
      return;
    }

    setSubmittingAction(true);
    try {
      if (window.curtissApi?.financial?.depositReceivedCheque) {
        const res = await window.curtissApi.financial.depositReceivedCheque({
          cheque_id: selectedCheque.id,
          deposit_bank_account_id: depBankId,
          actual_deposit_date: depDate,
          deposit_reference: depReference.trim() || undefined,
          financial_year_id: activeYear?.id,
        });

        if (res.success) {
          success('Cheque Deposited', `Cheque #${selectedCheque.cheque_number} deposited into bank account.`);
          setDepositModalOpen(false);
          setSelectedCheque(null);
          await loadCheques();
        } else {
          toastError('Error', res.error || 'Failed to deposit cheque.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Record Issued Cheque Submit
  const handleRecordIssued = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = parseFloat(issueAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      toastError('Validation Error', 'Please enter a valid positive amount.');
      return;
    }
    if (!issueChequeNumber.trim() || !issuePayeeName.trim() || !issueBankId) {
      toastError('Validation Error', 'Cheque number, payee name, and issuing bank account are required.');
      return;
    }

    setSubmittingAction(true);
    try {
      if (window.curtissApi?.financial?.recordIssuedCheque) {
        const res = await window.curtissApi.financial.recordIssuedCheque({
          cheque_number: issueChequeNumber.trim(),
          payee_name: issuePayeeName.trim(),
          issuing_bank_account_id: issueBankId,
          issue_date: issueDate,
          cheque_date: issueChequeDate,
          amount_cents: Math.round(amtNum * 100),
          budget_category_id: issueBudgetCatId || undefined,
          expense_id: issueExpenseMode === 'existing' ? (issueExpenseId || undefined) : undefined,
          financial_year_id: activeYear?.id,
          description: issueDescription.trim() || undefined,
          reference: issueReference.trim() || undefined,
        });

        if (res.success) {
          success('Cheque Issued', `Cheque #${issueChequeNumber} issued to "${issuePayeeName}".`);
          setRecordIssuedModalOpen(false);
          resetIssuedForm();
          await loadCheques();
        } else {
          toastError('Error', res.error || 'Failed to issue cheque.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const resetIssuedForm = () => {
    setIssuePayeeName('');
    setIssueChequeNumber('');
    setIssueAmount('');
    setIssueBudgetCatId(null);
    setIssueExpenseId(null);
    setIssueDescription('');
    setIssueReference('');
  };

  // Open Action Modal (Clear, Bounce, Cancel)
  const handleOpenAction = (cheque: ChequeRecord, type: 'cleared' | 'bounced' | 'cancelled') => {
    setSelectedCheque(cheque);
    setActionType(type);
    setActionDate(new Date().toISOString().split('T')[0]);
    setActionReason('');
    setActionBounceFee(cheque.bounce_fee_cents ? (cheque.bounce_fee_cents / 100).toString() : '');
    setActionBankId(cheque.deposit_bank_account_id || (bankAccounts.length > 0 ? bankAccounts[0].id : null));
    setActionModalOpen(true);
  };

  // Handle Action Submit
  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheque) return;

    if ((actionType === 'bounced' || actionType === 'cancelled') && !actionReason.trim()) {
      toastError('Validation Error', 'A reason is required for this action.');
      return;
    }

    setSubmittingAction(true);
    try {
      const api = window.curtissApi?.financial;
      if (!api) return;

      let res: any;
      if (selectedCheque.cheque_type === 'received') {
        if (actionType === 'cleared') {
          res = await api.clearReceivedCheque({
            cheque_id: selectedCheque.id,
            actual_clearance_date: actionDate,
            deposit_bank_account_id: actionBankId || selectedCheque.deposit_bank_account_id || undefined,
            notes: actionReason.trim() || undefined,
          });
        } else if (actionType === 'bounced') {
          const bounceFeeCents = actionBounceFee.trim() ? Math.round(parseFloat(actionBounceFee) * 100) : 0;
          res = await api.bounceReceivedCheque({
            cheque_id: selectedCheque.id,
            bounce_date: actionDate,
            bounce_reason: actionReason.trim(),
            bounce_fee_cents: bounceFeeCents,
          });
        } else if (actionType === 'cancelled') {
          res = await api.cancelReceivedCheque({
            cheque_id: selectedCheque.id,
            cancellation_reason: actionReason.trim(),
          });
        }
      } else {
        if (actionType === 'cleared') {
          res = await api.clearIssuedCheque({
            cheque_id: selectedCheque.id,
            actual_clearance_date: actionDate,
            notes: actionReason.trim() || undefined,
          });
        } else if (actionType === 'bounced') {
          const bounceFeeCents = actionBounceFee.trim() ? Math.round(parseFloat(actionBounceFee) * 100) : 0;
          res = await api.bounceIssuedCheque({
            cheque_id: selectedCheque.id,
            bounce_date: actionDate,
            bounce_reason: actionReason.trim(),
            bounce_fee_cents: bounceFeeCents,
          });
        } else if (actionType === 'cancelled') {
          res = await api.cancelIssuedCheque({
            cheque_id: selectedCheque.id,
            cancellation_reason: actionReason.trim(),
          });
        }
      }

      if (res?.success) {
        success('Updated', `Cheque #${selectedCheque.cheque_number} marked as ${actionType}.`);
        setActionModalOpen(false);
        setSelectedCheque(null);
        await loadCheques();
      } else {
        toastError('Failed', res?.error || 'Action could not be completed.');
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Details Modal
  const handleOpenDetail = async (cheque: ChequeRecord) => {
    try {
      if (window.curtissApi?.financial?.getChequeDetail) {
        const res = await window.curtissApi.financial.getChequeDetail(cheque.id);
        if (res.success && res.data) {
          setSelectedChequeDetail(res.data);
          setDetailModalOpen(true);
        }
      }
    } catch (err: any) {
      toastError('Error', 'Failed to load cheque audit history.');
    }
  };

  // Helpers
  const formatLKR = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getStatusBadge = (status: ChequeStatus) => {
    switch (status) {
      case 'received':
        return <Badge variant="outline" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Received (In Hand)</Badge>;
      case 'deposited':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">Deposited</Badge>;
      case 'issued':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">Issued (Outstanding)</Badge>;
      case 'presented':
        return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300">Presented</Badge>;
      case 'cleared':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300">Cleared</Badge>;
      case 'bounced':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300">Bounced</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-400">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4 select-none font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-bold shadow-xs">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>{t('cheques.title', 'Cheque Management')}</span>
              {activeYear && (
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {activeYear.year_name}
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('cheques.subtitle', 'Register, deposit, present, clear, and reconcile inward & outward school cheques.')}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'received' ? (
            <Button
              size="sm"
              onClick={() => {
                resetReceivedForm();
                setRecordReceivedModalOpen(true);
              }}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Record Received Cheque</span>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                resetIssuedForm();
                if (bankAccounts.length > 0 && !issueBankId) {
                  setIssueBankId(bankAccounts[0].id);
                }
                setRecordIssuedModalOpen(true);
              }}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Issue New Cheque</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadCheques}
            isLoading={loading}
            className="text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>{tCommon('actions.refresh', 'Refresh')}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="text-xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1" />
            <span>{tCommon('actions.print', 'Print')}</span>
          </Button>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900/80 p-1 rounded-xl">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              setActiveTab('received');
              setStatusFilter('all');
              setPage(0);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'received'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
            <span>Cheques Received</span>
            {summary && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {summary.received_total_count}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('issued');
              setStatusFilter('all');
              setPage(0);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'issued'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-amber-500" />
            <span>Cheques Issued</span>
            {summary && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {summary.issued_total_count}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-zinc-500 px-3">
          Showing {cheques.length} of {totalCount} records
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {activeTab === 'received' ? (
            <>
              <Card className="border-l-4 border-l-emerald-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Total Received</span>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    Rs. {formatLKR(summary.received_total_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">{summary.received_total_count} inward cheques recorded</div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Pending Deposit (In Hand)</span>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                    Rs. {formatLKR(summary.received_pending_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">{summary.received_pending_count} cheques awaiting banking</div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Deposited (Awaiting Clearance)</span>
                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                    Rs. {formatLKR(summary.received_deposited_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">{summary.received_deposited_count} cheques in banking process</div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Cleared (Realized)</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    Rs. {formatLKR(summary.received_cleared_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {summary.received_cleared_count} cleared
                    {summary.received_bounced_count > 0 && (
                      <span className="text-red-500 ml-2 font-medium">• {summary.received_bounced_count} bounced</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card className="border-l-4 border-l-indigo-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Total Cheques Issued</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    Rs. {formatLKR(summary.issued_total_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">{summary.issued_total_count} outward cheques issued</div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Outstanding Cheques</span>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                    Rs. {formatLKR(summary.issued_outstanding_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">{summary.issued_outstanding_count} cheques pending clearance</div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Cleared from Bank</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    Rs. {formatLKR(summary.issued_cleared_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {summary.issued_cleared_count} cleared through bank
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-red-500 shadow-xs">
                <CardContent className="p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Bounced / Voided</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  </span>
                  <div className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
                    Rs. {formatLKR(summary.issued_bounced_amount_cents)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {summary.issued_bounced_count} bounced • {summary.issued_cancelled_count} cancelled
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Filter Toolbar */}
      <Card className="shadow-xs">
        <CardContent className="p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder={
                  activeTab === 'received'
                    ? 'Search cheque #, payer, issuing bank...'
                    : 'Search cheque #, payee, bank, ref...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-100"
              />
            </div>

            {/* Date Filters */}
            <div className="flex items-center space-x-1.5 text-xs text-zinc-500">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                title="From Date"
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                title="To Date"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  title="Clear Dates"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
            <span className="text-[11px] font-semibold text-zinc-400 mr-1 flex items-center">
              <Filter className="w-3 h-3 mr-1" />
              Status:
            </span>

            {activeTab === 'received' ? (
              <>
                {['all', 'received', 'deposited', 'cleared', 'bounced', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(0);
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                      statusFilter === st
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {st === 'all'
                      ? 'All'
                      : st === 'received'
                      ? 'In Hand'
                      : st === 'deposited'
                      ? 'Deposited'
                      : st === 'cleared'
                      ? 'Cleared'
                      : st === 'bounced'
                      ? 'Bounced'
                      : 'Cancelled'}
                  </button>
                ))}
              </>
            ) : (
              <>
                {['all', 'issued', 'cleared', 'bounced', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(0);
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                      statusFilter === st
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {st === 'all'
                      ? 'All'
                      : st === 'issued'
                      ? 'Outstanding'
                      : st === 'cleared'
                      ? 'Cleared'
                      : st === 'bounced'
                      ? 'Bounced'
                      : 'Cancelled'}
                  </button>
                ))}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cheques Master Table */}
      <Card className="shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-2.5">Cheque Info</th>
                <th className="px-4 py-2.5">{activeTab === 'received' ? 'Payer & Issuing Bank' : 'Payee & Bank Account'}</th>
                <th className="px-4 py-2.5">Amount (LKR)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">{activeTab === 'received' ? 'Deposit Bank & Dates' : 'Clearance & Dates'}</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                    <span>Loading cheques...</span>
                  </td>
                </tr>
              ) : cheques.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    <p className="font-medium text-zinc-500">
                      No {activeTab === 'received' ? 'received' : 'issued'} cheques found matching current filters.
                    </p>
                    {activeTab === 'received' && (summary?.issued_total_count ?? 0) > 0 && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveTab('issued');
                            setStatusFilter('all');
                            setPage(0);
                          }}
                          className="text-xs inline-flex items-center space-x-1.5 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 text-amber-500" />
                          <span>Switch to Cheques Issued ({summary?.issued_total_count} record{summary?.issued_total_count === 1 ? '' : 's'})</span>
                        </Button>
                      </div>
                    )}
                    {activeTab === 'issued' && (summary?.received_total_count ?? 0) > 0 && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveTab('received');
                            setStatusFilter('all');
                            setPage(0);
                          }}
                          className="text-xs inline-flex items-center space-x-1.5 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Switch to Cheques Received ({summary?.received_total_count} record{summary?.received_total_count === 1 ? '' : 's'})</span>
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                cheques.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                    {/* Cheque Info */}
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-400" />
                        <span>#{c.cheque_number}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 flex items-center space-x-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        <span>Cheque Date: {c.cheque_date}</span>
                      </div>
                      {c.reference && (
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate max-w-[180px]">
                          Ref: {c.reference}
                        </div>
                      )}
                    </td>

                    {/* Payer/Payee & Bank */}
                    <td className="px-4 py-3">
                      {c.cheque_type === 'received' ? (
                        <div>
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{c.payer_name}</div>
                          <div className="text-[11px] text-zinc-500">
                            {c.issuing_bank_name} {c.issuing_bank_branch ? `(${c.issuing_bank_branch})` : ''}
                          </div>
                          {c.fund_category_name && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {c.fund_category_name}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{c.payee_name}</div>
                          <div className="text-[11px] text-zinc-500">
                            {c.issuing_bank_name} ({c.issuing_account_number})
                          </div>
                          {c.budget_category_name && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              {c.budget_category_name}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 font-mono font-bold text-sm">
                      <span className={c.cheque_type === 'received' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'}>
                        Rs. {formatLKR(c.amount_cents)}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3">
                      {getStatusBadge(c.status)}
                      {c.status === 'bounced' && (
                        <div className="space-y-0.5 mt-1">
                          {((c.bounce_fee_cents && c.bounce_fee_cents > 0) || (c.bounce_reason && !isNaN(parseFloat(c.bounce_reason)))) && (
                            <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                              Fee: Rs. {formatLKR(c.bounce_fee_cents || Math.round(parseFloat(c.bounce_reason!) * 100))}
                            </div>
                          )}
                          {c.bounce_reason && isNaN(parseFloat(c.bounce_reason)) && (
                            <div className="text-[10px] text-zinc-500 max-w-[160px] truncate" title={c.bounce_reason}>
                              {c.bounce_reason}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Banking & Lifecycle Dates */}
                    <td className="px-4 py-3 text-[11px] text-zinc-500 space-y-0.5">
                      {c.cheque_type === 'received' ? (
                        <>
                          {c.deposit_bank_name ? (
                            <div className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center space-x-1">
                              <Building2 className="w-3 h-3 text-blue-500" />
                              <span>{c.deposit_bank_name}</span>
                            </div>
                          ) : (
                            <div className="text-amber-600 dark:text-amber-400 italic">Not yet deposited</div>
                          )}
                          {c.actual_deposit_date && <div>Deposited: {c.actual_deposit_date}</div>}
                          {c.actual_clearance_date && (
                            <div className="text-emerald-600 font-medium">Cleared: {c.actual_clearance_date}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div>Issued: {c.issue_date}</div>
                          {c.actual_clearance_date ? (
                            <div className="text-emerald-600 dark:text-emerald-400 font-semibold">Cleared: {c.actual_clearance_date}</div>
                          ) : c.bounce_date ? (
                            <div className="text-red-500 font-semibold">Bounced: {c.bounce_date}</div>
                          ) : c.cancellation_date ? (
                            <div className="text-zinc-400 line-through">Cancelled: {c.cancellation_date}</div>
                          ) : (
                            <div className="text-amber-600 dark:text-amber-400 font-medium">Pending Clearance</div>
                          )}
                        </>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      {/* View Details */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDetail(c)}
                        className="h-7 px-2 text-xs"
                        title="View cheque details & audit log"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>

                      {/* Workflow Actions for Received Cheques */}
                      {c.cheque_type === 'received' && (
                        <>
                          {c.status === 'received' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleOpenDeposit(c)}
                                className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                title="Deposit cheque into bank account"
                              >
                                <Building2 className="w-3.5 h-3.5 mr-1" />
                                <span>Deposit</span>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleOpenAction(c, 'cleared')}
                                className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                title="Clear cheque directly into bank account"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                <span>Clear</span>
                              </Button>
                            </>
                          )}

                          {c.status === 'deposited' && (
                            <Button
                              size="sm"
                              onClick={() => handleOpenAction(c, 'cleared')}
                              className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              title="Mark cheque as cleared by bank"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              <span>Clear</span>
                            </Button>
                          )}

                          {(c.status === 'received' || c.status === 'deposited') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAction(c, 'bounced')}
                              className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50"
                              title="Record cheque bounce and reverse bank balance"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          {c.status !== 'cancelled' && c.status !== 'cleared' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAction(c, 'cancelled')}
                              className="h-7 px-2 text-xs text-zinc-400 hover:text-red-500"
                              title="Cancel cheque"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </>
                      )}

                      {/* Workflow Actions for Issued Cheques */}
                      {c.cheque_type === 'issued' && (
                        <>
                          {(c.status === 'issued' || c.status === 'presented') && (
                            <Button
                              size="sm"
                              onClick={() => handleOpenAction(c, 'cleared')}
                              className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              title="Mark cheque cleared by bank"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              <span>Clear</span>
                            </Button>
                          )}

                          {(c.status === 'issued' || c.status === 'presented') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAction(c, 'bounced')}
                              className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50"
                              title="Record cheque bounce and restore expense liability"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          {c.status !== 'cancelled' && c.status !== 'cleared' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAction(c, 'cancelled')}
                              className="h-7 px-2 text-xs text-zinc-400 hover:text-red-500"
                              title="Cancel / void cheque"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination Footer */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <div>
            Page {page + 1} of {Math.ceil(totalCount / pageSize)} ({totalCount} total)
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="text-xs h-7"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * pageSize >= totalCount}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs h-7"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* MODAL 1: Record Received Cheque */}
      <Modal
        isOpen={recordReceivedModalOpen}
        onClose={() => setRecordReceivedModalOpen(false)}
        title="Record Inward Received Cheque"
      >
        <form onSubmit={handleRecordReceived} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Cheque Number *
              </label>
              <Input
                value={recvChequeNumber}
                onChange={(e) => setRecvChequeNumber(e.target.value)}
                placeholder="e.g. 104829"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Amount (LKR) *
              </label>
              <Input
                type="number"
                step="0.01"
                value={recvAmount}
                onChange={(e) => setRecvAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
              Payer / Organization Name *
            </label>
            <Input
              value={recvPayerName}
              onChange={(e) => setRecvPayerName(e.target.value)}
              placeholder="e.g. Ministry of Education / Past Pupils Association"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Issuing Bank *
              </label>
              <Input
                value={recvIssuingBank}
                onChange={(e) => setRecvIssuingBank(e.target.value)}
                placeholder="e.g. Bank of Ceylon / Commercial Bank"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Branch Name
              </label>
              <Input
                value={recvIssuingBranch}
                onChange={(e) => setRecvIssuingBranch(e.target.value)}
                placeholder="e.g. Kandy Branch"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Cheque Date *
              </label>
              <Input
                type="date"
                value={recvChequeDate}
                onChange={(e) => setRecvChequeDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Received Date
              </label>
              <Input
                type="date"
                value={recvReceivedDate}
                onChange={(e) => setRecvReceivedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Expected Deposit
              </label>
              <Input
                type="date"
                value={recvExpectedDepositDate}
                onChange={(e) => setRecvExpectedDepositDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
              Related Donation / Fund Category (Optional)
            </label>
            <select
              value={recvCategoryId || ''}
              onChange={(e) => setRecvCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            >
              <option value="">-- None (General Received Cheque) --</option>
              {fundCategories.map((fc) => (
                <option key={fc.id} value={fc.id}>
                  {fc.name_en} ({fc.category_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
              Description / Purpose
            </label>
            <Input
              value={recvDescription}
              onChange={(e) => setRecvDescription(e.target.value)}
              placeholder="e.g. Annual science lab donation grant"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRecordReceivedModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={submittingAction}>
              Save Cheque
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Deposit Cheque */}
      <Modal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        title="Deposit Cheque to School Bank Account"
      >
        {selectedCheque && (
          <form onSubmit={handleDepositSubmit} className="space-y-3.5 text-xs">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg space-y-1 border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Cheque Number:</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  #{selectedCheque.cheque_number}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Payer:</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{selectedCheque.payer_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Amount:</span>
                <span className="font-mono font-bold text-emerald-600 text-sm">
                  Rs. {formatLKR(selectedCheque.amount_cents)}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 text-xs flex items-center space-x-2">
              <Landmark className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Depositing into institutional account: <strong>{bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})</strong></span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Actual Deposit Date *
                </label>
                <Input
                  type="date"
                  value={depDate}
                  onChange={(e) => setDepDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Deposit Reference / Slip #
                </label>
                <Input
                  value={depReference}
                  onChange={(e) => setDepReference(e.target.value)}
                  placeholder="e.g. SLIP-8910"
                />
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 italic">
              Depositing will credit the receiving bank account ledger and update the Unified Cash Book automatically.
            </p>

            <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDepositModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={submittingAction}>
                Confirm Deposit
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 3: Issue New Cheque */}
      <Modal
        isOpen={recordIssuedModalOpen}
        onClose={() => setRecordIssuedModalOpen(false)}
        title="Issue New Outward Cheque"
      >
        <form onSubmit={handleRecordIssued} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium">
                Issuing Account
              </label>
              <div className="px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-800 dark:text-zinc-200 font-medium">
                {bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})
              </div>
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Cheque Number *
              </label>
              <Input
                value={issueChequeNumber}
                onChange={(e) => setIssueChequeNumber(e.target.value)}
                placeholder="e.g. 700124"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Payee Name *
              </label>
              <Input
                value={issuePayeeName}
                onChange={(e) => setIssuePayeeName(e.target.value)}
                placeholder="e.g. Ceylon Electricity Board / Supplier Ltd"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Amount (LKR) *
              </label>
              <Input
                type="number"
                step="0.01"
                value={issueAmount}
                onChange={(e) => setIssueAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Issue Date *
              </label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Cheque Date *
              </label>
              <Input
                type="date"
                value={issueChequeDate}
                onChange={(e) => setIssueChequeDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
              Annual Budget Subcategory *
            </label>
            <select
              value={issueBudgetCatId || ''}
              onChange={(e) => setIssueBudgetCatId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              required
            >
              <option value="">-- Select Budget Category --</option>
              {budgetCategories.map((bc) => (
                <option key={bc.category_id} value={bc.category_id}>
                  {bc.category_code} - {bc.category_name} (Remaining: Rs. {formatLKR(bc.remaining_amount_cents || 0)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
              Description / Notes
            </label>
            <Input
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="e.g. Payment for term exam printing papers"
            />
          </div>

          <p className="text-[11px] text-zinc-500 italic">
            Issuing this cheque debits the selected bank account ledger and marks the budget expense as paid without duplication.
          </p>

          <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRecordIssuedModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={submittingAction}>
              Issue Cheque
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Action Modal (Present, Clear, Bounce, Cancel) */}
      <Modal
        isOpen={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        title={
          actionType === 'cleared'
            ? 'Record Bank Clearance'
            : actionType === 'bounced'
            ? 'Record Cheque Bounce (Reversal)'
            : 'Cancel / Void Cheque'
        }
      >
        {selectedCheque && (
          <form onSubmit={handleActionSubmit} className="space-y-3.5 text-xs">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg space-y-1 border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Cheque Number:</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  #{selectedCheque.cheque_number}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">
                  {selectedCheque.cheque_type === 'received' ? 'Payer:' : 'Payee:'}
                </span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {selectedCheque.payer_name || selectedCheque.payee_name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Amount:</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  Rs. {formatLKR(selectedCheque.amount_cents)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                {actionType === 'cleared'
                  ? 'Bank Clearance Date *'
                  : actionType === 'bounced'
                  ? 'Bounce Date *'
                  : 'Cancellation Date *'}
              </label>
              <Input
                type="date"
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
                required
              />
            </div>

            {actionType === 'cleared' && selectedCheque.cheque_type === 'received' && (
              <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2">
                <Landmark className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Clearing into institutional account: <strong>{bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})</strong></span>
              </div>
            )}

            {actionType === 'cleared' && selectedCheque.cheque_type === 'issued' && (
              <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Marking cheque as cleared and verified from bank statement. (No duplicate bank deduction will occur).</span>
              </div>
            )}

            {(actionType === 'bounced' || actionType === 'cancelled') && (
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Reason for {actionType === 'bounced' ? 'Bounce' : 'Cancellation'} *
                </label>
                <Input
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="e.g. Insufficient funds / Payment stopped / Incorrect signature"
                  required
                />
              </div>
            )}

            {actionType === 'bounced' && (
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Cheque Return Fee / අගරු ගාස්තුව (LKR)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={actionBounceFee}
                  onChange={(e) => setActionBounceFee(e.target.value)}
                  placeholder="0.00 (e.g. 500.00)"
                />
              </div>
            )}

            {actionType === 'bounced' && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-[11px] flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Financial Effect:</strong> Recording this bounce will automatically post a bank reversal entry and restore the related fund/expense balance to maintain financial integrity.
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActionModalOpen(false)}
              >
                Close
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={actionType === 'bounced' || actionType === 'cancelled' ? 'destructive' : 'default'}
                isLoading={submittingAction}
              >
                Confirm {actionType.toUpperCase()}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 5: Cheque Detail & Audit History */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Cheque Details & Audit Trail"
      >
        {selectedChequeDetail && (
          <div className="space-y-4 text-xs">
            {/* Meta Card */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg space-y-2 border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <div>
                  <span className="text-zinc-500 font-medium mr-2">Type:</span>
                  <span className="font-semibold uppercase text-zinc-900 dark:text-zinc-100">
                    {selectedChequeDetail.cheque.cheque_type}
                  </span>
                </div>
                <div>{getStatusBadge(selectedChequeDetail.cheque.status)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-zinc-500">Cheque #:</span>{' '}
                  <span className="font-mono font-bold">{selectedChequeDetail.cheque.cheque_number}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Amount:</span>{' '}
                  <span className="font-mono font-bold text-emerald-600">
                    Rs. {formatLKR(selectedChequeDetail.cheque.amount_cents)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Cheque Date:</span> {selectedChequeDetail.cheque.cheque_date}
                </div>
                <div>
                  <span className="text-zinc-500">Recorded On:</span>{' '}
                  {selectedChequeDetail.cheque.received_date || selectedChequeDetail.cheque.issue_date}
                </div>
                {selectedChequeDetail.cheque.payer_name && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Payer:</span> {selectedChequeDetail.cheque.payer_name}
                  </div>
                )}
                {selectedChequeDetail.cheque.payee_name && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Payee:</span> {selectedChequeDetail.cheque.payee_name}
                  </div>
                )}
                {selectedChequeDetail.cheque.deposit_bank_name && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Deposit Bank:</span> {selectedChequeDetail.cheque.deposit_bank_name} ({selectedChequeDetail.cheque.deposit_account_number})
                  </div>
                )}
                {selectedChequeDetail.cheque.issuing_bank_name && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Issuing Bank:</span> {selectedChequeDetail.cheque.issuing_bank_name}
                  </div>
                )}
              </div>
            </div>

            {/* Audit History Timeline */}
            <div>
              <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center space-x-1.5">
                <History className="w-3.5 h-3.5 text-zinc-400" />
                <span>Audit & State Transitions History</span>
              </h4>

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-3 py-1.5">Date & Time</th>
                      <th className="px-3 py-1.5">Action</th>
                      <th className="px-3 py-1.5">User</th>
                      <th className="px-3 py-1.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {selectedChequeDetail.auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                        <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">{log.created_at}</td>
                        <td className="px-3 py-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                          {log.action}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">
                          {log.creator_name || 'System'}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{log.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-zinc-200 dark:border-zinc-800">
              <Button size="sm" variant="outline" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
