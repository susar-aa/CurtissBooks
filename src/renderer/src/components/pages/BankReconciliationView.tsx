import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Scale,
  Building2,
  Calendar,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Lock,
  Unlock,
  Printer,
  Clock,
  CreditCard,
  Edit2,
  FileCheck,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import {
  BankReconciliationSession,
  ReconciliationSummaryCalculation,
  BankAccount,
} from '../../../../shared/types/finance';

interface BankReconciliationViewProps {
  currentUser?: any;
  permissions?: string[];
}

export const BankReconciliationView: React.FC<BankReconciliationViewProps> = ({ currentUser, permissions = [] }) => {
  const { t: tCommon } = useTranslation('common');
  const { t: tFinance } = useTranslation('finance');
  const { success, error: toastError, warning } = useToast();

  const canManage =
    !currentUser ||
    currentUser.role_key === 'admin' ||
    currentUser.role_id === 1 ||
    permissions.length === 0 ||
    permissions.includes('bank.manage') ||
    permissions.includes('bank.create') ||
    permissions.includes('bank.edit') ||
    permissions.includes('bank.view') ||
    permissions.some((p) => p.startsWith('bank') || p.startsWith('financial'));

  // View state: 'sessions_list' | 'workspace'
  const [viewMode, setViewMode] = useState<'sessions_list' | 'workspace'>('sessions_list');
  const [sessions, setSessions] = useState<BankReconciliationSession[]>([]);
  const [activeSession, setActiveSession] = useState<BankReconciliationSession | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(false);

  // Workspace Data
  const [systemTransactions, setSystemTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummaryCalculation | null>(null);

  // Workspace Filters & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposits' | 'payments' | 'ticked' | 'pending'>('all');

  // Quick Start Reconciliation Form State
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [stmtOpening, setStmtOpening] = useState('0.00');
  const [stmtClosing, setStmtClosing] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [startingSession, setStartingSession] = useState(false);

  // Edit Statement Balance in Workspace
  const [editingBalance, setEditingBalance] = useState(false);
  const [newClosingInput, setNewClosingInput] = useState('');
  const [updatingBalance, setUpdatingBalance] = useState(false);

  // Add Missing Fee / Adjustment Modal State
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjType, setAdjType] = useState<'bank_charge' | 'interest' | 'deposit' | 'withdrawal'>('bank_charge');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDesc, setAdjDesc] = useState('');
  const [adjRef, setAdjRef] = useState('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

  // Finalize / Complete Modal State
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completing, setCompleting] = useState(false);

  // Reopen Modal State
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // 1. Initial Load: Sessions & Operating Bank Account
  const loadSessions = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const [sessRes, bankRes] = await Promise.all([
          window.curtissApi.financial.getReconciliationSessions(),
          window.curtissApi.financial.getBankAccounts(),
        ]);

        if (sessRes.success && sessRes.data) {
          setSessions(sessRes.data);

          // Find the last completed reconciliation to auto-populate opening balance
          const completed = sessRes.data.filter((s: any) => s.status === 'completed');
          if (completed.length > 0) {
            const lastClosing = completed[0].statement_closing_balance_cents / 100;
            setStmtOpening(lastClosing.toFixed(2));
          }
        }
        if (bankRes.success && bankRes.data && bankRes.data.length > 0) {
          setBankAccount(bankRes.data[0]);
        }
      }
    } catch (err: any) {
      toastError('Failed to load reconciliation sessions', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // 2. Load Workspace Session Details
  const loadWorkspaceData = async (sessionId: number) => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const [detailRes, sysRes] = await Promise.all([
          window.curtissApi.financial.getReconciliationSessionDetail(sessionId),
          window.curtissApi.financial.getSystemTransactionsForRecon(sessionId),
        ]);

        if (detailRes.success && detailRes.data) {
          setActiveSession(detailRes.data.session);
          setSummary(detailRes.data.summary);
          setNewClosingInput((detailRes.data.session.statement_closing_balance_cents / 100).toFixed(2));
        }
        if (sysRes.success && sysRes.data) {
          setSystemTransactions(sysRes.data.transactions || []);
        }
      }
    } catch (err: any) {
      toastError('Error loading reconciliation workspace', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWorkspace = (s: BankReconciliationSession) => {
    setActiveSession(s);
    setViewMode('workspace');
    loadWorkspaceData(s.id);
  };

  // 3. Start New Reconciliation Session
  const handleStartReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    const openVal = parseFloat(stmtOpening);
    const closeVal = parseFloat(stmtClosing);
    if (isNaN(closeVal)) {
      toastError('Statement Balance Required', 'Please enter the statement ending balance.');
      return;
    }

    setStartingSession(true);
    try {
      const res = await window.curtissApi.financial.createReconciliationSession({
        period_start_date: startDate,
        period_end_date: endDate,
        reconciliation_date: endDate,
        statement_opening_balance_cents: isNaN(openVal) ? 0 : Math.round(openVal * 100),
        statement_closing_balance_cents: Math.round(closeVal * 100),
        notes: sessionNotes.trim() || undefined,
      });

      if (res.success && res.data) {
        success('Reconciliation Started', `Session ${res.data.session_code} initiated.`);
        loadSessions();
        handleOpenWorkspace(res.data);
      } else {
        toastError('Failed to start reconciliation', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setStartingSession(false);
    }
  };

  // 4. Toggle Tick for a Single Transaction
  const handleToggleTick = async (tx: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activeSession || isCompleted) return;

    const nextState = !tx.is_matched;

    // Optimistic UI update
    setSystemTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, is_matched: nextState } : t))
    );

    try {
      const res = await window.curtissApi.financial.toggleReconTick({
        sessionId: activeSession.id,
        bankTransactionId: tx.id,
        isTicked: nextState,
      });

      if (res.success) {
        // Refresh summary calculations
        const sumRes = await window.curtissApi.financial.getReconciliationSummary(activeSession.id);
        if (sumRes.success && sumRes.data) {
          setSummary(sumRes.data);
        }
      } else {
        // Revert on error
        setSystemTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, is_matched: !nextState } : t))
        );
        toastError('Failed to tick transaction', res.error);
      }
    } catch (err: any) {
      // Revert on error
      setSystemTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, is_matched: !nextState } : t))
      );
      toastError('Error', err.message);
    }
  };

  // 5. Batch Tick All / Untick All
  const handleBatchTick = async (tickAll: boolean) => {
    if (!activeSession || isCompleted) return;

    const targetIds = filteredTransactions.map((t) => t.id);
    if (targetIds.length === 0) return;

    // Optimistic update
    setSystemTransactions((prev) =>
      prev.map((t) => (targetIds.includes(t.id) ? { ...t, is_matched: tickAll } : t))
    );

    try {
      const res = await window.curtissApi.financial.batchReconTick({
        sessionId: activeSession.id,
        bankTransactionIds: targetIds,
        isTicked: tickAll,
      });

      if (res.success) {
        const sumRes = await window.curtissApi.financial.getReconciliationSummary(activeSession.id);
        if (sumRes.success && sumRes.data) {
          setSummary(sumRes.data);
        }
        success(tickAll ? 'All Ticked' : 'All Unticked', `${targetIds.length} transactions updated.`);
      } else {
        loadWorkspaceData(activeSession.id);
        toastError('Failed to batch update', res.error);
      }
    } catch (err: any) {
      loadWorkspaceData(activeSession.id);
      toastError('Error', err.message);
    }
  };

  // 6. Update Statement Ending Balance Live
  const handleSaveStatementBalance = async () => {
    if (!activeSession || isCompleted) return;
    const val = parseFloat(newClosingInput);
    if (isNaN(val)) {
      toastError('Invalid Balance', 'Please enter a valid numeric statement balance.');
      return;
    }

    setUpdatingBalance(true);
    try {
      const res = await window.curtissApi.financial.updateReconBalances({
        sessionId: activeSession.id,
        statementClosingCents: Math.round(val * 100),
      });

      if (res.success) {
        success('Balance Updated', `Target statement balance updated to Rs. ${val.toFixed(2)}.`);
        setEditingBalance(false);
        loadWorkspaceData(activeSession.id);
      } else {
        toastError('Failed to update balance', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setUpdatingBalance(false);
    }
  };

  // 7. Add Missing Fee / Interest / Adjustment
  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const amt = parseFloat(adjAmount);
    if (isNaN(amt) || amt <= 0) {
      toastError('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }
    if (!adjDesc.trim()) {
      toastError('Description Required', 'Please enter a brief description for this transaction.');
      return;
    }

    setSubmittingAdj(true);
    try {
      const res = await window.curtissApi.financial.recordReconAdjustment({
        sessionId: activeSession.id,
        data: {
          type: adjType,
          date: adjDate,
          amount_cents: Math.round(amt * 100),
          description: adjDesc.trim(),
          reference_no: adjRef.trim() || undefined,
        },
      });

      if (res.success) {
        success('Transaction Recorded & Ticked', `Rs. ${amt.toFixed(2)} added to bank transactions and cleared.`);
        setAdjModalOpen(false);
        setAdjAmount('');
        setAdjDesc('');
        setAdjRef('');
        loadWorkspaceData(activeSession.id);
      } else {
        toastError('Failed to record transaction', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmittingAdj(false);
    }
  };

  // 8. Complete & Lock Reconciliation
  const handleCompleteReconciliation = async () => {
    if (!activeSession) return;
    setCompleting(true);
    try {
      const res = await window.curtissApi.financial.completeReconciliation({
        sessionId: activeSession.id,
        notes: completeNotes.trim() || undefined,
      });

      if (res.success && res.data) {
        success('Reconciliation Completed & Locked', `Session ${activeSession.session_code} is officially finalized.`);
        setFinalizeModalOpen(false);
        setActiveSession(res.data);
        loadSessions();
        loadWorkspaceData(activeSession.id);
      } else {
        toastError('Cannot Complete Reconciliation', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setCompleting(false);
    }
  };

  // 9. Authorized Reopen
  const handleReopenReconciliation = async () => {
    if (!activeSession) return;
    if (!reopenReason.trim()) {
      toastError('Reason Required', 'Please provide a formal justification for reopening.');
      return;
    }

    setReopening(true);
    try {
      const res = await window.curtissApi.financial.reopenReconciliation({
        sessionId: activeSession.id,
        reason: reopenReason.trim(),
      });

      if (res.success && res.data) {
        warning('Reconciliation Reopened', `Session ${activeSession.session_code} unlocked for correction.`);
        setReopenModalOpen(false);
        setReopenReason('');
        setActiveSession(res.data);
        loadSessions();
        loadWorkspaceData(activeSession.id);
      } else {
        toastError('Failed to reopen', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setReopening(false);
    }
  };

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return systemTransactions.filter((tx) => {
      // Type Tab
      if (typeFilter === 'deposits' && tx.amount_cents < 0) return false;
      if (typeFilter === 'payments' && tx.amount_cents > 0) return false;
      if (typeFilter === 'ticked' && !tx.is_matched) return false;
      if (typeFilter === 'pending' && tx.is_matched) return false;

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const amountStr = (Math.abs(tx.amount_cents) / 100).toFixed(2);
      return (
        tx.description.toLowerCase().includes(q) ||
        (tx.payee_or_payer && tx.payee_or_payer.toLowerCase().includes(q)) ||
        (tx.reference_no && tx.reference_no.toLowerCase().includes(q)) ||
        (tx.cheque_number && tx.cheque_number.toLowerCase().includes(q)) ||
        amountStr.includes(q)
      );
    });
  }, [systemTransactions, typeFilter, searchQuery]);

  // Derived Counts
  const counts = useMemo(() => {
    const total = systemTransactions.length;
    const deposits = systemTransactions.filter((t) => t.amount_cents > 0).length;
    const payments = systemTransactions.filter((t) => t.amount_cents < 0).length;
    const ticked = systemTransactions.filter((t) => t.is_matched).length;
    const pending = total - ticked;
    return { total, deposits, payments, ticked, pending };
  }, [systemTransactions]);

  const isCompleted = activeSession?.status === 'completed';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none font-sans">
      {/* Page Header */}
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Verify bank statement, tick cleared transactions, and balance accounts"
        badge={
          <Badge variant="warning" size="md">
            <Scale className="w-3.5 h-3.5 mr-1 inline" />
            Institutional Banking
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            {viewMode === 'workspace' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => loadWorkspaceData(activeSession!.id)} isLoading={loading}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()} title="Print Reconciliation Statement">
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  <span>Print Statement</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setViewMode('sessions_list'); loadSessions(); }}>
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  <span>Back to Sessions</span>
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={loadSessions} isLoading={loading}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        }
      />

      {/* Primary Operating Bank Notice */}
      <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-2.5">
          <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <span className="font-semibold">Institutional Operating Account: </span>
            <span className="font-medium">{bankAccount?.bank_name || 'Bank of Ceylon'} ({bankAccount?.account_number || '1004829104'})</span>
            <span className="ml-2.5 font-mono text-[11px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 font-bold">
              Current Ledger Balance: Rs. {((bankAccount?.current_balance_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* VIEW MODE 1: SESSIONS LIST & QUICK START                       */}
      {/* ============================================================== */}
      {viewMode === 'sessions_list' && (
        <div className="space-y-6">
          {/* Quick Start Reconciliation Card */}
          {canManage && (
            <Card className="border-2 border-indigo-200/80 dark:border-indigo-900/50 shadow-sm bg-gradient-to-br from-white via-indigo-50/20 to-zinc-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900">
              <CardHeader className="py-3 px-5 border-b border-indigo-100 dark:border-zinc-800 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  <span>Start New Bank Reconciliation</span>
                </CardTitle>
                <span className="text-xs text-zinc-500">Quick 1-step setup</span>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleStartReconciliation} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input
                      label="Period Start Date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                    <Input
                      label="Statement End Date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                    <Input
                      label="Statement Opening Balance (LKR)"
                      type="number"
                      step="0.01"
                      value={stmtOpening}
                      onChange={(e) => setStmtOpening(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                    <Input
                      label="Statement Ending Balance (LKR)"
                      type="number"
                      step="0.01"
                      value={stmtClosing}
                      onChange={(e) => setStmtClosing(e.target.value)}
                      placeholder="e.g. 1015000.00"
                      required
                      className="font-bold border-indigo-300 dark:border-indigo-700 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                    <div className="w-full sm:max-w-md">
                      <Input
                        label=""
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        placeholder="Session remarks (e.g. March 2026 Bank of Ceylon Statement)..."
                      />
                    </div>
                    <Button
                      type="submit"
                      size="md"
                      isLoading={startingSession}
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      <span>Start Reconcile</span>
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Reconciliation History Table */}
          <Card className="shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center space-x-2">
                <FileCheck className="w-4 h-4 text-zinc-500" />
                <span>Reconciliation Sessions & History</span>
              </CardTitle>
              <span className="text-xs text-zinc-500">{sessions.length} total sessions</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="py-3 px-3 font-semibold">Session Code</th>
                      <th className="py-3 px-3 font-semibold">Statement Period</th>
                      <th className="py-3 px-3 font-semibold text-right">Statement Balance</th>
                      <th className="py-3 px-3 font-semibold text-right">Book Balance</th>
                      <th className="py-3 px-3 font-semibold text-right">Variance</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-3 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          {s.session_code}
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                          {s.period_start_date} → {s.period_end_date}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium">
                          Rs. {(s.statement_closing_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium">
                          Rs. {(s.system_closing_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono font-bold ${s.difference_cents === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                          Rs. {(s.difference_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant={s.status === 'completed' ? 'success' : 'neutral'} size="sm">
                            {s.status === 'completed' ? (
                              <><Lock className="w-3 h-3 mr-1 inline" /> Completed</>
                            ) : (
                              'ACTIVE DRAFT'
                            )}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Button size="sm" variant="outline" onClick={() => handleOpenWorkspace(s)}>
                            <span>{s.status === 'completed' ? 'View Report' : 'Open & Tick'}</span>
                            <ArrowRight className="w-3 h-3 ml-1 inline" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {sessions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                              <Scale className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                No Reconciliation Sessions Yet
                              </p>
                              <p className="text-xs text-zinc-500 max-w-sm">
                                Enter your bank statement balance in the card above and click "Start Reconcile" to begin.
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW MODE 2: RECONCILIATION WORKSPACE (TICK & BALANCE)         */}
      {/* ============================================================== */}
      {viewMode === 'workspace' && activeSession && (
        <div className="space-y-6">
          {/* STICKY RECONCILIATION BALANCE BAR */}
          <div className="sticky top-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-md">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
              {/* 1. Target Statement Balance */}
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
                  <span>Statement Ending Balance</span>
                  {!isCompleted && (
                    <button
                      onClick={() => setEditingBalance(!editingBalance)}
                      className="text-indigo-600 hover:text-indigo-700 text-xs flex items-center"
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      <span>{editingBalance ? 'Close' : 'Edit'}</span>
                    </button>
                  )}
                </div>
                {editingBalance ? (
                  <div className="flex items-center space-x-1.5 pt-1">
                    <input
                      type="number"
                      step="0.01"
                      value={newClosingInput}
                      onChange={(e) => setNewClosingInput(e.target.value)}
                      className="w-full text-sm font-mono font-bold px-2 py-1 rounded border border-indigo-400 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                    />
                    <Button size="sm" onClick={handleSaveStatementBalance} isLoading={updatingBalance}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    Rs. {((activeSession.statement_closing_balance_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                )}
                <div className="text-[10px] text-zinc-500 truncate">
                  Opening: Rs. {((activeSession.statement_opening_balance_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* 2. Cleared (Ticked) Balance */}
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-1">
                <span className="text-zinc-500 text-[11px] font-semibold uppercase tracking-wider block">
                  Cleared / Reconciled Balance
                </span>
                <div className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  Rs. {summary ? (summary.adjusted_book_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {counts.ticked} of {counts.total} items ticked
                </div>
              </div>

              {/* 3. Variance / Difference */}
              <div className={`p-3 rounded-lg border space-y-1 ${
                summary?.is_balanced
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60'
              }`}>
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
                  <span>Reconciliation Variance</span>
                  {summary?.is_balanced ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  )}
                </div>
                <div className={`text-lg font-bold font-mono ${
                  summary?.is_balanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                }`}>
                  Rs. {summary ? (Math.abs(summary.difference_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                </div>
                <div className="text-[10px] font-semibold">
                  {summary?.is_balanced ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓ BALANCED (DIFFERENCE IS ZERO)</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">UNBALANCED (TICK ITEMS TO BALANCE)</span>
                  )}
                </div>
              </div>

              {/* 4. Finalize Action Button */}
              <div className="flex flex-col justify-center space-y-2">
                {isCompleted ? (
                  <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-center space-y-1">
                    <span className="text-xs font-bold text-emerald-600 flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5 mr-1" /> Reconciled & Locked
                    </span>
                    {canManage && (
                      <button
                        onClick={() => setReopenModalOpen(true)}
                        className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline block mx-auto"
                      >
                        Authorized Reopen
                      </button>
                    )}
                  </div>
                ) : (
                  <Button
                    size="md"
                    disabled={!summary?.is_balanced || completing}
                    onClick={() => setFinalizeModalOpen(true)}
                    className={`w-full font-bold shadow-xs transition-all ${
                      summary?.is_balanced
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    <span>Finalize Reconciliation</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* WORKSPACE TOOLBAR & TABS */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center space-x-1 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1 bg-white dark:bg-zinc-900 shadow-2xs overflow-x-auto">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  typeFilter === 'all'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                All ({counts.total})
              </button>
              <button
                onClick={() => setTypeFilter('deposits')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  typeFilter === 'deposits'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                }`}
              >
                Deposits ({counts.deposits})
              </button>
              <button
                onClick={() => setTypeFilter('payments')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  typeFilter === 'payments'
                    ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
                }`}
              >
                Payments / Cheques ({counts.payments})
              </button>
              <button
                onClick={() => setTypeFilter('ticked')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  typeFilter === 'ticked'
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30'
                }`}
              >
                Cleared ({counts.ticked})
              </button>
              <button
                onClick={() => setTypeFilter('pending')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  typeFilter === 'pending'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30'
                }`}
              >
                Pending ({counts.pending})
              </button>
            </div>

            {/* Actions: Search & Add Missing Transaction */}
            <div className="flex items-center space-x-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search cheque #, payee, amount..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {!isCompleted && canManage && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchTick(true)}
                    title="Tick all visible transactions"
                  >
                    <span>Tick All</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchTick(false)}
                    title="Untick all visible transactions"
                  >
                    <span>Untick All</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setAdjModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>+ Add Bank Fee / Missing</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* TRANSACTIONS TABLE (THE TICK CHECKLIST) */}
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="py-3 px-3 w-12 text-center">Cleared</th>
                      <th className="py-3 px-3 font-semibold">Date</th>
                      <th className="py-3 px-3 font-semibold">Type</th>
                      <th className="py-3 px-3 font-semibold">Cheque / Ref #</th>
                      <th className="py-3 px-3 font-semibold">Payee & Description</th>
                      <th className="py-3 px-3 font-semibold text-right">Amount (LKR)</th>
                      <th className="py-3 px-3 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredTransactions.map((tx) => (
                      <tr
                        key={tx.id}
                        onClick={() => handleToggleTick(tx)}
                        className={`transition-colors cursor-pointer ${
                          tx.is_matched
                            ? 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-3 text-center" onClick={(e) => handleToggleTick(tx, e)}>
                          <input
                            type="checkbox"
                            checked={Boolean(tx.is_matched)}
                            disabled={isCompleted || !canManage}
                            onChange={() => {}} // Handled by row/cell click
                            className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Date */}
                        <td className="py-2.5 px-3 font-mono text-zinc-600 dark:text-zinc-300">
                          {tx.transaction_date}
                        </td>

                        {/* Type */}
                        <td className="py-2.5 px-3">
                          <span className="capitalize text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                            {tx.transaction_type.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Cheque / Ref # */}
                        <td className="py-2.5 px-3 font-mono">
                          {tx.cheque_number ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                              #{tx.cheque_number}
                            </span>
                          ) : tx.reference_no ? (
                            <span className="text-zinc-500 text-[11px]">{tx.reference_no}</span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>

                        {/* Payee / Description */}
                        <td className="py-2.5 px-3 max-w-md">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {tx.payee_or_payer || tx.description}
                          </div>
                          {tx.payee_or_payer && tx.description && (
                            <div className="text-[10px] text-zinc-500 truncate">{tx.description}</div>
                          )}
                        </td>

                        {/* Amount */}
                        <td className={`py-2.5 px-3 text-right font-mono font-bold text-sm ${
                          tx.amount_cents > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'
                        }`}>
                          {tx.amount_cents > 0 ? '+' : '-'} Rs. {(Math.abs(tx.amount_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 text-center">
                          {tx.is_matched ? (
                            <Badge variant="success" size="sm">
                              <Check className="w-3 h-3 mr-1 inline" /> Cleared
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Pending
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}

                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-zinc-400">
                          No transactions found matching current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: ADD MISSING FEE / INTEREST / ADJUSTMENT               */}
      {/* ============================================================== */}
      <Modal isOpen={adjModalOpen} onClose={() => setAdjModalOpen(false)} title="Record Missing Bank Transaction" maxWidth="md">
        <form onSubmit={handleAddAdjustment} className="space-y-4">
          <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-lg text-xs text-indigo-900 dark:text-indigo-200">
            Record bank fees, interest, or direct deposits appearing on your statement. It will automatically post to your bank account and be marked as <strong>Cleared</strong>.
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Transaction Type *
            </label>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as any)}
              className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-zinc-900 dark:text-zinc-100 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="bank_charge">Bank Service Charge / Fee (Deduction)</option>
              <option value="interest">Bank Interest Received (Addition)</option>
              <option value="deposit">Direct Bank Deposit / Transfer Received (Addition)</option>
              <option value="withdrawal">Other Bank Withdrawal / Debit (Deduction)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Transaction Date *"
              type="date"
              value={adjDate}
              onChange={(e) => setAdjDate(e.target.value)}
              required
            />
            <Input
              label="Amount (LKR) *"
              type="number"
              step="0.01"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <Input
            label="Description / Reason *"
            value={adjDesc}
            onChange={(e) => setAdjDesc(e.target.value)}
            placeholder="e.g. Monthly Ledger Maintenance Fee"
            required
          />

          <Input
            label="Reference # (Optional)"
            value={adjRef}
            onChange={(e) => setAdjRef(e.target.value)}
            placeholder="e.g. TXN-94827"
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => setAdjModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submittingAdj} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <span>Add & Tick Transaction</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 2: FINALIZE CONFIRMATION                                  */}
      {/* ============================================================== */}
      <Modal isOpen={finalizeModalOpen} onClose={() => setFinalizeModalOpen(false)} title="Finalize Bank Reconciliation" maxWidth="md">
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-xs space-y-1">
            <div className="font-bold text-emerald-800 dark:text-emerald-200 flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
              <span>Variance is Rs. 0.00 – Balanced</span>
            </div>
            <p className="text-emerald-700 dark:text-emerald-300">
              Finalizing will lock this statement period against further modifications and officially record all ticked transactions as reconciled.
            </p>
          </div>

          <Input
            label="Finalization Remarks / Sign-off Notes (Optional)"
            value={completeNotes}
            onChange={(e) => setCompleteNotes(e.target.value)}
            placeholder="e.g. Verified against official bank statement..."
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" onClick={() => setFinalizeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCompleteReconciliation}
              isLoading={completing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <span>Confirm & Lock Reconciliation</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 3: REOPEN MODAL                                          */}
      {/* ============================================================== */}
      <Modal isOpen={reopenModalOpen} onClose={() => setReopenModalOpen(false)} title="Authorized Reopen / Correction" maxWidth="md">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg text-xs text-amber-800 dark:text-amber-200">
            Reopening will unlock this statement period for corrections. All actions are audited.
          </div>

          <Input
            label="Reason for Reopening *"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="e.g. Audit correction needed for transaction..."
            required
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" onClick={() => setReopenModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReopenReconciliation}
              isLoading={reopening}
            >
              <span>Unlock Session</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
