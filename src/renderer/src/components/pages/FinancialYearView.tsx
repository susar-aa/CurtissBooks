import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Plus,
  Lock,
  Edit3,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Search,
  Sparkles,
  AlertTriangle,
  FolderPlus,
  ShieldCheck,
  ChevronRight,
  Layers,
  ArrowLeft,
  Calendar,
  Clock,
  Eye,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  FinancialYear,
  FinancialYearDetail,
  BudgetAllocationItem,
  ReusableCategory,
} from '../../../shared/types/finance';

interface SubcategoryRowProps {
  alloc: BudgetAllocationItem;
  originalIndex: number;
  isReadOnly: boolean;
  onAmountChange: (index: number, valStr: string) => void;
  onNotesChange: (index: number, notesStr: string) => void;
  onRemoveCategory: (index: number) => void;
  onEditCategory: (cat: {
    id: number;
    category_code: string;
    name: string;
    name_si?: string;
    is_parent?: boolean;
  }) => void;
  t: any;
}

const SubcategoryRow: React.FC<SubcategoryRowProps> = React.memo(
  ({
    alloc,
    originalIndex,
    isReadOnly,
    onAmountChange,
    onNotesChange,
    onRemoveCategory,
    onEditCategory,
    t,
  }) => {
    const [amountStr, setAmountStr] = useState<string>(
      alloc.allocated_amount_cents === 0 ? '' : (alloc.allocated_amount_cents / 100).toString()
    );
    const [notesStr, setNotesStr] = useState<string>(alloc.notes || '');

    useEffect(() => {
      const formatted =
        alloc.allocated_amount_cents === 0 ? '' : (alloc.allocated_amount_cents / 100).toString();
      if (formatted !== amountStr) {
        setAmountStr(formatted);
      }
    }, [alloc.allocated_amount_cents]);

    useEffect(() => {
      if ((alloc.notes || '') !== notesStr) {
        setNotesStr(alloc.notes || '');
      }
    }, [alloc.notes]);

    const handleAmountChangeLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setAmountStr(val);
      onAmountChange(originalIndex, val);
    };

    const handleNotesChangeLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setNotesStr(val);
      onNotesChange(originalIndex, val);
    };

    return (
      <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
        <td className="py-2.5 px-4 text-center text-zinc-400 font-mono">
          {originalIndex + 1}
        </td>
        <td className="py-2.5 px-4 pl-8">
          <div className="flex items-center space-x-2">
            <ChevronRight className="w-3 h-3 text-zinc-400 flex-shrink-0" />
            {alloc.category_code && (
              <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-semibold flex-shrink-0">
                {alloc.category_code}
              </span>
            )}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {alloc.category_name}
            </span>
          </div>
          {alloc.category_name_si && alloc.category_name_si !== alloc.category_name && (
            <div className="text-[11px] text-zinc-500 font-sinhala ml-5 mt-0.5">
              {alloc.category_name_si}
            </div>
          )}
        </td>
        <td className="py-2.5 px-4">
          <div className="relative">
            <span className="absolute left-2.5 top-2 text-zinc-400 font-mono text-[11px]">
              Rs.
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={isReadOnly}
              value={amountStr}
              placeholder="0.00"
              onChange={handleAmountChangeLocal}
              className="w-full pl-8 pr-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono text-right focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>
        </td>
        <td className="py-2.5 px-4">
          <input
            type="text"
            disabled={isReadOnly}
            value={notesStr}
            placeholder={t('optionalNotes')}
            onChange={handleNotesChangeLocal}
            className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 disabled:opacity-75 disabled:cursor-not-allowed"
          />
        </td>
        {!isReadOnly && (
          <td className="py-2.5 px-4 text-center">
            <div className="flex items-center justify-center space-x-1">
              <button
                type="button"
                onClick={() =>
                  onEditCategory({
                    id: alloc.category_id,
                    category_code: alloc.category_code || '',
                    name: alloc.category_name,
                    name_si: alloc.category_name_si || '',
                    is_parent: false,
                  })
                }
                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Edit Subcategory Code & Name"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveCategory(originalIndex)}
                className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title={t('actions.remove')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  }
);

export const FinancialYearView: React.FC = () => {
  const { t } = useTranslation('finance');
  const { t: tCommon } = useTranslation('common');
  const { success, error: toastError, warning } = useToast();

  const [activeView, setActiveView] = useState<'list' | 'detail'>('list');
  const [listSearch, setListSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'approved' | 'closed'>('all');

  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [currentYearDetail, setCurrentYearDetail] = useState<FinancialYearDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  // Form State
  const [yearName, setYearName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allocations, setAllocations] = useState<BudgetAllocationItem[]>([]);
  const [isNewYear, setIsNewYear] = useState(false);

  // Category Search & Quick-Create
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReusableCategory[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll dropdown items on keyboard highlight
  useEffect(() => {
    if (dropdownOpen && dropdownListRef.current && highlightedIndex >= 0) {
      const items = dropdownListRef.current.children;
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, dropdownOpen]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Approval Modal State
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  // End Year Modal State
  const [endYearModalOpen, setEndYearModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [endingYear, setEndingYear] = useState(false);

  // New Category Modal State
  const [newCatModalOpen, setNewCatModalOpen] = useState(false);
  const [newCatClassification, setNewCatClassification] = useState<'sub' | 'main'>('sub');
  const [newCatParentId, setNewCatParentId] = useState<number | null>(null);
  const [mainCategoriesList, setMainCategoriesList] = useState<ReusableCategory[]>([]);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameSi, setNewCatNameSi] = useState('');
  const [newCatAllocAmount, setNewCatAllocAmount] = useState('');
  const [newCatNotes, setNewCatNotes] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Edit Category Modal State
  const [editCatModalOpen, setEditCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    id: number;
    category_code: string;
    name: string;
    name_si?: string;
    is_parent?: boolean;
  } | null>(null);
  const [editCatCode, setEditCatCode] = useState('');
  const [editCatName, setEditCatName] = useState('');
  const [editCatNameSi, setEditCatNameSi] = useState('');
  const [savingCategoryEdit, setSavingCategoryEdit] = useState(false);

  // Existing Category Allocation Modal State
  const [allocExistingModalOpen, setAllocExistingModalOpen] = useState(false);
  const [selectedExistingCat, setSelectedExistingCat] = useState<ReusableCategory | null>(null);
  const [existingCatAmount, setExistingCatAmount] = useState('');
  const [existingCatNotes, setExistingCatNotes] = useState('');

  const focusSearchInput = () => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // 1. Load Financial Years List
  const loadYears = async (autoSelectId?: number) => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial?.getYears) {
        const res = await window.curtissApi.financial.getYears();
        if (res.success && res.data) {
          setYears(res.data);
          if (autoSelectId) {
            setSelectedYearId(autoSelectId);
            setIsNewYear(false);
            await loadYearDetail(autoSelectId);
          }
        }
      }
    } catch (err: any) {
      toastError('Failed to load financial years', err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Load Selected Year Details
  const loadYearDetail = async (id: number) => {
    try {
      if (window.curtissApi?.financial?.getYearDetail) {
        const res = await window.curtissApi.financial.getYearDetail(id);
        if (res.success && res.data) {
          const detail: FinancialYearDetail = res.data;
          setCurrentYearDetail(detail);
          setYearName(detail.year_name);
          setStartDate(detail.start_date);
          setEndDate(detail.end_date);
          setAllocations(detail.allocations || []);
          setIsNewYear(false);
        }
      }
    } catch (err: any) {
      toastError('Failed to load year details', err.message);
    }
  };

  useEffect(() => {
    loadYears();
  }, []);

  // Handle switching years / opening panel
  const handleSelectYear = async (id: number) => {
    setSelectedYearId(id);
    setIsNewYear(false);
    setActiveView('detail');
    await loadYearDetail(id);
  };

  // Handle Start New Year Form
  const handleStartNewYear = () => {
    setIsNewYear(true);
    setSelectedYearId(null);
    setCurrentYearDetail(null);
    const nextYear = new Date().getFullYear() + 1;
    setYearName(`FY-${nextYear}`);
    setStartDate(`${nextYear}-01-01`);
    setEndDate(`${nextYear}-12-31`);
    setAllocations([]);
    setActiveView('detail');
  };

  const handleBackToList = () => {
    setActiveView('list');
    loadYears();
  };

  // 3. Category Search & Autocomplete
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const searchCategories = async (query: string) => {
    setIsSearching(true);
    try {
      if (window.curtissApi?.financial?.getReusableCategories) {
        const res = await window.curtissApi.financial.getReusableCategories(query.trim(), true);
        if (res.success && res.data) {
          setSearchResults(res.data);
          setDropdownOpen(true);
          setHighlightedIndex(0);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchFocus = () => {
    searchCategories(searchQuery);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setHighlightedIndex(0);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchCategories(val);
    }, 150);
  };

  // 4. Existing Category Allocation Modal
  const openAllocateExistingModal = (cat: ReusableCategory) => {
    setSelectedExistingCat(cat);
    const existingAlloc = allocations.find((a) => a.category_id === cat.id);
    setExistingCatAmount(existingAlloc && existingAlloc.allocated_amount_cents > 0 ? (existingAlloc.allocated_amount_cents / 100).toString() : '');
    setExistingCatNotes(existingAlloc?.notes || '');
    setDropdownOpen(false);
    setAllocExistingModalOpen(true);
  };

  const handleConfirmAllocateExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExistingCat) return;

    const amountNum = parseFloat(existingCatAmount);
    const cents = isNaN(amountNum) || amountNum < 0 ? 0 : Math.round(amountNum * 100);

    setAllocations((prev) => {
      const existsIndex = prev.findIndex((a) => a.category_id === selectedExistingCat.id);
      if (existsIndex >= 0) {
        const copy = [...prev];
        copy[existsIndex] = {
          ...copy[existsIndex],
          allocated_amount_cents: cents,
          notes: existingCatNotes.trim(),
        };
        return copy;
      } else {
        return [
          ...prev,
          {
            category_id: selectedExistingCat.id,
            category_code: selectedExistingCat.category_code,
            category_name: selectedExistingCat.name,
            category_name_si: selectedExistingCat.name_si,
            parent_id: selectedExistingCat.parent_id || null,
            parent_code: selectedExistingCat.parent_code || null,
            parent_name: selectedExistingCat.parent_name || null,
            allocated_amount_cents: cents,
            notes: existingCatNotes.trim(),
          },
        ];
      }
    });

    success('Category Added', `Allocated Rs. ${(cents / 100).toFixed(2)} to "${selectedExistingCat.name}".`);
    setAllocExistingModalOpen(false);
    setSearchQuery('');
    focusSearchInput();
  };

  // Helper to fetch auto-suggested category code
  const fetchSuggestedCategoryCode = async (parentId?: number | null) => {
    try {
      if (window.curtissApi?.financial?.suggestCategoryCode) {
        const res = await window.curtissApi.financial.suggestCategoryCode(parentId);
        if (res.success && res.data) {
          setNewCatCode(res.data);
        }
      }
    } catch {
      // ignore
    }
  };

  // 5. Open Create Category Modal
  const openCreateCategoryModal = async (nameToPreFill: string, preSelectParentId?: number | null) => {
    setNewCatName(nameToPreFill.trim());
    setNewCatNameSi('');
    setNewCatAllocAmount('');
    setNewCatNotes('');
    setDropdownOpen(false);

    let chosenParentId: number | null = null;
    try {
      if (window.curtissApi?.financial?.getReusableCategories) {
        const res = await window.curtissApi.financial.getReusableCategories('', true);
        if (res.success && res.data) {
          const mains = res.data.filter((c: any) => c.is_parent || c.parent_id === null);
          setMainCategoriesList(mains);
          if (preSelectParentId) {
            setNewCatClassification('sub');
            setNewCatParentId(preSelectParentId);
            chosenParentId = preSelectParentId;
          } else if (mains.length > 0) {
            setNewCatClassification('sub');
            setNewCatParentId(mains[0].id);
            chosenParentId = mains[0].id;
          } else {
            setNewCatClassification('main');
            setNewCatParentId(null);
            chosenParentId = null;
          }
        }
      }
    } catch {
      // fallback
    }

    fetchSuggestedCategoryCode(chosenParentId);
    setNewCatModalOpen(true);
  };

  // Submit New Category Modal
  const handleConfirmCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    const cleanSi = newCatNameSi.trim();

    if (!cleanName) {
      toastError('Validation Error', t('validation.nameRequired'));
      return;
    }

    const amountNum = parseFloat(newCatAllocAmount);
    const cents = isNaN(amountNum) || amountNum < 0 ? 0 : Math.round(amountNum * 100);

    setCreatingCategory(true);
    try {
      if (window.curtissApi?.financial?.quickCreateCategory) {
        const parentId = newCatClassification === 'sub' ? newCatParentId : null;
        const res = await window.curtissApi.financial.quickCreateCategory(
          cleanName,
          cleanSi || undefined,
          parentId,
          newCatCode.trim() || undefined
        );
        if (res.success && res.data) {
          if (newCatClassification === 'sub') {
            success('Subcategory Created', `"${cleanName}" (${res.data.category_code}) saved to budget.`);

            // Add to current setup table with entered allocated budget & notes
            setAllocations((prev) => [
              ...prev,
              {
                category_id: res.data.id,
                category_code: res.data.category_code,
                category_name: res.data.name,
                category_name_si: res.data.name_si,
                parent_id: res.data.parent_id || null,
                parent_code: res.data.parent_code || null,
                parent_name: res.data.parent_name || null,
                parent_name_si: res.data.parent_name_si || null,
                allocated_amount_cents: cents,
                notes: newCatNotes.trim(),
              },
            ]);
          } else {
            success('Main Category Created', `Main category "${cleanName}" (${res.data.category_code}) created.`);

            // Add Main Category to current setup table so it displays immediately
            setAllocations((prev) => [
              ...prev,
              {
                category_id: res.data.id,
                category_code: res.data.category_code,
                category_name: res.data.name,
                category_name_si: res.data.name_si,
                parent_id: null,
                parent_code: null,
                parent_name: null,
                parent_name_si: null,
                allocated_amount_cents: cents,
                notes: newCatNotes.trim(),
              },
            ]);

            // Add newly created main category to mainCategoriesList for subsequent subcategories
            setMainCategoriesList((prev) => [
              ...prev,
              {
                id: res.data.id,
                name: res.data.name,
                name_en: res.data.name,
                name_si: res.data.name_si,
                category_code: res.data.category_code,
                parent_id: null,
                is_parent: true,
                is_active: true,
              },
            ]);
          }

          setNewCatModalOpen(false);
          setSearchQuery('');
          focusSearchInput();
        } else {
          toastError('Could Not Create Category', res.error || 'Failed to create category.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setCreatingCategory(false);
    }
  };

  // Open Edit Category Modal
  const openEditCategoryModal = (cat: {
    id: number;
    category_code: string;
    name: string;
    name_si?: string;
    is_parent?: boolean;
  }) => {
    setEditingCategory(cat);
    setEditCatCode(cat.category_code || '');
    setEditCatName(cat.name || '');
    setEditCatNameSi(cat.name_si || '');
    setEditCatModalOpen(true);
  };

  // Confirm Edit Category
  const handleConfirmEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const cleanCode = editCatCode.trim();
    const cleanName = editCatName.trim();
    const cleanSi = editCatNameSi.trim();

    if (!cleanCode) {
      toastError('Validation Error', 'Category code is required.');
      return;
    }
    if (!cleanName) {
      toastError('Validation Error', 'Category name is required.');
      return;
    }

    setSavingCategoryEdit(true);
    try {
      if (window.curtissApi?.financial?.updateCategory) {
        const res = await window.curtissApi.financial.updateCategory(editingCategory.id, {
          category_code: cleanCode,
          name: cleanName,
          name_en: cleanName,
          name_si: cleanSi || undefined,
        });

        if (res.success && res.data) {
          success('Category Updated', `Category updated successfully to "${cleanName}" (${cleanCode}).`);

          // Update local allocations table immediately
          setAllocations((prev) =>
            prev.map((a) => {
              let updated = { ...a };
              if (a.category_id === editingCategory.id) {
                updated = {
                  ...updated,
                  category_code: cleanCode,
                  category_name: cleanName,
                  category_name_si: cleanSi || updated.category_name_si,
                };
              }
              if (a.parent_id === editingCategory.id) {
                updated = {
                  ...updated,
                  parent_code: cleanCode,
                  parent_name: cleanName,
                  parent_name_si: cleanSi || updated.parent_name_si,
                };
              }
              return updated;
            })
          );

          // Update mainCategoriesList if applicable
          setMainCategoriesList((prev) =>
            prev.map((m) =>
              m.id === editingCategory.id
                ? {
                    ...m,
                    category_code: cleanCode,
                    name: cleanName,
                    name_en: cleanName,
                    name_si: cleanSi || m.name_si,
                  }
                : m
            )
          );

          setEditCatModalOpen(false);
          setEditingCategory(null);
        } else {
          toastError('Update Failed', res.error || 'Failed to update category.');
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSavingCategoryEdit(false);
    }
  };

  const hasExactMatch = searchResults.some(
    (c) => c.name.toLowerCase() === searchQuery.trim().toLowerCase()
  );
  const showCreateOption = Boolean(searchQuery.trim() && !hasExactMatch);
  const totalOptions = searchResults.length + (showCreateOption ? 1 : 0);

  // Keyboard navigation for Search (Arrow keys navigate, Enter selects/opens modal, Escape closes)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(true);
        setHighlightedIndex(0);
        return;
      }
      if (totalOptions > 0) {
        setHighlightedIndex((prev) => (prev + 1) % totalOptions);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(true);
        setHighlightedIndex(totalOptions - 1);
        return;
      }
      if (totalOptions > 0) {
        setHighlightedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = searchQuery.trim();
      if (!trimmed && highlightedIndex < 0) return;

      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        openAllocateExistingModal(searchResults[highlightedIndex]);
      } else if (highlightedIndex === searchResults.length && showCreateOption) {
        openCreateCategoryModal(trimmed);
      } else {
        const exactMatch = searchResults.find(
          (c) => c.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (exactMatch) {
          openAllocateExistingModal(exactMatch);
        } else if (searchResults.length > 0 && searchResults[0].name.toLowerCase().startsWith(trimmed.toLowerCase())) {
          openAllocateExistingModal(searchResults[0]);
        } else if (trimmed) {
          openCreateCategoryModal(trimmed);
        }
      }
    }
  };

  // 6. Allocation Table Updates
  const handleAmountChange = (index: number, valStr: string) => {
    const parsed = parseFloat(valStr);
    const cents = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100);
    setAllocations((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], allocated_amount_cents: cents };
      return copy;
    });
  };

  const handleNotesChange = (index: number, notesStr: string) => {
    setAllocations((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], notes: notesStr };
      return copy;
    });
  };

  const handleRemoveCategory = (index: number) => {
    setAllocations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMainCategory = (mainCategoryId: number) => {
    setAllocations((prev) =>
      prev.filter((a) => a.category_id !== mainCategoryId && a.parent_id !== mainCategoryId)
    );
  };

  // Group allocations hierarchically by Parent Main Category
  const groupedAllocations = useMemo(() => {
    const groupsMap = new Map<string, {
      key: string;
      mainCategoryId: number | null;
      mainAllocItem?: { alloc: BudgetAllocationItem; originalIndex: number };
      parentCode: string;
      parentName: string;
      parentNameSi?: string;
      subcategories: { alloc: BudgetAllocationItem; originalIndex: number }[];
      totalCents: number;
    }>();

    // Pass 1: Register all Main Categories present in allocations
    allocations.forEach((alloc, originalIndex) => {
      if (alloc.parent_id === null || !alloc.parent_id) {
        const key = `main_${alloc.category_id}`;
        groupsMap.set(key, {
          key,
          mainCategoryId: alloc.category_id,
          mainAllocItem: { alloc, originalIndex },
          parentCode: alloc.category_code || '',
          parentName: alloc.category_name,
          parentNameSi: alloc.category_name_si || undefined,
          subcategories: [],
          totalCents: alloc.allocated_amount_cents || 0,
        });
      }
    });

    // Pass 2: Attach subcategories to their corresponding Main Category
    allocations.forEach((alloc, originalIndex) => {
      if (alloc.parent_id !== null && alloc.parent_id) {
        const key = `main_${alloc.parent_id}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            key,
            mainCategoryId: alloc.parent_id,
            parentCode: alloc.parent_code || '',
            parentName: alloc.parent_name || (alloc.parent_id ? `Main Category ${alloc.parent_id}` : 'General Category'),
            parentNameSi: alloc.parent_name_si || undefined,
            subcategories: [],
            totalCents: 0,
          });
        }
        const g = groupsMap.get(key)!;
        g.subcategories.push({ alloc, originalIndex });
      }
    });

    // Pass 3: Calculate subtotals
    groupsMap.forEach((g) => {
      if (g.subcategories.length > 0) {
        g.totalCents = g.subcategories.reduce((acc, item) => acc + (item.alloc.allocated_amount_cents || 0), 0);
      } else if (g.mainAllocItem) {
        g.totalCents = g.mainAllocItem.alloc.allocated_amount_cents || 0;
      }
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.parentCode.localeCompare(b.parentCode));
  }, [allocations]);

  // Derived Total Budget (sum of all group subtotals in cents)
  const totalBudgetCents = useMemo(() => {
    return groupedAllocations.reduce((acc, g) => acc + g.totalCents, 0);
  }, [groupedAllocations]);

  const totalBudgetFormatted = (totalBudgetCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isApproved = currentYearDetail?.status === 'approved' || currentYearDetail?.status === 'locked';
  const isClosed = currentYearDetail?.status === 'closed';
  const isReadOnly = isApproved || isClosed;
  const isCurrent = currentYearDetail?.is_current || years.find((y) => y.id === selectedYearId)?.is_current;

  const filteredYears = useMemo(() => {
    return years.filter((y) => {
      const q = listSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        y.year_name.toLowerCase().includes(q) ||
        (y.approver_name && y.approver_name.toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'approved') return y.status === 'approved' || y.status === 'locked';
      return y.status === statusFilter;
    });
  }, [years, listSearch, statusFilter]);

  // 7. Save Draft
  const handleSaveDraft = async () => {
    if (!yearName.trim()) {
      toastError('Validation Error', t('validation.nameRequired'));
      return;
    }
    if (!startDate || !endDate) {
      toastError('Validation Error', t('validation.datesRequired'));
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toastError('Validation Error', t('validation.invalidDates'));
      return;
    }

    setSaving(true);
    try {
      if (window.curtissApi?.financial?.saveYearDraft) {
        const payload = {
          id: selectedYearId || undefined,
          year_name: yearName.trim(),
          start_date: startDate,
          end_date: endDate,
          allocations: allocations.map((a) => ({
            category_id: a.category_id,
            allocated_amount_cents: a.allocated_amount_cents,
            notes: a.notes,
          })),
        };
        const res = await window.curtissApi.financial.saveYearDraft(payload);
        if (res.success && res.data) {
          success('Draft Saved', `Financial year "${yearName.trim()}" draft saved successfully.`);
          await loadYears(res.data.id);
        } else {
          toastError('Failed to Save Draft', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // 8. Approve and Lock Budget
  const handleOpenApprovalModal = () => {
    if (!yearName.trim()) {
      toastError('Validation Error', t('validation.nameRequired'));
      return;
    }
    if (!startDate || !endDate) {
      toastError('Validation Error', t('validation.datesRequired'));
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toastError('Validation Error', t('validation.invalidDates'));
      return;
    }
    if (allocations.length === 0) {
      toastError('Validation Error', t('validation.noAllocations'));
      return;
    }
    if (totalBudgetCents <= 0) {
      toastError('Validation Error', 'Cannot approve a budget with zero total allocation. Please allocate budget amounts to the subcategories.');
      return;
    }
    const emptyMains = groupedAllocations.filter((g) => g.subcategories.length === 0);
    if (emptyMains.length > 0) {
      toastError(
        'Incomplete Category Hierarchy',
        `Main category "${emptyMains[0].parentName}" has no subcategories. Every main category must have at least one subcategory before budget approval.`
      );
      return;
    }
    setApprovalModalOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!yearName.trim()) {
      toastError('Validation Error', t('validation.nameRequired'));
      return;
    }
    if (!startDate || !endDate) {
      toastError('Validation Error', t('validation.datesRequired'));
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toastError('Validation Error', t('validation.invalidDates'));
      return;
    }
    if (allocations.length === 0) {
      toastError('Validation Error', t('validation.noAllocations'));
      return;
    }
    if (totalBudgetCents <= 0) {
      toastError('Validation Error', 'Cannot approve a budget with zero total allocation. Please allocate budget amounts to the subcategories.');
      return;
    }
    const emptyMains = groupedAllocations.filter((g) => g.subcategories.length === 0);
    if (emptyMains.length > 0) {
      toastError(
        'Incomplete Category Hierarchy',
        `Main category "${emptyMains[0].parentName}" has no subcategories. Every main category must have at least one subcategory before budget approval.`
      );
      return;
    }

    setApproving(true);
    try {
      if (window.curtissApi?.financial?.saveYearDraft && window.curtissApi?.financial?.approveYear) {
        // Step 1: Ensure current year draft and all category allocations are persisted to DB
        const payload = {
          id: selectedYearId || undefined,
          year_name: yearName.trim(),
          start_date: startDate,
          end_date: endDate,
          allocations: allocations.map((a) => ({
            category_id: a.category_id,
            allocated_amount_cents: a.allocated_amount_cents,
            notes: a.notes,
          })),
        };
        const draftRes = await window.curtissApi.financial.saveYearDraft(payload);
        if (!draftRes.success || !draftRes.data) {
          toastError('Approval Failed', draftRes.error || 'Failed to save budget allocations before approval.');
          return;
        }

        const targetYearId = draftRes.data.id;

        // Step 2: Now approve and permanently lock the budget
        const res = await window.curtissApi.financial.approveYear(targetYearId, approvalNotes);
        if (res.success && res.data) {
          success('Budget Approved & Locked', `Financial year "${res.data.year_name}" is now permanently locked.`);
          setApprovalModalOpen(false);
          await loadYears(targetYearId);
        } else {
          toastError('Approval Failed', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleConfirmEndYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId) return;
    if (!adminUsername.trim() || !adminPassword) {
      toastError('Validation Error', 'Administrator username and password are required.');
      return;
    }

    setEndingYear(true);
    try {
      if (window.curtissApi?.financial?.closeYear) {
        const res = await window.curtissApi.financial.closeYear({
          yearId: selectedYearId,
          adminUsername: adminUsername.trim(),
          adminPassword,
        });

        if (res.success) {
          success('Financial Year Closed', `Financial year "${yearName}" has been successfully ended and closed.`);
          setEndYearModalOpen(false);
          setAdminUsername('');
          setAdminPassword('');
          await loadYears(selectedYearId);
        } else {
          toastError('Closure Failed', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setEndingYear(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 select-none">
      {activeView === 'list' ? (
        <div className="space-y-4">
          {/* List View Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {t('existingYears', 'Financial Years')}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {years.length} {years.length === 1 ? 'Year' : 'Years'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t('subtitle', 'Manage school annual fiscal calendar, budget ceilings, and approvals.')}
              </p>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadYears()}
                isLoading={loading}
                title={t('actions.refresh', 'Refresh')}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={handleStartNewYear}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>{t('newFinancialYear', 'Create New Financial Year')}</span>
              </Button>
            </div>
          </div>

          {/* List View Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Active Financial Period
                </span>
                <div className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                  {years.find((y) => y.is_current)?.year_name || 'No Active Year Set'}
                </div>
                <span className="text-[10px] text-zinc-400">
                  Current institutional operating year
                </span>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Approved & Locked Budgets
                </span>
                <div className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {years.filter((y) => y.status === 'approved' || y.status === 'locked').length} Periods
                </div>
                <span className="text-[10px] text-zinc-400">
                  Authorized annual budgets with locked ceilings
                </span>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Draft Financial Periods
                </span>
                <div className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {years.filter((y) => y.status === 'draft').length} Drafts
                </div>
                <span className="text-[10px] text-zinc-400">
                  In-progress budget drafts awaiting authorization
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Search financial years by name or approver..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 shadow-xs"
              />
            </div>

            <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
              {(
                [
                  { id: 'all', label: `All (${years.length})` },
                  { id: 'draft', label: `Draft (${years.filter((y) => y.status === 'draft').length})` },
                  { id: 'approved', label: `Approved (${years.filter((y) => y.status === 'approved' || y.status === 'locked').length})` },
                  { id: 'closed', label: `Closed (${years.filter((y) => y.status === 'closed').length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    statusFilter === tab.id
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Financial Years List Items */}
          {filteredYears.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CalendarDays className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {years.length === 0 ? 'No Financial Years Created Yet' : 'No matching financial years found'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                  {years.length === 0
                    ? 'Start by creating your first school financial year to allocate budgets and manage expenses.'
                    : 'Try clearing the search query or status filter to see other financial periods.'}
                </p>
                {years.length === 0 && (
                  <Button size="sm" onClick={handleStartNewYear} className="mt-4">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>Create First Financial Year</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {filteredYears.map((y) => {
                const isAppr = y.status === 'approved' || y.status === 'locked';
                const isCls = y.status === 'closed';
                const isDrf = y.status === 'draft';
                const budgetFormatted = ((y.total_budget_cents || 0) / 100).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });

                return (
                  <div
                    key={y.id}
                    onClick={() => handleSelectYear(y.id)}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-sm cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-start space-x-3.5">
                      <div
                        className={`p-2.5 rounded-lg flex-shrink-0 mt-0.5 ${
                          isCls
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                            : isAppr
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isCls ? (
                          <Lock className="w-5 h-5" />
                        ) : isAppr ? (
                          <ShieldCheck className="w-5 h-5" />
                        ) : (
                          <Edit3 className="w-5 h-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-mono">
                            {y.year_name}
                          </span>
                          {y.is_current && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Current Active Year</span>
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                              isCls
                                ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20'
                                : isAppr
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {isCls ? t('closed') : isAppr ? t('approved') : t('draft')}
                          </span>
                        </div>

                        <div className="flex items-center space-x-4 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap gap-y-1">
                          <div className="flex items-center space-x-1 font-mono">
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                            <span>
                              {y.start_date} &rarr; {y.end_date}
                            </span>
                          </div>
                          {y.approver_name && (
                            <div className="flex items-center space-x-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Approved by {y.approver_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end space-x-6 border-t md:border-t-0 pt-2 md:pt-0 border-zinc-100 dark:border-zinc-800">
                      <div className="text-left md:text-right">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400 block tracking-wider">
                          Total Budget
                        </span>
                        <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                          Rs. {budgetFormatted}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900 transition-colors flex-shrink-0"
                      >
                        <span>{isDrf ? 'Edit Budget' : 'Open Panel'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* DETAIL PANEL VIEW (Opened on tap) */
        <div className="space-y-4">
          {/* Detail Panel Top Navigation Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToList}
                className="text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                <span>All Financial Years</span>
              </Button>

              <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                  {isNewYear ? 'New Financial Year Draft' : yearName}
                </h2>
                {isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Current Year
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                    isClosed
                      ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20'
                      : isApproved
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {isClosed ? t('closed') : isApproved ? t('approved') : t('draft')}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              {isApproved && !isClosed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEndYearModalOpen(true)}
                  className="border-red-300 text-red-600 dark:border-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  <span>{t('endYearBtn')}</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedYearId && loadYearDetail(selectedYearId)}
                isLoading={loading}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Financial Year Basic Information */}
          <Card>
            <CardContent className="p-3.5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  label={t('yearName')}
                  value={yearName}
                  onChange={(e) => setYearName(e.target.value)}
                  placeholder={t('yearNamePlaceholder')}
                  disabled={isReadOnly}
                  required
                />
                <Input
                  label={t('startDate')}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isReadOnly}
                  required
                />
                <Input
                  label={t('endDate')}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isReadOnly}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Financial Year Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  {t('totalBudget', 'Total Annual Budget')}
                </span>
                <div className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
                  Rs. {totalBudgetFormatted}
                </div>
                <span className="text-[10px] text-zinc-400">
                  {isApproved ? 'Approved & Locked Budget' : 'Draft Budget (Editable)'}
                </span>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Main Budget Categories
                </span>
                <div className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {groupedAllocations.length} Main Categories
                </div>
                <span className="text-[10px] text-zinc-400">
                  Aggregated parent heads
                </span>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Budget Ceilings (Subcategories)
                </span>
                <div className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {allocations.filter((a) => a.parent_id !== null).length} Subcategories
                </div>
                <span className="text-[10px] text-zinc-400">
                  Active expense spending limits
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Category Search & Quick Actions */}
          {!isReadOnly && (
            <div className="flex items-center space-x-2">
              <div className="relative flex-1" ref={searchContainerRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={handleSearchFocus}
                    placeholder="Search or select budget category (Main or Subcategory)..."
                    className="w-full pl-9 pr-24 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 shadow-sm"
                  />
                  <div className="absolute right-2 top-2 text-[10px] text-zinc-400 flex items-center space-x-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      ↑↓ Navigate
                    </kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      Enter ↵
                    </kbd>
                  </div>
                </div>

                {/* Autocomplete Dropdown */}
                {dropdownOpen && (
                  <div
                    ref={dropdownListRef}
                    className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1 divide-y divide-zinc-100 dark:divide-zinc-800/60"
                  >
                    {searchResults.map((cat, idx) => {
                      const isMain = cat.is_parent || cat.parent_id === null;
                      const alreadyAdded = allocations.some((a) => a.category_id === cat.id);
                      const isHighlighted = highlightedIndex === idx;
                      return (
                        <div
                          key={cat.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            openAllocateExistingModal(cat);
                          }}
                          className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors ${
                            isHighlighted
                              ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-zinc-400 dark:ring-zinc-600'
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          } ${alreadyAdded ? 'border-l-2 border-emerald-500' : ''}`}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {cat.name}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                                isMain
                                  ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                              }`}>
                                {isMain ? 'Main Category' : `Subcategory of: ${cat.parent_code || cat.parent_name}`}
                              </span>
                            </div>
                            {cat.name_si && cat.name_si !== cat.name && (
                              <span className="text-[11px] text-zinc-500 font-sinhala">
                                {cat.name_si}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-zinc-400">
                              {cat.category_code}
                            </span>
                            {alreadyAdded ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                In Budget (Edit)
                              </span>
                            ) : (
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                                + Add to Budget
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick-Create option if no exact match */}
                    {showCreateOption && (
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openCreateCategoryModal(searchQuery);
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 text-xs cursor-pointer border-t border-blue-100 dark:border-blue-900 ${
                          highlightedIndex === searchResults.length
                            ? 'bg-blue-100 dark:bg-blue-900/60 ring-2 ring-blue-500 text-blue-800 dark:text-blue-200'
                            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span className="font-semibold">
                            {t('createCategory', { name: searchQuery.trim() })}
                          </span>
                        </div>
                        <span className="text-[10px] opacity-75">{t('pressEnterToCreate')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button
                size="sm"
                onClick={() => openCreateCategoryModal('')}
                className="flex-shrink-0 text-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>Create Category</span>
              </Button>
            </div>
          )}

          {/* Compact Budget Allocation Table */}
          <Card>
            <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold flex items-center space-x-2 text-zinc-800 dark:text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-zinc-500" />
                <span>Budget Allocations & Category Ceilings</span>
              </CardTitle>
              <span className="text-xs text-zinc-500">
                {allocations.length} {allocations.length === 1 ? 'Category' : 'Categories'} Selected
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {allocations.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 dark:text-zinc-600 text-xs">
                  {t('noAllocations')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400">
                        <th className="py-3 px-4 font-semibold w-12 text-center">#</th>
                        <th className="py-3 px-4 font-semibold">{t('categoryName')}</th>
                        <th className="py-3 px-4 font-semibold w-56">{t('allocatedAmount')}</th>
                        <th className="py-3 px-4 font-semibold">{t('notes')}</th>
                        {!isApproved && <th className="py-3 px-4 font-semibold w-16 text-center"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {groupedAllocations.map((group) => {
                        const groupTotalFormatted = (group.totalCents / 100).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });

                        return (
                          <React.Fragment key={group.key}>
                            {/* Main Category Header Row */}
                            <tr className="bg-zinc-100/90 dark:bg-zinc-800/80 font-semibold border-t-2 border-zinc-200 dark:border-zinc-700">
                              <td className="py-2.5 px-4 text-center">
                                <Layers className="w-4 h-4 text-zinc-600 dark:text-zinc-300 inline" />
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center space-x-2">
                                  {group.parentCode && (
                                    <span className="font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold">
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
                                  {!isReadOnly && group.mainCategoryId && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openEditCategoryModal({
                                          id: group.mainCategoryId!,
                                          category_code: group.parentCode || '',
                                          name: group.parentName || '',
                                          name_si: group.parentNameSi || '',
                                          is_parent: true,
                                        })
                                      }
                                      className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors ml-1"
                                      title="Edit Main Category Code & Name"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <span className="text-[10px] text-zinc-500 font-normal ml-2">
                                    • {group.subcategories.length} {group.subcategories.length === 1 ? 'subcategory' : 'subcategories'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                  Rs. {groupTotalFormatted}
                                </div>
                                <span className="text-[10px] text-zinc-400 font-normal">
                                  {group.subcategories.length > 0 ? 'Subtotal' : 'Budget'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-zinc-400 text-[11px]">
                                {!isReadOnly && group.mainCategoryId && (
                                  <button
                                    type="button"
                                    onClick={() => openCreateCategoryModal('', group.mainCategoryId)}
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors"
                                  >
                                    <Plus className="w-3 h-3 mr-0.5" />
                                    <span>Add Subcategory</span>
                                  </button>
                                )}
                              </td>
                              {!isReadOnly && (
                                <td className="py-2.5 px-4 text-center">
                                  {group.mainCategoryId && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMainCategory(group.mainCategoryId!)}
                                      className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                      title="Remove Main Category and subcategories"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>

                            {/* If no subcategories yet under this main category */}
                            {group.subcategories.length === 0 && (
                              <tr className="bg-zinc-50/40 dark:bg-zinc-900/20 italic">
                                <td className="py-2 px-4 text-center text-zinc-400 font-mono">—</td>
                                <td className="py-2 px-4 pl-8 text-zinc-500 text-xs" colSpan={!isReadOnly ? 3 : 4}>
                                  <div className="flex items-center justify-between">
                                    <span>No subcategories created yet under {group.parentName}.</span>
                                    {!isReadOnly && group.mainCategoryId && (
                                      <button
                                        type="button"
                                        onClick={() => openCreateCategoryModal('', group.mainCategoryId)}
                                        className="text-xs text-blue-600 hover:underline font-medium not-italic"
                                      >
                                        + Add Subcategory under {group.parentName}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                {!isReadOnly && <td className="py-2 px-4"></td>}
                              </tr>
                            )}

                            {/* Child Subcategory Rows */}
                            {group.subcategories.map(({ alloc, originalIndex }) => (
                              <SubcategoryRow
                                key={alloc.category_id}
                                alloc={alloc}
                                originalIndex={originalIndex}
                                isReadOnly={isReadOnly}
                                onAmountChange={handleAmountChange}
                                onNotesChange={handleNotesChange}
                                onRemoveCategory={handleRemoveCategory}
                                onEditCategory={openEditCategoryModal}
                                t={t}
                              />
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table Summary & Total Display */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  <span>{t('totalBudget')}:</span>
                </div>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  Rs. {totalBudgetFormatted}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Controls */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={handleBackToList}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span>Back to Years List</span>
            </Button>

            {!isReadOnly && (
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleSaveDraft}
                  isLoading={saving}
                  disabled={approving}
                >
                  <Edit3 className="w-4 h-4 mr-1.5" />
                  <span>{saving ? t('saving') : t('saveDraft')}</span>
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleOpenApprovalModal}
                  disabled={saving || allocations.length === 0}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  <span>{t('approveBudget')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Final Approval Confirmation Modal */}
      <Modal
        isOpen={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        title={t('confirmApprovalTitle')}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t('confirmApprovalDesc')}</p>
              <p className="mt-1 opacity-90">
                Future expense entries in Stage 08 will reference these exact approved category limits.
              </p>
            </div>
          </div>

          <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('yearName')}:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{yearName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Categories Included:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{allocations.length}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2 text-sm font-bold">
              <span>{t('totalBudget')}:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                Rs. {totalBudgetFormatted}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Authorization Notes (Optional):
            </label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="e.g. Approved in Finance Committee Meeting #04..."
              className="w-full h-20 p-2 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApprovalModalOpen(false)}
              disabled={approving}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmApproval}
              isLoading={approving}
            >
              <Lock className="w-3.5 h-3.5 mr-1" />
              <span>{t('actions.confirm')}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* End & Close Financial Year Modal */}
      <Modal
        isOpen={endYearModalOpen}
        onClose={() => {
          if (!endingYear) {
            setEndYearModalOpen(false);
            setAdminUsername('');
            setAdminPassword('');
          }
        }}
        title={t('endYearModalTitle')}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmEndYear} className="space-y-4">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-800 dark:text-red-300 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <p>{t('endYearWarning')}</p>
          </div>

          <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('yearName')}:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{yearName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('totalBudget')}:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {totalBudgetFormatted}</span>
            </div>
          </div>

          <Input
            label={t('adminUsername')}
            value={adminUsername}
            onChange={(e) => setAdminUsername(e.target.value)}
            placeholder="e.g. admin"
            autoFocus
            required
          />

          <Input
            label={t('adminPassword')}
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => {
                setEndYearModalOpen(false);
                setAdminUsername('');
                setAdminPassword('');
              }}
              disabled={endingYear}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="danger"
              type="submit"
              size="sm"
              isLoading={endingYear}
            >
              <Lock className="w-3.5 h-3.5 mr-1" />
              <span>{endingYear ? t('endingYear') : t('confirmEndYearBtn')}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create New Budget Category Modal */}
      <Modal
        isOpen={newCatModalOpen}
        onClose={() => {
          setNewCatModalOpen(false);
          focusSearchInput();
        }}
        title={newCatClassification === 'main' ? t('hierarchy.newMainCategory') : t('createCategoryModalTitle')}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmCreateCategory} className="space-y-4">
          {/* Classification Selection */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t('hierarchy.categoryType')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewCatClassification('sub');
                  const targetParent = newCatParentId || (mainCategoriesList[0]?.id ?? null);
                  setNewCatParentId(targetParent);
                  fetchSuggestedCategoryCode(targetParent);
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border text-center transition-all ${
                  newCatClassification === 'sub'
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {t('hierarchy.newSubCategory')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewCatClassification('main');
                  setNewCatParentId(null);
                  fetchSuggestedCategoryCode(null);
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold border text-center transition-all ${
                  newCatClassification === 'main'
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {t('hierarchy.newMainCategory')}
              </button>
            </div>
          </div>

          {/* If Subcategory, choose Parent Main Category */}
          {newCatClassification === 'sub' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t('hierarchy.selectMainCategory')}
              </label>
              {mainCategoriesList.length === 0 ? (
                <div className="p-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                  No main categories registered yet. Please create a Main Category first.
                </div>
              ) : (
                <select
                  value={newCatParentId || ''}
                  onChange={(e) => {
                    const pId = Number(e.target.value);
                    setNewCatParentId(pId);
                    fetchSuggestedCategoryCode(pId);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                  required
                >
                  {mainCategoriesList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.category_code} — {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Category Code (Auto-suggested & Editable) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Category Code
              </label>
              <span className="text-[10px] text-zinc-400">Auto-suggested • Editable</span>
            </div>
            <input
              type="text"
              value={newCatCode}
              onChange={(e) => setNewCatCode(e.target.value)}
              placeholder="e.g. Rex 01 or 1.1"
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-mono text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300 font-semibold"
              required
            />
          </div>

          <Input
            label={t('categoryNameEn')}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder={newCatClassification === 'main' ? "e.g. Administration" : "e.g. Office Supplies"}
            required
            autoFocus
          />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t('categoryNameSi')}
            </label>
            <input
              type="text"
              value={newCatNameSi}
              onChange={(e) => setNewCatNameSi(e.target.value)}
              placeholder={t('categoryNameSiPlaceholder')}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300 font-sinhala"
            />
          </div>

          {newCatClassification === 'sub' && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {t('allocatedAmountLabel')}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-mono text-zinc-400">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCatAllocAmount}
                    onChange={(e) => setNewCatAllocAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex h-9 w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-md border border-zinc-200 bg-white text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {t('notesLabel')}
                </label>
                <input
                  type="text"
                  value={newCatNotes}
                  onChange={(e) => setNewCatNotes(e.target.value)}
                  placeholder={t('optionalNotes')}
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300"
                />
              </div>
            </>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => {
                setNewCatModalOpen(false);
                focusSearchInput();
              }}
              disabled={creatingCategory}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              size="sm"
              isLoading={creatingCategory}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              <span>{creatingCategory ? t('creating') : t('createAndAddBtn')}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Allocate Existing Budget Category Modal */}
      <Modal
        isOpen={allocExistingModalOpen}
        onClose={() => {
          setAllocExistingModalOpen(false);
          focusSearchInput();
        }}
        title={t('allocateCategoryModalTitle')}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmAllocateExisting} className="space-y-4">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
              Selected Category
            </span>
            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
              <span>{selectedExistingCat?.name}</span>
              <span className="text-[11px] font-mono text-zinc-400">
                {selectedExistingCat?.category_code}
              </span>
            </div>
            {selectedExistingCat?.name_si && selectedExistingCat.name_si !== selectedExistingCat.name && (
              <div className="text-xs text-zinc-500 font-sinhala">
                {selectedExistingCat.name_si}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t('allocatedAmountLabel')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-mono text-zinc-400">
                Rs.
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={existingCatAmount}
                onChange={(e) => setExistingCatAmount(e.target.value)}
                placeholder="0.00"
                className="flex h-9 w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-md border border-zinc-200 bg-white text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t('notesLabel')}
            </label>
            <input
              type="text"
              value={existingCatNotes}
              onChange={(e) => setExistingCatNotes(e.target.value)}
              placeholder={t('optionalNotes')}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => {
                setAllocExistingModalOpen(false);
                focusSearchInput();
              }}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              size="sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              <span>{t('addToBudgetBtn')}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Category Modal */}
      <Modal
        isOpen={editCatModalOpen}
        onClose={() => {
          setEditCatModalOpen(false);
          setEditingCategory(null);
        }}
        title={`Edit ${editingCategory?.is_parent ? 'Main Category' : 'Subcategory'}`}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmEditCategory} className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Category Code
              </label>
              <span className="text-[10px] text-zinc-400">Unique Code</span>
            </div>
            <input
              type="text"
              value={editCatCode}
              onChange={(e) => setEditCatCode(e.target.value)}
              placeholder="e.g. Rex 01 or 1.1"
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-mono text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300 font-semibold"
              required
              autoFocus
            />
          </div>

          <Input
            label={t('categoryNameEn')}
            value={editCatName}
            onChange={(e) => setEditCatName(e.target.value)}
            placeholder="e.g. Administration"
            required
          />

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t('categoryNameSi')}
            </label>
            <input
              type="text"
              value={editCatNameSi}
              onChange={(e) => setEditCatNameSi(e.target.value)}
              placeholder={t('categoryNameSiPlaceholder')}
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300 dark:focus-visible:border-zinc-300 font-sinhala"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => {
                setEditCatModalOpen(false);
                setEditingCategory(null);
              }}
              disabled={savingCategoryEdit}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              size="sm"
              isLoading={savingCategoryEdit}
            >
              <span>{savingCategoryEdit ? 'Saving...' : 'Save Changes'}</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
