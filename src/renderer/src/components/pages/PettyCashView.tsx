import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Coins,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Printer,
  Building2,
  Receipt,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  X,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { PettyCashVoucher, FinancialYear, BankAccount, BudgetCategory } from '../../../shared/types/finance';

export const PettyCashView: React.FC = () => {
  const { t: tCommon, i18n } = useTranslation('common');
  const { t: tFinance } = useTranslation('finance');
  const { success, error: toastError, warning } = useToast();

  const [vouchers, setVouchers] = useState<PettyCashVoucher[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'replenishment'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // KPIs
  const [kpi, setKpi] = useState({
    balanceCents: 0,
    totalReplenishedCents: 0,
    totalDisbursedCents: 0,
    expenseCount: 0,
    replenishCount: 0,
  });

  // Replenish Modal State (Locked to Institutional Bank: Bank of Ceylon)
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [repDate, setRepDate] = useState(new Date().toISOString().split('T')[0]);
  const [repAmount, setRepAmount] = useState('');
  const [repRef, setRepRef] = useState('');
  const [repDesc, setRepDesc] = useState('Petty cash imprest monthly replenishment');

  // Dedicated Petty Cash Expense Modal State
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expSubmitting, setExpSubmitting] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expPayee, setExpPayee] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expCategoryId, setExpCategoryId] = useState<number>(0);
  const [expAmount, setExpAmount] = useState('');
  const [expReceiptNo, setExpReceiptNo] = useState('');
  const [expNotes, setExpNotes] = useState('');

  // Category search & quick-create in petty cash
  const [catSearch, setCatSearch] = useState('');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [quickCreatingCat, setQuickCreatingCat] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const offset = (page - 1) * pageSize;
        const [pRes, yRes, bRes, cRes] = await Promise.all([
          window.curtissApi.financial.getPettyCash(pageSize, offset, selectedYearId, {
            search: searchTerm,
            type: typeFilter,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
          }),
          window.curtissApi.financial.getYears(),
          window.curtissApi.financial.getBankAccounts(),
          window.curtissApi.financial.getBudgetCategories(selectedYearId),
        ]);

        if (pRes.success && pRes.data) {
          setVouchers(pRes.data.vouchers || []);
          setTotalCount(pRes.data.total || 0);
          setKpi({
            balanceCents: pRes.data.balanceCents ?? 0,
            totalReplenishedCents: pRes.data.totalReplenishedCents ?? 0,
            totalDisbursedCents: pRes.data.totalDisbursedCents ?? 0,
            expenseCount: pRes.data.expenseCount ?? 0,
            replenishCount: pRes.data.replenishCount ?? 0,
          });
        }
        if (yRes.success && yRes.data) {
          setYears(yRes.data);
          const curr = yRes.data.find((y: FinancialYear) => y.is_current);
          if (curr && selectedYearId === 1) setSelectedYearId(curr.id);
        }
        if (bRes.success && bRes.data && bRes.data.length > 0) {
          setBankAccounts(bRes.data);
        }
        if (cRes.success && cRes.data) {
          setCategories(cRes.data);
          if (cRes.data.length > 0 && expCategoryId === 0) {
            setExpCategoryId(cRes.data[0].id);
          }
        }
      }
    } catch (err: any) {
      toastError('Failed to load petty cash', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYearId, page, pageSize, typeFilter, startDate, endDate]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      loadData();
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return categories;
    const q = catSearch.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.category_code.toLowerCase().includes(q) ||
        (c.name_en && c.name_en.toLowerCase().includes(q)) ||
        (c.name_si && c.name_si.includes(q))
    );
  }, [categories, catSearch]);

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === expCategoryId);
  }, [categories, expCategoryId]);

  const selectedCategoryRemainingCents = useMemo(() => {
    if (!selectedCategory) return 0;
    const approved = selectedCategory.approved_amount_cents || 0;
    const spent = selectedCategory.spent_amount_cents || 0;
    return approved - spent;
  }, [selectedCategory]);

  const hasExactCategoryMatch = categories.some(
    (c) => (c.name_en && c.name_en.toLowerCase() === catSearch.trim().toLowerCase()) ||
           (c.name_si && c.name_si === catSearch.trim())
  );
  const showCategoryQuickCreate = Boolean(catSearch.trim() && !hasExactCategoryMatch);

  const handleQuickCreateCategory = async () => {
    const clean = catSearch.trim();
    if (!clean) return;
    setQuickCreatingCat(true);
    try {
      if (window.curtissApi?.financial?.quickCreateCategory) {
        const res = await window.curtissApi.financial.quickCreateCategory(clean);
        if (res.success && res.data) {
          // Rule 7: Automatically reload, select, and apply the newly created category
          const cRes = await window.curtissApi.financial.getBudgetCategories(selectedYearId);
          if (cRes.success && cRes.data) {
            setCategories(cRes.data);
          }
          setExpCategoryId(res.data.id);
          setCatSearch('');
          setCatDropdownOpen(false);
          success('Category Created & Applied', `"${clean}" (${res.data.category_code}) automatically selected.`);
        } else {
          toastError('Could not save category', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setQuickCreatingCat(false);
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(expAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toastError('Invalid Amount', 'Please provide a valid expense amount.');
      return;
    }
    const cents = Math.round(amountVal * 100);

    if (cents > kpi.balanceCents) {
      toastError('Insufficient Petty Cash', `Available float is Rs. ${(kpi.balanceCents / 100).toFixed(2)}. Expense cannot exceed available float.`);
      return;
    }

    if (selectedCategory && cents > selectedCategoryRemainingCents) {
      toastError('Exceeds Budget Ceiling', `Budget subcategory "${selectedCategory.category_code}" only has Rs. ${(selectedCategoryRemainingCents / 100).toFixed(2)} remaining.`);
      return;
    }

    if (!expPayee.trim() || !expDesc.trim()) {
      toastError('Validation Error', 'Payee and expense description are required.');
      return;
    }

    setExpSubmitting(true);
    try {
      const res = await window.curtissApi.financial.recordPettyCashExpense({
        financial_year_id: selectedYearId,
        category_id: expCategoryId,
        expense_date: expDate,
        payee: expPayee.trim(),
        description: expDesc.trim(),
        amount_cents: cents,
        receipt_no: expReceiptNo.trim() || undefined,
        notes: expNotes.trim() || undefined,
      });

      if (res.success) {
        success('Petty Cash Expense Recorded', `Voucher ${res.data.voucher_no} recorded and deducted from float.`);
        setExpenseModalOpen(false);
        setExpPayee('');
        setExpDesc('');
        setExpAmount('');
        setExpReceiptNo('');
        setExpNotes('');
        loadData();
      } else {
        toastError('Failed to record expense', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setExpSubmitting(false);
    }
  };

  // Replenishment exclusively drawn from institutional Bank Account (Rule 1 & Bank Simplification)
  const handleReplenish = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(repAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toastError('Invalid Amount', 'Please provide a valid replenishment amount.');
      return;
    }

    setSubmitting(true);
    try {
      const cents = Math.round(amountVal * 100);
      const res = await window.curtissApi.financial.replenishPettyCash({
        financial_year_id: selectedYearId,
        voucher_date: repDate,
        amount_cents: cents,
        description: repDesc,
        source_type: 'bank',
        bank_account_id: bankAccounts[0]?.id || 1,
        reference_no: repRef.trim() || undefined,
      });

      if (res.success) {
        success('Petty Cash Float Replenished', 'Float replenished from Bank of Ceylon operating account.');
        setModalOpen(false);
        setRepAmount('');
        setRepRef('');
        loadData();
      } else {
        toastError('Failed to replenish', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      <PageHeader
        title={tFinance('pettycash.title')}
        subtitle="Imprest float ledger, voucher disbursements, and institutional bank replenishment"
        badge={
          <Badge variant="warning" size="md">
            <Coins className="w-3.5 h-3.5 mr-1 inline" />
            {tFinance('pettycash.badge')}
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={loadData} isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} title="Print Petty Cash Statement">
              <Printer className="w-3.5 h-3.5 mr-1" />
              <span>Print</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Replenish Float</span>
            </Button>
            <Button size="sm" onClick={() => { setCatSearch(''); setCatDropdownOpen(false); setExpenseModalOpen(true); }}>
              <Receipt className="w-3.5 h-3.5 mr-1" />
              <span>Record Expense</span>
            </Button>
          </div>
        }
      />

      {/* 4 Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Balance */}
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-medium">Available Float Balance</span>
              <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className={`text-xl font-bold tracking-tight mt-1 ${kpi.balanceCents >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
              Rs. {(kpi.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center space-x-1">
              {kpi.balanceCents < 500000 ? (
                <span className="text-amber-500 font-semibold flex items-center">
                  <AlertTriangle className="w-3 h-3 mr-0.5 inline" /> Low Float Warning
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">Float Healthy</span>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Total Replenishments (+ Inflows) */}
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-medium">Float Replenished</span>
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400 mt-1">
              + Rs. {(kpi.totalReplenishedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {kpi.replenishCount} replenishment events from Bank
            </div>
          </CardHeader>
        </Card>

        {/* Total Disbursed (- Expenses) */}
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-medium">Total Disbursed</span>
              <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400 mt-1">
              - Rs. {(kpi.totalDisbursedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {kpi.expenseCount} voucher expenses approved
            </div>
          </CardHeader>
        </Card>

        {/* Total Vouchers Activity */}
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-medium">Voucher Ledger Activity</span>
              <Receipt className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
              {totalCount} {tCommon('labels.records')}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Filtered in current selection
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Filter & Search Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search voucher #, payee, desc, receipt #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Movement Type Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as 'all' | 'expense' | 'replenishment');
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium"
              >
                <option value="all">All Movements</option>
                <option value="expense">Expenses Only (- Outflow)</option>
                <option value="replenishment">Replenishments (+ Inflow)</option>
              </select>
            </div>

            {/* Financial Year Selector */}
            {years.length > 0 && (
              <select
                value={selectedYearId}
                onChange={(e) => {
                  setSelectedYearId(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year_name} {y.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Date Range Filters */}
            <div className="flex items-center space-x-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                title="Start Date"
              />
              <span className="text-zinc-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                title="End Date"
              />
            </div>

            {/* Reset Filters */}
            {(searchTerm || typeFilter !== 'all' || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-xs text-zinc-500">
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}

            {/* Page Size Selector */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
            >
              <option value={15}>15 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Vouchers Table */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Coins className="w-4 h-4 text-zinc-400" />
            <span>Petty Cash Imprest Ledger</span>
          </CardTitle>
          <span className="text-xs text-zinc-500">
            Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} records
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('pettycash.voucherNo')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('pettycash.date')}</th>
                  <th className="py-2.5 px-3 font-semibold">Movement / Category</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('pettycash.payee')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tCommon('labels.description')}</th>
                  <th className="py-2.5 px-3 font-semibold">Receipt / Ref</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{tFinance('pettycash.amount')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('pettycash.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-zinc-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Coins className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                        <span className="font-medium">No petty cash vouchers match the current filters.</span>
                        <span className="text-[11px] text-zinc-500">Try adjusting your search criteria or record a new transaction.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  vouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {v.voucher_no}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{v.voucher_date}</td>
                      <td className="py-2.5 px-3">
                        {v.type === 'replenishment' || v.type === 'transfer_in' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                            <TrendingUp className="w-3 h-3 mr-1 text-blue-600" />
                            + Float Replenish
                          </span>
                        ) : (
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {v.category_code && (
                              <span className="font-mono text-[11px] px-1 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 mr-1.5 font-semibold">
                                {v.category_code}
                              </span>
                            )}
                            <span>{i18n.language === 'si' && v.category_name_si ? v.category_name_si : (v.category_name_en || 'Petty Cash Expense')}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-900 dark:text-zinc-100 font-medium">{v.payee}</td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 max-w-xs truncate">
                        <div>{v.description}</div>
                        {v.notes && <div className="text-[10px] text-zinc-400 truncate">{v.notes}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">
                        {v.receipt_no ? (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            {v.receipt_no}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono font-semibold ${v.type === 'replenishment' || v.type === 'transfer_in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {v.type === 'replenishment' || v.type === 'transfer_in' ? '+' : '-'} Rs. {(v.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="success" size="sm">
                          <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                          Approved
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 text-xs">
              <span className="text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center space-x-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2 py-1"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Replenish Float Modal (Institutional Bank Drawn Only) */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Replenish Petty Cash Float" maxWidth="md">
        <form onSubmit={handleReplenish} className="space-y-4">
          {/* Institutional Single Bank Account Notice */}
          <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-200 text-xs flex items-center space-x-2.5">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <span className="font-semibold">Institutional Bank Source: </span>
              <span>{bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})</span>
              <div className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">
                Imprest replenishment withdrawals are drawn strictly from the primary school bank account. Cash-in-hand replenishment is disabled.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={tFinance('expenses.expenseDate')}
              type="date"
              value={repDate}
              onChange={(e) => setRepDate(e.target.value)}
              required
            />
            <Input
              label={tFinance('expenses.amountLkr')}
              type="number"
              step="0.01"
              value={repAmount}
              onChange={(e) => setRepAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <Input
            label="Cheque / Withdrawal Reference #"
            value={repRef}
            onChange={(e) => setRepRef(e.target.value)}
            placeholder="e.g. CHQ-99042 or Bank Slip #"
          />

          <Input
            label={tCommon('labels.description')}
            value={repDesc}
            onChange={(e) => setRepDesc(e.target.value)}
            placeholder="e.g. Petty cash monthly float replenishment"
            required
          />

          <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              {tFinance('expenses.cancel')}
            </Button>
            <Button type="submit" isLoading={submitting}>
              <span>Replenish from Bank</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Petty Cash Expense Dedicated Modal */}
      <Modal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title="Record Petty Cash Expense Voucher"
        maxWidth="md"
      >
        <form onSubmit={handleRecordExpense} className="space-y-4">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs flex items-center justify-between">
            <span className="text-zinc-500">Available Float Balance:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              Rs. {(kpi.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={tFinance('expenses.expenseDate')}
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              required
            />
            <Input
              label={tFinance('expenses.amountLkr')}
              type="number"
              step="0.01"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Budget Subcategory Selection with Search & Quick-Create */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Approved Budget Subcategory
              </label>
              {selectedCategory && (
                <span className="text-[11px] font-mono text-zinc-500">
                  Remaining: Rs. {(selectedCategoryRemainingCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            <div className="relative">
              <div
                tabIndex={0}
                onClick={() => setCatDropdownOpen(!catDropdownOpen)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer flex items-center justify-between text-xs hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {selectedCategory ? (
                  <div className="flex items-center space-x-2">
                    <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold text-[11px]">
                      {selectedCategory.category_code}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {i18n.language === 'si' && selectedCategory.name_si ? selectedCategory.name_si : (selectedCategory.name_en || selectedCategory.name)}
                    </span>
                  </div>
                ) : (
                  <span className="text-zinc-400">Select an approved budget subcategory...</span>
                )}
                <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              </div>

              {catDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-2 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                    <input
                      ref={catInputRef}
                      type="text"
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      placeholder="Search subcategories..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredCategories.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setExpCategoryId(c.id);
                          setCatDropdownOpen(false);
                          setCatSearch('');
                        }}
                        className={`p-2 cursor-pointer flex items-center justify-between text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded ${
                          c.id === expCategoryId ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold' : ''
                        }`}
                      >
                        <div>
                          <span className="font-mono font-semibold text-[11px] mr-1.5 text-zinc-600 dark:text-zinc-400">
                            {c.category_code}
                          </span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {i18n.language === 'si' && c.name_si ? c.name_si : (c.name_en || c.name)}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-400">
                          Rs. {((c.approved_amount_cents - c.spent_amount_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}

                    {showCategoryQuickCreate && (
                      <div
                        onClick={handleQuickCreateCategory}
                        className="p-2 cursor-pointer text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded flex items-center justify-between mt-1"
                      >
                        <div className="flex items-center space-x-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span className="font-semibold">+ Quick-Create "{catSearch.trim()}"</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{quickCreatingCat ? 'Creating...' : 'Click to save & select'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={tFinance('expenses.payeeLabel')}
              value={expPayee}
              onChange={(e) => setExpPayee(e.target.value)}
              placeholder="e.g. Stationery Store"
              required
            />
            <Input
              label="Receipt / Bill / Reference #"
              value={expReceiptNo}
              onChange={(e) => setExpReceiptNo(e.target.value)}
              placeholder="e.g. REC-88392"
            />
          </div>

          <Input
            label={tFinance('expenses.descLabel')}
            value={expDesc}
            onChange={(e) => setExpDesc(e.target.value)}
            placeholder="e.g. Emergency office supplies purchase"
            required
          />

          <Input
            label="Notes / Remarks"
            value={expNotes}
            onChange={(e) => setExpNotes(e.target.value)}
            placeholder="Optional remarks..."
          />

          <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => setExpenseModalOpen(false)}>
              {tFinance('expenses.cancel')}
            </Button>
            <Button type="submit" isLoading={expSubmitting} disabled={categories.length === 0 || !expCategoryId}>
              <span>Post Petty Cash Expense</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
