import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar, NavItemKey } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DashboardView } from './components/pages/DashboardView';
import { PlaceholderView } from './components/pages/PlaceholderView';
import { UserManagementView } from './components/pages/UserManagementView';
import { SchoolProfileView } from './components/pages/SchoolProfileView';
import { FinancialYearView } from './components/pages/FinancialYearView';
import { BudgetManagementView } from './components/pages/BudgetManagementView';
import { FundManagementView } from './components/pages/FundManagementView';
import { ExpenseManagementView } from './components/pages/ExpenseManagementView';
import { ChequeManagementView } from './components/pages/ChequeManagementView';
import { FundTransfersView } from './components/pages/FundTransfersView';
import { CashBookView } from './components/pages/CashBookView';
import { PettyCashView } from './components/pages/PettyCashView';
import { BankAccountsView } from './components/pages/BankAccountsView';
import { BankReconciliationView } from './components/pages/BankReconciliationView';
import { PeriodicFinancialStatementView } from './components/pages/PeriodicFinancialStatementView';
import { FinancialReportsView } from './components/pages/FinancialReportsView';
import { AuditLogsView } from './components/pages/AuditLogsView';
import { SetupView } from './components/auth/SetupView';
import { LoginView } from './components/auth/LoginView';
import { LockScreenModal } from './components/auth/LockScreenModal';
import { AccessDeniedView } from './components/auth/AccessDeniedView';
import { ToastProvider, useToast } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { LoadingState } from './components/ui/LoadingState';
import { ThemeProvider } from './context/ThemeContext';
import { changeAppLanguage } from './i18n';
import { AuthSession } from '../../shared/types/auth';

const moduleStages: Record<NavItemKey, string> = {
  dashboard: 'Stage 02',
  financialYear: 'Stage 06',
  budget: 'Stage 06',
  funds: 'Stage 07',
  expenses: 'Stage 08',
  cheques: 'Stage 10',
  transfers: 'Stage 12',
  cashbook: 'Stage 09',
  pettycash: 'Stage 09',
  bank: 'Stage 10',
  reconciliation: 'Stage 11',
  reports: 'Stage 12',
  audit: 'Stage 13',
  users: 'Stage 03',
  settings: 'Stage 04',
};

const modulePermissions: Partial<Record<NavItemKey, string>> = {
  dashboard: 'dashboard.view',
  financialYear: 'financialYear.view',
  budget: 'budget.view',
  funds: 'funds.view',
  expenses: 'expenses.view',
  cheques: 'cheques.received_view',
  transfers: 'fundTransfer.view',
  cashbook: 'cashbook.view',
  pettycash: 'pettycash.view',
  bank: 'bank.view',
  reconciliation: 'bank.view',
  reports: 'reports.view',
  audit: 'audit.view',
  users: 'users.view',
  settings: 'settings.view',
};

export const AppContent: React.FC = () => {
  const { i18n } = useTranslation();
  const { success } = useToast();

  const [authState, setAuthState] = useState<'checking' | 'setup' | 'unauthenticated' | 'authenticated'>('checking');
  const [session, setSession] = useState<AuthSession | null>(null);

  const [activeNav, setActiveNav] = useState<NavItemKey>('dashboard');
  const [chequeInitialTab, setChequeInitialTab] = useState<'received' | 'issued'>('received');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [language, setLanguage] = useState<'en' | 'si'>('en');

  // Check auth and initial preferences on boot
  useEffect(() => {
    async function initApp() {
      if (!window.curtissApi) return;
      try {
        // 1. Language preference
        const langRes = await window.curtissApi.settings.get('default_language');
        if (langRes.success && langRes.data && (langRes.data === 'en' || langRes.data === 'si')) {
          setLanguage(langRes.data);
          changeAppLanguage(langRes.data);
        }

        // 2. Sidebar collapsed preference
        const collapseRes = await window.curtissApi.settings.get('sidebar_collapsed');
        if (collapseRes.success && collapseRes.data === 'true') {
          setIsSidebarCollapsed(true);
        }

        // 3. First-time setup check
        const setupRes = await window.curtissApi.auth.checkSetup();
        if (setupRes.success && setupRes.data?.setupRequired) {
          setAuthState('setup');
          return;
        }

        // 4. Session check
        const sessionRes = await window.curtissApi.auth.getCurrentSession();
        if (sessionRes.success && sessionRes.data) {
          setSession(sessionRes.data);
          setAuthState('authenticated');
        } else {
          setAuthState('unauthenticated');
        }
      } catch (err) {
        console.error('Failed to initialize application state:', err);
        setAuthState('unauthenticated');
      }
    }
    initApp();
  }, []);

  const handleLanguageChange = (lang: 'en' | 'si') => {
    setLanguage(lang);
    changeAppLanguage(lang);
  };

  const handleToggleCollapse = async () => {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    if (window.curtissApi?.settings?.set) {
      try {
        await window.curtissApi.settings.set('sidebar_collapsed', next ? 'true' : 'false');
      } catch (e) {
        console.error('Failed to persist sidebar state in SQLite:', e);
      }
    }
  };

  const handleLoginSuccess = (newSession: AuthSession) => {
    setSession(newSession);
    setAuthState('authenticated');
    success('Authenticated', `Welcome back, ${newSession.user.full_name}`);
  };

  const handleLogout = async () => {
    if (window.curtissApi?.auth?.logout) {
      await window.curtissApi.auth.logout();
    }
    setSession(null);
    setAuthState('unauthenticated');
    setActiveNav('dashboard');
  };

  const handleLockSession = async () => {
    if (window.curtissApi?.auth?.lockSession) {
      await window.curtissApi.auth.lockSession();
      if (session) {
        setSession({ ...session, isLocked: true });
      }
    }
  };

  const handleUnlocked = () => {
    if (session) {
      setSession({ ...session, isLocked: false });
    }
  };

  // 1. Initial State: Checking
  if (authState === 'checking') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <LoadingState message="Initializing offline institutional node..." />
      </div>
    );
  }

  // 2. Initial Setup Screen
  if (authState === 'setup') {
    return (
      <SetupView
        onSetupComplete={handleLoginSuccess}
        selectedLanguage={language}
        onLanguageChange={handleLanguageChange}
      />
    );
  }

  // 3. Login Screen
  if (authState === 'unauthenticated' || !session) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        selectedLanguage={language}
        onLanguageChange={handleLanguageChange}
      />
    );
  }

  // 4. Permission Check for Active View
  const safePermissions = session?.permissions || [];
  const requiredPerm = modulePermissions[activeNav];
  const hasAccess =
    !requiredPerm ||
    safePermissions.includes(requiredPerm) ||
    (activeNav === 'cheques' && (safePermissions.includes('cheques.received_view') || safePermissions.includes('cheques.issued_view')));

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* Frameless Desktop Titlebar */}
      <TitleBar />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeNav={activeNav}
          onSelectNav={setActiveNav}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          userPermissions={safePermissions}
        />

        {/* Center / Right Content Panel */}
        <div className="flex flex-col flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
          <TopBar
            currentModuleKey={activeNav}
            selectedLanguage={language}
            onLanguageChange={handleLanguageChange}
            currentUser={session.user}
            onLockSession={handleLockSession}
            onLogout={handleLogout}
          />

          <main className="flex-1 overflow-y-auto">
            {!hasAccess ? (
              <AccessDeniedView
                requiredPermission={requiredPerm}
                onBackToDashboard={() => setActiveNav('dashboard')}
              />
            ) : activeNav === 'dashboard' ? (
              <DashboardView onNavigate={setActiveNav} />
            ) : activeNav === 'financialYear' ? (
              <FinancialYearView />
            ) : activeNav === 'budget' ? (
              <BudgetManagementView />
            ) : activeNav === 'funds' ? (
              <FundManagementView />
            ) : activeNav === 'expenses' ? (
              <ExpenseManagementView onNavigateCheques={(tab) => {
                setChequeInitialTab(tab);
                setActiveNav('cheques');
              }} />
            ) : activeNav === 'cheques' ? (
              <ChequeManagementView permissions={safePermissions} initialTab={chequeInitialTab} />
            ) : activeNav === 'transfers' ? (
              <FundTransfersView permissions={safePermissions} />
            ) : activeNav === 'cashbook' ? (
              <CashBookView />
            ) : activeNav === 'pettycash' ? (
              <PettyCashView />
            ) : activeNav === 'bank' ? (
              <BankAccountsView />
            ) : activeNav === 'reconciliation' ? (
              <BankReconciliationView currentUser={session.user} permissions={safePermissions} />
            ) : activeNav === 'periodicStatement' ? (
              <PeriodicFinancialStatementView currentUser={session.user} permissions={safePermissions} />
            ) : activeNav === 'reports' ? (
              <FinancialReportsView />
            ) : activeNav === 'audit' ? (
              <AuditLogsView />
            ) : activeNav === 'users' ? (
              <UserManagementView currentUser={session.user} />
            ) : activeNav === 'settings' ? (
              <SchoolProfileView />
            ) : (
              <PlaceholderView
                moduleKey={activeNav}
                stageName={moduleStages[activeNav]}
              />
            )}
          </main>
        </div>
      </div>

      {/* Session Lock Screen Overlay */}
      {session.isLocked && (
        <LockScreenModal
          user={session.user}
          onUnlocked={handleUnlocked}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};
