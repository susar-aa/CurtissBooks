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
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
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
  const [formPayee, setFormPayee] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState<'cash' | 'bank' | 'cheque'>('cash');
  const [formRef, setFormRef] = useState('');
  const [formBill, setFormBill] = useState('');
  const [formChequeNo, setFormChequeNo] = useState('');
  const [formChequeDate, setFormChequeDate] = useState(new Date().toISOString().split('T')[0]);

  // Cancel / Reverse Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingExpense, setCancellingExpense] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Category Combobox & Inline Quick-Create State
  const [catSearch, setCatSearch] = useState('');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [highlightedCatIndex, setHighlightedCatIndex] = useState(0);
  const catInputRef = useRef<HTMLInputElement>(null);
  const catDropdownRef = useRef<HTMLDivElement>(null);

  // Quick-Create Category Sub-Modal
  const [quickCreateModalOpen, setQuickCreateModalOpen] = useState(false);
  const [quickParentId, setQuickParentId] = useState<number | null>(null);
  const [quickCatCode, setQuickCatCode] = useState('');
  const [quickCatNameEn, setQuickCatNameEn] = useState('');
  const [quickCatNameSi, setQuickCatNameSi] = useState('');
  const [quickCatAlloc, setQuickCatAlloc] = useState('');
  const [quickCatDesc, setQuickCatDesc] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);

  // Load Financial Years on mount
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
          if (cRes.data.length > 0 && formCategoryId === 0) {
            setFormCategoryId(cRes.data[0].id);
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

  // Filter categories for searchable combobox
  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return categories;
    const query = catSearch.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.category_code.toLowerCase().includes(query) ||
        (c.name_en && c.name_en.toLowerCase().includes(query)) ||
        (c.name_si && c.name_si.includes(query))
    );
  }, [categories, catSearch]);

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === formCategoryId);
  }, [categories, formCategoryId]);

  const activeFinancialYear = useMemo(() => {
    return years.find((y) => y.id === selectedYearId);
  }, [years, selectedYearId]);

  // Distinct parent categories for quick-create dropdown
  const parentCategories = useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>();
    categories.forEach((c) => {
      if (c.parent_id && c.parent_code && c.parent_name_en) {
        map.set(c.parent_id, { id: c.parent_id, name: c.parent_name_en, code: c.parent_code });
      }
    });
    return Array.from(map.values());
  }, [categories]);

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

  // Open Quick-Create Sub-Modal
  const handleOpenQuickCreate = () => {
    if (parentCategories.length > 0 && !quickParentId) {
      setQuickParentId(parentCategories[0].id);
    }
    setQuickCatCode('');
    setQuickCatNameEn(catSearch.trim());
    setQuickCatNameSi('');
    setQuickCatAlloc('');
    setQuickCatDesc('');
    setQuickCreateModalOpen(true);
  };

  // Submit Quick-Create Budget Category
  const handleQuickCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) return;
    const cleanEn = quickCatNameEn.trim();
    const cleanSi = quickCatNameSi.trim();
    if (!cleanEn) {
      toastError('Validation Error', 'Category English name is required.');
      return;
    }
    if (!cleanSi) {
      toastError('Validation Error', 'Please enter the Sinhala term (සිංහල නම).');
      return;
    }

    setQuickCreating(true);
    try {
      const allocCents = Math.round((parseFloat(quickCatAlloc) || 0) * 100);
      const res = await window.curtissApi.financial.quickCreateExpenseBudgetCategory({
        financial_year_id: selectedYearId,
        name_en: cleanEn,
        name_si: cleanSi,
        parent_id: quickParentId || undefined,
        category_code: quickCatCode.trim() || undefined,
        allocated_amount_cents: allocCents,
        description: quickCatDesc.trim() || undefined,
      });

      if (res.success && res.data) {
        success('Category Created', `"${res.data.name_en}" created and selected for active financial year.`);
        const cRes = await window.curtissApi.financial.getBudgetCategories(selectedYearId);
        if (cRes.success && cRes.data) {
          setCategories(cRes.data);
        }
        setFormCategoryId(res.data.id);
        setQuickCreateModalOpen(false);
        setCatDropdownOpen(false);
        setCatSearch('');
      } else {
        toastError('Failed to Create Category', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setQuickCreating(false);
    }
  };

  // Post Expense
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) return;

    if (!formCategoryId || categories.length === 0) {
      toastError('Category Required', 'Please select a valid budget category from the active financial year.');
      return;
    }

    const amountVal = parseFloat(formAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toastError('Invalid Amount', 'Please provide a valid expenditure amount.');
      return;
    }
    if (!formPayee.trim() || !formDesc.trim()) {
      toastError('Validation Error', 'Payee and description are required.');
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
        payee: formPayee.trim(),
        description: formDesc.trim(),
        amount_cents: cents,
        payment_method: formMethod,
        bank_account_id: (formMethod === 'bank' || formMethod === 'cheque') ? singleBankId : null,
        reference_no: formRef.trim() || undefined,
        bill_no: formBill.trim() || undefined,
        cheque_number: formMethod === 'cheque' ? formChequeNo.trim() : undefined,
        cheque_date: formMethod === 'cheque' ? formChequeDate : undefined,
      });

      if (res.success) {
        success('Expense Recorded', `Voucher ${res.data.voucher_no} posted successfully.`);
        setModalOpen(false);
        setFormPayee('');
        setFormDesc('');
        setFormAmount('');
        setFormRef('');
        setFormBill('');
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
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      <PageHeader
        title={tFinance('expenses.title')}
        subtitle={tFinance('expenses.subtitle')}
        badge={
          <Badge variant="error" size="md">
            <Receipt className="w-3.5 h-3.5 mr-1 inline" />
            {tFinance('expenses.badge')}
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={loadData} isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCatDropdownOpen(false);
                setCatSearch('');
                setModalOpen(true);
              }}
              disabled={activeFinancialYear?.status === 'closed'}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {tFinance('expenses.recordExpense')}
            </Button>
          </div>
        }
      />

      {/* Active Financial Year Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-zinc-500 font-medium">{tFinance('expenses.operationalPeriod')}</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>{activeFinancialYear ? activeFinancialYear.year_name : 'Loading...'}</span>
              {activeFinancialYear?.is_current ? (
                <Badge variant="success" size="sm">{tFinance('expenses.activeRunningYear')}</Badge>
              ) : (
                <Badge variant={activeFinancialYear?.status === 'closed' ? 'neutral' : 'warning'} size="sm">
                  {tCommon(`status.${activeFinancialYear?.status}`, activeFinancialYear?.status?.toUpperCase())}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-zinc-500 font-medium">{tFinance('expenses.switchPeriod')}</span>
          <select
            value={selectedYearId || ''}
            onChange={(e) => {
              setSelectedYearId(Number(e.target.value));
              setExpensesPage(1);
            }}
            className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year_name} {y.is_current ? `★ (${tFinance('expenses.activeRunningYear')})` : `(${tCommon(`status.${y.status}`, y.status)})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards: Detailed Expenditure Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-red-500 shadow-xs">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>{tFinance('expenses.totalExpenses')}</span>
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
              Rs. {(summary.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">{summary.total_count} Vouchers Posted</span>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>Cash Payments</span>
              <Wallet className="w-3.5 h-3.5 text-amber-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400 mt-1">
              Rs. {(summary.cash_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">Institutional Cash in Hand</span>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-xs">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>Bank Payments</span>
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400 mt-1">
              Rs. {(summary.bank_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">{bankAccounts[0]?.bank_name || 'Bank'} Direct Transfers</span>
          </CardHeader>
        </Card>

        <Card
          className={`border-l-4 border-l-purple-500 shadow-xs ${onNavigateCheques ? 'cursor-pointer hover:bg-purple-50/20 dark:hover:bg-purple-950/20 transition-colors' : ''}`}
          onClick={() => onNavigateCheques?.('issued')}
          title={onNavigateCheques ? 'Click to view in Cheque Management' : undefined}
        >
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>Cheques Issued</span>
              <CreditCard className="w-3.5 h-3.5 text-purple-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-purple-600 dark:text-purple-400 mt-1">
              Rs. {(summary.cheque_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400 flex items-center space-x-1">
              <span>Tracked in Cheque Module</span>
              {onNavigateCheques && <ArrowUpRight className="w-2.5 h-2.5 text-purple-500 inline" />}
            </span>
          </CardHeader>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="shadow-xs">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search voucher #, payee, description, bill #, cheque #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-100"
              />
            </div>

            {/* Category Filter */}
            <div className="w-48">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setExpensesPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              >
                <option value="all">All Budget Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.category_code} - {c.name_en}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="w-36">
              <select
                value={methodFilter}
                onChange={(e) => {
                  setMethodFilter(e.target.value);
                  setExpensesPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              >
                <option value="all">All Methods</option>
                <option value="cash">Cash in Hand</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-32">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setExpensesPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            {/* Date Filters */}
            <div className="flex items-center space-x-1.5 text-xs text-zinc-500">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setExpensesPage(1);
                }}
                className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                title="From Date"
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setExpensesPage(1);
                }}
                className="px-2 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                title="To Date"
              />
            </div>

            {/* Reset Filters Button */}
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={handleResetFilters} className="text-xs h-7.5 px-2">
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card className="shadow-xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-zinc-400" />
              <span>{tFinance('expenses.tableTitle')} ({activeFinancialYear?.year_name})</span>
            </CardTitle>
            <span className="text-xs text-zinc-400">
              Total {expensesTotal} vouchers recorded
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/80 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.voucherNo')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.date')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.payee')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.budgetCategory')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.method')}</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{tFinance('expenses.amount')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.status')}</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{tCommon('labels.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-zinc-400">
                      {hasActiveFilters ? 'No expenditure vouchers match the filter criteria.' : tFinance('expenses.empty')}
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {exp.voucher_no}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{exp.expense_date}</td>
                      <td className="py-2.5 px-3 text-zinc-900 dark:text-zinc-100 font-medium">
                        {exp.payee}
                        <div className="text-[10px] text-zinc-400 font-normal truncate max-w-xs">{exp.description}</div>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {exp.category_code}
                          </span>
                          <span>{i18n.language === 'si' && exp.category_name_si ? exp.category_name_si : exp.category_name_en}</span>
                        </div>
                        {exp.category_name_si && exp.category_name_en && exp.category_name_si !== exp.category_name_en && (
                          <div className="text-[11px] text-zinc-500 font-sinhala">
                            {i18n.language === 'si' ? exp.category_name_en : exp.category_name_si}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="capitalize font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
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
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-600 dark:text-red-400">
                        Rs. {(exp.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={exp.status === 'approved' ? 'success' : exp.status === 'reversed' ? 'error' : 'neutral'} size="sm">
                          {tCommon(`status.${exp.status}`, exp.status.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {exp.status !== 'reversed' && (
                          <button
                            type="button"
                            onClick={() => handleOpenCancelModal(exp)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors"
                            title="Reverse / Cancel Expense"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <span className="text-zinc-500">
                Showing {Math.min((expensesPage - 1) * EXPENSES_PAGE_SIZE + 1, expensesTotal)} to{' '}
                {Math.min(expensesPage * EXPENSES_PAGE_SIZE, expensesTotal)} of {expensesTotal} records
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpensesPage((p) => Math.max(1, p - 1))}
                  disabled={expensesPage <= 1}
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Previous
                </Button>
                <span className="font-medium text-zinc-700 dark:text-zinc-300 px-2">
                  Page {expensesPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpensesPage((p) => Math.min(totalPages, p + 1))}
                  disabled={expensesPage >= totalPages}
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
          {categories.length === 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">{tFinance('budget.noAllocations')}:</span>
                <p className="mt-0.5">
                  Financial year "{activeFinancialYear?.year_name}" does not have any budget categories allocated yet. Use the Quick-Create button below to register and allocate a category now.
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

          {/* Interactive Keyboard-Navigable Budget Category Selector with Quick-Create */}
          <div className="space-y-1 relative" ref={catDropdownRef}>
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center space-x-1.5">
                <span>{tFinance('expenses.categorySelect')}</span>
                <span className="text-[10px] text-zinc-400 font-normal">({tFinance('expenses.useKeysHint')})</span>
              </div>
              <button
                type="button"
                onClick={handleOpenQuickCreate}
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium flex items-center space-x-1 hover:underline text-[11px]"
              >
                <Plus className="w-3 h-3" />
                <span>+ Quick-Create Category</span>
              </button>
            </div>

            {catDropdownOpen ? (
              <div className="relative">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                  <input
                    ref={catInputRef}
                    type="text"
                    autoFocus
                    placeholder={tFinance('expenses.categoryPlaceholder')}
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
                    <div className="p-3 text-center text-xs space-y-2">
                      <p className="text-zinc-400">No active year categories match "{catSearch}"</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleOpenQuickCreate}
                        className="mx-auto text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Create "{catSearch}" Now
                      </Button>
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
                            {c.name_si && c.name_en && (
                              <div className="text-[11px] text-zinc-500 font-sinhala mt-0.5">
                                {i18n.language === 'si' ? c.name_en : c.name_si}
                              </div>
                            )}
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
                      {selectedCategory.name_si && selectedCategory.name_en && (
                        <span className="text-[11px] text-zinc-500 font-sinhala mt-0.5">
                          {i18n.language === 'si' ? selectedCategory.name_en : selectedCategory.name_si}
                        </span>
                      )}
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
                  <span className="text-zinc-400">{tFinance('expenses.categoryPlaceholder')}</span>
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

          {/* Row 3: Payee & Bill Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label={tFinance('expenses.payeeLabel')}
              value={formPayee}
              onChange={(e) => setFormPayee(e.target.value)}
              placeholder={tFinance('expenses.payeePlaceholder')}
              required
            />
            <Input
              label={tFinance('expenses.billNo')}
              value={formBill}
              onChange={(e) => setFormBill(e.target.value)}
              placeholder="e.g. INV-99482"
            />
          </div>

          {/* Row 4: Expenditure Description */}
          <Input
            label={tFinance('expenses.descLabel')}
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder={tFinance('expenses.descPlaceholder')}
            required
          />

          {/* Row 5: Payment Method & Reference */}
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
              <span>Direct bank payment disbursed from institutional account: <strong>{bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})</strong></span>
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
                  Drawn on: <strong>{bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})</strong>
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

      {/* Quick-Create Budget Category Popup Sub-Modal */}
      <Modal
        isOpen={quickCreateModalOpen}
        onClose={() => setQuickCreateModalOpen(false)}
        title="Quick-Create Budget Category"
        maxWidth="sm"
        zIndex="z-[60]"
      >
        <form onSubmit={handleQuickCreateCategory} className="space-y-3.5 text-xs">
          <p className="text-[11px] text-zinc-500">
            Quick-creates a new budget subcategory and allocates it directly to the active operational year (<strong>{activeFinancialYear?.year_name}</strong>).
          </p>

          {parentCategories.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Parent Main Category (Group)
              </label>
              <select
                value={quickParentId || ''}
                onChange={(e) => setQuickParentId(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              >
                {parentCategories.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="English Name *"
              value={quickCatNameEn}
              onChange={(e) => setQuickCatNameEn(e.target.value)}
              placeholder="e.g. Science Lab Equipment"
              required
              autoFocus
            />
            <Input
              label="Sinhala Term (සිංහල නම) *"
              value={quickCatNameSi}
              onChange={(e) => setQuickCatNameSi(e.target.value)}
              placeholder="e.g. විද්‍යාගාර උපකරණ"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Category Code (Optional)"
              value={quickCatCode}
              onChange={(e) => setQuickCatCode(e.target.value)}
              placeholder="Auto-generated if empty"
            />
            <Input
              label="Initial Allocation (Rs.)"
              type="number"
              step="0.01"
              value={quickCatAlloc}
              onChange={(e) => setQuickCatAlloc(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Description (Optional)
            </label>
            <textarea
              value={quickCatDesc}
              onChange={(e) => setQuickCatDesc(e.target.value)}
              placeholder="Brief description of this expenditure scope..."
              className="w-full h-16 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 resize-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => setQuickCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={quickCreating}>
              Save & Select
            </Button>
          </div>
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
