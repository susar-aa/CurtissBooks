import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Receipt,
  Plus,
  RefreshCw,
  AlertTriangle,
  Calendar,
  ChevronDown,
  Search,
  Check,
  X,
  RotateCcw,
  CreditCard,
  Building2,
  Wallet,
  Coins,
  ChevronLeft,
  ChevronRight,
  Filter,
  Sparkles,
  Layers,
  CheckCircle2,
  TrendingDown,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { Expense, BudgetCategory, Fund, BankAccount, FinancialYear } from '../../../shared/types/finance';

const EXPENSES_PAGE_SIZE = 15;

interface ExpenseManagementViewProps {
  onNavigateCheques?: (tab: 'received' | 'issued') => void;
}

export const ExpenseManagementView: React.FC<ExpenseManagementViewProps> = ({ onNavigateCheques }) => {
  const { t: tCommon, i18n } = useTranslation('common');
  const { t: tFinance } = useTranslation('finance');
  const { success, error: toastError } = useToast();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [expensesPage, setExpensesPage] = useState(1);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Summary Metrics State
  const [summary, setSummary] = useState({
    total_count: 0,
    total_cents: 0,
    cash_cents: 0,
    bank_cents: 0,
    cheque_cents: 0,
  });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCategoryId, setFormCategoryId] = useState<number>(0);
  const [formFundId, setFormFundId] = useState<number | null>(null);
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState<'cash' | 'bank' | 'cheque'>('cash');
  const [formRef, setFormRef] = useState('');
  const [formChequeNo, setFormChequeNo] = useState('');
  const [formChequeDate, setFormChequeDate] = useState(new Date().toISOString().split('T')[0]);

  // Cancel / Reverse Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingExpense, setCancellingExpense] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Category Combobox State (Subcategories Only)
  const [catSearch, setCatSearch] = useState('');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [highlightedCatIndex, setHighlightedCatIndex] = useState(0);
  const catInputRef = useRef<HTMLInputElement>(null);
  const catDropdownRef = useRef<HTMLDivElement>(null);

  // Load Financial Years on mount — always select current active year
  useEffect(() => {
    async function initYears() {
      if (window.curtissApi?.financial?.getYears) {
        try {
          const yRes = await window.curtissApi.financial.getYears();
          if (yRes.success && yRes.data && yRes.data.length > 0) {
            setYears(yRes.data);
            const activeYear = yRes.data.find((y: FinancialYear) => y.is_current) || yRes.data[0];
            setSelectedYearId(activeYear.id);
          }
        } catch (err: any) {
          toastError('Error Loading Years', err.message);
        }
      }
    }
    initYears();
  }, []);

  // Fetch paginated expenses and categories
  const loadData = async () => {
    if (!selectedYearId) return;
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const offset = (expensesPage - 1) * EXPENSES_PAGE_SIZE;
        const [eRes, cRes, fRes, bRes] = await Promise.all([
          window.curtissApi.financial.getExpenses(
            EXPENSES_PAGE_SIZE,
            offset,
            selectedYearId,
            categoryFilter === 'all' ? undefined : categoryFilter,
            searchQuery.trim() || undefined,
            methodFilter === 'all' ? undefined : methodFilter,
            statusFilter === 'all' ? undefined : statusFilter,
            dateFrom || undefined,
            dateTo || undefined
          ),
          window.curtissApi.financial.getBudgetCategories(selectedYearId),
          window.curtissApi.financial.getFunds(),
          window.curtissApi.financial.getBankAccounts(),
        ]);

        if (eRes.success && eRes.data) {
          setExpenses(eRes.data.expenses || []);
          setExpensesTotal(eRes.data.total || 0);
          if (eRes.data.summary) {
            setSummary(eRes.data.summary);
          }
        }
        if (cRes.success && cRes.data) {
          setCategories(cRes.data);
          const subs = cRes.data.filter((c: BudgetCategory) => c.parent_id !== null && c.parent_id !== undefined);
          if (subs.length > 0 && (!formCategoryId || !subs.some((s: BudgetCategory) => s.id === formCategoryId))) {
            setFormCategoryId(subs[0].id);
          }
        }
        if (fRes.success && fRes.data) setFunds(fRes.data);
        if (bRes.success && bRes.data) setBankAccounts(bRes.data);
      }
    } catch (err: any) {
      toastError('Failed to load expenses', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedYearId) {
      loadData();
    }
  }, [selectedYearId, expensesPage, categoryFilter, methodFilter, statusFilter, dateFrom, dateTo]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedYearId) {
        setExpensesPage(1);
        loadData();
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Only subcategories (leaf categories with parent_id) can be selected for recording expenses
  const subcategories = useMemo(() => {
    return categories.filter((c) => c.parent_id !== null && c.parent_id !== undefined);
  }, [categories]);

  // Filter subcategories for searchable combobox
  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return subcategories;
    const query = catSearch.toLowerCase().trim();
    return subcategories.filter(
      (c) =>
        c.category_code.toLowerCase().includes(query) ||
        (c.name_en && c.name_en.toLowerCase().includes(query)) ||
        (c.name_si && c.name_si.includes(query)) ||
        (c.parent_name_en && c.parent_name_en.toLowerCase().includes(query)) ||
        (c.parent_code && c.parent_code.toLowerCase().includes(query))
    );
  }, [subcategories, catSearch]);

  const selectedCategory = useMemo(() => {
    return subcategories.find((c) => c.id === formCategoryId) || categories.find((c) => c.id === formCategoryId);
  }, [subcategories, categories, formCategoryId]);

  const activeFinancialYear = useMemo(() => {
    return years.find((y) => y.id === selectedYearId);
  }, [years, selectedYearId]);

  // Available remaining budget calculation for selected category
  const categoryRemainingCents = useMemo(() => {
    if (!selectedCategory) return 0;
    return Math.max(0, (selectedCategory.approved_amount_cents || 0) - (selectedCategory.spent_amount_cents || 0));
  }, [selectedCategory]);

  // Is entered amount exceeding remaining budget?
  const isOverBudget = useMemo(() => {
    if (!selectedCategory) return false;
    const entered = Math.round((parseFloat(formAmount) || 0) * 100);
    return entered > 0 && entered > categoryRemainingCents;
  }, [formAmount, categoryRemainingCents, selectedCategory]);

  // Keyboard navigation in Category Combobox
  const handleCatKeyDown = (e: React.KeyboardEvent) => {
    if (!catDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setCatDropdownOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedCatIndex((prev) => (prev + 1) % (filteredCategories.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedCatIndex((prev) => (prev - 1 + (filteredCategories.length || 1)) % (filteredCategories.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCategories[highlightedCatIndex]) {
        setFormCategoryId(filteredCategories[highlightedCatIndex].id);
        setCatDropdownOpen(false);
        setCatSearch('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCatDropdownOpen(false);
    }
  };

  // Post Expense
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) return;

    if (!formCategoryId || subcategories.length === 0) {
      toastError('Subcategory Required', 'Please select a valid budget subcategory.');
      return;
    }

    const amountVal = parseFloat(formAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toastError('Invalid Amount', 'Please provide a valid expenditure amount.');
      return;
    }
    const cleanDesc = formDesc.trim();
    if (!cleanDesc) {
      toastError('Validation Error', 'Expenditure description is required.');
      return;
    }
    if (formMethod === 'cheque') {
      if (!formChequeNo.trim()) {
        toastError('Validation Error', 'Please enter the cheque number.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const cents = Math.round(amountVal * 100);
      const singleBankId = bankAccounts[0]?.id || 1;
      const res = await window.curtissApi.financial.createExpense({
        financial_year_id: selectedYearId,
        category_id: formCategoryId,
        fund_id: formFundId,
        expense_date: formDate,
        payee: cleanDesc,
        description: cleanDesc,
        amount_cents: cents,
        payment_method: formMethod,
        bank_account_id: (formMethod === 'bank' || formMethod === 'cheque') ? singleBankId : null,
        reference_no: formRef.trim() || undefined,
        cheque_number: formMethod === 'cheque' ? formChequeNo.trim() : undefined,
        cheque_date: formMethod === 'cheque' ? formChequeDate : undefined,
      });

      if (res.success) {
        success('Expense Recorded', `Voucher ${res.data.voucher_no} posted successfully.`);
        setModalOpen(false);
        setFormDesc('');
        setFormAmount('');
        setFormRef('');
        setFormChequeNo('');
        setFormChequeDate(new Date().toISOString().split('T')[0]);
        loadData();
      } else {
        toastError('Failed to record expense', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCancelModal = (exp: Expense) => {
    setCancellingExpense(exp);
    setCancelReason('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancelExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingExpense) return;
    if (!cancelReason.trim()) {
      toastError('Validation Error', 'Please specify a reason for reversing this expense.');
      return;
    }

    setCancelling(true);
    try {
      const res = await window.curtissApi.financial.cancelExpense({
        expenseId: cancellingExpense.id,
        reason: cancelReason.trim(),
      });
      if (res.success) {
        success('Expense Reversed', `Voucher ${cancellingExpense.voucher_no} has been cancelled and reversed.`);
        setCancelModalOpen(false);
        setCancellingExpense(null);
        setCancelReason('');
        loadData();
      } else {
        toastError('Failed to Reverse Expense', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setCancelling(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(expensesTotal / EXPENSES_PAGE_SIZE));
  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    categoryFilter !== 'all' ||
    methodFilter !== 'all' ||
    statusFilter !== 'all' ||
    dateFrom ||
    dateTo
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setMethodFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setExpensesPage(1);
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto flex flex-col h-[calc(100vh-7rem)] space-y-3 select-none font-sans">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {tFinance('expenses.title')}
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {expensesTotal} {expensesTotal === 1 ? 'Voucher' : 'Vouchers'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <Button
            size="sm"
            onClick={() => {
              setCatDropdownOpen(false);
              setCatSearch('');
              setModalOpen(true);
            }}
            disabled={activeFinancialYear?.status === 'closed'}
            className="text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span>{tFinance('expenses.recordExpense')}</span>
          </Button>
        </div>
      </div>

      {/* Metric Cards — Compact Sleek Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-shrink-0">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block">Total Expenses</span>
            <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
              Rs. {(summary.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block">Cash Payments</span>
            <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
              Rs. {(summary.cash_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Wallet className="w-4 h-4" />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block">Bank Payments</span>
            <span className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
              Rs. {(summary.bank_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div
          onClick={() => onNavigateCheques?.('issued')}
          className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center justify-between shadow-xs ${
            onNavigateCheques ? 'cursor-pointer hover:border-purple-300 dark:hover:border-purple-800 transition-colors' : ''
          }`}
          title={onNavigateCheques ? 'Click to view in Cheque Management' : undefined}
        >
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 flex items-center gap-1">
              <span>Cheques Issued</span>
              {onNavigateCheques && <ArrowUpRight className="w-2.5 h-2.5 text-purple-500" />}
            </span>
            <span className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400 tabular-nums">
              Rs. {(summary.cheque_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search voucher #, description, cheque #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-2.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-colors"
          />
        </div>

        {/* Category Filter — Subcategories Only */}
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
            setExpensesPage(1);
          }}
          className="h-8 px-2.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 max-w-[200px] truncate"
        >
          <option value="all">All Subcategories</option>
          {subcategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.category_code} - {i18n.language === 'si' && c.name_si ? c.name_si : c.name_en}
            </option>
          ))}
        </select>

        {/* Payment Method Filter */}
        <select
          value={methodFilter}
          onChange={(e) => {
            setMethodFilter(e.target.value);
            setExpensesPage(1);
          }}
          className="h-8 px-2.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        >
          <option value="all">All Methods</option>
          <option value="cash">Cash in Hand</option>
          <option value="bank">Bank Transfer</option>
          <option value="cheque">Cheque</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setExpensesPage(1);
          }}
          className="h-8 px-2.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="reversed">Reversed</option>
        </select>

        {/* Date Filters */}
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setExpensesPage(1);
            }}
            className="h-8 px-2 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-mono"
            title="From Date"
          />
          <span className="text-[10px]">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setExpensesPage(1);
            }}
            className="h-8 px-2 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-mono"
            title="To Date"
          />
        </div>

        {/* Reset Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="h-8 px-2.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Expenses Table — Scrollable with Zebra Striping */}
      <div className="flex-1 min-h-0 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden flex flex-col bg-white dark:bg-zinc-900">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-3 w-28">{tFinance('expenses.voucherNo')}</th>
                <th className="py-2.5 px-3 w-24">{tFinance('expenses.date')}</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">{tFinance('expenses.budgetCategory')}</th>
                <th className="py-2.5 px-3 w-28">{tFinance('expenses.method')}</th>
                <th className="py-2.5 px-3 w-32 text-right">{tFinance('expenses.amount')}</th>
                <th className="py-2.5 px-3 w-24 text-center">{tFinance('expenses.status')}</th>
                <th className="py-2.5 px-2 w-16 text-center">{tCommon('labels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-zinc-400">
                    <Receipt className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {hasActiveFilters ? 'No expenditure vouchers match the filter criteria.' : tFinance('expenses.empty')}
                    </p>
                  </td>
                </tr>
              ) : (
                expenses.map((exp, idx) => {
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={exp.id}
                      className={`group/row transition-colors ${
                        isEven
                          ? 'bg-white dark:bg-zinc-900'
                          : 'bg-zinc-50/70 dark:bg-zinc-800/25'
                      } hover:bg-blue-50/40 dark:hover:bg-blue-950/20`}
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                        {exp.voucher_no}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500 text-[11px] tabular-nums">
                        {exp.expense_date}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-900 dark:text-zinc-100 font-medium">
                        <span className="text-xs">{exp.description || exp.payee}</span>
                        {exp.payee && exp.payee !== exp.description && exp.payee !== 'General' && (
                          <div className="text-[10px] text-zinc-400 font-normal truncate max-w-xs">{exp.payee}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold">
                            {exp.category_code}
                          </span>
                          <span className="text-xs">{i18n.language === 'si' && exp.category_name_si ? exp.category_name_si : exp.category_name_en}</span>
                        </div>
                        {exp.category_name_si && exp.category_name_en && exp.category_name_si !== exp.category_name_en && (
                          <div className="text-[10px] text-zinc-400 font-sinhala">
                            {i18n.language === 'si' ? exp.category_name_en : exp.category_name_si}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="capitalize font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                            {exp.cheque_number ? 'Cheque' : tCommon(`paymentMethods.${exp.payment_method}`, exp.payment_method.replace('_', ' '))}
                          </span>
                          {exp.cheque_number && (
                            <button
                              type="button"
                              onClick={() => onNavigateCheques?.('issued')}
                              className="text-[10px] font-mono text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center space-x-0.5 cursor-pointer text-left"
                              title="Click to view in Cheque Management (Issued Cheques)"
                            >
                              <span>#{exp.cheque_number}</span>
                              {onNavigateCheques && <ArrowUpRight className="w-2.5 h-2.5 inline" />}
                            </button>
                          )}
                          {exp.bill_no && (
                            <span className="text-[10px] text-zinc-400">
                              Bill: {exp.bill_no}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600 dark:text-red-400 text-xs tabular-nums">
                        Rs. {(exp.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={exp.status === 'approved' ? 'success' : exp.status === 'reversed' ? 'error' : 'neutral'} size="sm">
                          {tCommon(`status.${exp.status}`, exp.status.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {exp.status !== 'reversed' && (
                          <button
                            type="button"
                            onClick={() => handleOpenCancelModal(exp)}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Reverse / Cancel Expense"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Summary Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700 flex-shrink-0 text-xs">
          <span className="text-zinc-500">
            {expensesTotal === 0
              ? '0 records'
              : `Showing ${Math.min((expensesPage - 1) * EXPENSES_PAGE_SIZE + 1, expensesTotal)} to ${Math.min(expensesPage * EXPENSES_PAGE_SIZE, expensesTotal)} of ${expensesTotal} records`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpensesPage((p) => Math.max(1, p - 1))}
                disabled={expensesPage <= 1}
                className="text-xs h-7 px-2"
              >
                <ChevronLeft className="w-3 h-3 mr-0.5" />
                Previous
              </Button>
              <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 px-1">
                {expensesPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpensesPage((p) => Math.min(totalPages, p + 1))}
                disabled={expensesPage >= totalPages}
                className="text-xs h-7 px-2"
              >
                Next
                <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Record Expenditure Voucher Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={tFinance('expenses.modalTitle')}
        maxWidth="xl"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              {tFinance('expenses.cancel')}
            </Button>
            <Button
              type="submit"
              form="expense-voucher-form"
              isLoading={submitting}
              disabled={categories.length === 0 || !formCategoryId}
            >
              {tFinance('expenses.postBtn')}
            </Button>
          </>
        }
      >
        <form id="expense-voucher-form" onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
          {subcategories.length === 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">{tFinance('budget.noAllocations')}:</span>
                <p className="mt-0.5">
                  No active budget subcategories are available to record expenditures against. Please configure subcategories in Annual Budget first.
                </p>
              </div>
            </div>
          )}

          {/* Row 1: Expense Date & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label={tFinance('expenses.expenseDate')}
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              required
            />
            <Input
              label={tFinance('expenses.amountLkr')}
              type="number"
              step="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Budget Subcategory Selector (Subcategories only) */}
          <div className="space-y-1 relative" ref={catDropdownRef}>
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center space-x-1.5">
                <span>Budget Subcategory</span>
                <span className="text-[10px] text-zinc-400 font-normal">({tFinance('expenses.useKeysHint')})</span>
              </div>
            </div>

            {catDropdownOpen ? (
              <div className="relative">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                  <input
                    ref={catInputRef}
                    type="text"
                    autoFocus
                    placeholder="Search subcategory code or name..."
                    value={catSearch}
                    onChange={(e) => {
                      setCatSearch(e.target.value);
                      setHighlightedCatIndex(0);
                    }}
                    onKeyDown={handleCatKeyDown}
                    className="w-full h-9 pl-9 pr-8 rounded-lg border border-primary-500 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCatDropdownOpen(false);
                      setCatSearch('');
                    }}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl max-h-56 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredCategories.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400">
                      No budget subcategories match "{catSearch}"
                    </div>
                  ) : (
                    filteredCategories.map((c, idx) => {
                      const isSelected = c.id === formCategoryId;
                      const isHighlighted = idx === highlightedCatIndex;
                      const remCents = Math.max(0, (c.approved_amount_cents || 0) - (c.spent_amount_cents || 0));
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            setFormCategoryId(c.id);
                            setCatDropdownOpen(false);
                            setCatSearch('');
                          }}
                          onMouseEnter={() => setHighlightedCatIndex(idx)}
                          className={`px-3 py-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                            isHighlighted
                              ? 'bg-primary-50 dark:bg-primary-950/40 border-l-2 border-primary-600'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <div className="flex flex-col">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                              <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                                {c.category_code}
                              </span>
                              <span>{i18n.language === 'si' && c.name_si ? c.name_si : c.name_en}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-primary-600 inline ml-1" />}
                            </div>
                            <div className="flex items-center space-x-2 text-[10px] text-zinc-400 mt-0.5">
                              {c.parent_name_en && (
                                <span>Under: {c.parent_code ? `[${c.parent_code}] ` : ''}{c.parent_name_en}</span>
                              )}
                              {c.name_si && c.name_en && c.name_si !== c.name_en && (
                                <span className="font-sinhala">• {i18n.language === 'si' ? c.name_en : c.name_si}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right font-mono text-[11px]">
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Rem: Rs. {(remCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <div className="text-[10px] text-zinc-400">
                              Alloc: Rs. {((c.approved_amount_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div
                tabIndex={0}
                onKeyDown={handleCatKeyDown}
                onClick={() => setCatDropdownOpen(true)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer flex items-center justify-between text-xs hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-primary-500/20"
              >
                {selectedCategory ? (
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex flex-col">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                        <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                          {selectedCategory.category_code}
                        </span>
                        <span>{i18n.language === 'si' && selectedCategory.name_si ? selectedCategory.name_si : selectedCategory.name_en}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] text-zinc-400 mt-0.5">
                        {selectedCategory.parent_name_en && (
                          <span>Under: {selectedCategory.parent_code ? `[${selectedCategory.parent_code}] ` : ''}{selectedCategory.parent_name_en}</span>
                        )}
                        {selectedCategory.name_si && selectedCategory.name_en && selectedCategory.name_si !== selectedCategory.name_en && (
                          <span className="font-sinhala">• {i18n.language === 'si' ? selectedCategory.name_en : selectedCategory.name_si}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] shrink-0 ml-2">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold block">
                        Remaining: Rs. {(categoryRemainingCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        Allocated: Rs. {((selectedCategory.approved_amount_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-zinc-400">Select budget subcategory...</span>
                )}
                <ChevronDown className="w-4 h-4 text-zinc-400 ml-2 shrink-0" />
              </div>
            )}
          </div>

          {/* Real-time Over-Budget Warning Card */}
          {isOverBudget && (
            <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Budget Exceeded Warning</p>
                <p className="mt-0.5 text-[11px]">
                  Entered voucher amount (Rs. {parseFloat(formAmount).toFixed(2)}) exceeds remaining allocated budget (Rs. {(categoryRemainingCents / 100).toFixed(2)}) for category "{selectedCategory?.name_en}". Please revise the amount or transfer budget from another category.
                </p>
              </div>
            </div>
          )}

          {/* Row 3: Expenditure Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {tFinance('expenses.descLabel')} *
            </label>
            <textarea
              rows={2}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Describe reason, scope, and particulars of this payment..."
              className="w-full p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 resize-none"
              required
            />
          </div>

          {/* Row 4: Payment Method & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{tFinance('expenses.paymentMethod')}</label>
              <select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
              >
                <option value="cash">{tCommon('paymentMethods.cash')}</option>
                <option value="bank">{tCommon('paymentMethods.bank')}</option>
                <option value="cheque">{tCommon('paymentMethods.cheque')}</option>
              </select>
            </div>

            <Input
              label={formMethod === 'cheque' ? 'Additional Reference' : 'Receipt / Reference Number'}
              value={formRef}
              onChange={(e) => setFormRef(e.target.value)}
              placeholder={formMethod === 'cheque' ? 'Optional tracking reference' : 'e.g. REF-104928'}
            />
          </div>

          {/* Payment Method Details (Auto-Bound to Single Operating Account) */}
          {formMethod === 'cash' && (
            <div className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Direct cash disbursement debited from institutional <strong>Cash in Hand</strong>.</span>
            </div>
          )}

          {formMethod === 'bank' && (
            <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 text-xs flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Direct bank payment disbursed from institutional account: <strong>{bankAccounts[0]?.bank_name || 'Commercial Bank'} ({bankAccounts[0]?.account_number || 'Main Account'})</strong></span>
            </div>
          )}

          {formMethod === 'cheque' && (
            <div className="p-3 rounded-lg border border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-purple-800 dark:text-purple-300">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Cheque Issuance Details (Auto-tracks in Cheque Management)</span>
                </div>
                <span className="text-[11px] font-normal text-purple-700 dark:text-purple-400">
                  Drawn on: <strong>{bankAccounts[0]?.bank_name || 'Commercial Bank'} ({bankAccounts[0]?.account_number || 'Main Account'})</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Cheque Number *"
                  value={formChequeNo}
                  onChange={(e) => setFormChequeNo(e.target.value)}
                  placeholder="e.g. CHQ-104928"
                  required
                />
                <Input
                  type="date"
                  label="Cheque Date *"
                  value={formChequeDate}
                  onChange={(e) => setFormChequeDate(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Reverse / Cancel Expense Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => {
          if (!cancelling) {
            setCancelModalOpen(false);
            setCancellingExpense(null);
          }
        }}
        title="Reverse / Cancel Expense"
        maxWidth="md"
      >
        <form onSubmit={handleConfirmCancelExpense} className="space-y-4">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-800 dark:text-red-300 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold">Confirm Reversal of Voucher {cancellingExpense?.voucher_no}</p>
              <p className="mt-1">
                Reversing this expense will automatically restore the paid funds to the original payment source (Cash or Bank), restore the budget category allocation, and reverse all associated accounting journal entries.
              </p>
            </div>
          </div>

          <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500">Payee:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{cancellingExpense?.payee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Amount:</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-400">
                Rs. {((cancellingExpense?.amount_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Reason for Cancellation / Reversal:
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Inadvertent duplicate entry / Cheque cancelled"
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100"
              autoFocus
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => {
                setCancelModalOpen(false);
                setCancellingExpense(null);
              }}
              disabled={cancelling}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="submit"
              size="sm"
              isLoading={cancelling}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              <span>Confirm Reversal</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
