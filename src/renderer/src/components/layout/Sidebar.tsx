import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarDays,
  PieChart,
  Landmark,
  Receipt,
  BookOpen,
  Coins,
  Building2,
  FileSpreadsheet,
  FileText,
  Users,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeftRight,
  CreditCard,
  Scale,
  FileCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';

export type NavItemKey =
  | 'dashboard'
  | 'financialYear'
  | 'budget'
  | 'funds'
  | 'expenses'
  | 'cheques'
  | 'transfers'
  | 'cashbook'
  | 'pettycash'
  | 'bank'
  | 'reconciliation'
  | 'periodicStatement'
  | 'reports'
  | 'audit'
  | 'users'
  | 'settings';

interface SidebarProps {
  activeNav: NavItemKey;
  onSelectNav: (key: NavItemKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  userPermissions?: string[];
}

interface NavItemDef {
  key: NavItemKey;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  requiredPermission?: string | string[];
}

interface NavGroupDef {
  groupKey: string;
  items: NavItemDef[];
}

const navGroups: NavGroupDef[] = [
  {
    groupKey: 'overview',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, labelKey: 'dashboard', requiredPermission: 'dashboard.view' },
    ],
  },
  {
    groupKey: 'financial',
    items: [
      { key: 'budget', icon: PieChart, labelKey: 'budget', requiredPermission: 'budget.view' },
      { key: 'funds', icon: Landmark, labelKey: 'funds', requiredPermission: 'funds.view' },
      { key: 'expenses', icon: Receipt, labelKey: 'expenses', requiredPermission: 'expenses.view' },
      { key: 'cheques', icon: CreditCard, labelKey: 'cheques', requiredPermission: ['cheques.received_view', 'cheques.issued_view'] },
      { key: 'transfers', icon: ArrowLeftRight, labelKey: 'transfers', requiredPermission: 'fundTransfer.view' },
      { key: 'cashbook', icon: BookOpen, labelKey: 'cashbook', requiredPermission: 'cashbook.view' },
      { key: 'pettycash', icon: Coins, labelKey: 'pettycash', requiredPermission: 'pettycash.view' },
      { key: 'bank', icon: Building2, labelKey: 'bank', requiredPermission: 'bank.view' },
      { key: 'reconciliation', icon: Scale, labelKey: 'reconciliation', requiredPermission: 'bank.view' },
      { key: 'periodicStatement', icon: FileCheck, labelKey: 'periodicStatement', requiredPermission: 'reports.view' },
      { key: 'reports', icon: FileSpreadsheet, labelKey: 'reports', requiredPermission: 'reports.view' },
    ],
  },
  {
    groupKey: 'governance',
    items: [
      { key: 'audit', icon: FileText, labelKey: 'audit', requiredPermission: 'audit.view' },
      { key: 'users', icon: Users, labelKey: 'users', requiredPermission: 'users.view' },
      { key: 'settings', icon: Settings, labelKey: 'settings', requiredPermission: 'settings.view' },
      { key: 'financialYear', icon: CalendarDays, labelKey: 'financialYear', requiredPermission: 'financialYear.view' },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onSelectNav,
  isCollapsed,
  onToggleCollapse,
  userPermissions = [],
}) => {
  const { t } = useTranslation('navigation');
  const { t: tCommon } = useTranslation('common');

  return (
    <aside
      className={cn(
        'h-full bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col justify-between transition-all duration-200 ease-in-out select-none z-30',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* App Logo & Collapse Header */}
        <div className="h-14 px-3 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold text-xs tracking-tight shrink-0 shadow-xs">
              CB
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-none">
                  {tCommon('appName')}
                </h1>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                  {tCommon('appSubtitle', 'School Manager ERP')}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? tCommon('actions.expand') : tCommon('actions.collapse')}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Scrollable Navigation Groups */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {navGroups.map((group) => {
            // Filter group items according to user permissions
            const visibleItems = group.items.filter((item) => {
              if (!item.requiredPermission) return true;
              if (Array.isArray(item.requiredPermission)) {
                return item.requiredPermission.some((p) => userPermissions.includes(p));
              }
              return userPermissions.includes(item.requiredPermission);
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.groupKey} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {t(`groups.${group.groupKey}`)}
                  </div>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.key;
                  const label = t(`items.${item.labelKey}`);

                  const btn = (
                    <button
                      key={item.key}
                      onClick={() => onSelectNav(item.key)}
                      className={cn(
                        'w-full flex items-center rounded-lg text-xs font-medium transition-all group relative',
                        isCollapsed ? 'justify-center p-2' : 'justify-between px-2.5 py-1.5',
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                      )}
                    >
                      <div className="flex items-center space-x-2.5 overflow-hidden">
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-105',
                            isActive
                              ? 'text-white dark:text-zinc-950'
                              : 'text-zinc-500 dark:text-zinc-400'
                          )}
                        />
                        {!isCollapsed && <span className="truncate">{label}</span>}
                      </div>

                      {!isCollapsed && isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                    </button>
                  );

                  return isCollapsed ? (
                    <Tooltip key={item.key} content={label} position="right">
                      {btn}
                    </Tooltip>
                  ) : (
                    btn
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Node Security Indicator */}
      <div className="p-2.5 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/40">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          {!isCollapsed && (
            <div className="overflow-hidden">
              <div className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 truncate leading-none">
                {tCommon('status.offline')}
              </div>
              <div className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5 truncate">
                {tCommon('status.sqliteActive')}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
