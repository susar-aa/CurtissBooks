import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  RefreshCw,
  Wallet,
  Building2,
  DollarSign,
  ArrowRightLeft,
  Search,
  Printer,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import { UnifiedCashBookTransaction, BankAccount, FinancialYear } from '../../../shared/types/finance';

export const CashBookView: React.FC = () => {
  const { t: tFinance } = useTranslation('finance');
  const { error: toastError } = useToast();

  const [transactions, setTransactions] = useState<UnifiedCashBookTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // KPIs
  const [kpi, setKpi] = useState({
    cashBalanceCents: 0,
    bankBalanceCents: 0,
    totalLiquidBalanceCents: 0,
    totalInflowCents: 0,
    totalOutflowCents: 0,
  });

  // Filters: All, Cash in Hand, or Bank of Ceylon
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cash' | 'bank'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const offset = (page - 1) * pageSize;
        const [uRes, yRes] = await Promise.all([
          window.curtissApi.financial.getUnifiedCashBook({
            financialYearId: selectedYearId,
            search: searchTerm.trim() || undefined,
            sourceFilter,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            typeFilter: typeFilter !== 'all' ? typeFilter : undefined,
            limit: pageSize,
            offset,
          }),
          window.curtissApi.financial.getYears(),
        ]);

        if (uRes.success && uRes.data) {
          setTransactions(uRes.data.transactions || []);
          setKpi(uRes.data.kpi);
          setBankAccounts(uRes.data.bankAccounts || []);
          setTotalCount(uRes.data.total || 0);
        }
        if (yRes.success && yRes.data) {
          setYears(yRes.data);
          const curr = yRes.data.find((y: FinancialYear) => y.is_current);
          if (curr && selectedYearId === 1) setSelectedYearId(curr.id);
        }
      }
    } catch (err: any) {
      toastError('Failed to load unified cash book', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [selectedYearId, sourceFilter, searchTerm, dateFrom, dateTo, typeFilter, pageSize]);

  useEffect(() => {
    loadData();
  }, [selectedYearId, sourceFilter, searchTerm, dateFrom, dateTo, typeFilter, page, pageSize]);

  const handlePrint = () => {
    window.print();
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const activeBank = bankAccounts[0] || null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans print:p-0 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={tFinance('unifiedCashBook.title', 'Unified Cash Book')}
        subtitle={tFinance('unifiedCashBook.subtitle', 'Consolidated chronological ledger of cash-in-hand and institution bank transactions.')}
        badge={
          <Badge variant="success" size="md">
            <BookOpen className="w-3.5 h-3.5 mr-1 inline" />
            {tFinance('unifiedCashBook.badge', 'Unified Cash & Bank Ledger')}
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2 print:hidden">
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

            <Button variant="outline" size="sm" onClick={handlePrint} title="Print Cash Book">
              <Printer className="w-3.5 h-3.5 mr-1" />
              <span>Print</span>
            </Button>

            <Button variant="outline" size="sm" onClick={loadData} isLoading={loading} title="Refresh Data">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {/* KPI Cards: Liquid Balances & Flows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
        {/* Total Liquid Reserves */}
        <Card className="bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900 border-emerald-200/60 dark:border-emerald-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>{tFinance('unifiedCashBook.totalLiquid', 'Combined Liquid Reserves')}</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
              Rs. {(kpi.totalLiquidBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">Total Available Institutional Funds</span>
          </CardHeader>
        </Card>

        {/* Cash in Hand */}
        <Card className="bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/20 dark:to-zinc-900 border-blue-200/60 dark:border-blue-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>{tFinance('unifiedCashBook.cashBalance', 'Cash in Hand')}</span>
              <Wallet className="w-3.5 h-3.5 text-blue-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
              Rs. {(kpi.cashBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400">Physical Cash Register Float</span>
          </CardHeader>
        </Card>

        {/* Institutional Bank (Bank of Ceylon) */}
        <Card className="bg-gradient-to-br from-purple-50/60 to-white dark:from-purple-950/20 dark:to-zinc-900 border-purple-200/60 dark:border-purple-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>{activeBank?.bank_name || 'Bank of Ceylon'}</span>
              <Building2 className="w-3.5 h-3.5 text-purple-500" />
            </span>
            <div className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
              Rs. {(kpi.bankBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">
              A/C: {activeBank?.account_number || '1004829104'}
            </span>
          </CardHeader>
        </Card>

        {/* Period Inflow / Outflow Flow Summary */}
        <Card className="bg-gradient-to-br from-amber-50/40 to-white dark:from-amber-950/20 dark:to-zinc-900 border-amber-200/60 dark:border-amber-900/40">
          <CardHeader className="pb-1">
            <span className="text-xs text-zinc-500 font-medium flex items-center justify-between">
              <span>Period Flow Summary</span>
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-500" />
            </span>
            <div className="text-xs space-y-1 mt-1 font-mono">
              <div className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-between">
                <span className="flex items-center text-[11px] font-sans font-medium text-zinc-500">
                  <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" /> Inflows:
                </span>
                <span>+ Rs. {(kpi.totalInflowCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="text-rose-600 dark:text-rose-400 font-semibold flex items-center justify-between">
                <span className="flex items-center text-[11px] font-sans font-medium text-zinc-500">
                  <TrendingDown className="w-3 h-3 mr-1 text-rose-500" /> Outflows:
                </span>
                <span>- Rs. {(kpi.totalOutflowCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
        {/* Source & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ref #, cheque, payee, description..."
              className="h-8 pl-8 pr-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 w-64"
            />
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-zinc-500">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Sources (Unified)</option>
              <option value="cash">Cash in Hand Only</option>
              <option value="bank">Bank of Ceylon Only (1004829104)</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-zinc-500">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Movements</option>
              <option value="inflow">Inflows Only (Receipts / Deposits)</option>
              <option value="disbursement">Disbursements Only (Payments / Withdrawals)</option>
            </select>
          </div>
        </div>

        {/* Date Range & Reset */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <span className="text-zinc-400">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-zinc-400">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
            />
          </div>

          {(searchTerm || dateFrom || dateTo || typeFilter !== 'all' || sourceFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setDateFrom('');
                setDateTo('');
                setTypeFilter('all');
                setSourceFilter('all');
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold px-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Unified Multi-Column Transactions Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-zinc-400" />
            <span>Unified Chronological Transactions</span>
          </CardTitle>
          <div className="flex items-center space-x-2 text-xs text-zinc-500 font-mono">
            <span>Showing {transactions.length} of {totalCount} records</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold w-24">Date</th>
                  <th className="py-2.5 px-3 font-semibold w-32">Reference / Chq #</th>
                  <th className="py-2.5 px-3 font-semibold">Payee / Payer & Description</th>
                  <th className="py-2.5 px-3 font-semibold w-36">Account Source</th>
                  <th className="py-2.5 px-3 font-semibold text-right text-emerald-600 dark:text-emerald-400 w-28">Cash In</th>
                  <th className="py-2.5 px-3 font-semibold text-right text-amber-600 dark:text-amber-400 w-28">Cash Out</th>
                  <th className="py-2.5 px-3 font-semibold text-right text-purple-600 dark:text-purple-400 w-28">Bank In</th>
                  <th className="py-2.5 px-3 font-semibold text-right text-rose-600 dark:text-rose-400 w-28">Bank Out</th>
                  <th className="py-2.5 px-3 font-semibold text-right font-mono w-32">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-zinc-400 text-xs">
                      No transactions recorded matching the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="py-2.5 px-3 font-mono text-zinc-500 whitespace-nowrap">{tx.date}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          {tx.reference || '—'}
                        </div>
                        {tx.cheque_number && (
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 mt-0.5">
                            #{tx.cheque_number}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {tx.payee_or_payer && (
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                            {tx.payee_or_payer}
                          </div>
                        )}
                        <div className="text-zinc-600 dark:text-zinc-400 text-[11px] truncate max-w-md">
                          {tx.description}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          tx.payment_source === 'Cash in Hand' || tx.source_type === 'cash'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                        }`}>
                          {tx.payment_source === 'Cash in Hand' || tx.source_type === 'cash' ? (
                            <Wallet className="w-3 h-3 mr-1 shrink-0" />
                          ) : (
                            <Building2 className="w-3 h-3 mr-1 shrink-0" />
                          )}
                          <span className="truncate max-w-[110px]">{tx.account_name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                        {tx.cash_received_cents > 0
                          ? `Rs. ${(tx.cash_received_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                        {tx.cash_paid_cents > 0
                          ? `Rs. ${(tx.cash_paid_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-purple-600 dark:text-purple-400 font-semibold whitespace-nowrap">
                        {tx.bank_received_cents > 0
                          ? `Rs. ${(tx.bank_received_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                        {tx.bank_paid_cents > 0
                          ? `Rs. ${(tx.bank_paid_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        Rs. {(tx.running_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 print:hidden">
            <div className="flex items-center space-x-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-7 px-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <span>
                Page {page} of {totalPages} ({totalCount} total)
              </span>
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
