import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Landmark,
  Plus,
  RefreshCw,
  FileText,
  DollarSign,
  Wallet,
  Coins,
  Building2,
  Calendar,
  Layers,
  ArrowRightLeft,
  Search,
  CheckCircle2,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Tag,
  HeartHandshake,
  CreditCard,
  Sparkles,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import {
  FundCategory,
  FundReceipt,
  BankAccount,
  FinancialYear,
} from '../../../shared/types/finance';

const RECEIPTS_PAGE_SIZE = 15;

export const FundManagementView: React.FC = () => {
  const { t: tCommon, i18n } = useTranslation('common');
  const { t: tFinance } = useTranslation('finance');
  const { success, error: toastError } = useToast();

  const [fundCategories, setFundCategories] = useState<FundCategory[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);

  // Receipts State & Server Pagination
  const [receipts, setReceipts] = useState<FundReceipt[]>([]);
  const [receiptsTotal, setReceiptsTotal] = useState(0);
  const [receiptsPage, setReceiptsPage] = useState(1);
  const [receiptSearch, setReceiptSearch] = useState('');

  // Summary Metrics State (Aggregate by destination account)
  const [summary, setSummary] = useState({
    total_cents: 0,
    bank_cents: 0,
    cash_cents: 0,
    petty_cash_cents: 0,
    total_count: 0,
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Modals
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [catManageModalOpen, setCatManageModalOpen] = useState(false);

  // Category Manage Form State
  const [catCode, setCatCode] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catNameSi, setCatNameSi] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Record Inward Donation Form State
  const [rcptCatId, setRcptCatId] = useState<number>(1);
  const [rcptDate, setRcptDate] = useState(new Date().toISOString().split('T')[0]);
  const [rcptDonor, setRcptDonor] = useState('');
  const [rcptAmount, setRcptAmount] = useState('');
  const [rcptMethod, setRcptMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'direct_deposit' | 'other'>('cash');
  const [rcptDest, setRcptDest] = useState<'cash' | 'bank' | 'petty_cash'>('cash');
  const [rcptBankId, setRcptBankId] = useState<number>(1);
  const [rcptRef, setRcptRef] = useState('');
  const [rcptPurpose, setRcptPurpose] = useState('');
  const [rcptChequeNo, setRcptChequeNo] = useState('');
  const [rcptIssuingBank, setRcptIssuingBank] = useState('');
  const [rcptIssuingBranch, setRcptIssuingBranch] = useState('');
  const [rcptChequeDate, setRcptChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [rcptChequeDepositMode, setRcptChequeDepositMode] = useState<'deposit_now' | 'hold_in_hand'>('deposit_now');
  const [submitting, setSubmitting] = useState(false);

  // Donation Category Combobox & Quick-Create System
  const [catSearch, setCatSearch] = useState('');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [highlightedCatIndex, setHighlightedCatIndex] = useState(0);
  const [quickCreateModalOpen, setQuickCreateModalOpen] = useState(false);
  const [quickCatNameEn, setQuickCatNameEn] = useState('');
  const [quickCatNameSi, setQuickCatNameSi] = useState('');
  const [quickCatDesc, setQuickCatDesc] = useState('');
  const [quickCreatingCat, setQuickCreatingCat] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);
  const catDropdownRef = useRef<HTMLDivElement>(null);

  // Initialize active financial year
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

  const loadData = async () => {
    if (!selectedYearId) return;
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const offset = (receiptsPage - 1) * RECEIPTS_PAGE_SIZE;
        const [cRes, rRes, bRes, sRes] = await Promise.all([
          window.curtissApi.financial.getFundCategories(),
          window.curtissApi.financial.getFundReceipts(
            RECEIPTS_PAGE_SIZE,
            offset,
            selectedYearId,
            selectedCatId || undefined,
            receiptSearch.trim() || undefined
          ),
          window.curtissApi.financial.getBankAccounts(),
          window.curtissApi.financial.getFundReceiptsSummary(selectedYearId),
        ]);

        if (cRes.success && cRes.data) {
          setFundCategories(cRes.data);
          if (cRes.data.length > 0 && rcptCatId === 1) {
            setRcptCatId(cRes.data[0].id);
          }
        }
        if (rRes.success && rRes.data) {
          setReceipts(rRes.data.receipts || []);
          setReceiptsTotal(rRes.data.total || 0);
        }
        if (bRes.success && bRes.data) {
          setBankAccounts(bRes.data);
          if (bRes.data.length > 0) setRcptBankId(bRes.data[0].id);
        }
        if (sRes.success && sRes.data) {
          setSummary(sRes.data);
        }
      }
    } catch (err: any) {
      toastError('Failed to load donation data', err.message);
    } finally {
      setLoading(false);
    }
  };

  const openRecordReceiptModal = (catId?: number) => {
    const targetCatId = catId || selectedCatId || (fundCategories.length > 0 ? fundCategories[0].id : 1);
    setRcptCatId(targetCatId);
    setReceiptModalOpen(true);
  };

  useEffect(() => {
    if (selectedYearId) {
      loadData();
    }
  }, [selectedYearId, selectedCatId, receiptsPage, receiptSearch]);

  const activeFinancialYear = useMemo(() => {
    return years.find((y) => y.id === selectedYearId);
  }, [years, selectedYearId]);

  // Filtered fund categories for search
  const filteredFundCategories = useMemo(() => {
    if (!catSearch.trim()) return fundCategories;
    const q = catSearch.toLowerCase().trim();
    return fundCategories.filter(
      (c) =>
        (c.category_code && c.category_code.toLowerCase().includes(q)) ||
        (c.name_en && c.name_en.toLowerCase().includes(q)) ||
        (c.name_si && c.name_si.includes(q))
    );
  }, [fundCategories, catSearch]);

  const hasExactCatMatch = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return true;
    return fundCategories.some(
      (c) =>
        c.name_en.toLowerCase() === q ||
        (c.name_si && c.name_si.toLowerCase() === q)
    );
  }, [fundCategories, catSearch]);

  const showCategoryQuickCreate = Boolean(catSearch.trim() && !hasExactCatMatch);

  const selectedCategory = useMemo(() => {
    return fundCategories.find((c) => c.id === rcptCatId);
  }, [fundCategories, rcptCatId]);

  // Keyboard navigation inside Category Combobox
  const handleCatKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = filteredFundCategories.length + (showCategoryQuickCreate ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!catDropdownOpen) {
        setCatDropdownOpen(true);
        setHighlightedCatIndex(0);
        return;
      }
      if (totalItems > 0) {
        setHighlightedCatIndex((prev) => (prev + 1) % totalItems);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!catDropdownOpen) {
        setCatDropdownOpen(true);
        setHighlightedCatIndex(Math.max(0, totalItems - 1));
        return;
      }
      if (totalItems > 0) {
        setHighlightedCatIndex((prev) => (prev - 1 + totalItems) % totalItems);
      }
    } else if (e.key === 'Escape') {
      setCatDropdownOpen(false);
      setCatSearch('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedCatIndex >= 0 && highlightedCatIndex < filteredFundCategories.length) {
        const selected = filteredFundCategories[highlightedCatIndex];
        setRcptCatId(selected.id);
        setCatDropdownOpen(false);
        setCatSearch('');
      } else {
        openQuickCreateModal(catSearch.trim());
      }
    }
  };

  // Auto-scroll dropdown items on keyboard highlight
  useEffect(() => {
    if (catDropdownOpen && catDropdownRef.current && highlightedCatIndex >= 0) {
      const items = catDropdownRef.current.children;
      if (items[highlightedCatIndex]) {
        (items[highlightedCatIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedCatIndex, catDropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        catDropdownRef.current &&
        !catDropdownRef.current.contains(e.target as Node) &&
        catInputRef.current &&
        !catInputRef.current.contains(e.target as Node)
      ) {
        setCatDropdownOpen(false);
      }
    };
    if (catDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [catDropdownOpen]);

  // Open Quick-Create Modal and prompt for English & Sinhala terms
  const openQuickCreateModal = (prefillName: string = '') => {
    const trimmed = prefillName.trim();
    setQuickCatNameEn(trimmed);
    setQuickCatNameSi('');
    setQuickCatDesc('');
    setCatDropdownOpen(false);
    setQuickCreateModalOpen(true);
  };

  // Detailed Quick Create with English name, Sinhala term, and Description
  const handleConfirmDetailedQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setQuickCreatingCat(true);
    try {
      if (window.curtissApi?.financial?.createFundCategory) {
        const res = await window.curtissApi.financial.createFundCategory({
          name_en: cleanEn,
          name_si: cleanSi,
          description: quickCatDesc.trim() || undefined,
        });

        if (res.success && res.data) {
          success('Category Created', `"${res.data.name_en}" created and selected.`);
          await loadData();
          setRcptCatId(res.data.id);
          setQuickCreateModalOpen(false);
          setQuickCatNameEn('');
          setQuickCatNameSi('');
          setQuickCatDesc('');
          setCatDropdownOpen(false);
          setCatSearch('');
        } else {
          toastError('Failed to Create Category', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setQuickCreatingCat(false);
    }
  };

  // Create Fund Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameEn.trim()) {
      toastError('Validation Error', 'Category name is required.');
      return;
    }

    setSavingCat(true);
    try {
      if (window.curtissApi?.financial?.createFundCategory) {
        const res = await window.curtissApi.financial.createFundCategory({
          category_code: catCode.trim() || undefined,
          name_en: catNameEn.trim(),
          name_si: catNameSi.trim() || catNameEn.trim(),
          description: catDesc.trim() || undefined,
        });

        if (res.success) {
          success('Category Registered', `Category "${catNameEn.trim()}" created successfully.`);
          setCatCode('');
          setCatNameEn('');
          setCatNameSi('');
          setCatDesc('');
          loadData();
        } else {
          toastError('Failed to create category', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSavingCat(false);
    }
  };

  // Toggle Category Status
  const handleToggleCatStatus = async (cat: FundCategory) => {
    try {
      if (window.curtissApi?.financial?.updateFundCategory) {
        const res = await window.curtissApi.financial.updateFundCategory(cat.id, {
          is_active: !cat.is_active,
        });
        if (res.success) {
          success('Category Updated', `Category status changed to ${!cat.is_active ? 'Active' : 'Inactive'}.`);
          loadData();
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    }
  };

  // Create Inward Donation / Fund Receipt
  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) {
      toastError('Error', 'Please select an active financial year.');
      return;
    }
    const amountVal = parseFloat(rcptAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toastError('Invalid Amount', 'Please provide a valid donation amount greater than zero.');
      return;
    }
    if (!rcptDonor.trim()) {
      toastError('Required Field', 'Please enter the donor, parent, or government department name.');
      return;
    }
    if (!rcptCatId) {
      toastError('Required Field', 'Please select a category.');
      return;
    }
    const isChq = rcptMethod === 'cheque';
    if (isChq) {
      if (!rcptChequeNo.trim()) {
        toastError('Required Field', 'Please enter the cheque number.');
        return;
      }
      if (!rcptIssuingBank.trim()) {
        toastError('Required Field', 'Please enter the issuing bank name (e.g. Commercial Bank, BOC).');
        return;
      }
    } else {
      if ((rcptDest === 'bank' || rcptMethod === 'bank_transfer' || rcptMethod === 'direct_deposit') && !rcptBankId) {
        toastError('Required Field', 'Please select the destination bank account.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const cents = Math.round(amountVal * 100);
      const effectiveDest = isChq
        ? 'bank'
        : rcptMethod === 'bank_transfer' || rcptMethod === 'direct_deposit'
        ? 'bank'
        : rcptDest;

      const res = await window.curtissApi.financial.createFundReceipt({
        financial_year_id: selectedYearId,
        fund_category_id: rcptCatId,
        receipt_date: rcptDate,
        donor_or_dept: rcptDonor.trim(),
        amount_cents: cents,
        payment_method: rcptMethod,
        destination_type: effectiveDest,
        bank_account_id: isChq ? null : effectiveDest === 'bank' ? rcptBankId : null,
        reference_no: rcptRef.trim() || (isChq ? `CHQ-${rcptChequeNo.trim()}` : undefined),
        purpose: rcptPurpose.trim() || undefined,
        cheque_number: isChq ? rcptChequeNo.trim() : undefined,
        issuing_bank_name: isChq ? rcptIssuingBank.trim() : undefined,
        issuing_bank_branch: isChq ? (rcptIssuingBranch.trim() || undefined) : undefined,
        cheque_date: isChq ? rcptChequeDate : undefined,
      });

      if (res.success) {
        const destLabel = isChq
          ? 'Cheques Received (Pending Clearance in Cheque Management)'
          : effectiveDest === 'bank'
          ? `Bank Account (${bankAccounts.find((b) => b.id === rcptBankId)?.bank_name || 'Bank'})`
          : effectiveDest === 'petty_cash'
          ? 'Petty Cash Float'
          : 'Cash in Hand';
        success(
          'Donation / Fund Receipt Recorded',
          `Receipt ${res.data.receipt_no} recorded. Rs. ${amountVal.toFixed(2)} (${destLabel}).`
        );
        setReceiptModalOpen(false);
        setRcptDonor('');
        setRcptAmount('');
        setRcptRef('');
        setRcptPurpose('');
        setRcptChequeNo('');
        setRcptIssuingBank('');
        setRcptIssuingBranch('');
        setRcptChequeDate(new Date().toISOString().split('T')[0]);
        loadData();
      } else {
        toastError('Failed to record donation', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalReceiptPages = Math.ceil(receiptsTotal / RECEIPTS_PAGE_SIZE) || 1;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      {/* Clean Header */}
      <PageHeader
        title="Donations & Funds Management"
        actions={
          <div className="flex items-center space-x-2">
            {activeFinancialYear && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 mr-1">
                <Calendar className="w-3.5 h-3.5 mr-1" />
                Fiscal Year {activeFinancialYear.year_name} (Active)
              </span>
            )}
            <Button size="sm" onClick={() => openRecordReceiptModal()}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Record Donation / Fund</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCatManageModalOpen(true)}>
              <Settings className="w-3.5 h-3.5 mr-1" />
              <span>Manage Categories</span>
            </Button>
            <Button variant="outline" size="sm" onClick={loadData} isLoading={loading} title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {/* Modern Sleek KPI Cards (Inward Direct Deposit Summary) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 relative overflow-hidden border-l-4 border-l-emerald-500 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>TOTAL DONATIONS RECEIVED</span>
            <HeartHandshake className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-2">
            Rs. {(summary.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 relative overflow-hidden border-l-4 border-l-blue-500 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>DEPOSITED TO BANK</span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-2">
            Rs. {(summary.bank_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 relative overflow-hidden border-l-4 border-l-amber-500 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>DEPOSITED TO CASH IN HAND</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-2">
            Rs. {(summary.cash_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 relative overflow-hidden border-l-4 border-l-purple-500 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>TOTAL RECEIPTS COUNT</span>
            <FileText className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-2">
            {summary.total_count} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">Transactions</span>
          </div>
        </div>
      </div>

      {/* Category Pills & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/30 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-center space-x-1.5 overflow-x-auto max-w-full pb-0.5">
          <button
            onClick={() => {
              setSelectedCatId(null);
              setReceiptsPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${
              selectedCatId === null
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            }`}
          >
            All Categories ({summary.total_count})
          </button>

          {fundCategories.map((cat) => {
            const isSel = selectedCatId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCatId(cat.id);
                  setReceiptsPage(1);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                  isSel
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                }`}
              >
                <span>{i18n.language === 'si' && cat.name_si ? cat.name_si : cat.name_en}</span>
                {cat.total_received_cents !== undefined && cat.total_received_cents > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isSel ? 'bg-blue-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                    Rs. {(cat.total_received_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Live Search */}
        <div className="relative w-full sm:w-72 flex-shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={receiptSearch}
            onChange={(e) => {
              setReceiptSearch(e.target.value);
              setReceiptsPage(1);
            }}
            placeholder="Search donor, receipt no, purpose..."
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Receipts Ledger Card with Search & Server Pagination */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span>Donations & Inward Receipts Ledger</span>
          </CardTitle>
          <span className="text-xs text-zinc-500 font-mono">
            {receiptsTotal} Recorded Inflow{receiptsTotal === 1 ? '' : 's'}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Receipt No</th>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Donation Category</th>
                  <th className="py-2.5 px-3 font-semibold">Donor / Contributor</th>
                  <th className="py-2.5 px-3 font-semibold">Purpose / Description</th>
                  <th className="py-2.5 px-3 font-semibold">Deposited Directly Into</th>
                  <th className="py-2.5 px-3 font-semibold">Payment Method</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Amount Received</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-zinc-400">
                      No donation receipts found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  receipts.map((rcpt) => (
                    <tr key={rcpt.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="py-2.5 px-3 font-mono text-zinc-700 dark:text-zinc-300 font-semibold">
                        {rcpt.receipt_no}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{rcpt.receipt_date}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {rcpt.fund_category_name_en || 'General Donation'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        {rcpt.donor_or_dept}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 max-w-xs truncate">
                        {rcpt.purpose || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {rcpt.destination_type === 'bank' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                            <Building2 className="w-3 h-3 mr-1 text-blue-500" />
                            {rcpt.bank_name || 'Bank Account'}
                          </span>
                        ) : rcpt.destination_type === 'petty_cash' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
                            <Coins className="w-3 h-3 mr-1 text-purple-500" />
                            Petty Cash Float
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                            <Wallet className="w-3 h-3 mr-1 text-amber-500" />
                            Cash in Hand
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 capitalize">
                        {rcpt.payment_method.replace('_', ' ')}
                        {rcpt.reference_no && (
                          <span className="block text-[10px] text-zinc-400">Ref: {rcpt.reference_no}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        Rs. {(rcpt.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="success" size="sm">
                          {rcpt.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Bar */}
          <div className="py-3 px-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Showing {receipts.length > 0 ? (receiptsPage - 1) * RECEIPTS_PAGE_SIZE + 1 : 0} to{' '}
              {Math.min(receiptsPage * RECEIPTS_PAGE_SIZE, receiptsTotal)} of {receiptsTotal} donation receipts
            </span>
            <div className="flex items-center space-x-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReceiptsPage((p) => Math.max(1, p - 1))}
                disabled={receiptsPage <= 1}
                className="h-7 px-2"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                <span>Previous</span>
              </Button>
              <span className="px-2 font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                {receiptsPage} / {totalReceiptPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReceiptsPage((p) => Math.min(totalReceiptPages, p + 1))}
                disabled={receiptsPage >= totalReceiptPages}
                className="h-7 px-2"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Record Inward Donation / Fund Modal */}
      <Modal isOpen={receiptModalOpen} onClose={() => setReceiptModalOpen(false)} title="Record Inward Donation / Fund" maxWidth="lg">
        <form onSubmit={handleCreateReceipt} className="space-y-4 text-xs">
          {/* Donation Category Selection with Combobox & Quick-Create */}
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-0.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Donation Category <span className="text-rose-500">*</span>
                <span className="text-[10px] text-zinc-400 font-normal ml-1.5">(Use ↑/↓ & Enter)</span>
              </label>
              <button
                type="button"
                onClick={() => openQuickCreateModal(catSearch.trim())}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium inline-flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 inline" />
                <span>Quick-Create</span>
              </button>
            </div>

                {/* Combobox Dropdown */}
                {catDropdownOpen ? (
                  <div className="relative">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                      <input
                        ref={catInputRef}
                        type="text"
                        autoFocus
                        placeholder="Search code, English name, or සිංහල නම..."
                        value={catSearch}
                        onChange={(e) => {
                          setCatSearch(e.target.value);
                          setHighlightedCatIndex(0);
                        }}
                        onKeyDown={handleCatKeyDown}
                        className="w-full h-9 pl-9 pr-8 rounded-lg border border-blue-500 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
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

                    <div
                      ref={catDropdownRef}
                      className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl max-h-52 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800"
                    >
                      {filteredFundCategories.length === 0 && !showCategoryQuickCreate ? (
                        <div className="p-3 text-center text-xs text-zinc-400">
                          No categories match "{catSearch}"
                        </div>
                      ) : (
                        filteredFundCategories.map((c, idx) => {
                          const isSelected = c.id === rcptCatId;
                          const isHighlighted = idx === highlightedCatIndex;
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                setRcptCatId(c.id);
                                setCatDropdownOpen(false);
                                setCatSearch('');
                              }}
                              onMouseEnter={() => setHighlightedCatIndex(idx)}
                              className={`px-3 py-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                                isHighlighted
                                  ? 'bg-blue-50 dark:bg-blue-950/40 border-l-2 border-blue-600'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex flex-col">
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                                  {c.category_code && (
                                    <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                                      {c.category_code}
                                    </span>
                                  )}
                                  <span>{i18n.language === 'si' && c.name_si ? c.name_si : c.name_en}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 inline ml-1" />}
                                </div>
                                {c.name_si && c.name_en && (
                                  <div className="text-[11px] text-zinc-500 font-sinhala mt-0.5">
                                    {i18n.language === 'si' ? c.name_en : c.name_si}
                                  </div>
                                )}
                              </div>
                              {c.description && (
                                <span className="text-[11px] text-zinc-400 truncate max-w-[120px]">
                                  {c.description}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Quick-Create option in dropdown */}
                      {showCategoryQuickCreate && (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            openQuickCreateModal(catSearch.trim());
                          }}
                          onMouseEnter={() => setHighlightedCatIndex(filteredFundCategories.length)}
                          className={`p-2.5 cursor-pointer text-xs flex items-center justify-between transition-colors ${
                            highlightedCatIndex === filteredFundCategories.length
                              ? 'bg-blue-100 dark:bg-blue-900/60 ring-2 ring-blue-500 text-blue-800 dark:text-blue-200 font-medium'
                              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                          }`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="font-semibold">Quick-Create "{catSearch.trim()}" Category</span>
                          </div>
                          <span className="text-[10px] opacity-75 font-mono">
                            Press Enter
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    tabIndex={0}
                    onKeyDown={handleCatKeyDown}
                    onClick={() => setCatDropdownOpen(true)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer flex items-center justify-between text-xs hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {selectedCategory ? (
                      <div className="flex flex-col">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                          {selectedCategory.category_code && (
                            <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                              {selectedCategory.category_code}
                            </span>
                          )}
                          <span>
                            {i18n.language === 'si' && selectedCategory.name_si ? selectedCategory.name_si : selectedCategory.name_en}
                          </span>
                        </div>
                        {selectedCategory.name_si && selectedCategory.name_en && (
                          <span className="text-[11px] text-zinc-500 font-sinhala mt-0.5">
                            {i18n.language === 'si' ? selectedCategory.name_en : selectedCategory.name_si}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-400">Select or search category...</span>
                    )}
                    <ChevronDown className="w-4 h-4 text-zinc-400 ml-2 flex-shrink-0" />
                  </div>
                )}

                {/* Native fallback select for HTML form validation */}
                <select
                  value={rcptCatId}
                  onChange={(e) => setRcptCatId(Number(e.target.value))}
                  className="sr-only"
                  tabIndex={-1}
                  required
                >
                  {fundCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.category_code ? `${c.category_code} — ` : ''}{i18n.language === 'si' && c.name_si ? c.name_si : c.name_en}
                    </option>
                  ))}
                </select>
              </div>

          {/* Receipt Date & Amount */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Receipt Date *"
              type="date"
              value={rcptDate}
              onChange={(e) => setRcptDate(e.target.value)}
              required
            />
            <Input
              label="Donation Amount (Rs.) *"
              type="number"
              step="0.01"
              value={rcptAmount}
              onChange={(e) => setRcptAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Donor / Contributor */}
          <Input
            label="Donor / Contributor / Organization *"
            value={rcptDonor}
            onChange={(e) => setRcptDonor(e.target.value)}
            placeholder="e.g. Grade 10 Parents Batch / Ministry of Education"
            required
          />

          {/* Purpose / Notes */}
          <Input
            label="Purpose / Notes *"
            value={rcptPurpose}
            onChange={(e) => setRcptPurpose(e.target.value)}
            placeholder="e.g. Donation for Prize Giving / Laboratory Upgrade"
            required
          />

          {/* Payment Method & Destination Controls */}
          {rcptMethod === 'cheque' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Payment Method *</label>
                <select
                  value={rcptMethod}
                  onChange={(e) => setRcptMethod(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                >
                  <option value="cash">Cash in Hand</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="direct_deposit">Direct Deposit</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Clean Cheque Details Card */}
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Cheque Details (Auto-tracks under Cheques Received)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Cheque Number *"
                    value={rcptChequeNo}
                    onChange={(e) => setRcptChequeNo(e.target.value)}
                    placeholder="e.g. CHQ-992810"
                    required
                  />
                  <Input
                    label="Cheque Date *"
                    type="date"
                    value={rcptChequeDate}
                    onChange={(e) => setRcptChequeDate(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Issuing Bank Name *"
                    value={rcptIssuingBank}
                    onChange={(e) => setRcptIssuingBank(e.target.value)}
                    placeholder="e.g. Commercial Bank / BOC"
                    required
                  />
                  <Input
                    label="Issuing Branch"
                    value={rcptIssuingBranch}
                    onChange={(e) => setRcptIssuingBranch(e.target.value)}
                    placeholder="e.g. Colombo 07"
                  />
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">
                  Note: Cheque will be logged under Cheques Received. Receiving bank account will be credited when cleared or deposited in Cheque Management.
                </p>
              </div>
            </div>
          ) : rcptMethod === 'bank_transfer' || rcptMethod === 'direct_deposit' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Payment Method *</label>
                  <select
                    value={rcptMethod}
                    onChange={(e) => setRcptMethod(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="cheque">Cheque</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="direct_deposit">Direct Deposit</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <Input
                  label="Reference / Transfer / Slip No"
                  value={rcptRef}
                  onChange={(e) => setRcptRef(e.target.value)}
                  placeholder="e.g. TXN-992810 / SLIP-102"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 text-xs flex items-center space-x-2">
                <Landmark className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Directly credited into institutional account: <strong>{bankAccounts[0]?.bank_name || 'Bank of Ceylon'} ({bankAccounts[0]?.account_number || '1004829104'})</strong></span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Payment Method *</label>
                  <select
                    value={rcptMethod}
                    onChange={(e) => {
                      setRcptMethod(e.target.value as any);
                      setRcptDest('cash');
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="cheque">Cheque</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="direct_deposit">Direct Deposit</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <Input
                  label="Receipt / Reference No"
                  value={rcptRef}
                  onChange={(e) => setRcptRef(e.target.value)}
                  placeholder="e.g. RCPT-REF-102"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-2">
                <Wallet className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Cash receipts are directly debited into institutional <strong>Cash in Hand</strong>.</span>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => setReceiptModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              {rcptMethod === 'cheque' ? 'Record Cheque Receipt' : 'Deposit & Save Receipt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick-Create Category Popup Modal with Sinhala Term */}
      <Modal
        isOpen={quickCreateModalOpen}
        onClose={() => setQuickCreateModalOpen(false)}
        title="Quick-Create Donation Category"
        maxWidth="sm"
        zIndex="z-[60]"
      >
        <form onSubmit={handleConfirmDetailedQuickCreate} className="space-y-3.5">
          <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 flex items-center space-x-2 text-xs text-blue-800 dark:text-blue-300 font-medium">
            <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>Enter the Sinhala term for this category and save.</span>
          </div>

          <Input
            label="Category Name (English) *"
            value={quickCatNameEn}
            onChange={(e) => setQuickCatNameEn(e.target.value)}
            placeholder="e.g. Sports Sponsorship"
            required
          />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Sinhala Term (සිංහල නම) *</span>
              <span className="text-[10px] text-zinc-400 font-normal">Required</span>
            </label>
            <input
              type="text"
              autoFocus
              value={quickCatNameSi}
              onChange={(e) => setQuickCatNameSi(e.target.value)}
              placeholder="උදා: ක්‍රීඩා අනුග්‍රාහක අරමුදල"
              className="w-full h-9 px-3 rounded-lg border border-blue-500 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-sinhala focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <Input
            label="Description (Optional)"
            value={quickCatDesc}
            onChange={(e) => setQuickCatDesc(e.target.value)}
            placeholder="Brief purpose of this category..."
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuickCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={quickCreatingCat}
            >
              Save & Select Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manage Reusable Donation Categories Modal */}
      <Modal
        isOpen={catManageModalOpen}
        onClose={() => setCatManageModalOpen(false)}
        title="Manage Donation Categories"
        maxWidth="lg"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Active Donation Categories:
            </span>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border rounded-lg overflow-hidden">
              {fundCategories.map((c) => (
                <div key={c.id} className="p-3 flex items-center justify-between text-xs bg-white dark:bg-zinc-900">
                  <div>
                    <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                        {c.category_code}
                      </span>
                      <span>{c.name_en}</span>
                      <span className="text-[11px] text-zinc-500 font-sinhala">({c.name_si})</span>
                    </div>
                    {c.description && (
                      <div className="text-[11px] text-zinc-500 mt-0.5">{c.description}</div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={c.is_active ? 'success' : 'neutral'} size="sm">
                      {c.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => handleToggleCatStatus(c)}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Category Form */}
          <form onSubmit={handleCreateCategory} className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              + New Donation Category:
            </span>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Code (Optional)"
                value={catCode}
                onChange={(e) => setCatCode(e.target.value)}
                placeholder="e.g. FCAT-PRNT"
              />
              <Input
                label="Name (English)"
                value={catNameEn}
                onChange={(e) => setCatNameEn(e.target.value)}
                placeholder="e.g. Donations from Parents"
                required
              />
              <Input
                label="Name (Sinhala)"
                value={catNameSi}
                onChange={(e) => setCatNameSi(e.target.value)}
                placeholder="e.g. දෙමව්පිය පරිත්‍යාග"
              />
            </div>
            <Input
              label="Description"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="e.g. Voluntary donations, sponsorships, and funds from parents"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setCatManageModalOpen(false)}>
                Close
              </Button>
              <Button type="submit" isLoading={savingCat}>
                Save Category
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
};
