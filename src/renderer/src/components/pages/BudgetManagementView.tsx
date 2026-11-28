import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Printer,
  Layers,
  AlertCircle,
  Receipt,
  Search,
  ChevronRight,
  ChevronDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  History,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  FinancialYear,
  FinancialYearDetail,
  BudgetAllocationItem,
  Expense,
  BudgetReallocation,
} from '../../../shared/types/finance';

interface CategoryGroup {
  key: string;
  parentCode: string;
  parentName: string;
  parentNameSi?: string;
  mainCategoryId?: number;
  subcategories: BudgetAllocationItem[];
  totalAllocatedCents: number;
  totalSpentCents: number;
  totalRemainingCents: number;
  burnRate: number;
}

export const BudgetManagementView: React.FC = () => {
  const { t, i18n } = useTranslation('finance');
  const { t: tCommon } = useTranslation('common');
  const { success, error: toastError } = useToast();

  const [yearDetail, setYearDetail] = useState<FinancialYearDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'healthy' | 'warning' | 'exhausted'>('all');
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Record<string, boolean>>({});

  // Category Transaction Modal State
  const [selectedCatForTx, setSelectedCatForTx] = useState<BudgetAllocationItem | null>(null);
  const [categoryTransactions, setCategoryTransactions] = useState<Expense[]>([]);
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [txPaymentMethodFilter, setTxPaymentMethodFilter] = useState<string>('all');
  const [txStatusFilter, setTxStatusFilter] = useState<string>('all');
  const [txLoading, setTxLoading] = useState(false);

  // Budget Reallocation State
  const [reallocModalOpen, setReallocModalOpen] = useState(false);
  const [reallocHistoryModalOpen, setReallocHistoryModalOpen] = useState(false);
  const [sourceCatId, setSourceCatId] = useState<number | null>(null);
  const [destCatId, setDestCatId] = useState<number | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [submittingRealloc, setSubmittingRealloc] = useState(false);
  const [reallocationsList, setReallocationsList] = useState<BudgetReallocation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load Running Active Financial Year by Default
  const loadActiveYearBudget = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial?.getYears) {
        const yRes = await window.curtissApi.financial.getYears();
        if (yRes.success && yRes.data && yRes.data.length > 0) {
          const loadedYears: FinancialYear[] = yRes.data;

          // Running active financial year (priority: is_current -> first approved/locked -> first available)
          const activeYear =
            loadedYears.find((y) => y.is_current) ||
            loadedYears.find((y) => y.status === 'approved' || y.status === 'locked') ||
            loadedYears[0];

          if (activeYear && window.curtissApi?.financial?.getYearDetail) {
            const detailRes = await window.curtissApi.financial.getYearDetail(activeYear.id);
            if (detailRes.success && detailRes.data) {
              setYearDetail(detailRes.data);
            }
          }
        }
      }
    } catch (err: any) {
      toastError('Failed to load annual budget', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveYearBudget();
  }, []);

  // Open transaction ledger for a selected subcategory
  const handleOpenCategoryTransactions = async (category: BudgetAllocationItem) => {
    setSelectedCatForTx(category);
    setTxSearchQuery('');
    setTxPaymentMethodFilter('all');
    setTxStatusFilter('all');
    setTxLoading(true);
    try {
      if (window.curtissApi?.financial?.getExpenses && yearDetail) {
        const res = await window.curtissApi.financial.getExpenses(500, 0, yearDetail.id, category.category_id);
        if (res.success && res.data) {
          setCategoryTransactions(res.data.expenses || []);
        } else {
          setCategoryTransactions([]);
        }
      }
    } catch (err: any) {
      toastError('Failed to load category transactions', err.message);
      setCategoryTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  // Group Allocations Hierarchically (Main Categories & Child Subcategories)
  const groupedAllocations = useMemo(() => {
    const rawAllocations: BudgetAllocationItem[] = yearDetail?.allocations || [];
    const groupsMap = new Map<string, CategoryGroup>();

    // Pass 1: Identify all explicit main categories
    rawAllocations.forEach((alloc) => {
      const isExplicitMain = alloc.parent_id === null || alloc.parent_id === undefined;
      if (isExplicitMain) {
        const key = `main-${alloc.category_id}`;
        groupsMap.set(key, {
          key,
          parentCode: alloc.category_code || '',
          parentName: alloc.category_name,
          parentNameSi: alloc.category_name_si || undefined,
          mainCategoryId: alloc.category_id,
          subcategories: [],
          totalAllocatedCents: 0,
          totalSpentCents: 0,
          totalRemainingCents: 0,
          burnRate: 0,
        });
      }
    });

    // Pass 2: Attach child subcategories to their respective main categories
    rawAllocations.forEach((alloc) => {
      if (alloc.parent_id !== null && alloc.parent_id !== undefined) {
        const key = `main-${alloc.parent_id}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            key,
            parentCode: alloc.parent_code || '',
            parentName: alloc.parent_name || (alloc.parent_id ? `Main Category ${alloc.parent_id}` : 'General Category'),
            parentNameSi: alloc.parent_name_si || undefined,
            mainCategoryId: alloc.parent_id,
            subcategories: [],
            totalAllocatedCents: 0,
            totalSpentCents: 0,
            totalRemainingCents: 0,
            burnRate: 0,
          });
        }
        groupsMap.get(key)!.subcategories.push(alloc);
      }
    });

    // Pass 3: Calculate aggregated subtotals for each parent
    groupsMap.forEach((g) => {
      if (g.subcategories.length > 0) {
        g.totalAllocatedCents = g.subcategories.reduce(
          (acc, item) => acc + (item.allocated_amount_cents || 0),
          0
        );
        g.totalSpentCents = g.subcategories.reduce(
          (acc, item) => acc + (item.spent_amount_cents || 0),
          0
        );
        g.totalRemainingCents = g.totalAllocatedCents - g.totalSpentCents;
      } else {
        const selfItem = rawAllocations.find((a) => a.category_id === g.mainCategoryId);
        if (selfItem) {
          g.totalAllocatedCents = selfItem.allocated_amount_cents || 0;
          g.totalSpentCents = selfItem.spent_amount_cents || 0;
          g.totalRemainingCents = g.totalAllocatedCents - g.totalSpentCents;
        }
      }
      g.burnRate =
        g.totalAllocatedCents > 0
          ? Math.round((g.totalSpentCents / g.totalAllocatedCents) * 100)
          : 0;
    });

    return Array.from(groupsMap.values()).sort((a, b) =>
      a.parentCode.localeCompare(b.parentCode)
    );
  }, [yearDetail?.allocations]);

  // Overall Financial Totals
  const totalAllocatedCents = useMemo(() => {
    return groupedAllocations.reduce((acc, g) => acc + g.totalAllocatedCents, 0);
  }, [groupedAllocations]);

  const totalSpentCents = useMemo(() => {
    return groupedAllocations.reduce((acc, g) => acc + g.totalSpentCents, 0);
  }, [groupedAllocations]);

  const totalRemainingCents = totalAllocatedCents - totalSpentCents;

  const totalAllocatedFormatted = (totalAllocatedCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const totalSpentFormatted = (totalSpentCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const totalRemainingFormatted = (totalRemainingCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const overallBurnRate =
    totalAllocatedCents > 0
      ? ((totalSpentCents / totalAllocatedCents) * 100).toFixed(1)
      : '0.0';

  const totalSubcategoriesCount = useMemo(() => {
    return groupedAllocations.reduce((acc, g) => acc + g.subcategories.length, 0);
  }, [groupedAllocations]);

  // All individual subcategories flattened (for transfer source/dest dropdowns)
  const availableSubcategories = useMemo(() => {
    const list: BudgetAllocationItem[] = [];
    groupedAllocations.forEach((g) => {
      g.subcategories.forEach((sub) => {
        list.push(sub);
      });
    });
    return list;
  }, [groupedAllocations]);

  // Filter Groups based on Search Query and Status Mode
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return groupedAllocations
      .map((group) => {
        const matchesParent =
          !q ||
          group.parentCode.toLowerCase().includes(q) ||
          group.parentName.toLowerCase().includes(q) ||
          (group.parentNameSi && group.parentNameSi.includes(q));

        const filteredSubs = group.subcategories.filter((sub) => {
          const matchesQuery =
            matchesParent ||
            (sub.category_code && sub.category_code.toLowerCase().includes(q)) ||
            (sub.category_name && sub.category_name.toLowerCase().includes(q)) ||
            (sub.category_name_si && sub.category_name_si.includes(q)) ||
            (sub.notes && sub.notes.toLowerCase().includes(q));

          if (!matchesQuery) return false;

          const allocated = sub.allocated_amount_cents || 0;
          const spent = sub.spent_amount_cents || 0;
          const remaining = sub.remaining_amount_cents ?? (allocated - spent);
          const burnPct = allocated > 0 ? (spent / allocated) * 100 : 0;

          if (filterMode === 'healthy') return burnPct < 80;
          if (filterMode === 'warning') return burnPct >= 80 && remaining > 0;
          if (filterMode === 'exhausted') return remaining <= 0;
          return true;
        });

        if (filteredSubs.length > 0 || (matchesParent && !q)) {
          return {
            ...group,
            subcategories: filteredSubs,
          };
        }
        return null;
      })
      .filter((g): g is CategoryGroup => g !== null);
  }, [groupedAllocations, searchQuery, filterMode]);

  // Collapse/Expand state handlers
  const toggleGroup = (key: string) => {
    setCollapsedGroupKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAll = () => setCollapsedGroupKeys({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    groupedAllocations.forEach((g) => {
      next[g.key] = true;
    });
    setCollapsedGroupKeys(next);
  };

  const isApproved = yearDetail?.status === 'approved' || yearDetail?.status === 'locked';

  // Filter transactions within modal
  const filteredModalTransactions = useMemo(() => {
    let list = categoryTransactions;
    if (txPaymentMethodFilter !== 'all') {
      list = list.filter((tx) => {
        if (txPaymentMethodFilter === 'cheque') {
          return tx.payment_method === 'cheque' || (tx as any).cheque_number;
        }
        return tx.payment_method === txPaymentMethodFilter;
      });
    }
    if (txStatusFilter !== 'all') {
      list = list.filter((tx) => tx.status === txStatusFilter);
    }
    if (txSearchQuery.trim()) {
      const q = txSearchQuery.toLowerCase().trim();
      list = list.filter((tx) =>
        (tx.voucher_no && tx.voucher_no.toLowerCase().includes(q)) ||
        (tx.payee && tx.payee.toLowerCase().includes(q)) ||
        (tx.description && tx.description.toLowerCase().includes(q)) ||
        (tx.reference_no && tx.reference_no.toLowerCase().includes(q)) ||
        (tx.bill_no && tx.bill_no.toLowerCase().includes(q)) ||
        ((tx as any).bank_name && (tx as any).bank_name.toLowerCase().includes(q)) ||
        ((tx as any).cheque_number && (tx as any).cheque_number.toLowerCase().includes(q))
      );
    }
    return list;
  }, [categoryTransactions, txSearchQuery, txPaymentMethodFilter, txStatusFilter]);

  const filteredTotalSpentCents = useMemo(() => {
    return filteredModalTransactions.reduce((acc, tx) => {
      if (tx.status !== 'reversed') {
        return acc + (tx.amount_cents || 0);
      }
      return acc;
    }, 0);
  }, [filteredModalTransactions]);

  // Open Reallocation Modal
  const handleOpenReallocateModal = () => {
    setTransferAmount('');
    setTransferReason('');
    // Pre-select first category with positive remaining if available
    const firstAvailable = availableSubcategories.find(
      (s) => (s.remaining_amount_cents ?? (s.allocated_amount_cents - (s.spent_amount_cents || 0))) > 0
    );
    setSourceCatId(firstAvailable ? firstAvailable.category_id : null);
    const firstDest = availableSubcategories.find(
      (s) => !firstAvailable || s.category_id !== firstAvailable.category_id
    );
    setDestCatId(firstDest ? firstDest.category_id : null);
    setReallocModalOpen(true);
  };

  // Submit Budget Reallocation
  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearDetail || !sourceCatId || !destCatId) {
      toastError('Validation Error', 'Please select both source and destination categories.');
      return;
    }
    if (sourceCatId === destCatId) {
      toastError('Validation Error', 'Source and destination categories must be different.');
      return;
    }
    const amountNum = parseFloat(transferAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toastError('Validation Error', 'Please enter a valid transfer amount greater than zero.');
      return;
    }
    if (!transferReason.trim()) {
      toastError('Validation Error', 'Please provide a reason or justification for this budget reallocation.');
      return;
    }

    const cents = Math.round(amountNum * 100);

    const sourceCat = availableSubcategories.find((s) => s.category_id === sourceCatId);
    const destCat = availableSubcategories.find((s) => s.category_id === destCatId);
    const srcRemaining = sourceCat
      ? sourceCat.remaining_amount_cents ?? (sourceCat.allocated_amount_cents - (sourceCat.spent_amount_cents || 0))
      : 0;

    if (cents > srcRemaining) {
      toastError(
        'Insufficient Allocation',
        `Transfer amount (Rs. ${amountNum.toFixed(2)}) exceeds available remaining budget (Rs. ${(srcRemaining / 100).toFixed(2)}) for category "${sourceCat?.category_name}".`
      );
      return;
    }

    setSubmittingRealloc(true);
    try {
      if (window.curtissApi?.financial?.transferBudget) {
        const res = await window.curtissApi.financial.transferBudget({
          financial_year_id: yearDetail.id,
          source_category_id: sourceCatId,
          destination_category_id: destCatId,
          amount_cents: cents,
          reason: transferReason.trim(),
        });

        if (res.success && res.data) {
          success(
            'Budget Transferred',
            `Reallocated Rs. ${amountNum.toFixed(2)} from "${sourceCat?.category_name}" to "${destCat?.category_name}".`
          );
          setReallocModalOpen(false);
          setTransferAmount('');
          setTransferReason('');
          setSourceCatId(null);
          setDestCatId(null);
          await loadActiveYearBudget();
        } else {
          toastError('Transfer Failed', res.error || 'Failed to reallocate budget.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmittingRealloc(false);
    }
  };

  // Load and Open Reallocation History Modal
  const handleOpenHistoryModal = async () => {
    if (!yearDetail) return;
    setLoadingHistory(true);
    setReallocHistoryModalOpen(true);
    try {
      if (window.curtissApi?.financial?.getBudgetReallocations) {
        const res = await window.curtissApi.financial.getBudgetReallocations(yearDetail.id);
        if (res.success && res.data) {
          setReallocationsList(res.data);
        } else {
          setReallocationsList([]);
        }
      }
    } catch (err: any) {
      toastError('Failed to load budget transfer history', err.message);
      setReallocationsList([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Real-time calculation helpers for reallocation modal preview
  const selectedSourceCat = useMemo(
    () => availableSubcategories.find((s) => s.category_id === sourceCatId),
    [availableSubcategories, sourceCatId]
  );
  const selectedDestCat = useMemo(
    () => availableSubcategories.find((s) => s.category_id === destCatId),
    [availableSubcategories, destCatId]
  );
  const parsedTransferCents = useMemo(() => {
    const val = parseFloat(transferAmount);
    return isNaN(val) || val <= 0 ? 0 : Math.round(val * 100);
  }, [transferAmount]);

  const sourceCurrentRemaining = selectedSourceCat
    ? selectedSourceCat.remaining_amount_cents ??
      (selectedSourceCat.allocated_amount_cents - (selectedSourceCat.spent_amount_cents || 0))
    : 0;
  const sourceNewRemaining = sourceCurrentRemaining - parsedTransferCents;

  const destCurrentRemaining = selectedDestCat
    ? selectedDestCat.remaining_amount_cents ??
      (selectedDestCat.allocated_amount_cents - (selectedDestCat.spent_amount_cents || 0))
    : 0;
  const destNewRemaining = destCurrentRemaining + parsedTransferCents;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4 select-none font-sans">
      {/* Clean Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t('annualBudgetTitle', 'Annual Budget')}
          </h1>
          {yearDetail && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{yearDetail.year_name}</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Transfer Budget Between Categories */}
          <Button
            size="sm"
            onClick={handleOpenReallocateModal}
            className="text-xs"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
            <span>Transfer Budget</span>
          </Button>

          {/* Transfer History */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenHistoryModal}
            className="text-xs"
            title="View budget reallocations history"
          >
            <History className="w-3.5 h-3.5 mr-1" />
            <span>History</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadActiveYearBudget}
            isLoading={loading}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span>{tCommon('actions.refresh', 'Refresh')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="w-3.5 h-3.5 mr-1" />
            <span>{t('actions.print', 'Print')}</span>
          </Button>
        </div>
      </div>

      {/* Notice if active year is still a draft */}
      {!isApproved && yearDetail ? (
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 shadow-xs">
          <CardContent className="p-4 flex items-start space-x-3 text-amber-800 dark:text-amber-300 text-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-sm">Draft Financial Year ({yearDetail.year_name})</h3>
              <p className="text-amber-700/90 dark:text-amber-400/90">
                This budget is currently in <strong>Draft status</strong>. Allocations become locked once authorized by school governance in the Financial Year setup panel.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-emerald-500 shadow-xs">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                  <span>{t('budget.totalAllocated', 'Total Budget')}</span>
                  <Wallet className="w-3.5 h-3.5 text-zinc-400" />
                </span>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  Rs. {totalAllocatedFormatted}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-xs">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                  <span>{t('budget.totalSpent', 'Total Spent')}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-500" />
                </span>
                <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 flex items-center justify-between">
                  <span>Rs. {totalSpentFormatted}</span>
                  <span className="text-xs font-mono font-medium text-zinc-400">
                    {overallBurnRate}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-xs">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                  <span>{t('budget.totalRemaining', 'Remaining Balance')}</span>
                  <ArrowDownRight className="w-3.5 h-3.5 text-blue-500" />
                </span>
                <div
                  className={`text-xl font-bold font-mono ${
                    totalRemainingCents < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  Rs. {totalRemainingFormatted}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500 shadow-xs">
              <CardContent className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Categories</span>
                  <Layers className="w-3.5 h-3.5 text-purple-500" />
                </span>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {groupedAllocations.length} Main • {totalSubcategoriesCount} Sub
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Hierarchical Allocations & Spending Table */}
          <Card className="shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  Budget Allocations
                </span>
                <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
                  <span>•</span>
                  <button
                    type="button"
                    onClick={expandAll}
                    className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    Expand All
                  </button>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Search & Filter Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 w-full sm:w-56"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-1 overflow-x-auto text-xs">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'healthy', label: '< 80%' },
                      { id: 'warning', label: '≥ 80%' },
                      { id: 'exhausted', label: '100%' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilterMode(f.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        filterMode === f.id
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 font-semibold">
                      <th className="py-2.5 px-4 w-12 text-center">#</th>
                      <th className="py-2.5 px-4">{t('budget.category', 'Category')}</th>
                      <th className="py-2.5 px-4 text-right w-36">{t('budget.allocated', 'Allocated (Rs.)')}</th>
                      <th className="py-2.5 px-4 text-right w-36">{t('budget.spent', 'Spent (Rs.)')}</th>
                      <th className="py-2.5 px-4 text-right w-36">{t('budget.remaining', 'Remaining (Rs.)')}</th>
                      <th className="py-2.5 px-4 text-center w-36">{t('budget.utilization', 'Burn Rate')}</th>
                      <th className="py-2.5 px-4 text-center w-28">{tCommon('labels.actions', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredGroups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-zinc-400">
                          {groupedAllocations.length === 0
                            ? 'No budget categories allocated for this financial period.'
                            : `No categories match query "${searchQuery}".`}
                        </td>
                      </tr>
                    ) : (
                      filteredGroups.map((group) => {
                        const isCollapsed = Boolean(collapsedGroupKeys[group.key]) && !searchQuery.trim();
                        const groupAllocFormatted = (group.totalAllocatedCents / 100).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        const groupSpentFormatted = (group.totalSpentCents / 100).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        const groupRemainingFormatted = (group.totalRemainingCents / 100).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });

                        return (
                          <React.Fragment key={group.key}>
                            {/* Main Category Row */}
                            <tr
                              onClick={() => toggleGroup(group.key)}
                              className="bg-zinc-100/90 dark:bg-zinc-800/80 font-semibold border-t-2 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors"
                            >
                              <td className="py-2.5 px-4 text-center">
                                {isCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 inline" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 inline" />
                                )}
                              </td>

                              <td className="py-2.5 px-4">
                                <div className="flex items-center space-x-2">
                                  <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                  {group.parentCode && (
                                    <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold">
                                      {group.parentCode}
                                    </span>
                                  )}
                                  <span className="text-zinc-900 dark:text-zinc-100 font-bold text-xs">
                                    {group.parentName}
                                  </span>
                                  {group.parentNameSi && group.parentNameSi !== group.parentName && (
                                    <span className="text-[11px] text-zinc-500 font-sinhala font-normal">
                                      ({group.parentNameSi})
                                    </span>
                                  )}
                                  <span className="text-[10px] text-zinc-400 font-normal ml-2">
                                    • {group.subcategories.length} {group.subcategories.length === 1 ? 'subcategory' : 'subcategories'}
                                  </span>
                                </div>
                              </td>

                              <td className="py-2.5 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                Rs. {groupAllocFormatted}
                              </td>

                              <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                Rs. {groupSpentFormatted}
                              </td>

                              <td
                                className={`py-2.5 px-4 text-right font-mono font-bold ${
                                  group.totalRemainingCents < 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                Rs. {groupRemainingFormatted}
                              </td>

                              <td className="py-2.5 px-4">
                                <div className="flex flex-col items-center justify-center space-y-1">
                                  <span className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300 font-bold">
                                    {group.burnRate}%
                                  </span>
                                  <div className="w-20 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        group.burnRate >= 100
                                          ? 'bg-red-500'
                                          : group.burnRate >= 80
                                          ? 'bg-amber-500'
                                          : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(100, group.burnRate)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-4 text-center">
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {isCollapsed ? 'Expand' : 'Collapse'}
                                </span>
                              </td>
                            </tr>

                            {/* Child Subcategories Rows */}
                            {!isCollapsed &&
                              group.subcategories.map((alloc, subIdx) => {
                                const allocated = alloc.allocated_amount_cents || 0;
                                const spent = alloc.spent_amount_cents || 0;
                                const remaining = alloc.remaining_amount_cents ?? (allocated - spent);
                                const burnPct =
                                  allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;
                                const rawPct = allocated > 0 ? ((spent / allocated) * 100).toFixed(1) : '0.0';

                                return (
                                  <tr
                                    key={alloc.category_id}
                                    onClick={() => handleOpenCategoryTransactions(alloc)}
                                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer transition-colors"
                                  >
                                    <td className="py-2.5 px-4 text-center text-zinc-400 font-mono text-[11px]">
                                      {subIdx + 1}
                                    </td>

                                    <td className="py-2.5 px-4 pl-8">
                                      <div className="flex items-center space-x-2">
                                        <ChevronRight className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                                        {alloc.category_code && (
                                          <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px] font-semibold flex-shrink-0">
                                            {alloc.category_code}
                                          </span>
                                        )}
                                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                          {i18n.language === 'si' && alloc.category_name_si
                                            ? alloc.category_name_si
                                            : alloc.category_name}
                                        </span>
                                      </div>
                                      {alloc.category_name_si &&
                                        alloc.category_name &&
                                        alloc.category_name_si !== alloc.category_name && (
                                          <div className="text-[11px] text-zinc-500 font-sinhala ml-5 mt-0.5">
                                            {i18n.language === 'si'
                                              ? alloc.category_name
                                              : alloc.category_name_si}
                                          </div>
                                        )}
                                      {alloc.notes && (
                                        <div className="text-[10px] text-zinc-400 truncate max-w-xs ml-5 mt-0.5">
                                          {alloc.notes}
                                        </div>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-4 text-right font-mono font-medium text-zinc-900 dark:text-zinc-100">
                                      Rs. {(allocated / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>

                                    <td className="py-2.5 px-4 text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                                      Rs. {(spent / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>

                                    <td
                                      className={`py-2.5 px-4 text-right font-mono font-bold ${
                                        remaining < 0
                                          ? 'text-red-600 dark:text-red-400'
                                          : remaining === 0
                                          ? 'text-zinc-400'
                                          : 'text-emerald-600 dark:text-emerald-400'
                                      }`}
                                    >
                                      Rs. {(remaining / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>

                                    <td className="py-2.5 px-4">
                                      <div className="flex flex-col items-center justify-center space-y-1">
                                        <span className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300">
                                          {rawPct}%
                                        </span>
                                        <div className="w-20 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${
                                              burnPct >= 100
                                                ? 'bg-red-500'
                                                : burnPct >= 80
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${burnPct}%` }}
                                          />
                                        </div>
                                      </div>
                                    </td>

                                    <td className="py-2.5 px-4 text-center">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenCategoryTransactions(alloc);
                                        }}
                                        className="text-[11px] h-6 px-2"
                                      >
                                        <Receipt className="w-3 h-3 mr-1 text-zinc-400" />
                                        <span>Ledger</span>
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Grand Total Summary Footer */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-semibold">
                <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
                  <span className="text-zinc-500 font-medium">{t('budget.totalAllocated', 'Total Budget')}:</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold">
                    Rs. {totalAllocatedFormatted}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
                  <span className="text-zinc-500 font-medium">{t('budget.totalSpent', 'Total Spent')}:</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                    Rs. {totalSpentFormatted}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
                  <span className="text-zinc-500 font-medium">{t('budget.totalRemaining', 'Net Remaining')}:</span>
                  <span
                    className={`font-mono font-bold ${
                      totalRemainingCents < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    Rs. {totalRemainingFormatted}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
                  <span className="text-zinc-500 font-medium">{t('budget.utilization', 'Overall Burn')}:</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                    {overallBurnRate}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Budget Reallocation / Transfer Modal */}
      <Modal
        isOpen={reallocModalOpen}
        onClose={() => setReallocModalOpen(false)}
        title="Transfer Budget Between Categories"
        description="Transfer available remaining allocation from one subcategory to another."
        maxWidth="lg"
      >
        <form onSubmit={handleConfirmTransfer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Source Category */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Source Subcategory (Transfer From)
              </label>
              <select
                value={sourceCatId || ''}
                onChange={(e) => setSourceCatId(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                required
              >
                <option value="">-- Select Source Category --</option>
                {availableSubcategories
                  .filter(
                    (s) =>
                      (s.remaining_amount_cents ?? (s.allocated_amount_cents - (s.spent_amount_cents || 0))) > 0
                  )
                  .map((s) => {
                    const rem =
                      (s.remaining_amount_cents ?? (s.allocated_amount_cents - (s.spent_amount_cents || 0))) / 100;
                    return (
                      <option key={s.category_id} value={s.category_id}>
                        {s.category_code ? `[${s.category_code}] ` : ''}
                        {s.category_name} (Avail: Rs. {rem.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                      </option>
                    );
                  })}
              </select>
            </div>

            {/* Destination Category */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Destination Subcategory (Transfer To)
              </label>
              <select
                value={destCatId || ''}
                onChange={(e) => setDestCatId(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                required
              >
                <option value="">-- Select Destination Category --</option>
                {availableSubcategories
                  .filter((s) => s.category_id !== sourceCatId)
                  .map((s) => {
                    const rem =
                      (s.remaining_amount_cents ?? (s.allocated_amount_cents - (s.spent_amount_cents || 0))) / 100;
                    return (
                      <option key={s.category_id} value={s.category_id}>
                        {s.category_code ? `[${s.category_code}] ` : ''}
                        {s.category_name} (Current: Rs. {rem.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          {/* Transfer Amount */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Transfer Amount (Rs.)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-mono text-zinc-400">Rs.</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0.00"
                className="flex h-9 w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                required
              />
            </div>
          </div>

          {/* Reason / Justification */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Transfer Justification / Reason
            </label>
            <input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Reallocating stationery surplus to cover emergency science lab repairs..."
              className="flex h-9 w-full px-3 py-1.5 text-xs rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              required
            />
          </div>

          {/* Balance Preview Card */}
          {selectedSourceCat && selectedDestCat && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">
                Balance Reallocation Preview
              </span>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-zinc-500 text-[11px] block">{selectedSourceCat.category_name} (Source)</span>
                  <div className="font-mono text-xs">
                    <span className="text-zinc-400 line-through mr-1">
                      Rs. {(sourceCurrentRemaining / 100).toFixed(2)}
                    </span>
                    &rarr;{' '}
                    <span className={sourceNewRemaining < 0 ? 'text-red-500 font-bold' : 'text-zinc-900 dark:text-zinc-100 font-bold'}>
                      Rs. {(sourceNewRemaining / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 text-[11px] block">{selectedDestCat.category_name} (Dest)</span>
                  <div className="font-mono text-xs">
                    <span className="text-zinc-400 line-through mr-1">
                      Rs. {(destCurrentRemaining / 100).toFixed(2)}
                    </span>
                    &rarr;{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      Rs. {(destNewRemaining / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 flex justify-between text-[11px] text-zinc-400">
                <span>Total Annual Institutional Budget:</span>
                <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                  Rs. {totalAllocatedFormatted} (Unchanged)
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => setReallocModalOpen(false)}
              disabled={submittingRealloc}
            >
              {tCommon('actions.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              size="sm"
              isLoading={submittingRealloc}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              <span>Confirm Transfer</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reallocation History Modal */}
      <Modal
        isOpen={reallocHistoryModalOpen}
        onClose={() => setReallocHistoryModalOpen(false)}
        title="Budget Transfer & Reallocation History"
        description="Immutable audit trail of budget transfers between categories in this financial year."
        maxWidth="2xl"
      >
        <div className="space-y-3">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            {loadingHistory ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-zinc-400" />
                <div>Loading history...</div>
              </div>
            ) : reallocationsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-1">
                <History className="w-6 h-6 mx-auto text-zinc-300 dark:text-zinc-600" />
                <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                  No budget reallocations recorded for this financial year.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Ref No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Source Category</th>
                      <th className="py-2.5 px-3">Destination Category</th>
                      <th className="py-2.5 px-3 text-right">Amount (Rs.)</th>
                      <th className="py-2.5 px-3">Reason / Authorized By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {reallocationsList.map((r) => (
                      <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                        <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {r.reallocation_no}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-zinc-500 text-[11px]">
                          {r.created_at ? r.created_at.split('T')[0] : ''}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[11px] text-zinc-500 mr-1">
                            [{r.source_category_code}]
                          </span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {r.source_category_name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[11px] text-zinc-500 mr-1">
                            [{r.destination_category_code}]
                          </span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {r.destination_category_name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          Rs. {(r.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-zinc-800 dark:text-zinc-200 text-xs">{r.reason}</div>
                          {r.creator_name && (
                            <div className="text-[10px] text-zinc-400">By {r.creator_name}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setReallocHistoryModalOpen(false)}>
              {tCommon('actions.close', 'Close')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Category Transactions Modal */}
      {selectedCatForTx && (() => {
        const allocated = selectedCatForTx.allocated_amount_cents || 0;
        const spent = selectedCatForTx.spent_amount_cents || 0;
        const remaining = selectedCatForTx.remaining_amount_cents ?? (allocated - spent);
        const burnRate = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;

        return (
          <Modal
            isOpen={Boolean(selectedCatForTx)}
            onClose={() => setSelectedCatForTx(null)}
            fullscreen={true}
            title={
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      Category Transaction Ledger
                    </span>
                    {selectedCatForTx.category_code && (
                      <span className="font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-bold">
                        {selectedCatForTx.category_code}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {i18n.language === 'si' && selectedCatForTx.category_name_si
                        ? selectedCatForTx.category_name_si
                        : selectedCatForTx.category_name}
                    </span>
                    {selectedCatForTx.category_name_si &&
                      selectedCatForTx.category_name &&
                      selectedCatForTx.category_name_si !== selectedCatForTx.category_name && (
                        <span className="text-xs text-zinc-400 font-sinhala font-normal">
                          ({i18n.language === 'si' ? selectedCatForTx.category_name : selectedCatForTx.category_name_si})
                        </span>
                      )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center space-x-2">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {yearDetail?.year_name || 'Running Financial Period'}
                    </span>
                    <span>•</span>
                    <span>Disbursement vouchers & expenditure transactions posted under this category</span>
                  </p>
                </div>
              </div>
            }
            headerAction={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCatForTx(null)}
                className="h-8 px-3 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5 text-zinc-500" />
                <span>Close (Esc)</span>
              </Button>
            }
          >
            <div className="space-y-3.5 flex flex-col h-full">
              {/* Category KPI Mini-Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Allocated Budget</span>
                  <div className="mt-1">
                    <span className="text-base sm:text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">
                      Rs. {(allocated / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">Approved annual ceiling</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total Disbursed</span>
                  <div className="mt-1">
                    <span className="text-base sm:text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                      Rs. {(spent / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      {categoryTransactions.length} total vouchers posted
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Remaining Balance</span>
                  <div className="mt-1">
                    <span
                      className={`text-base sm:text-lg font-bold font-mono ${
                        remaining < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      Rs. {(remaining / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      {remaining < 0 ? 'Budget ceiling exceeded' : 'Available spending headroom'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Budget Utilization</span>
                    <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">{burnRate}%</span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          burnRate >= 100 ? 'bg-red-500' : burnRate >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, burnRate)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400 block">
                      {burnRate >= 100 ? 'Ceiling reached' : `${(100 - burnRate).toFixed(1)}% remaining`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Vouchers Search & Filters Toolbar */}
              <div className="flex flex-wrap items-center gap-2 bg-zinc-50/80 dark:bg-zinc-900/40 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search voucher #, payee, description, bill #, cheque #..."
                    value={txSearchQuery}
                    onChange={(e) => setTxSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 w-full"
                  />
                  {txSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTxSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="w-36">
                  <select
                    value={txPaymentMethodFilter}
                    onChange={(e) => setTxPaymentMethodFilter(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 w-full"
                  >
                    <option value="all">All Methods</option>
                    <option value="cash">Cash in Hand</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="petty_cash">Petty Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div className="w-32">
                  <select
                    value={txStatusFilter}
                    onChange={(e) => setTxStatusFilter(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 w-full"
                  >
                    <option value="all">All Statuses</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                    <option value="draft">Draft</option>
                    <option value="reversed">Reversed</option>
                  </select>
                </div>

                {(txSearchQuery || txPaymentMethodFilter !== 'all' || txStatusFilter !== 'all') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTxSearchQuery('');
                      setTxPaymentMethodFilter('all');
                      setTxStatusFilter('all');
                    }}
                    className="h-8 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2.5"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                )}

                <div className="ml-auto text-xs text-zinc-500 font-medium">
                  Showing <span className="font-semibold text-zinc-900 dark:text-zinc-100">{filteredModalTransactions.length}</span> of {categoryTransactions.length} vouchers
                </div>
              </div>

              {/* Transactions List with Zebra Strips */}
              <div className="flex-1 min-h-[300px] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col bg-white dark:bg-zinc-900/60 shadow-xs">
                {txLoading ? (
                  <div className="p-12 text-center text-xs text-zinc-400 space-y-2 my-auto">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-zinc-400" />
                    <div>Loading category transaction ledger...</div>
                  </div>
                ) : filteredModalTransactions.length === 0 ? (
                  <div className="p-12 text-center text-xs text-zinc-400 space-y-2 my-auto">
                    <Receipt className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300 text-sm">
                      {categoryTransactions.length === 0
                        ? t('budget.noTransactions', 'No transactions posted yet under this budget category.')
                        : `No transactions match your search and filter criteria.`}
                    </div>
                    {categoryTransactions.length > 0 && (
                      <button
                        onClick={() => {
                          setTxSearchQuery('');
                          setTxPaymentMethodFilter('all');
                          setTxStatusFilter('all');
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-100/90 dark:bg-zinc-800/90 backdrop-blur-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold text-center w-12">#</th>
                          <th className="py-2.5 px-3 font-semibold w-32">{t('budget.transVoucher', 'Voucher')}</th>
                          <th className="py-2.5 px-3 font-semibold w-28">{t('budget.transDate', 'Date')}</th>
                          <th className="py-2.5 px-3 font-semibold">{t('budget.transPayee', 'Payee / Description')}</th>
                          <th className="py-2.5 px-3 font-semibold w-36">{t('budget.transMethod', 'Payment Method')}</th>
                          <th className="py-2.5 px-3 font-semibold w-32">Bill / Ref #</th>
                          <th className="py-2.5 px-3 font-semibold text-right w-36">{t('budget.transAmount', 'Amount (Rs.)')}</th>
                          <th className="py-2.5 px-3 font-semibold text-center w-28">{tCommon('labels.status', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                        {filteredModalTransactions.map((tx, idx) => (
                          <tr
                            key={tx.id}
                            className="even:bg-white dark:even:bg-zinc-900 odd:bg-zinc-50/70 dark:odd:bg-zinc-800/25 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            <td className="py-2.5 px-3 text-center text-zinc-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                              {tx.voucher_no}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-zinc-500">{tx.expense_date}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-zinc-900 dark:text-zinc-100">{tx.payee}</div>
                              {tx.description && (
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                                  {tx.description}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="capitalize font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                                {tx.payment_method === 'bank' && (tx as any).bank_name
                                  ? `Bank (${(tx as any).bank_name})`
                                  : tCommon(`paymentMethods.${tx.payment_method}`, tx.payment_method.replace('_', ' '))}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">
                              {tx.bill_no || tx.reference_no || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                              Rs. {(tx.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge
                                variant={
                                  tx.status === 'approved' || tx.status === 'paid'
                                    ? 'success'
                                    : tx.status === 'reversed'
                                    ? 'destructive'
                                    : 'neutral'
                                }
                                size="sm"
                              >
                                {tCommon(`status.${tx.status}`, tx.status.toUpperCase())}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bottom Summary Bar & Close Button */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0 text-xs">
                <div className="flex items-center space-x-3 text-zinc-500">
                  <span>
                    Total Disbursed for Filtered Records:
                    <span className="ml-1.5 font-mono font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      Rs. {(filteredTotalSpentCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                  <span>•</span>
                  <span>{filteredModalTransactions.length} vouchers recorded</span>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedCatForTx(null)} className="h-8 px-4 font-medium">
                    <X className="w-3.5 h-3.5 mr-1" />
                    {tCommon('actions.close', 'Close')}
                  </Button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};
