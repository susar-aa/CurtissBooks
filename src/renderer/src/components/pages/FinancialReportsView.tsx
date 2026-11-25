import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  RefreshCw,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  ArrowRight,
  Receipt,
  Search,
  Filter,
  CreditCard,
  Building2,
  FileCheck,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import {
  FinancialYear,
  BudgetCategory,
  FinancialSummaryStats,
  ReimbursementVoucherOption,
  ReimbursementReportData,
} from '../../../shared/types/finance';

export const FinancialReportsView: React.FC = () => {
  const { t: tCommon } = useTranslation('common');
  const { t: tFinance } = useTranslation('finance');
  const { toast, error: toastError, success } = useToast();

  const [activeTab, setActiveTab] = useState<'trial_balance' | 'budget_vs_actual' | 'summary' | 'reimbursement'>('trial_balance');
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  // Standard Reports Data
  const [trialBalance, setTrialBalance] = useState<{ lines: any[]; totalDebitCents: number; totalCreditCents: number }>({
    lines: [],
    totalDebitCents: 0,
    totalCreditCents: 0,
  });
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [summaryStats, setSummaryStats] = useState<FinancialSummaryStats | null>(null);

  // Reimbursement Report State
  const [reimbVouchers, setReimbVouchers] = useState<ReimbursementVoucherOption[]>([]);
  const [reimbFilterMode, setReimbFilterMode] = useState<'reimbursements' | 'date_range'>('reimbursements');
  const [fromVoucherId, setFromVoucherId] = useState<number | ''>('');
  const [toVoucherId, setToVoucherId] = useState<number | ''>('');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reimbursementReport, setReimbursementReport] = useState<ReimbursementReportData | null>(null);
  const [reimbLoading, setReimbLoading] = useState(false);

  // Reimbursement Table Search & Filter
  const [reimbSearch, setReimbSearch] = useState('');
  const [reimbTypeFilter, setReimbTypeFilter] = useState<'all' | 'expense' | 'replenishment'>('all');

  const loadReportData = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const [tbRes, bRes, sRes, yRes, rvRes] = await Promise.all([
          window.curtissApi.financial.getTrialBalance(selectedYearId),
          window.curtissApi.financial.getBudgetCategories(selectedYearId),
          window.curtissApi.financial.getSummaryStats(selectedYearId),
          window.curtissApi.financial.getYears(),
          window.curtissApi.financial.getReimbursementVouchers(selectedYearId),
        ]);

        if (tbRes.success && tbRes.data) setTrialBalance(tbRes.data);
        if (bRes.success && bRes.data) setBudgetCategories(bRes.data);
        if (sRes.success && sRes.data) setSummaryStats(sRes.data);
        if (rvRes.success && rvRes.data) {
          setReimbVouchers(rvRes.data);
          if (rvRes.data.length >= 2 && fromVoucherId === '') {
            setFromVoucherId(rvRes.data[0].id);
            setToVoucherId(rvRes.data[rvRes.data.length - 1].id);
          } else if (rvRes.data.length === 1 && fromVoucherId === '') {
            setFromVoucherId(rvRes.data[0].id);
          }
        }
        if (yRes.success && yRes.data) {
          setYears(yRes.data);
          const curr = yRes.data.find((y: FinancialYear) => y.is_current);
          if (curr && selectedYearId === 1) setSelectedYearId(curr.id);
        }
      }
    } catch (err: any) {
      toastError('Failed to load financial report', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReimbursementReport = async () => {
    setReimbLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const params: any = { yearId: selectedYearId };
        if (reimbFilterMode === 'reimbursements') {
          if (fromVoucherId !== '') params.fromVoucherId = Number(fromVoucherId);
          if (toVoucherId !== '') params.toVoucherId = Number(toVoucherId);
        } else {
          params.startDate = customStartDate;
          params.endDate = customEndDate;
        }

        const res = await window.curtissApi.financial.getReimbursementReport(params);
        if (res.success && res.data) {
          setReimbursementReport(res.data);
        } else {
          toastError('Failed to load reimbursement report', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error generating report', err.message);
    } finally {
      setReimbLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [selectedYearId]);

  useEffect(() => {
    if (activeTab === 'reimbursement') {
      loadReimbursementReport();
    }
  }, [activeTab, selectedYearId, reimbFilterMode, fromVoucherId, toVoucherId, customStartDate, customEndDate]);

  const isBalanced = trialBalance.totalDebitCents === trialBalance.totalCreditCents;

  // Filtered transactions in reimbursement report
  const filteredReimbTransactions = useMemo(() => {
    if (!reimbursementReport) return [];
    return reimbursementReport.transactions.filter((tx) => {
      if (reimbTypeFilter === 'expense' && tx.type !== 'expense') return false;
      if (reimbTypeFilter === 'replenishment' && tx.type === 'expense') return false;

      if (!reimbSearch.trim()) return true;
      const q = reimbSearch.toLowerCase().trim();
      const amtStr = (tx.amount_cents / 100).toFixed(2);
      return (
        tx.voucher_no.toLowerCase().includes(q) ||
        tx.payee.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        (tx.category_code && tx.category_code.toLowerCase().includes(q)) ||
        (tx.category_name_en && tx.category_name_en.toLowerCase().includes(q)) ||
        amtStr.includes(q)
      );
    });
  }, [reimbursementReport, reimbTypeFilter, reimbSearch]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      <PageHeader
        title={tFinance('reports.title')}
        subtitle={tFinance('reports.subtitle')}
        badge={
          <Badge variant="neutral" size="md">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 inline" />
            {tFinance('reports.badge')}
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            <select
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(Number(e.target.value))}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-900 dark:text-zinc-100"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year_name} {y.is_current ? '(Active)' : ''}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={loadReportData} isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('trial_balance')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'trial_balance'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
          }`}
        >
          Trial Balance
        </button>
        <button
          onClick={() => setActiveTab('budget_vs_actual')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'budget_vs_actual'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
          }`}
        >
          Budget vs Actual Statement
        </button>
        <button
          onClick={() => setActiveTab('reimbursement')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
            activeTab === 'reimbursement'
              ? 'bg-indigo-600 text-white font-semibold shadow-xs'
              : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Reimbursement Statement</span>
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'summary'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
          }`}
        >
          Financial Summary
        </button>
      </div>

      {/* 1. TRIAL BALANCE TAB */}
      {activeTab === 'trial_balance' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Double-Entry Trial Balance</CardTitle>
            <Badge variant={isBalanced ? 'success' : 'error'} size="sm">
              {isBalanced ? (
                <>
                  <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                  Balanced (Debits = Credits)
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 mr-1 inline" />
                  Unbalanced Difference
                </>
              )}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Account Code</th>
                    <th className="py-2.5 px-3 font-semibold">Account Description</th>
                    <th className="py-2.5 px-3 font-semibold">Classification</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Debit (LKR)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Credit (LKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {trialBalance.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-zinc-400">
                        No general ledger movements posted for this financial period yet.
                      </td>
                    </tr>
                  ) : (
                    trialBalance.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3 font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                          {l.account_code}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {l.account_name_en}
                          <span className="text-[10px] text-zinc-400 ml-2 font-normal">({l.account_name_si})</span>
                        </td>
                        <td className="py-2.5 px-3 capitalize font-mono text-[11px] text-zinc-500">
                          {l.account_type}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {l.total_debit_cents > 0
                            ? (l.total_debit_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {l.total_credit_cents > 0
                            ? (l.total_credit_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t-2 border-zinc-900 dark:border-white font-mono font-bold text-xs bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    <td colSpan={3} className="py-3 px-3 uppercase text-zinc-900 dark:text-zinc-100">
                      Total Ledger Postings
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      Rs. {(trialBalance.totalDebitCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      Rs. {(trialBalance.totalCreditCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. BUDGET VS ACTUAL TAB */}
      {activeTab === 'budget_vs_actual' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Annual Budget vs Actual Expenditure Statement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Approved Ceiling</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actual Spent</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Variance / Balance</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Burn Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {budgetCategories.map((c) => {
                    const alloc = c.revised_amount_cents || c.approved_amount_cents || 0;
                    const spent = c.spent_amount_cents || 0;
                    const variance = alloc - spent;
                    const percent = alloc > 0 ? Math.round((spent / alloc) * 100) : 0;
                    return (
                      <tr key={c.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">{c.category_code} — {c.name_en}</div>
                          {c.name_si && c.name_si !== c.name_en && (
                            <div className="text-[11px] text-zinc-500 font-sinhala">{c.name_si}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-900 dark:text-zinc-100">
                          Rs. {(alloc / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                          Rs. {(spent / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          Rs. {(variance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          {percent}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. REIMBURSEMENT STATEMENT REPORT TAB */}
      {activeTab === 'reimbursement' && (
        <div className="space-y-6">
          {/* Report Filter Controls Card */}
          <Card className="border border-indigo-200/80 dark:border-indigo-900/50 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center space-x-2 text-indigo-900 dark:text-indigo-200">
                <Receipt className="w-4 h-4 text-indigo-600" />
                <span>Petty Cash Reimbursement Period Filter</span>
              </CardTitle>
              {/* Filter Mode Selector */}
              <div className="flex items-center space-x-1 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setReimbFilterMode('reimbursements')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    reimbFilterMode === 'reimbursements'
                      ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Between Reimbursements
                </button>
                <button
                  type="button"
                  onClick={() => setReimbFilterMode('date_range')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    reimbFilterMode === 'date_range'
                      ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Filter by Dates
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {reimbFilterMode === 'reimbursements' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                  {/* From Reimbursement */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      From Reimbursement Record
                    </label>
                    <select
                      value={fromVoucherId}
                      onChange={(e) => setFromVoucherId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 font-medium text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">-- Earliest Inflow / Float Inception --</option>
                      {reimbVouchers.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.voucher_no} ({v.voucher_date}) — Rs. {(v.amount_cents / 100).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* To Reimbursement */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      To Reimbursement Record
                    </label>
                    <select
                      value={toVoucherId}
                      onChange={(e) => setToVoucherId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 font-medium text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">-- Current / Latest Open Period --</option>
                      {reimbVouchers.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.voucher_no} ({v.voucher_date}) — Rs. {(v.amount_cents / 100).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Button
                      size="sm"
                      onClick={loadReimbursementReport}
                      isLoading={reimbLoading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      <span>Generate Reimbursement Statement</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                  <Input
                    label="From Date"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                  <Input
                    label="To Date"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                  <div>
                    <Button
                      size="sm"
                      onClick={loadReimbursementReport}
                      isLoading={reimbLoading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      <span>Filter Transactions by Dates</span>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statement Header & Summary KPIs */}
          {reimbursementReport && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Opening Float */}
                <Card className="border-l-4 border-l-blue-500 shadow-xs">
                  <CardContent className="p-3.5 space-y-1">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                      Opening Float Balance
                    </span>
                    <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                      Rs. {(reimbursementReport.openingFloatCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-zinc-500">Balance prior to {reimbursementReport.startDate}</div>
                  </CardContent>
                </Card>

                {/* 2. Total Reimbursed Inflows */}
                <Card className="border-l-4 border-l-emerald-500 shadow-xs">
                  <CardContent className="p-3.5 space-y-1">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                      Float Replenishments (+)
                    </span>
                    <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      + Rs. {(reimbursementReport.totalReplenishedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-zinc-500">Bank replenishments during period</div>
                  </CardContent>
                </Card>

                {/* 3. Total Expenses Disbursed */}
                <Card className="border-l-4 border-l-amber-500 shadow-xs">
                  <CardContent className="p-3.5 space-y-1">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                      Total Expenses Disbursed (-)
                    </span>
                    <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                      - Rs. {(reimbursementReport.totalDisbursedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-zinc-500">{reimbursementReport.transactions.filter(t => t.type === 'expense').length} vouchers disbursed</div>
                  </CardContent>
                </Card>

                {/* 4. Closing Float Balance */}
                <Card className="border-l-4 border-l-indigo-500 shadow-xs">
                  <CardContent className="p-3.5 space-y-1">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                      Remaining Float Balance
                    </span>
                    <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      Rs. {(reimbursementReport.closingFloatCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-semibold text-indigo-600 dark:text-indigo-400">
                      Claim Amount: Rs. {(reimbursementReport.totalDisbursedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Category Breakdown Card */}
              {reimbursementReport.categoryBreakdown.length > 0 && (
                <Card className="shadow-xs">
                  <CardHeader className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-800">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center space-x-2">
                      <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Expenditure Breakdown by Budget Category</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {reimbursementReport.categoryBreakdown.map((cat) => (
                        <div key={cat.category_id} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            <span className="truncate">{cat.category_code} {cat.category_name_en}</span>
                            <span className="text-[10px] text-zinc-500 font-normal shrink-0">({cat.voucher_count})</span>
                          </div>
                          <div className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">
                            Rs. {(cat.total_spent_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Transactions Table Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-1 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs">
                  <button
                    onClick={() => setReimbTypeFilter('all')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      reimbTypeFilter === 'all'
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    All Records ({reimbursementReport.transactions.length})
                  </button>
                  <button
                    onClick={() => setReimbTypeFilter('expense')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      reimbTypeFilter === 'expense'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20'
                    }`}
                  >
                    Expenses ({reimbursementReport.transactions.filter(t => t.type === 'expense').length})
                  </button>
                  <button
                    onClick={() => setReimbTypeFilter('replenishment')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      reimbTypeFilter === 'replenishment'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                    }`}
                  >
                    Replenishments ({reimbursementReport.transactions.filter(t => t.type !== 'expense').length})
                  </button>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search voucher #, payee, desc..."
                    value={reimbSearch}
                    onChange={(e) => setReimbSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Transactions Table */}
              <Card className="shadow-xs overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Date</th>
                          <th className="py-2.5 px-3 font-semibold">Voucher #</th>
                          <th className="py-2.5 px-3 font-semibold">Budget Category</th>
                          <th className="py-2.5 px-3 font-semibold">Type</th>
                          <th className="py-2.5 px-3 font-semibold">Payee</th>
                          <th className="py-2.5 px-3 font-semibold">Description</th>
                          <th className="py-2.5 px-3 font-semibold text-center">Receipt</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Amount (LKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {filteredReimbTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                              {tx.voucher_date}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                              {tx.voucher_no}
                            </td>
                            <td className="py-2.5 px-3">
                              {tx.category_code ? (
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                  {tx.category_code} {tx.category_name_en}
                                </span>
                              ) : (
                                <span className="text-zinc-400 italic">Float Imprest</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {tx.type === 'expense' ? (
                                <Badge variant="warning" size="sm">Disbursement</Badge>
                              ) : (
                                <Badge variant="success" size="sm">+ Replenish</Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100">
                              {tx.payee}
                            </td>
                            <td className="py-2.5 px-3 max-w-xs truncate text-zinc-600 dark:text-zinc-400">
                              {tx.description}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {tx.receipt_attached ? (
                                <Badge variant="success" size="sm">Attached</Badge>
                              ) : (
                                <span className="text-zinc-400 text-[11px]">—</span>
                              )}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                              tx.type === 'expense' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {tx.type === 'expense' ? '-' : '+'} Rs. {(tx.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}

                        {filteredReimbTransactions.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-10 text-center text-zinc-400">
                              No petty cash transactions found for the selected reimbursement criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="border-t-2 border-zinc-900 dark:border-zinc-100 font-mono font-bold text-xs bg-zinc-50 dark:bg-zinc-900/60">
                        <tr>
                          <td colSpan={7} className="py-2.5 px-3 uppercase text-zinc-800 dark:text-zinc-200">
                            Total Disbursed in this Reimbursement Period
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">
                            Rs. {(reimbursementReport.totalDisbursedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Institutional Sign-off & Audit Certification Block */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/80 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 block">
                  Institutional Imprest Reimbursement Certification
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="border-t border-zinc-400 dark:border-zinc-600 pt-2 text-center text-xs">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Prepared by (Petty Cashier)</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Signature & Date</p>
                  </div>
                  <div className="border-t border-zinc-400 dark:border-zinc-600 pt-2 text-center text-xs">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Checked & Verified (Treasurer / Bursar)</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Signature & Date</p>
                  </div>
                  <div className="border-t border-zinc-400 dark:border-zinc-600 pt-2 text-center text-xs">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Approved for Reimbursement (Principal)</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Signature & Date</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. FINANCIAL SUMMARY TAB */}
      {activeTab === 'summary' && summaryStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <span className="text-xs text-zinc-500 font-medium">Cash in Hand</span>
              <div className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
                Rs. {(summaryStats.cashBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <span className="text-xs text-zinc-500 font-medium">Consolidated Bank Funds</span>
              <div className="text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400 mt-1">
                Rs. {(summaryStats.bankBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <span className="text-xs text-zinc-500 font-medium">Petty Cash Float</span>
              <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
                Rs. {(summaryStats.pettyCashBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <span className="text-xs text-zinc-500 font-medium">Annual Budget</span>
              <div className="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400 mt-1">
                Rs. {(summaryStats.annualBudgetCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </CardHeader>
          </Card>
        </div>
      )}
    </div>
  );
};
