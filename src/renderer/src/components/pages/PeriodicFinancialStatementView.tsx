import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  Printer,
  Download,
  RefreshCw,
  SlidersHorizontal,
  Plus,
  Save,
  Calendar,
  Layers,
  Edit3,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
  X,
  Zap,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  FinancialYear,
  PeriodicStatementMapping,
  PeriodicStatementReportData,
  PeriodicStatementRow,
  FundCategory,
  BudgetCategory,
} from '../../../../shared/types/finance';

interface PeriodicFinancialStatementViewProps {
  currentUser?: any;
  permissions?: string[];
}

export const PeriodicFinancialStatementView: React.FC<PeriodicFinancialStatementViewProps> = ({
  currentUser,
  permissions = [],
}) => {
  const { t } = useTranslation('finance');
  const { success, error: toastError, warning } = useToast();

  const canManage =
    !currentUser ||
    currentUser.role_key === 'admin' ||
    currentUser.role_id === 1 ||
    permissions.length === 0 ||
    permissions.includes('financial.manage') ||
    permissions.includes('reports.view');

  // Year & Period state
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number>(0);
  const [selectedYear, setSelectedYear] = useState<FinancialYear | null>(null);

  const initialNow = new Date();
  const initialMonth = initialNow.getMonth();
  const initialYear = initialNow.getFullYear();
  const initialPType: '1st' | '2nd' | '3rd' =
    initialMonth >= 8 ? '3rd' : initialMonth >= 4 ? '2nd' : '1st';
  const initialStart =
    initialPType === '3rd'
      ? `${initialYear}-09-01`
      : initialPType === '2nd'
      ? `${initialYear}-05-01`
      : `${initialYear}-01-01`;
  const initialEnd =
    initialPType === '3rd'
      ? `${initialYear}-12-31`
      : initialPType === '2nd'
      ? `${initialYear}-08-31`
      : `${initialYear}-04-30`;

  const [periodType, setPeriodType] = useState<'1st' | '2nd' | '3rd' | 'custom'>(initialPType);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [loading, setLoading] = useState(false);

  // Report Data
  const [reportData, setReportData] = useState<PeriodicStatementReportData | null>(null);

  // Mappings Modal State
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappings, setMappings] = useState<PeriodicStatementMapping[]>([]);
  const [savingMappings, setSavingMappings] = useState(false);
  const [fundCategories, setFundCategories] = useState<FundCategory[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);

  // Adjustments Modal State
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjOpeningOverride, setAdjOpeningOverride] = useState<string>('');
  const [adjOtherAdditions, setAdjOtherAdditions] = useState<string>('0.00');
  const [adjCanteenRefund, setAdjCanteenRefund] = useState<string>('0.00');
  const [adjChequeReissue, setAdjChequeReissue] = useState<string>('0.00');
  const [adjBankCharges, setAdjBankCharges] = useState<string>('0.00');
  const [adjPettyCashBal, setAdjPettyCashBal] = useState<string>('0.00');
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [savingAdj, setSavingAdj] = useState(false);

  // 1. Load Financial Years
  useEffect(() => {
    async function loadYears() {
      try {
        const fn =
          window.curtissApi?.financial?.getYears ||
          window.curtissApi?.financial?.getFinancialYears;
        if (fn) {
          const res = await fn();
          if (res.success && res.data && res.data.length > 0) {
            setYears(res.data);
            // Prioritize active/approved current financial year
            const active =
              res.data.find((y: any) => Boolean(y.is_current)) ||
              res.data.find((y: any) => y.status === 'approved' || y.status === 'active') ||
              res.data[0];

            if (active) {
              setSelectedYearId(active.id);
              setSelectedYear(active);

              // Automatically select the 4-month period matching current calendar month
              const now = new Date();
              const currentMonth = now.getMonth(); // 0-indexed (0=Jan, 11=Dec)
              const defaultPType: '1st' | '2nd' | '3rd' =
                currentMonth >= 8 ? '3rd' : currentMonth >= 4 ? '2nd' : '1st';
              setPeriodType(defaultPType);

              const cleanYear = active.start_date
                ? active.start_date.slice(0, 4)
                : active.year_name?.replace(/\D/g, '').slice(0, 4) || new Date().getFullYear().toString();

              let sDate = `${cleanYear}-09-01`;
              let eDate = `${cleanYear}-12-31`;
              if (defaultPType === '1st') {
                sDate = `${cleanYear}-01-01`;
                eDate = `${cleanYear}-04-30`;
              } else if (defaultPType === '2nd') {
                sDate = `${cleanYear}-05-01`;
                eDate = `${cleanYear}-08-31`;
              }
              setStartDate(sDate);
              setEndDate(eDate);

              // Immediate initial fetch to prevent any race conditions or blank screens
              loadReport({
                yearId: active.id,
                periodType: defaultPType,
                startDate: sDate,
                endDate: eDate,
              });
            }
          }
        }
      } catch (err: any) {
        toastError('Failed to load financial years', err.message);
      }
    }
    loadYears();
  }, []);

  // Update dates when periodType changes
  const applyPeriodDates = (pType: '1st' | '2nd' | '3rd' | 'custom', fy?: FinancialYear | null) => {
    const yr = fy || selectedYear;
    const cleanYear = yr?.start_date
      ? yr.start_date.slice(0, 4)
      : yr?.year_name?.replace(/\D/g, '').slice(0, 4) || new Date().getFullYear().toString();

    if (pType === '1st') {
      setStartDate(`${cleanYear}-01-01`);
      setEndDate(`${cleanYear}-04-30`);
    } else if (pType === '2nd') {
      setStartDate(`${cleanYear}-05-01`);
      setEndDate(`${cleanYear}-08-31`);
    } else if (pType === '3rd') {
      setStartDate(`${cleanYear}-09-01`);
      setEndDate(`${cleanYear}-12-31`);
    }
  };

  const handlePeriodChange = (pType: '1st' | '2nd' | '3rd' | 'custom') => {
    setPeriodType(pType);
    if (pType !== 'custom') {
      const yr = selectedYear;
      const cleanYear = yr?.start_date
        ? yr.start_date.slice(0, 4)
        : yr?.year_name?.replace(/\D/g, '').slice(0, 4) || new Date().getFullYear().toString();

      let sDate = startDate;
      let eDate = endDate;
      if (pType === '1st') {
        sDate = `${cleanYear}-01-01`;
        eDate = `${cleanYear}-04-30`;
      } else if (pType === '2nd') {
        sDate = `${cleanYear}-05-01`;
        eDate = `${cleanYear}-08-31`;
      } else if (pType === '3rd') {
        sDate = `${cleanYear}-09-01`;
        eDate = `${cleanYear}-12-31`;
      }
      setStartDate(sDate);
      setEndDate(eDate);

      loadReport({
        yearId: selectedYearId,
        periodType: pType,
        startDate: sDate,
        endDate: eDate,
      });
    }
  };

  const handleYearChange = (yearId: number) => {
    setSelectedYearId(yearId);
    const yr = years.find((y) => y.id === yearId) || null;
    setSelectedYear(yr);
    if (periodType !== 'custom') {
      const cleanYear = yr?.start_date
        ? yr.start_date.slice(0, 4)
        : yr?.year_name?.replace(/\D/g, '').slice(0, 4) || new Date().getFullYear().toString();

      let sDate = startDate;
      let eDate = endDate;
      if (periodType === '1st') {
        sDate = `${cleanYear}-01-01`;
        eDate = `${cleanYear}-04-30`;
      } else if (periodType === '2nd') {
        sDate = `${cleanYear}-05-01`;
        eDate = `${cleanYear}-08-31`;
      } else if (periodType === '3rd') {
        sDate = `${cleanYear}-09-01`;
        eDate = `${cleanYear}-12-31`;
      }
      setStartDate(sDate);
      setEndDate(eDate);

      loadReport({
        yearId,
        periodType,
        startDate: sDate,
        endDate: eDate,
      });
    } else {
      loadReport({
        yearId,
      });
    }
  };

  // 2. Load Report Data
  const loadReport = async (overrideParams?: {
    yearId?: number;
    periodType?: '1st' | '2nd' | '3rd' | 'custom';
    startDate?: string;
    endDate?: string;
  }) => {
    const yId = overrideParams?.yearId ?? selectedYearId;
    const pType = overrideParams?.periodType ?? periodType;
    const sDate = overrideParams?.startDate ?? startDate;
    const eDate = overrideParams?.endDate ?? endDate;

    if (!yId || yId === 0) return;
    setLoading(true);
    try {
      if (window.curtissApi?.financial?.getPeriodicStatementReport) {
        const res = await window.curtissApi.financial.getPeriodicStatementReport({
          financialYearId: yId,
          periodType: pType,
          startDate: sDate,
          endDate: eDate,
        });

        if (res.success && res.data) {
          setReportData(res.data);
          // Pre-populate adjustment modal state
          const calc = res.data.calculation;
          setAdjOpeningOverride(
            res.data.opening_balance_cents !== undefined ? (res.data.opening_balance_cents / 100).toFixed(2) : ''
          );
          setAdjOtherAdditions((calc.other_additions_cents / 100).toFixed(2));
          setAdjCanteenRefund((calc.canteen_refund_cents / 100).toFixed(2));
          setAdjChequeReissue((calc.cheque_reissue_cents / 100).toFixed(2));
          setAdjBankCharges((calc.bank_charges_cents / 100).toFixed(2));
          setAdjPettyCashBal((calc.petty_cash_balance_cents / 100).toFixed(2));
          setAdjNotes(calc.notes || '');
        } else {
          toastError('Failed to generate report', res.error);
        }
      }
    } catch (err: any) {
      toastError('Report error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedYearId && startDate && endDate) {
      loadReport();
    }
  }, [selectedYearId, startDate, endDate]);

  // 3. Open & Manage Code Mappings Modal
  const handleOpenMappings = async () => {
    try {
      if (window.curtissApi?.financial) {
        const [mapsRes, fcatRes, bcatRes] = await Promise.all([
          window.curtissApi.financial.getPeriodicStatementMappings(selectedYearId),
          window.curtissApi.financial.getFundingCategories ? window.curtissApi.financial.getFundingCategories() : { success: true, data: [] },
          window.curtissApi.financial.getBudgetCategories ? window.curtissApi.financial.getBudgetCategories() : { success: true, data: [] },
        ]);

        if (mapsRes.success && mapsRes.data) {
          setMappings(mapsRes.data);
        }
        if (fcatRes.success && fcatRes.data) {
          setFundCategories(fcatRes.data);
        }
        if (bcatRes.success && bcatRes.data) {
          setBudgetCategories(bcatRes.data);
        }
        setMappingModalOpen(true);
      }
    } catch (err: any) {
      toastError('Failed to load code mappings', err.message);
    }
  };

  const handleSaveMappings = async () => {
    setSavingMappings(true);
    try {
      if (window.curtissApi?.financial?.savePeriodicStatementMappings) {
        const res = await window.curtissApi.financial.savePeriodicStatementMappings({
          financialYearId: selectedYearId,
          mappings,
        });

        if (res.success) {
          success('Configuration Saved', 'Report code mappings have been updated.');
          setMappingModalOpen(false);
          loadReport();
        } else {
          toastError('Failed to save mappings', res.error);
        }
      }
    } catch (err: any) {
      toastError('Save error', err.message);
    } finally {
      setSavingMappings(false);
    }
  };

  const [autoAssigning, setAutoAssigning] = useState(false);

  const handleAutoAssignMappings = async () => {
    if (!selectedYearId) return;
    setAutoAssigning(true);
    try {
      if (window.curtissApi?.financial?.autoAssignPeriodicStatementMappings) {
        const res = await window.curtissApi.financial.autoAssignPeriodicStatementMappings(selectedYearId);
        if (res.success && res.data) {
          setMappings(res.data);
          success('Auto-Assigned Successfully', 'Categories with transactions have been automatically assigned to report codes.');
          loadReport();
        } else {
          toastError('Auto-assign failed', res.error);
        }
      }
    } catch (err: any) {
      toastError('Auto-assign error', err.message);
    } finally {
      setAutoAssigning(false);
    }
  };

  // 4. Save Statement Adjustments (Bottom Section)
  const handleSaveAdjustments = async () => {
    setSavingAdj(true);
    try {
      if (window.curtissApi?.financial?.savePeriodicStatementAdjustments) {
        const openOverrideVal = adjOpeningOverride.trim() !== '' ? Math.round(parseFloat(adjOpeningOverride) * 100) : null;
        const otherAddVal = Math.round((parseFloat(adjOtherAdditions) || 0) * 100);
        const canteenRefVal = Math.round((parseFloat(adjCanteenRefund) || 0) * 100);
        const chqReissueVal = Math.round((parseFloat(adjChequeReissue) || 0) * 100);
        const bankChargesVal = Math.round((parseFloat(adjBankCharges) || 0) * 100);
        const pettyCashVal = Math.round((parseFloat(adjPettyCashBal) || 0) * 100);

        const res = await window.curtissApi.financial.savePeriodicStatementAdjustments({
          financialYearId: selectedYearId,
          startDate,
          endDate,
          adjustments: {
            opening_balance_override_cents: openOverrideVal,
            other_additions_cents: otherAddVal,
            canteen_refund_cents: canteenRefVal,
            cheque_reissue_cents: chqReissueVal,
            bank_charges_cents: bankChargesVal,
            petty_cash_balance_cents: pettyCashVal,
            notes: adjNotes.trim() || undefined,
          },
        });

        if (res.success) {
          success('Adjustments Applied', 'Closing balance calculation parameters updated.');
          setAdjModalOpen(false);
          loadReport();
        } else {
          toastError('Failed to save adjustments', res.error);
        }
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSavingAdj(false);
    }
  };

  // 5. Excel Export (.xlsx)
  const handleExportExcel = () => {
    if (!reportData) return;

    const wb = XLSX.utils.book_new();

    // Prepare main table rows
    const maxRows = Math.max(
      reportData.receipt_rows.length + 1, // +1 for Opening balance row
      reportData.recurrent_expense_rows.length + reportData.capital_expense_rows.length
    );

    const sheetData: any[][] = [];

    // Title Block
    sheetData.push(['ඇමුණුම 19. සිව්මස් ගිණුම් වාර්තාව']);
    sheetData.push(['සිව්මස් ගිණුම් වාර්තාව (PERIODIC FINANCIAL STATEMENT)']);
    sheetData.push([`පාසලේ නම: ${reportData.school_name_si} (${reportData.school_name_en})`]);
    sheetData.push([`${reportData.as_of_date_label} දිනෙන් අවසන් සිව්මස් ගිණුම් සාරාංශය`]);
    sheetData.push([]);

    // Headers
    sheetData.push([
      'ලැබීම් විස්තර (ඡේදය 7 අනුව)',
      'වාර්ෂික ඇස්තමේන්තුවේ සඳහන් මුදල (රු)',
      'පෙර සිව්මස් දක්වා එකතු කළ මුදල (රු)',
      'මෙම සිව්මසේ එකතුව (රු)',
      'පෙර සිව්මස් එකතුව සමග මුළු මුදල (රු)',
      'ගෙවීම් විස්තර (ඡේදය 8 අනුව)',
      'වර්ෂය සඳහා වෙන් කරන ලද මුදල (රු)',
      'පෙර සිව්මස දක්වා වියදම (රු)',
      'මෙම සිව්මසේ වියදම (රු)',
      'පෙර සිව්මස් එකතුව සමග මුළු වියදම් එකතුව (රු)',
    ]);

    // Row 1: Opening Balance on Left, First Expense on Right
    const allExpenses = [
      ...reportData.recurrent_expense_rows,
      ...reportData.capital_expense_rows,
    ];
    const firstExp = allExpenses[0];
    sheetData.push([
      'ආරම්භක ශේෂය',
      '',
      '',
      '',
      reportData.opening_balance_cents / 100,
      firstExp ? (firstExp.report_code || firstExp.category_code || '') : '',
      firstExp ? (firstExp.annual_estimate_cents ? firstExp.annual_estimate_cents / 100 : '') : '',
      firstExp ? (firstExp.prior_cumulative_cents ? firstExp.prior_cumulative_cents / 100 : '') : '',
      firstExp ? (firstExp.current_period_cents ? firstExp.current_period_cents / 100 : '') : '',
      firstExp ? (firstExp.total_cumulative_cents ? firstExp.total_cumulative_cents / 100 : '') : '',
    ]);

    // Rows 2..N
    const rightSideList = allExpenses.slice(1);

    for (let i = 0; i < Math.max(reportData.receipt_rows.length, rightSideList.length); i++) {
      const left = reportData.receipt_rows[i];
      const right = rightSideList[i];

      sheetData.push([
        left ? (left.report_code || left.category_code || '') : '',
        left ? (left.annual_estimate_cents ? left.annual_estimate_cents / 100 : '') : '',
        left ? (left.prior_cumulative_cents ? left.prior_cumulative_cents / 100 : '') : '',
        left ? (left.current_period_cents ? left.current_period_cents / 100 : '') : '',
        left ? (left.total_cumulative_cents ? left.total_cumulative_cents / 100 : '') : '',
        right ? (right.report_code || right.category_code || '') : '',
        right ? (right.annual_estimate_cents ? right.annual_estimate_cents / 100 : '') : '',
        right ? (right.prior_cumulative_cents ? right.prior_cumulative_cents / 100 : '') : '',
        right ? (right.current_period_cents ? right.current_period_cents / 100 : '') : '',
        right ? (right.total_cumulative_cents ? right.total_cumulative_cents / 100 : '') : '',
      ]);
    }

    // Totals Row
    sheetData.push([
      'එකතුව',
      reportData.receipt_totals.annual_estimate_cents / 100,
      reportData.receipt_totals.prior_cumulative_cents ? reportData.receipt_totals.prior_cumulative_cents / 100 : '',
      reportData.receipt_totals.current_period_cents / 100,
      reportData.receipt_totals.total_cumulative_cents / 100,
      'එකතුව',
      reportData.payment_totals.annual_allocation_cents / 100,
      reportData.payment_totals.prior_cumulative_cents ? reportData.payment_totals.prior_cumulative_cents / 100 : '',
      reportData.payment_totals.current_period_cents / 100,
      reportData.payment_totals.total_cumulative_cents / 100,
    ]);

    sheetData.push([]);
    sheetData.push(['ශේෂය ගණනය කිරීම (CLOSING BALANCE CALCULATION):']);

    const calc = reportData.calculation;
    sheetData.push([`${calc.period_start_date} දිනට ශේෂය`, calc.opening_balance_cents / 100]);
    sheetData.push([`${calc.period_end_date} දක්වා ලැබීම්`, calc.total_receipts_cents / 100]);
    sheetData.push(['(+) අගරු චෙක්', (calc.other_additions_cents || 0) / 100]);
    sheetData.push(['අතුරු එකතුව (Subtotal)', calc.subtotal_receipts_cents / 100]);
    sheetData.push([`${calc.period_end_date} දක්වා ගෙවීම්`, calc.total_payments_cents / 100]);
    if (calc.canteen_refund_cents > 0) {
      sheetData.push(['(-) ආපනශාලා තැන්පතු මුදල් ආපසු ගෙවුම්', calc.canteen_refund_cents / 100]);
    }
    if (calc.cheque_reissue_cents > 0) {
      sheetData.push(['(-) චෙක්පත් නැවත නිකුතුව', calc.cheque_reissue_cents / 100]);
    }
    sheetData.push(['(-) චෙක් අගරු ගාස්තු', (calc.bank_charges_cents || 0) / 100]);
    sheetData.push(['(-) සුළු මුදල් අත ඉතිරිය', (calc.petty_cash_balance_cents || 0) / 100]);
    sheetData.push([`${calc.period_end_date} දිනට ශේෂය (Closing Balance)`, calc.closing_balance_cents / 100]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Annexure 19');
    XLSX.writeFile(wb, `CurtissBooks_Periodic_Statement_${endDate}.xlsx`);
    success('Excel Downloaded', 'Statement exported to spreadsheet.');
  };

  // Helper number formatter matching reference
  const fmt = (cents: number | undefined | null, emptyZero = false) => {
    if (cents === undefined || cents === null) return '-';
    if (cents === 0 && emptyZero) return '-';
    return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="p-6 max-w-full mx-auto space-y-6 select-none font-sans">
      {/* Non-printable Action Controls Header */}
      <div className="print:hidden space-y-4">
        <PageHeader
          title="Periodic Financial Statement"
          titleSi="සිව්මස් ගිණුම් වාර්තාව (ඇමුණුම 19)"
          subtitle="Ministry Annexure 19 standard four-month statement, code mapping, and verified closing balance"
          badge={
            <Badge variant="neutral" size="md">
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1 inline" />
              <span>Annexure 19 Format</span>
            </Badge>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenMappings} title="Configure S, REX, CEX codes">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                <span>Code Mappings</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAdjModalOpen(true)} title="Adjust bottom closing balance lines">
                <Edit3 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                <span>Calculation Adjustments</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel} title="Export exact Excel spreadsheet">
                <Download className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                <span>Excel Export</span>
              </Button>
              <Button variant="primary" size="sm" onClick={() => window.print()} className="bg-zinc-900 text-white hover:bg-zinc-800">
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                <span>Print Statement (A4 Landscape)</span>
              </Button>
            </div>
          }
        />

        {/* Filter Bar */}
        <Card className="shadow-xs border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Financial Year Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Financial Year:</span>
                <select
                  value={selectedYearId}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.year_name} {Boolean(y.is_current) ? '(Current)' : y.status === 'approved' ? '(Approved)' : `(${y.status})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4-Month Period Selector Tabs */}
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => handlePeriodChange('1st')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    periodType === '1st'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  1st Period (Jan – Apr)
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('2nd')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    periodType === '2nd'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  2nd Period (May – Aug)
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('3rd')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    periodType === '3rd'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  3rd Period (Sep – Dec)
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('custom')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    periodType === 'custom'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Custom Dates
                </button>
              </div>
            </div>

            {/* Date Pickers */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-zinc-500">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodType('custom');
                  }}
                  className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                />
              </div>
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-zinc-500">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodType('custom');
                  }}
                  className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono font-bold"
                />
              </div>
              <Button size="sm" variant="outline" onClick={loadReport} isLoading={loading}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================== */}
      {/* PRINTABLE A4 LANDSCAPE DOCUMENT (EXACT REFERENCE REPRODUCTION)  */}
      {/* ============================================================== */}
      <div className="bg-white text-zinc-950 p-6 md:p-8 rounded-xl shadow-lg border border-zinc-300 print:border-none print:shadow-none print:p-0 print:m-0 print:w-full overflow-x-auto min-w-[1020px]">
        {/* Document Header */}
        <div className="relative mb-3 text-center">
          <div className="absolute top-0 left-0 text-left font-sans text-[11px] font-bold text-zinc-800">
            ඇමුණුම 19. සිව්මස් ගිණුම් වාර්තාව
          </div>
          <h1 className="text-base font-bold tracking-tight text-zinc-900 pt-1">
            සිව්මස් ගිණුම් වාර්තාව
          </h1>
          <div className="text-left mt-2 flex justify-between items-center text-xs">
            <span className="font-bold">
              පාසලේ නම:- <span className="font-normal underline decoration-dotted underline-offset-4">{reportData?.school_name_si}</span>
            </span>
          </div>
          <div className="text-center font-bold text-xs mt-1">
            {reportData?.as_of_date_label} දිනෙන් අවසන් සිව්මස් ගිණුම් සාරාංශය
          </div>
        </div>

        {/* MAIN 10-COLUMN TABLE */}
        <div className="overflow-x-auto border-t border-l border-zinc-900 text-[11px] leading-tight">
          <table className="w-full border-collapse text-zinc-950 font-sans">
            <thead>
              <tr className="bg-zinc-100/60 text-center font-bold">
                {/* Left Side: Receipts */}
                <th className="border-r border-b border-zinc-900 p-1.5 w-[14%]">
                  ලැබීම් විස්තර<br />
                  <span className="text-[9.5px] font-normal">(ඡේදය 7 අනුව)</span>
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[10%]">
                  වාර්ෂික ඇස්තමේන්තුවේ සඳහන් මුදල
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[8%]">
                  පෙර සිව්මස් දක්වා එකතු කළ මුදල
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[9%]">
                  මෙම සිව්මසේ එකතුව
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[9%]">
                  පෙර සිව්මස් එකතුව සමග මුළු මුදල
                </th>

                {/* Right Side: Payments */}
                <th className="border-r border-b border-zinc-900 p-1.5 w-[14%]">
                  ගෙවීම් විස්තර<br />
                  <span className="text-[9.5px] font-normal">(ඡේදය 8 අනුව)</span>
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[10%]">
                  වර්ෂය සඳහා වෙන් කරන ලද මුදල
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[8%]">
                  පෙර සිව්මස දක්වා වියදම
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[9%]">
                  මෙම සිව්මසේ වියදම
                </th>
                <th className="border-r border-b border-zinc-900 p-1.5 w-[9%]">
                  පෙර සිව්මස් එකතුව සමග මුළු වියදම් එකතුව
                </th>
              </tr>

              {/* Sub-header row for currency indicator (රු) */}
              <tr className="text-center font-bold text-[10px] bg-zinc-50">
                <th className="border-r border-b border-zinc-900 py-0.5"></th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5"></th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
                <th className="border-r border-b border-zinc-900 py-0.5">රු</th>
              </tr>
            </thead>

            <tbody>
              {/* Row 1: Opening Balance on Left, First Expense Category on Right */}
              {(() => {
                const allExpenses = [
                  ...(reportData?.recurrent_expense_rows || []),
                  ...(reportData?.capital_expense_rows || []),
                ];
                const firstExp = allExpenses[0];
                return (
                  <tr className="hover:bg-zinc-50/50">
                    <td className="border-r border-b border-zinc-900 px-2 py-1 font-bold">
                      ආරම්භක ශේෂය
                    </td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">-</td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">-</td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">-</td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono font-bold">
                      {fmt(reportData?.opening_balance_cents)}
                    </td>

                    <td className="border-r border-b border-zinc-900 px-2 py-1 font-medium">
                      {firstExp ? (
                        <span className="font-bold">{firstExp.report_code || firstExp.category_code}</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                      {firstExp ? fmt(firstExp.annual_estimate_cents, true) : ''}
                    </td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                      {firstExp ? fmt(firstExp.prior_cumulative_cents, true) : ''}
                    </td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                      {firstExp ? fmt(firstExp.current_period_cents, true) : ''}
                    </td>
                    <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono font-medium">
                      {firstExp ? fmt(firstExp.total_cumulative_cents, true) : ''}
                    </td>
                  </tr>
                );
              })()}

              {/* Rows 2..N: Dynamic rows filled from Actual Budget Page transactions */}
              {(() => {
                const receipts = reportData?.receipt_rows || [];
                const allExpenses = [
                  ...(reportData?.recurrent_expense_rows || []),
                  ...(reportData?.capital_expense_rows || []),
                ];
                const rightSide = allExpenses.slice(1);
                const totalRows = Math.max(receipts.length, rightSide.length, 12);

                const rows = [];
                for (let i = 0; i < totalRows; i++) {
                  const left = receipts[i];
                  const right = rightSide[i];

                  rows.push(
                    <tr key={`row-${i}`} className="hover:bg-zinc-50/50">
                      {/* Left: Receipts */}
                      <td className="border-r border-b border-zinc-900 px-2 py-1 font-medium">
                        {left ? (
                          <span className="font-bold">{left.report_code || left.category_code}</span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                        {left ? fmt(left.annual_estimate_cents, true) : ''}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                        {left ? fmt(left.prior_cumulative_cents, true) : ''}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                        {left ? fmt(left.current_period_cents, true) : ''}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono font-medium">
                        {left ? fmt(left.total_cumulative_cents, true) : ''}
                      </td>

                      {/* Right: Payments */}
                      <td className="border-r border-b border-zinc-900 px-2 py-1 font-medium">
                        {right ? (
                          <span className="font-bold">{right.report_code || right.category_code}</span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                        {right ? fmt(right.annual_estimate_cents, true) : ''}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                        {right ? fmt(right.prior_cumulative_cents, true) : ''}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono">
                        {right ? fmt(right.current_period_cents, true) : ''}
                      </td>
                      <td className="border-r border-b border-zinc-900 px-2 py-1 text-right font-mono font-medium">
                        {right ? fmt(right.total_cumulative_cents, true) : ''}
                      </td>
                    </tr>
                  );
                }
                return rows;
              })()}

              {/* Totals Row */}
              <tr className="font-bold border-t-2 border-b-2 border-zinc-900 bg-zinc-100/70">
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-center font-bold">
                  එකතුව
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.receipt_totals.annual_estimate_cents)}
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.receipt_totals.prior_cumulative_cents, true)}
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.receipt_totals.current_period_cents)}
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.receipt_totals.total_cumulative_cents)}
                </td>

                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-center font-bold">
                  එකතුව
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.payment_totals.annual_allocation_cents)}
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.payment_totals.prior_cumulative_cents, true)}
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.payment_totals.current_period_cents)}
                </td>
                <td className="border-r border-b border-zinc-900 px-2 py-1.5 text-right font-mono">
                  {fmt(reportData?.payment_totals.total_cumulative_cents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* CLOSING BALANCE CALCULATION SECTION (BELOW MAIN TABLE) */}
        {reportData && (
          <div className="mt-5 flex flex-col md:flex-row justify-between items-start gap-8 text-xs font-sans">
            {/* Left Column: Arithmetic breakdown matching photograph */}
            <div className="w-full md:w-[480px] space-y-1">
              {/* Row 1: Opening balance */}
              <div className="flex justify-between items-baseline py-0.5">
                <span>{reportData.calculation.period_start_date.replace(/-/g, '.')} දිනට ශේෂය</span>
                <span className="font-mono font-medium">{fmt(reportData.calculation.opening_balance_cents)}</span>
              </div>

              {/* Row 2: Total receipts */}
              <div className="flex justify-between items-baseline py-0.5">
                <span>{reportData.calculation.period_end_date.replace(/-/g, '.')} දක්වා ලැබීම්</span>
                <span className="font-mono font-medium">{fmt(reportData.calculation.total_receipts_cents)}</span>
              </div>

              {/* Row 3: Bounced Cheque Total (+) (matching Image 2) */}
              <div className="flex justify-between items-baseline py-0.5">
                <span>(+)අගරු චෙක්</span>
                <span className="font-mono font-medium">{fmt(reportData.calculation.other_additions_cents || 0)}</span>
              </div>

              {/* Separator line */}
              <div className="border-b border-zinc-900 my-0.5" />

              {/* Subtotal */}
              <div className="flex justify-between items-baseline py-0.5 font-semibold">
                <span className="invisible">Subtotal</span>
                <span className="font-mono">{fmt(reportData.calculation.subtotal_receipts_cents)}</span>
              </div>

              {/* Row 4: Total payments */}
              <div className="flex justify-between items-baseline py-0.5">
                <span>{reportData.calculation.period_end_date.replace(/-/g, '.')} දක්වා ගෙවීම්</span>
                <span className="font-mono font-medium">{fmt(reportData.calculation.total_payments_cents)}</span>
              </div>

              {/* Optional Canteen Refund (-) */}
              {reportData.calculation.canteen_refund_cents > 0 && (
                <div className="flex justify-between items-baseline py-0.5">
                  <span>(-)ආපනශාලා තැන්පතු මුදල් ආපසු ගෙවීම්</span>
                  <span className="font-mono font-medium">{fmt(reportData.calculation.canteen_refund_cents)}</span>
                </div>
              )}

              {/* Optional Cheque Reissue (-) */}
              {reportData.calculation.cheque_reissue_cents > 0 && (
                <div className="flex justify-between items-baseline py-0.5">
                  <span>(-)චෙක්පතක් නැවත නිකුතුව</span>
                  <span className="font-mono font-medium">{fmt(reportData.calculation.cheque_reissue_cents)}</span>
                </div>
              )}

              {/* Row 5: Cheque return / bounce fee (-) (matching Image 2) */}
              <div className="flex justify-between items-baseline py-0.5">
                <span>(-)චෙක් අගරු ගාස්තු</span>
                <span className="font-mono font-medium">{fmt(reportData.calculation.bank_charges_cents || 0)}</span>
              </div>

              {/* Row 6: Petty cash balance on hand (-) (matching Image 2) */}
              <div className="flex justify-between items-baseline py-0.5">
                <span>(-)සුළු මුදල් අත ඉතිරිය</span>
                <span className="font-mono font-medium">{fmt(reportData.calculation.petty_cash_balance_cents || 0)}</span>
              </div>

              {/* Final Double-line Separator */}
              <div className="border-b-2 border-zinc-900 pt-1" />

              {/* Final Closing Balance */}
              <div className="flex justify-between items-baseline py-1 font-bold text-sm">
                <span>{reportData.calculation.period_end_date.replace(/-/g, '.')} දිනට ශේෂය</span>
                <span className="font-mono text-base border-b-2 border-double border-zinc-900">
                  {fmt(reportData.calculation.closing_balance_cents)}
                </span>
              </div>
            </div>

            {/* Right Column: Institutional Sign-off Block */}
            <div className="w-full md:w-auto flex flex-col justify-end space-y-12 pt-8 md:pt-16 pr-8">
              <div className="flex justify-between gap-24 text-center">
                <div className="space-y-1">
                  <div className="text-zinc-400 font-mono">...............................................</div>
                  <div className="font-bold text-xs">විෂයභාර නිලධාරියා</div>
                  <div className="text-[10px] text-zinc-500">Subject Officer</div>
                </div>

                <div className="space-y-1">
                  <div className="text-zinc-400 font-mono">...............................................</div>
                  <div className="font-bold text-xs">විදුහල්පති</div>
                  <div className="text-[10px] text-zinc-500">Principal</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: CODE MAPPINGS (S1..S10, REX1..REX8, CEX1..CEX6)      */}
      {/* ============================================================== */}
      <Modal
        isOpen={mappingModalOpen}
        onClose={() => setMappingModalOpen(false)}
        title="Periodic Statement Code Mappings (Annexure 19)"
        size="xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto p-1">
          <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 p-2.5 rounded-lg text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
            <p>
              <strong>⚡ Automatic Category Discovery Active:</strong> All categories with transactions or budget allocations are automatically detected and mapped to Annexure 19 codes.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoAssignMappings}
              isLoading={autoAssigning}
              className="ml-3 shrink-0 bg-white dark:bg-zinc-900 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
              <span>Auto-Assign Now</span>
            </Button>
          </div>

          <div className="space-y-6">
            {/* Section A: S1..S10 Receipts */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b pb-1">
                Receipts Code Mapping (S1 – S10 & වෙනත්)
              </h3>
              <div className="space-y-2">
                {mappings
                  .filter((m) => m.section === 'receipt')
                  .map((m) => (
                    <div key={m.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border text-xs">
                      <div className="col-span-2 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {m.report_code}
                      </div>
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={m.label_si}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, label_si: val } : item)));
                          }}
                          placeholder="Sinhala Label..."
                          className="w-full px-2 py-1 rounded border text-xs bg-white dark:bg-zinc-800"
                        />
                      </div>
                      <div className="col-span-4">
                        <select
                          value={m.fund_category_id || ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, fund_category_id: val } : item)));
                          }}
                          className="w-full px-2 py-1 rounded border text-xs bg-white dark:bg-zinc-800"
                        >
                          <option value="">-- Unmapped / Manual --</option>
                          {fundCategories.map((fc) => (
                            <option key={fc.id} value={fc.id}>
                              {fc.category_code} - {fc.name_si || fc.name_en}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          value={(m.estimated_amount_cents / 100).toFixed(2)}
                          onChange={(e) => {
                            const val = Math.round((parseFloat(e.target.value) || 0) * 100);
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, estimated_amount_cents: val } : item)));
                          }}
                          placeholder="Est (LKR)"
                          className="w-full px-2 py-1 rounded border text-xs text-right font-mono bg-white dark:bg-zinc-800"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Section B: REX1..REX8 Recurrent Expenses */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b pb-1">
                Recurrent Expenditures Mapping (REX1 – REX8)
              </h3>
              <div className="space-y-2">
                {mappings
                  .filter((m) => m.section === 'recurrent_expense')
                  .map((m) => (
                    <div key={m.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border text-xs">
                      <div className="col-span-2 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {m.report_code}
                      </div>
                      <div className="col-span-5">
                        <input
                          type="text"
                          value={m.label_si}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, label_si: val } : item)));
                          }}
                          placeholder="Sinhala Label..."
                          className="w-full px-2 py-1 rounded border text-xs bg-white dark:bg-zinc-800"
                        />
                      </div>
                      <div className="col-span-5">
                        <select
                          value={m.budget_category_id || ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, budget_category_id: val } : item)));
                          }}
                          className="w-full px-2 py-1 rounded border text-xs bg-white dark:bg-zinc-800"
                        >
                          <option value="">-- Unmapped / Manual --</option>
                          {budgetCategories.map((bc) => (
                            <option key={bc.id} value={bc.id}>
                              {bc.category_code} - {bc.name_si || bc.name_en}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Section C: CEX1..CEX6 Capital Expenses */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 border-b pb-1">
                Capital Expenditures Mapping (CEX1 – CEX6 & වෙනත්)
              </h3>
              <div className="space-y-2">
                {mappings
                  .filter((m) => m.section === 'capital_expense')
                  .map((m) => (
                    <div key={m.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border text-xs">
                      <div className="col-span-2 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {m.report_code}
                      </div>
                      <div className="col-span-5">
                        <input
                          type="text"
                          value={m.label_si}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, label_si: val } : item)));
                          }}
                          placeholder="Sinhala Label..."
                          className="w-full px-2 py-1 rounded border text-xs bg-white dark:bg-zinc-800"
                        />
                      </div>
                      <div className="col-span-5">
                        <select
                          value={m.budget_category_id || ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setMappings((prev) => prev.map((item) => (item.id === m.id ? { ...item, budget_category_id: val } : item)));
                          }}
                          className="w-full px-2 py-1 rounded border text-xs bg-white dark:bg-zinc-800"
                        >
                          <option value="">-- Unmapped / Manual --</option>
                          {budgetCategories.map((bc) => (
                            <option key={bc.id} value={bc.id}>
                              {bc.category_code} - {bc.name_si || bc.name_en}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoAssignMappings}
              isLoading={autoAssigning}
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
              title="Automatically detect all categories with transactions/budget allocations and assign them to report codes"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              <span>Auto-Assign From Transactions (ස්වයංක්‍රීයව පවරන්න)</span>
            </Button>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => setMappingModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveMappings} isLoading={savingMappings} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                <span>Save Mappings</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 2: STATEMENT CALCULATION ADJUSTMENTS                     */}
      {/* ============================================================== */}
      <Modal
        isOpen={adjModalOpen}
        onClose={() => setAdjModalOpen(false)}
        title="Closing Balance Calculation Adjustments"
        size="md"
      >
        <div className="space-y-4 p-1">
          <p className="text-xs text-zinc-500">
            Configure specific financial additions and deductions appearing in the bottom section of Annexure 19.
          </p>

          <div className="space-y-3">
            <Input
              label="Opening Balance Override (LKR)"
              type="number"
              step="0.01"
              value={adjOpeningOverride}
              onChange={(e) => setAdjOpeningOverride(e.target.value)}
              placeholder="Auto-calculated from ledger if blank"
            />
            <Input
              label="(+) අගරු චෙක් / Bounced Cheque Total (LKR)"
              type="number"
              step="0.01"
              value={adjOtherAdditions}
              onChange={(e) => setAdjOtherAdditions(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="(-) චෙක් අගරු ගාස්තු / Cheque Return Fee (LKR)"
              type="number"
              step="0.01"
              value={adjBankCharges}
              onChange={(e) => setAdjBankCharges(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="(-) සුළු මුදල් අත ඉතිරිය / Petty Cash Float on Hand (LKR)"
              type="number"
              step="0.01"
              value={adjPettyCashBal}
              onChange={(e) => setAdjPettyCashBal(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="(-) ආපනශාලා තැන්පතු ආපසු ගෙවීම් / Canteen Refunds (LKR)"
              type="number"
              step="0.01"
              value={adjCanteenRefund}
              onChange={(e) => setAdjCanteenRefund(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="(-) චෙක්පත් නැවත නිකුතුව / Cheque Re-issues (LKR)"
              type="number"
              step="0.01"
              value={adjChequeReissue}
              onChange={(e) => setAdjChequeReissue(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="Audit Remarks / සටහන්"
              value={adjNotes}
              onChange={(e) => setAdjNotes(e.target.value)}
              placeholder="Reason or reference notes..."
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => setAdjModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveAdjustments} isLoading={savingAdj} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              <span>Apply Adjustments</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
