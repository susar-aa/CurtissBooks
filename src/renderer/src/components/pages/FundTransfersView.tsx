import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Building2,
  Layers,
  RefreshCw,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertCircle,
  History,
  Search,
  Filter,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import {
  FundTransfer,
  AccountBalancesSummary,
  FinancialYear,
} from '../../../shared/types/finance';

interface FundTransfersViewProps {
  permissions?: string[];
}

export const FundTransfersView: React.FC<FundTransfersViewProps> = ({ permissions = [] }) => {
  const { t } = useTranslation('finance');
  const { success, error: toastError } = useToast();

  const canCreate = permissions.length === 0 || permissions.includes('fundTransfer.create') || permissions.includes('admin');
  const canReverse = permissions.length === 0 || permissions.includes('fundTransfer.reverse') || permissions.includes('admin');

  // Active Tab: 2 transaction tabs + 1 history tab
  const [activeTab, setActiveTab] = useState<'deposit_to_bank' | 'withdraw_to_cash' | 'history'>('deposit_to_bank');

  // Balances & Data
  const [balances, setBalances] = useState<AccountBalancesSummary>({
    cashBalanceCents: 0,
    pettyCashBalanceCents: 0,
    bankAccounts: [],
    totalLiquidCents: 0,
  });
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  // Tab 1: Deposit to Bank (Cash -> Bank) Form State
  const [depDate, setDepDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [depAmount, setDepAmount] = useState<string>('');
  const [depRef, setDepRef] = useState<string>('');
  const [depDesc, setDepDesc] = useState<string>('');

  // Tab 2: Withdraw to Cash (Bank -> Cash) Form State
  const [wdrDate, setWdrDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [wdrAmount, setWdrAmount] = useState<string>('');
  const [wdrRef, setWdrRef] = useState<string>('');
  const [wdrDesc, setWdrDesc] = useState<string>('');

  // Confirmation Modal State
  const [pendingTransfer, setPendingTransfer] = useState<{
    direction: 'cash_to_bank' | 'bank_to_cash';
    transferDate: string;
    amountCents: number;
    referenceNo?: string;
    description: string;
  } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // History Tab Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'cash_to_bank' | 'bank_to_cash'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'reversed'>('all');

  // Detail Modal & Reversal Modal
  const [selectedTransfer, setSelectedTransfer] = useState<FundTransfer | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);

  // Operating Institutional Bank Account
  const bankAccount = balances.bankAccounts[0] || null;
  const bankBalanceCents = bankAccount ? bankAccount.current_balance_cents : 0;
  const cashBalanceCents = balances.cashBalanceCents;
  const totalOperatingLiquidCents = cashBalanceCents + bankBalanceCents;

  // Load balances and transfers
  const loadData = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        let typeFilterParam: string | undefined = undefined;
        if (directionFilter === 'cash_to_bank') typeFilterParam = 'cash_to_bank';
        if (directionFilter === 'bank_to_cash') typeFilterParam = 'bank_to_cash';

        const [balRes, trfRes, yRes] = await Promise.all([
          window.curtissApi.financial.getAccountBalances(selectedYearId),
          window.curtissApi.financial.getFundTransfers({
            financialYearId: selectedYearId,
            search: searchTerm.trim() || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            typeFilter: typeFilterParam,
            limit: 100,
            offset: 0,
          }),
          window.curtissApi.financial.getYears(),
        ]);

        if (balRes.success && balRes.data) {
          setBalances(balRes.data);
        }

        if (trfRes.success && trfRes.data) {
          let list = trfRes.data.transfers || [];
          if (statusFilter !== 'all') {
            list = list.filter((tx: FundTransfer) => tx.status === statusFilter);
          }
          setTransfers(list);
        }

        if (yRes.success && yRes.data) {
          setYears(yRes.data);
          const currentYear = yRes.data.find((y: FinancialYear) => y.is_current);
          if (currentYear && selectedYearId === 1) {
            setSelectedYearId(currentYear.id);
          }
        }
      }
    } catch (err: any) {
      toastError('Failed to load fund transfers', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYearId, searchTerm, dateFrom, dateTo, directionFilter, statusFilter]);

  // Handle Cash to Bank Submit
  const handleOpenDepositConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round((parseFloat(depAmount) || 0) * 100);

    if (amountCents <= 0) {
      toastError('Validation Error', 'Transfer amount must be greater than zero.');
      return;
    }

    if (amountCents > cashBalanceCents) {
      toastError(
        'Insufficient Cash Balance',
        `Available cash in hand is Rs. ${(cashBalanceCents / 100).toFixed(2)}. Cannot deposit Rs. ${(amountCents / 100).toFixed(2)}.`
      );
      return;
    }

    setPendingTransfer({
      direction: 'cash_to_bank',
      transferDate: depDate,
      amountCents,
      referenceNo: depRef.trim() || undefined,
      description: depDesc.trim() || 'Cash deposit into Bank of Ceylon',
    });
    setConfirmModalOpen(true);
  };

  // Handle Bank to Cash Submit
  const handleOpenWithdrawConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round((parseFloat(wdrAmount) || 0) * 100);

    if (amountCents <= 0) {
      toastError('Validation Error', 'Transfer amount must be greater than zero.');
      return;
    }

    if (amountCents > bankBalanceCents) {
      toastError(
        'Insufficient Bank Balance',
        `Available bank balance is Rs. ${(bankBalanceCents / 100).toFixed(2)}. Cannot withdraw Rs. ${(amountCents / 100).toFixed(2)}.`
      );
      return;
    }

    setPendingTransfer({
      direction: 'bank_to_cash',
      transferDate: wdrDate,
      amountCents,
      referenceNo: wdrRef.trim() || undefined,
      description: wdrDesc.trim() || 'Cash withdrawal from Bank of Ceylon',
    });
    setConfirmModalOpen(true);
  };

  // Execute Transfer
  const handleExecuteTransfer = async () => {
    if (!pendingTransfer) return;
    setSubmitting(true);
    try {
      if (window.curtissApi?.financial?.createFundTransfer) {
        const isDep = pendingTransfer.direction === 'cash_to_bank';
        const res = await window.curtissApi.financial.createFundTransfer({
          financial_year_id: selectedYearId,
          transfer_date: pendingTransfer.transferDate,
          source_account_type: isDep ? 'cash' : 'bank',
          source_bank_account_id: isDep ? null : (bankAccount?.id || null),
          destination_account_type: isDep ? 'bank' : 'cash',
          destination_bank_account_id: isDep ? (bankAccount?.id || null) : null,
          amount_cents: pendingTransfer.amountCents,
          reference_no: pendingTransfer.referenceNo,
          description: pendingTransfer.description,
        });

        if (res.success && res.data) {
          success(
            isDep ? 'Cash Deposited Successfully' : 'Cash Withdrawn Successfully',
            `Rs. ${(pendingTransfer.amountCents / 100).toFixed(2)} transferred cleanly [${res.data.transfer_reference}].`
          );

          if (isDep) {
            setDepAmount('');
            setDepRef('');
            setDepDesc('');
          } else {
            setWdrAmount('');
            setWdrRef('');
            setWdrDesc('');
          }

          setConfirmModalOpen(false);
          setPendingTransfer(null);
          await loadData();
          setActiveTab('history');
        } else {
          toastError('Transfer Failed', res.error || 'Failed to execute transfer.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Reverse Transfer
  const handleConfirmReverse = async () => {
    if (!selectedTransfer) return;
    if (!reversalReason.trim()) {
      toastError('Validation Error', 'Please enter a reason for reversing this transfer.');
      return;
    }

    setReversing(true);
    try {
      if (window.curtissApi?.financial?.reverseFundTransfer) {
        const res = await window.curtissApi.financial.reverseFundTransfer({
          transferId: selectedTransfer.id,
          reason: reversalReason.trim(),
        });

        if (res.success) {
          success('Transfer Reversed', `Transfer ${selectedTransfer.transfer_reference} has been reversed and balances restored.`);
          setReverseModalOpen(false);
          setDetailModalOpen(false);
          setSelectedTransfer(null);
          setReversalReason('');
          await loadData();
        } else {
          toastError('Reversal Failed', res.error || 'Could not reverse transfer.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setReversing(false);
    }
  };

  // Projection Calculations
  const depAmtCents = Math.round((parseFloat(depAmount) || 0) * 100);
  const depProjCash = cashBalanceCents - depAmtCents;
  const depProjBank = bankBalanceCents + depAmtCents;

  const wdrAmtCents = Math.round((parseFloat(wdrAmount) || 0) * 100);
  const wdrProjBank = bankBalanceCents - wdrAmtCents;
  const wdrProjCash = cashBalanceCents + wdrAmtCents;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <ArrowLeftRight className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
              <span>Internal Fund Transfers</span>
            </h1>
            <Badge variant="outline" size="sm">Single Bank Operating Model</Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Deposit cash into bank or withdraw bank funds into cash without impacting annual budget allocations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(Number(e.target.value))}
            className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year_name} {y.is_current ? '• (Current)' : ''}
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={loadData} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Account Balances Overview (3 Cards - No Petty Cash) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cash in Hand */}
        <Card className="bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/20 dark:to-zinc-900 border-blue-200/60 dark:border-blue-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs font-medium text-zinc-500 flex items-center justify-between">
              <span>Cash in Hand</span>
              <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </span>
            <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
              Rs. {(cashBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">Available Liquid Cash for Banking</span>
          </CardHeader>
        </Card>

        {/* Operating Bank Account */}
        <Card className="bg-gradient-to-br from-purple-50/60 to-white dark:from-purple-950/20 dark:to-zinc-900 border-purple-200/60 dark:border-purple-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs font-medium text-zinc-500 flex items-center justify-between">
              <span>{bankAccount?.bank_name || 'Bank of Ceylon'}</span>
              <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </span>
            <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
              Rs. {(bankBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">
              A/C: {bankAccount?.account_number || '1004829104'} • Operating Account
            </span>
          </CardHeader>
        </Card>

        {/* Total Operating Liquid Assets */}
        <Card className="bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900 border-emerald-200/60 dark:border-emerald-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs font-medium text-zinc-500 flex items-center justify-between">
              <span>Total Operating Funds</span>
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              Rs. {(totalOperatingLiquidCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">Cash + Bank (Invariant across transfers)</span>
          </CardHeader>
        </Card>
      </div>

      {/* Modern 3-Tab Segmented Navigation */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 space-x-1">
        <button
          type="button"
          onClick={() => setActiveTab('deposit_to_bank')}
          className={`pb-2.5 px-4 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'deposit_to_bank'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 dark:border-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Deposit to Bank (Cash → Bank)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('withdraw_to_cash')}
          className={`pb-2.5 px-4 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'withdraw_to_cash'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Withdraw to Cash (Bank → Cash)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`pb-2.5 px-4 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-zinc-900 text-zinc-900 dark:text-zinc-100 dark:border-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Transfer History</span>
          <Badge variant="secondary" size="sm" className="ml-1.5">{transfers.length}</Badge>
        </button>
      </div>

      {/* TAB 1: DEPOSIT CASH TO BANK */}
      {activeTab === 'deposit_to_bank' && (
        <Card className="border-emerald-200/70 dark:border-emerald-900/40 shadow-sm">
          <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center space-x-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>Execute Cash Deposit to Bank</span>
              </CardTitle>
              <span className="text-xs font-mono text-zinc-500">
                Source: <strong>Cash in Hand</strong> (Avail: Rs. {(cashBalanceCents / 100).toFixed(2)})
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleOpenDepositConfirm} className="space-y-5">
              {/* Route Summary Pill */}
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">From (Source)</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">Cash in Hand</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 px-3 py-1 bg-white dark:bg-zinc-900 rounded-full border border-emerald-200 dark:border-emerald-800 font-semibold text-emerald-700 dark:text-emerald-400 shadow-xs">
                  <span>Depositing</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>

                <div className="flex items-center space-x-2 text-right">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">To (Destination)</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {bankAccount?.bank_name || 'Bank of Ceylon'} ({bankAccount?.account_number || '1004829104'})
                    </span>
                  </div>
                  <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>

              {/* Form Input Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Deposit Date *
                  </label>
                  <input
                    type="date"
                    value={depDate}
                    onChange={(e) => setDepDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Deposit Amount (Rs.) *
                    </label>
                    {cashBalanceCents > 0 && (
                      <button
                        type="button"
                        onClick={() => setDepAmount((cashBalanceCents / 100).toFixed(2))}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                      >
                        All Cash (Rs. {(cashBalanceCents / 100).toFixed(2)})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono text-zinc-400">Rs.</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={cashBalanceCents / 100}
                      value={depAmount}
                      onChange={(e) => setDepAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex h-9 w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Bank Deposit Slip # / Ref
                  </label>
                  <input
                    type="text"
                    value={depRef}
                    onChange={(e) => setDepRef(e.target.value)}
                    placeholder="e.g. SLIP-99042, Counter Ref"
                    className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Purpose / Description
                </label>
                <input
                  type="text"
                  value={depDesc}
                  onChange={(e) => setDepDesc(e.target.value)}
                  placeholder="e.g. Weekly canteen and school fees cash collection deposited into BOC"
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              {/* Live Projection Preview Bar */}
              {depAmtCents > 0 && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="text-zinc-500 font-sans">Cash in Hand Projected:</span>
                    <span className={`font-bold ${depProjCash < 0 ? 'text-rose-600' : 'text-zinc-800 dark:text-zinc-200'}`}>
                      Rs. {(depProjCash / 100).toFixed(2)}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                  <div className="flex items-center space-x-2">
                    <span className="text-zinc-500 font-sans">Bank Balance Projected:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Rs. {(depProjBank / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[11px] font-sans text-zinc-400">
                    Total Operating Funds: Rs. {(totalOperatingLiquidCents / 100).toFixed(2)}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  type="submit"
                  size="sm"
                  disabled={!canCreate || depAmtCents <= 0 || depAmtCents > cashBalanceCents}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                  <span>Review & Deposit Cash into Bank</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: WITHDRAW CASH FROM BANK */}
      {activeTab === 'withdraw_to_cash' && (
        <Card className="border-blue-200/70 dark:border-blue-900/40 shadow-sm">
          <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center space-x-2">
                <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                <span>Execute Bank Withdrawal to Cash</span>
              </CardTitle>
              <span className="text-xs font-mono text-zinc-500">
                Source: <strong>{bankAccount?.bank_name || 'Bank of Ceylon'}</strong> (Avail: Rs. {(bankBalanceCents / 100).toFixed(2)})
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleOpenWithdrawConfirm} className="space-y-5">
              {/* Route Summary Pill */}
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">From (Source)</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {bankAccount?.bank_name || 'Bank of Ceylon'} ({bankAccount?.account_number || '1004829104'})
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 px-3 py-1 bg-white dark:bg-zinc-900 rounded-full border border-blue-200 dark:border-blue-800 font-semibold text-blue-700 dark:text-blue-400 shadow-xs">
                  <span>Withdrawing</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>

                <div className="flex items-center space-x-2 text-right">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">To (Destination)</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">Cash in Hand</span>
                  </div>
                  <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>

              {/* Form Input Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Withdrawal Date *
                  </label>
                  <input
                    type="date"
                    value={wdrDate}
                    onChange={(e) => setWdrDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Withdrawal Amount (Rs.) *
                    </label>
                    <span className="text-[10px] text-zinc-400">
                      Max: Rs. {(bankBalanceCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono text-zinc-400">Rs.</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={bankBalanceCents / 100}
                      value={wdrAmount}
                      onChange={(e) => setWdrAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex h-9 w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Cheque # / Withdrawal Slip
                  </label>
                  <input
                    type="text"
                    value={wdrRef}
                    onChange={(e) => setWdrRef(e.target.value)}
                    placeholder="e.g. CHQ-889104 (Self), Slip #12"
                    className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Purpose / Description
                </label>
                <input
                  type="text"
                  value={wdrDesc}
                  onChange={(e) => setWdrDesc(e.target.value)}
                  placeholder="e.g. Bank cash withdrawal for cash box replenishment and campus payments"
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              {/* Live Projection Preview Bar */}
              {wdrAmtCents > 0 && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="text-zinc-500 font-sans">Bank Balance Projected:</span>
                    <span className={`font-bold ${wdrProjBank < 0 ? 'text-rose-600' : 'text-zinc-800 dark:text-zinc-200'}`}>
                      Rs. {(wdrProjBank / 100).toFixed(2)}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                  <div className="flex items-center space-x-2">
                    <span className="text-zinc-500 font-sans">Cash in Hand Projected:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      Rs. {(wdrProjCash / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[11px] font-sans text-zinc-400">
                    Total Operating Funds: Rs. {(totalOperatingLiquidCents / 100).toFixed(2)}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  type="submit"
                  size="sm"
                  disabled={!canCreate || wdrAmtCents <= 0 || wdrAmtCents > bankBalanceCents}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 mr-1" />
                  <span>Review & Withdraw Cash from Bank</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: TRANSACTION HISTORY */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <History className="w-4 h-4 text-zinc-400" />
              <span>Internal Fund Transfer Records</span>
            </CardTitle>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search ref #, description..."
                  className="h-8 pl-8 pr-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 w-48"
                />
              </div>

              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as any)}
                className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All Directions</option>
                <option value="cash_to_bank">Cash → Bank (Deposits)</option>
                <option value="bank_to_cash">Bank → Cash (Withdrawals)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="reversed">Reversed</option>
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                title="From Date"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                title="To Date"
              />

              {(searchTerm || dateFrom || dateTo || directionFilter !== 'all' || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setDateFrom('');
                    setDateTo('');
                    setDirectionFilter('all');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-blue-600 hover:underline px-1 font-semibold"
                >
                  Reset
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold w-28">Ref #</th>
                    <th className="py-2.5 px-3 font-semibold w-24">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Direction / Route</th>
                    <th className="py-2.5 px-3 font-semibold text-right w-28">Amount</th>
                    <th className="py-2.5 px-3 font-semibold">Reference / Description</th>
                    <th className="py-2.5 px-3 font-semibold w-24">Operator</th>
                    <th className="py-2.5 px-3 font-semibold w-20 text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-zinc-400 text-xs">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <History className="w-6 h-6 text-zinc-300" />
                          <span>No fund transfers found matching the criteria.</span>
                          <div className="flex space-x-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveTab('deposit_to_bank')}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              <span>Deposit Cash</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveTab('withdraw_to_cash')}
                            >
                              <ArrowDownLeft className="w-3.5 h-3.5 mr-1 text-blue-600" />
                              <span>Withdraw Cash</span>
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transfers.map((tx) => {
                      const isDeposit = tx.source_account_type === 'cash' && tx.destination_account_type === 'bank';
                      const isWithdrawal = tx.source_account_type === 'bank' && tx.destination_account_type === 'cash';

                      return (
                        <tr key={tx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {tx.transfer_reference}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-zinc-500">{tx.transfer_date}</td>
                          <td className="py-2.5 px-3">
                            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                              {isDeposit ? (
                                <>
                                  <Wallet className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span>Cash</span>
                                  <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                                  <Building2 className="w-3 h-3 text-purple-500 shrink-0" />
                                  <span>Bank</span>
                                </>
                              ) : isWithdrawal ? (
                                <>
                                  <Building2 className="w-3 h-3 text-purple-500 shrink-0" />
                                  <span>Bank</span>
                                  <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                                  <Wallet className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span>Cash</span>
                                </>
                              ) : (
                                <span>{tx.source_account_label} → {tx.destination_account_label}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            Rs. {(tx.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate">
                            {tx.reference_no && (
                              <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold mr-1.5">
                                [{tx.reference_no}]
                              </span>
                            )}
                            <span className="text-zinc-600 dark:text-zinc-400">{tx.description}</span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500 truncate">{tx.creator_name || 'Admin'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge variant={tx.status === 'completed' ? 'success' : 'danger'} size="sm">
                              {tx.status === 'completed' ? 'Completed' : 'Reversed'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTransfer(tx);
                                  setDetailModalOpen(true);
                                }}
                                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                title="View Transfer Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {tx.status === 'completed' && canReverse && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTransfer(tx);
                                    setReversalReason('');
                                    setReverseModalOpen(true);
                                  }}
                                  className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                  title="Reverse Transfer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={pendingTransfer?.direction === 'cash_to_bank' ? 'Confirm Cash Deposit to Bank' : 'Confirm Cash Withdrawal from Bank'}
        maxWidth="md"
      >
        {pendingTransfer && (
          <div className="space-y-4">
            <div className={`p-3 rounded-lg text-xs border ${
              pendingTransfer.direction === 'cash_to_bank'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
            }`}>
              {pendingTransfer.direction === 'cash_to_bank'
                ? `Depositing Rs. ${(pendingTransfer.amountCents / 100).toFixed(2)} from Cash in Hand into Bank of Ceylon (${bankAccount?.account_number || '1004829104'}).`
                : `Drawing Rs. ${(pendingTransfer.amountCents / 100).toFixed(2)} from Bank of Ceylon (${bankAccount?.account_number || '1004829104'}) into Cash in Hand.`
              }
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Transfer Date:</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{pendingTransfer.transferDate}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Source (From):</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {pendingTransfer.direction === 'cash_to_bank' ? 'Cash in Hand' : `${bankAccount?.bank_name || 'Bank of Ceylon'} (${bankAccount?.account_number || '1004829104'})`}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Destination (To):</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {pendingTransfer.direction === 'cash_to_bank' ? `${bankAccount?.bank_name || 'Bank of Ceylon'} (${bankAccount?.account_number || '1004829104'})` : 'Cash in Hand'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Amount:</span>
                <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  Rs. {(pendingTransfer.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {pendingTransfer.referenceNo && (
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Slip # / Cheque Ref:</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{pendingTransfer.referenceNo}</span>
                </div>
              )}
              {pendingTransfer.description && (
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Description:</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{pendingTransfer.description}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="outline" size="sm" onClick={() => setConfirmModalOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteTransfer}
                isLoading={submitting}
                className={pendingTransfer.direction === 'cash_to_bank' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                <span>Confirm & Execute</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Transfer Details Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Transfer Details: ${selectedTransfer?.transfer_reference || ''}`}
        maxWidth="md"
      >
        {selectedTransfer && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-bold">Transfer Ref</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{selectedTransfer.transfer_reference}</span>
              </div>
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-bold">Status</span>
                <Badge variant={selectedTransfer.status === 'completed' ? 'success' : 'danger'} size="sm">
                  {selectedTransfer.status === 'completed' ? 'Completed' : 'Reversed'}
                </Badge>
              </div>
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-bold">Transfer Date</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">{selectedTransfer.transfer_date}</span>
              </div>
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-bold">Amount</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  Rs. {(selectedTransfer.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">From (Source):</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedTransfer.source_account_label}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">To (Destination):</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedTransfer.destination_account_label}</span>
              </div>
              {selectedTransfer.reference_no && (
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">External Ref / Slip:</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{selectedTransfer.reference_no}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Description:</span>
                <span className="text-zinc-900 dark:text-zinc-100">{selectedTransfer.description}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Created By:</span>
                <span className="text-zinc-900 dark:text-zinc-100">{selectedTransfer.creator_name || 'Admin'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Created At:</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">{selectedTransfer.created_at}</span>
              </div>
            </div>

            {selectedTransfer.status === 'reversed' && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-lg space-y-1">
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                  Reversal Information
                </span>
                <div className="text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400">Reversed At: </span>
                  <span className="font-mono">{selectedTransfer.reversed_at}</span>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400">Reversed By: </span>
                  <span>{selectedTransfer.reverser_name || 'Admin'}</span>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400">Reason: </span>
                  <span className="italic">"{selectedTransfer.reversal_reason}"</span>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {selectedTransfer.status === 'completed' && canReverse && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDetailModalOpen(false);
                    setReversalReason('');
                    setReverseModalOpen(true);
                  }}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  <span>Reverse Transfer</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reversal Confirmation Modal */}
      <Modal
        isOpen={reverseModalOpen}
        onClose={() => setReverseModalOpen(false)}
        title="Reverse Fund Transfer"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-lg text-rose-800 dark:text-rose-300">
            Reversing will deduct Rs. {((selectedTransfer?.amount_cents || 0) / 100).toFixed(2)} from {selectedTransfer?.destination_account_label} and restore it back to {selectedTransfer?.source_account_label}. This action is immutable and logged in the audit trail.
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Reason for Reversal (Required)
            </label>
            <input
              type="text"
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Duplicate entry correction, cash count discrepancy"
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setReverseModalOpen(false)} disabled={reversing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmReverse}
              isLoading={reversing}
              disabled={!reversalReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              <span>Confirm Reversal</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
