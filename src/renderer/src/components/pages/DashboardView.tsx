import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Receipt,
  Landmark,
  Wallet,
  CalendarDays,
  BarChart3,
  PieChart as DonutIcon,
  ArrowUpRight,
  Database,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';
import { EmptyState } from '../ui/EmptyState';
import { NavItemKey } from '../layout/Sidebar';
import { AppInfo } from '../../../shared/types/settings';

interface DashboardViewProps {
  onNavigate: (key: NavItemKey) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      if (window.curtissApi) {
        const info = await window.curtissApi.app.getInfo();
        if (info.success && info.data) setAppInfo(info.data);

        const s = await window.curtissApi.settings.getAll();
        if (s.success && s.data) setSettings(s.data);

        if (window.curtissApi.financial) {
          const statsRes = await window.curtissApi.financial.getSummaryStats();
          if (statsRes.success && statsRes.data) setStats(statsRes.data);
        }
      }
    } catch (e) {
      console.error('Error loading diagnostics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 select-none">
      {/* 1. Page Header */}
      <PageHeader
        title={t('welcomeTitle')}
        subtitle={t('welcomeSubtitle')}
        badge={
          <Badge variant="warning" size="md">
            <CalendarDays className="w-3 h-3 mr-1 inline" />
            {t('financialYearBadge')}
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadDiagnostics}
            isLoading={loading}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{tCommon('actions.refresh')}</span>
          </Button>
        }
      />

      {/* 2. Key Financial Indicators (Summary Card Placeholders) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Annual Budget */}
        <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('metrics.annualBudget.title')}
              </span>
              <PieChart className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
              {stats ? `Rs. ${(stats.annualBudgetCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {stats ? `Remaining: Rs. ${(stats.remainingBudgetCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : t('metrics.annualBudget.subtext')}
            </p>
          </CardContent>
        </Card>

        {/* Metric 2: Total Expenses */}
        <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('metrics.totalExpenses.title')}
              </span>
              <Receipt className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 mt-1">
              {stats ? `Rs. ${(stats.totalExpensesCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {t('metrics.totalExpenses.subtext')}
            </p>
          </CardContent>
        </Card>

        {/* Metric 3: Liquid Cash & Bank */}
        <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('metrics.liquidAssets.title')}
              </span>
              <Wallet className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
              {stats ? `Rs. ${((stats.cashBalanceCents + stats.bankBalanceCents + stats.pettyCashBalanceCents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {stats ? `Cash: Rs. ${(stats.cashBalanceCents / 100).toFixed(2)} | Bank: Rs. ${(stats.bankBalanceCents / 100).toFixed(2)}` : t('metrics.liquidAssets.subtext')}
            </p>
          </CardContent>
        </Card>

        {/* Metric 4: Active Grants & Funds */}
        <Card className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('metrics.activeFunds.title')}
              </span>
              <Landmark className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 mt-1">
              {stats ? `Rs. ${(stats.totalFundsReceivedCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {t('metrics.activeFunds.subtext')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Quick Navigation Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
          {t('quickActions.title')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate('budget')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-950 transition-colors">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t('quickActions.setupBudget')}
                </div>
                <div className="text-[10px] text-zinc-400">Stage 06</div>
              </div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
          </button>

          <button
            onClick={() => onNavigate('expenses')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-950 transition-colors">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t('quickActions.recordExpense')}
                </div>
                <div className="text-[10px] text-zinc-400">Stage 08</div>
              </div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
          </button>

          <button
            onClick={() => onNavigate('cashbook')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-950 transition-colors">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t('quickActions.cashBook')}
                </div>
                <div className="text-[10px] text-zinc-400">Stage 09</div>
              </div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
          </button>
        </div>
      </div>

      {/* 4. Financial Charts Placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Budget vs Actual */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-zinc-500" />
                <span>{t('charts.budgetVsActual.title')}</span>
              </CardTitle>
              <Badge variant="neutral" size="sm">Stage 11</Badge>
            </div>
            <CardDescription>
              {t('charts.budgetVsActual.placeholder')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-44 w-full rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center p-4 text-center bg-zinc-50/50 dark:bg-zinc-900/20">
              <BarChart3 className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
              <p className="text-xs text-zinc-400 max-w-xs">
                {t('charts.budgetVsActual.placeholder')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Category Distribution */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <DonutIcon className="w-4 h-4 text-zinc-500" />
                <span>{t('charts.expenseDistribution.title')}</span>
              </CardTitle>
              <Badge variant="neutral" size="sm">Stage 11</Badge>
            </div>
            <CardDescription>
              {t('charts.expenseDistribution.placeholder')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-44 w-full rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center p-4 text-center bg-zinc-50/50 dark:bg-zinc-900/20">
              <DonutIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
              <p className="text-xs text-zinc-400 max-w-xs">
                {t('charts.expenseDistribution.placeholder')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5. Recent Activity Empty State */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
          {tCommon('labels.recentActivity')}
        </h3>
        <EmptyState
          title={t('emptyActivity.title')}
          description={t('emptyActivity.description')}
        />
      </div>

      {/* 6. Local Storage & Engine Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2 text-xs">
              <HardDrive className="w-4 h-4 text-zinc-400" />
              <span>{t('systemStatus.title')}</span>
            </CardTitle>
            <Badge variant="success" size="sm">
              <Database className="w-3 h-3 mr-1 inline" />
              {tCommon('status.connected')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 break-all select-all">
              {appInfo?.dbPath || 'Initializing local database path...'}
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
              <div>Mode: <span className="font-semibold text-zinc-700 dark:text-zinc-200">SQLite 3.53+ (WAL)</span></div>
              <div>Node: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{appInfo?.nodeVersion || 'v20.x'}</span></div>
              <div>Electron: <span className="font-semibold text-zinc-700 dark:text-zinc-200">v{appInfo?.electronVersion || '45.x'}</span></div>
              <div>{tCommon('labels.language')}: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{settings['default_language'] === 'si' ? 'සිංහල' : 'English'}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
