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
  FolderTree,
  FolderPlus,
  Folder,
  Edit2,
  Trash2,
  CornerDownRight,
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

  // Category Manage Form State (Main Category vs Subcategory Hierarchy)
  const [catLevel, setCatLevel] = useState<'main' | 'sub'>('main');
  const [catParentId, setCatParentId] = useState<number | null>(null);
  const [catCode, setCatCode] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catNameSi, setCatNameSi] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [editingCat, setEditingCat] = useState<FundCategory | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<number, boolean>>({});
  const [catManageSearch, setCatManageSearch] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<number | null>(null);

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
  const [quickCatLevel, setQuickCatLevel] = useState<'main' | 'sub'>('main');
  const [quickCatParentId, setQuickCatParentId] = useState<number | null>(null);
  const [quickCatCode, setQuickCatCode] = useState('');
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

  // Main categories and hierarchical grouping
  const mainCategories = useMemo(() => {
    return fundCategories.filter((c) => !c.parent_id);
  }, [fundCategories]);

  const categoryGroups = useMemo(() => {
    const groups: Array<{
      main: FundCategory;
      subs: FundCategory[];
      totalReceipts: number;
      totalReceivedCents: number;
    }> = [];

    const mainCats = fundCategories.filter((c) => !c.parent_id);
    const subCats = fundCategories.filter((c) => Boolean(c.parent_id));

    mainCats.forEach((main) => {
      const subs = subCats.filter((s) => s.parent_id === main.id);
      const subReceipts = subs.reduce((acc, s) => acc + (s.receipt_count || 0), 0);
      const subCents = subs.reduce((acc, s) => acc + (s.total_received_cents || 0), 0);
      groups.push({
        main,
        subs,
        totalReceipts: (main.receipt_count || 0) + subReceipts,
        totalReceivedCents: (main.total_received_cents || 0) + subCents,
      });
    });

    const orphanSubs = subCats.filter((s) => !mainCats.some((m) => m.id === s.parent_id));
    if (orphanSubs.length > 0) {
      groups.push({
        main: {
          id: -1,
          category_code: 'OTHER',
          name_en: 'Other Categories',
          name_si: 'වෙනත් ප්‍රවර්ග',
          is_active: true,
        },
        subs: orphanSubs,
        totalReceipts: orphanSubs.reduce((acc, s) => acc + (s.receipt_count || 0), 0),
        totalReceivedCents: orphanSubs.reduce((acc, s) => acc + (s.total_received_cents || 0), 0),
      });
    }

    return groups;
  }, [fundCategories]);

  const fetchSuggestedCatCode = async (level: 'main' | 'sub', parentId?: number | null) => {
    if (window.curtissApi?.financial?.suggestFundCategoryCode) {
      try {
        const targetParent = level === 'sub' ? parentId : null;
        const res = await window.curtissApi.financial.suggestFundCategoryCode(targetParent);
        if (res.success && res.data) {
          setCatCode(res.data);
        }
      } catch (e) {}
    }
  };

  const handleSelectLevel = async (level: 'main' | 'sub', defaultParentId?: number | null) => {
    setCatLevel(level);
    const pId = level === 'sub' ? (defaultParentId || (mainCategories[0]?.id ?? null)) : null;
    setCatParentId(pId);
    if (!editingCat) {
      await fetchSuggestedCatCode(level, pId);
    }
  };

  const handleStartEditCategory = (cat: FundCategory) => {
    setEditingCat(cat);
    setCatCode(cat.category_code || '');
    setCatNameEn(cat.name_en || '');
    setCatNameSi(cat.name_si || '');
    setCatDesc(cat.description || '');
    if (cat.parent_id) {
      setCatLevel('sub');
      setCatParentId(cat.parent_id);
    } else {
      setCatLevel('main');
      setCatParentId(null);
    }
  };

  const handleCancelEditCategory = () => {
    setEditingCat(null);
    setCatCode('');
    setCatNameEn('');
    setCatNameSi('');
    setCatDesc('');
    setCatLevel('main');
    setCatParentId(null);
  };

  // Open Quick-Create Modal and prompt for English & Sinhala terms and level
  const openQuickCreateModal = async (prefillName: string = '') => {
    const trimmed = prefillName.trim();
    setQuickCatNameEn(trimmed);
    setQuickCatNameSi('');
    setQuickCatDesc('');
    const defaultParent = mainCategories[0]?.id || null;
    const defaultLevel = defaultParent ? 'sub' : 'main';
    setQuickCatLevel(defaultLevel);
    setQuickCatParentId(defaultParent);
    if (window.curtissApi?.financial?.suggestFundCategoryCode) {
      try {
        const cRes = await window.curtissApi.financial.suggestFundCategoryCode(defaultLevel === 'sub' ? defaultParent : null);
        if (cRes.success && cRes.data) setQuickCatCode(cRes.data);
      } catch (e) {}
    }
    setCatDropdownOpen(false);
    setQuickCreateModalOpen(true);
  };

  // Detailed Quick Create with English name, Sinhala term, Parent, and Code
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
        const targetParent = quickCatLevel === 'sub' ? quickCatParentId : null;
        const res = await window.curtissApi.financial.createFundCategory({
          category_code: quickCatCode.trim() || undefined,
          name_en: cleanEn,
          name_si: cleanSi,
          parent_id: targetParent,
          description: quickCatDesc.trim() || undefined,
        });

        if (res.success && res.data) {
          success('Category Created', `"${res.data.name_en}" (${res.data.category_code}) created and selected.`);
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

  // Create or Update Fund Category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEn = catNameEn.trim();
    const cleanSi = catNameSi.trim() || cleanEn;
    if (!cleanEn) {
      toastError('Validation Error', 'Category English name is required.');
      return;
    }
    if (catLevel === 'sub' && !catParentId) {
      toastError('Validation Error', 'Please select a Main Parent Category for this subcategory.');
      return;
    }

    setSavingCat(true);
    try {
      if (editingCat) {
        if (window.curtissApi?.financial?.updateFundCategory) {
          const res = await window.curtissApi.financial.updateFundCategory(editingCat.id, {
            category_code: catCode.trim() || undefined,
            name_en: cleanEn,
            name_si: cleanSi,
            parent_id: catLevel === 'sub' ? catParentId : null,
            description: catDesc.trim() || undefined,
          });

          if (res.success) {
            success('Category Updated', `Category "${cleanEn}" updated successfully.`);
            handleCancelEditCategory();
            loadData();
          } else {
            toastError('Failed to update category', res.error);
          }
        }
      } else {
        if (window.curtissApi?.financial?.createFundCategory) {
          const res = await window.curtissApi.financial.createFundCategory({
            category_code: catCode.trim() || undefined,
            name_en: cleanEn,
            name_si: cleanSi,
            parent_id: catLevel === 'sub' ? catParentId : null,
            description: catDesc.trim() || undefined,
          });

          if (res.success) {
            success('Category Registered', `Category "${cleanEn}" (${res.data?.category_code}) created successfully.`);
            setCatNameEn('');
            setCatNameSi('');
            setCatDesc('');
            fetchSuggestedCatCode(catLevel, catParentId);
            loadData();
          } else {
            toastError('Failed to create category', res.error);
          }
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSavingCat(false);
    }
  };

  // Delete Category Safely
  const handleDeleteCategory = async (cat: FundCategory) => {
    if (!window.confirm(`Are you sure you want to permanently delete category "${cat.name_en}" (${cat.category_code})?`)) {
      return;
    }
    setDeletingCatId(cat.id);
    try {
      if (window.curtissApi?.financial?.deleteFundCategory) {
        const res = await window.curtissApi.financial.deleteFundCategory(cat.id);
        if (res.success) {
          success('Category Deleted', `Category "${cat.name_en}" removed successfully.`);
          if (editingCat?.id === cat.id) handleCancelEditCategory();
          loadData();
        } else {
          toastError('Cannot Delete Category', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error Deleting Category', err.message);
    } finally {
      setDeletingCatId(null);
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

      {/* Category Pills & Filter Bar (Main Categories & Granular Subcategory Drilldown) */}
      <div className="space-y-2 bg-zinc-50/50 dark:bg-zinc-900/30 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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

            {categoryGroups.map((group) => {
              const main = group.main;
              const isMainSelected = selectedCatId === main.id || group.subs.some((s) => s.id === selectedCatId);
              return (
                <button
                  key={main.id}
                  onClick={() => {
                    setSelectedCatId(main.id);
                    setReceiptsPage(1);
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                    isMainSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                  }`}
                >
                  {main.category_code && (
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${isMainSelected ? 'bg-blue-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                      {main.category_code}
                    </span>
                  )}
                  <span>{i18n.language === 'si' && main.name_si ? main.name_si : main.name_en}</span>
                  {group.totalReceivedCents > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isMainSelected ? 'bg-blue-800 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                      Rs. {(group.totalReceivedCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
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

        {/* Subcategory Drilldown Pills for Selected Main Category */}
        {(() => {
          if (!selectedCatId) return null;
          const activeGroup = categoryGroups.find(
            (g) => g.main.id === selectedCatId || g.subs.some((s) => s.id === selectedCatId)
          );
          if (!activeGroup || activeGroup.subs.length === 0) return null;

          return (
            <div className="flex items-center space-x-1.5 overflow-x-auto pt-1.5 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px]">
              <span className="text-zinc-400 text-[10px] uppercase font-bold tracking-wider mr-1">Subcategories:</span>
              <button
                onClick={() => {
                  setSelectedCatId(activeGroup.main.id);
                  setReceiptsPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all whitespace-nowrap ${
                  selectedCatId === activeGroup.main.id
                    ? 'bg-zinc-800 text-white border-zinc-800 dark:bg-zinc-200 dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                }`}
              >
                All in {activeGroup.main.category_code}
              </button>
              {activeGroup.subs.map((sub) => {
                const isSubSel = selectedCatId === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setSelectedCatId(sub.id);
                      setReceiptsPage(1);
                    }}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all whitespace-nowrap ${
                      isSubSel
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <span className="font-mono text-[10px] opacity-75">{sub.category_code}</span>
                    <span>{i18n.language === 'si' && sub.name_si ? sub.name_si : sub.name_en}</span>
                    {sub.total_received_cents !== undefined && sub.total_received_cents > 0 && (
                      <span className={`px-1 py-0.2 rounded text-[9px] font-mono ${isSubSel ? 'bg-blue-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                        Rs. {(sub.total_received_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}
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
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-1.5">
                            {rcpt.fund_category_code && (
                              <span className="font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold">
                                {rcpt.fund_category_code}
                              </span>
                            )}
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                              {i18n.language === 'si' && rcpt.fund_category_name_si ? rcpt.fund_category_name_si : (rcpt.fund_category_name_en || 'General Donation')}
                            </span>
                          </div>
                          {rcpt.parent_category_name_en && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono pl-0.5 mt-0.5 flex items-center space-x-1">
                              <CornerDownRight className="w-3 h-3 inline text-zinc-400" />
                              <span>{rcpt.parent_category_code ? `${rcpt.parent_category_code} ` : ''}{i18n.language === 'si' && rcpt.parent_category_name_si ? rcpt.parent_category_name_si : rcpt.parent_category_name_en}</span>
                            </span>
                          )}
                        </div>
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
                                    <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px] font-bold">
                                      {c.category_code}
                                    </span>
                                  )}
                                  <span>{i18n.language === 'si' && c.name_si ? c.name_si : c.name_en}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 inline ml-1" />}
                                </div>
                                <div className="flex items-center space-x-2 text-[10px] text-zinc-400 mt-0.5">
                                  {c.parent_name_en ? (
                                    <span>↳ {c.parent_code} {c.parent_name_en}</span>
                                  ) : (
                                    <span className="text-blue-600 dark:text-blue-400 font-semibold uppercase text-[9px]">[Main Category]</span>
                                  )}
                                  {c.name_si && c.name_en && (
                                    <span className="font-sinhala text-zinc-500">
                                      • {i18n.language === 'si' ? c.name_en : c.name_si}
                                    </span>
                                  )}
                                </div>
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
                            <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px] font-bold">
                              {selectedCategory.category_code}
                            </span>
                          )}
                          <span>
                            {i18n.language === 'si' && selectedCategory.name_si ? selectedCategory.name_si : selectedCategory.name_en}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-zinc-500 mt-0.5">
                          {selectedCategory.parent_name_en ? (
                            <span className="font-mono">
                              ↳ {selectedCategory.parent_code} {selectedCategory.parent_name_en}
                            </span>
                          ) : (
                            <span className="text-blue-600 dark:text-blue-400 font-semibold text-[10px] uppercase">[Main Category]</span>
                          )}
                          {selectedCategory.name_si && selectedCategory.name_en && (
                            <span className="font-sinhala">
                              • {i18n.language === 'si' ? selectedCategory.name_en : selectedCategory.name_si}
                            </span>
                          )}
                        </div>
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
                  {categoryGroups.map((g) => (
                    <optgroup
                      key={g.main.id}
                      label={`${g.main.category_code ? `${g.main.category_code} — ` : ''}${g.main.name_en}`}
                    >
                      {g.subs.length === 0 ? (
                        <option value={g.main.id}>
                          {g.main.category_code ? `${g.main.category_code} — ` : ''}{g.main.name_en} ({g.main.name_si})
                        </option>
                      ) : (
                        g.subs.map((s) => (
                          <option key={s.id} value={s.id}>
                            &nbsp;&nbsp;{s.category_code ? `${s.category_code} — ` : ''}{s.name_en} ({s.name_si})
                          </option>
                        ))
                      )}
                    </optgroup>
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

      {/* Quick-Create Category Popup Modal with Hierarchy & Code */}
      <Modal
        isOpen={quickCreateModalOpen}
        onClose={() => setQuickCreateModalOpen(false)}
        title="Quick-Create Donation Category"
        maxWidth="md"
        zIndex="z-[60]"
      >
        <form onSubmit={handleConfirmDetailedQuickCreate} className="space-y-3.5">
          <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 flex items-center space-x-2 text-xs text-blue-800 dark:text-blue-300 font-medium">
            <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>Create a new Main Category or Subcategory with code.</span>
          </div>

          {/* Level Selection Tabs */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Category Level *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => {
                  setQuickCatLevel('main');
                  setQuickCatParentId(null);
                  if (window.curtissApi?.financial?.suggestFundCategoryCode) {
                    const cRes = await window.curtissApi.financial.suggestFundCategoryCode(null);
                    if (cRes.success && cRes.data) setQuickCatCode(cRes.data);
                  }
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center space-x-1.5 ${
                  quickCatLevel === 'main'
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Main Category</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setQuickCatLevel('sub');
                  const pId = quickCatParentId || mainCategories[0]?.id || null;
                  setQuickCatParentId(pId);
                  if (window.curtissApi?.financial?.suggestFundCategoryCode) {
                    const cRes = await window.curtissApi.financial.suggestFundCategoryCode(pId);
                    if (cRes.success && cRes.data) setQuickCatCode(cRes.data);
                  }
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center space-x-1.5 ${
                  quickCatLevel === 'sub'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Subcategory</span>
              </button>
            </div>
          </div>

          {/* Parent Category Selector (If Subcategory) */}
          {quickCatLevel === 'sub' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Parent Main Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={quickCatParentId || ''}
                onChange={async (e) => {
                  const val = Number(e.target.value);
                  setQuickCatParentId(val);
                  if (window.curtissApi?.financial?.suggestFundCategoryCode) {
                    const cRes = await window.curtissApi.financial.suggestFundCategoryCode(val);
                    if (cRes.success && cRes.data) setQuickCatCode(cRes.data);
                  }
                }}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                required
              >
                {mainCategories.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.category_code} — {m.name_en} ({m.name_si})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Code *</label>
              <input
                type="text"
                value={quickCatCode}
                onChange={(e) => setQuickCatCode(e.target.value)}
                placeholder="Code"
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Category Name (English) *"
                value={quickCatNameEn}
                onChange={(e) => setQuickCatNameEn(e.target.value)}
                placeholder="e.g. Sports Sponsorship"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Sinhala Term (සිංහල නම) *</span>
              <span className="text-[10px] text-zinc-400 font-normal">Required</span>
            </label>
            <input
              type="text"
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

      {/* Manage Reusable Donation Categories Modal (Hierarchical Main & Sub Categories) */}
      <Modal
        isOpen={catManageModalOpen}
        onClose={() => {
          setCatManageModalOpen(false);
          handleCancelEditCategory();
        }}
        title="Manage Fund & Donation Categories"
        maxWidth="2xl"
      >
        <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
          {/* Header Stats & Search */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-50/70 dark:bg-zinc-900/40 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80">
            <div className="flex items-center space-x-2 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
              <FolderTree className="w-4 h-4 text-blue-500" />
              <span>
                <strong>{mainCategories.length}</strong> Main Categories •{' '}
                <strong>{fundCategories.filter((c) => Boolean(c.parent_id)).length}</strong> Subcategories
              </span>
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={catManageSearch}
                onChange={(e) => setCatManageSearch(e.target.value)}
                placeholder="Search category or code..."
                className="w-full h-7 pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Hierarchical Categories Tree List */}
          <div className="space-y-3">
            {categoryGroups
              .filter((group) => {
                if (!catManageSearch.trim()) return true;
                const q = catManageSearch.toLowerCase().trim();
                const matchesMain =
                  (group.main.category_code && group.main.category_code.toLowerCase().includes(q)) ||
                  (group.main.name_en && group.main.name_en.toLowerCase().includes(q)) ||
                  (group.main.name_si && group.main.name_si.includes(q));
                const matchesSub = group.subs.some(
                  (s) =>
                    (s.category_code && s.category_code.toLowerCase().includes(q)) ||
                    (s.name_en && s.name_en.toLowerCase().includes(q)) ||
                    (s.name_si && s.name_si.includes(q))
                );
                return matchesMain || matchesSub;
              })
              .map((group) => {
                const main = group.main;
                const isCollapsed = Boolean(collapsedGroupIds[main.id]);

                return (
                  <div
                    key={main.id}
                    className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-xs"
                  >
                    {/* Main Category Header Row */}
                    <div className="p-3 bg-zinc-50/60 dark:bg-zinc-900/60 flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {group.subs.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedGroupIds((prev) => ({
                                ...prev,
                                [main.id]: !prev[main.id],
                              }))
                            }
                            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <span className="font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold text-xs">
                          {main.category_code}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {main.name_en}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-sinhala">
                            {main.name_si}
                          </span>
                        </div>
                        <Badge variant="neutral" size="sm" className="hidden sm:inline-flex">
                          {group.subs.length} Subcategories
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {group.totalReceivedCents > 0 && (
                          <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 mr-2">
                            Rs. {(group.totalReceivedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        {main.id > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleSelectLevel('sub', main.id)}
                            title="Add subcategory under this category"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            <span>Add Sub</span>
                          </Button>
                        )}
                        {main.id > 0 && (
                          <button
                            type="button"
                            onClick={() => handleStartEditCategory(main)}
                            className="p-1 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                            title="Edit Category"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {main.id > 0 && (
                          <button
                            type="button"
                            onClick={() => handleToggleCatStatus(main)}
                            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                          >
                            {main.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                        {main.id > 0 && (
                          <button
                            type="button"
                            disabled={deletingCatId === main.id}
                            onClick={() => handleDeleteCategory(main)}
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                            title="Delete Category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subcategories Indented List */}
                    {!isCollapsed && group.subs.length > 0 && (
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900">
                        {group.subs.map((sub) => (
                          <div
                            key={sub.id}
                            className="p-2.5 pl-8 flex items-center justify-between text-xs hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <CornerDownRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-bold">
                                {sub.category_code}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {sub.name_en}
                                </span>
                                <span className="text-[11px] text-zinc-500 font-sinhala">
                                  {sub.name_si}
                                </span>
                              </div>
                              {sub.description && (
                                <span className="text-[11px] text-zinc-400 truncate max-w-xs hidden md:inline">
                                  • {sub.description}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              {sub.total_received_cents !== undefined && sub.total_received_cents > 0 && (
                                <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 mr-2">
                                  Rs. {(sub.total_received_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              <Badge variant={sub.is_active ? 'success' : 'neutral'} size="sm">
                                {sub.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                              <button
                                type="button"
                                onClick={() => handleStartEditCategory(sub)}
                                className="p-1 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                                title="Edit Subcategory"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleCatStatus(sub)}
                                className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                              >
                                {sub.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                disabled={deletingCatId === sub.id}
                                onClick={() => handleDeleteCategory(sub)}
                                className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                                title="Delete Subcategory"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Add / Edit Category Form Card */}
          <form
            onSubmit={handleSaveCategory}
            className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
                {editingCat ? (
                  <>
                    <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Editing Category: {editingCat.category_code} — {editingCat.name_en}</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      + Create New{' '}
                      {catLevel === 'sub'
                        ? `Subcategory under "${mainCategories.find((m) => m.id === catParentId)?.name_en || 'Main Category'}"`
                        : 'Main Category'}
                    </span>
                  </>
                )}
              </span>

              {editingCat && (
                <button
                  type="button"
                  onClick={handleCancelEditCategory}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Level Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectLevel('main')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  catLevel === 'main'
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Main Category Level</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectLevel('sub', catParentId || mainCategories[0]?.id)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  catLevel === 'sub'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Subcategory Level</span>
              </button>
            </div>

            {/* Parent Category Selector (If Subcategory) */}
            {catLevel === 'sub' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Parent Main Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={catParentId || ''}
                  onChange={(e) => {
                    const newParentId = Number(e.target.value);
                    setCatParentId(newParentId);
                    if (!editingCat) {
                      fetchSuggestedCatCode('sub', newParentId);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                  required
                >
                  {mainCategories.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.category_code} — {m.name_en} ({m.name_si})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Category Code *</label>
                  <button
                    type="button"
                    onClick={() => fetchSuggestedCatCode(catLevel, catParentId)}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Auto
                  </button>
                </div>
                <input
                  type="text"
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value)}
                  placeholder={catLevel === 'sub' ? 'e.g. 1.1' : 'e.g. FCAT-001'}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <Input
                label="Name (English) *"
                value={catNameEn}
                onChange={(e) => setCatNameEn(e.target.value)}
                placeholder="e.g. Alumni Contributions"
                required
              />

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Name (Sinhala) *</label>
                <input
                  type="text"
                  value={catNameSi}
                  onChange={(e) => setCatNameSi(e.target.value)}
                  placeholder="e.g. හිටපු සිසුන්ගේ ආධාර"
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-sinhala focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <Input
              label="Description (Optional)"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="e.g. Voluntary donations, sponsorships, and funds from parents"
            />

            <div className="flex justify-end space-x-2 pt-1">
              <Button
                variant="outline"
                type="button"
                size="sm"
                onClick={() => {
                  setCatManageModalOpen(false);
                  handleCancelEditCategory();
                }}
              >
                Close
              </Button>
              <Button type="submit" size="sm" isLoading={savingCat}>
                {editingCat ? 'Update Category' : 'Save Category'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
};
