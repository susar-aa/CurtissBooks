import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Plus, RefreshCw, CreditCard, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { BankAccount, BankTransaction } from '../../../shared/types/finance';

export const BankAccountsView: React.FC = () => {
  const { t: tCommon } = useTranslation('common');
  const { t: tFinance } = useTranslation('finance');
  const { success, error: toastError } = useToast();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<BankAccount['account_type']>('current');
  const [openingBalance, setOpeningBalance] = useState('');

  const loadAccounts = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.financial) {
        const res = await window.curtissApi.financial.getBankAccounts();
        if (res.success && res.data) {
          setAccounts(res.data);
          if (res.data.length > 0 && !selectedAccountId) {
            setSelectedAccountId(res.data[0].id);
          }
        }
      }
    } catch (err: any) {
      toastError('Failed to load bank accounts', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (accId: number) => {
    try {
      const res = await window.curtissApi.financial.getBankTransactions(accId, 50, 0);
      if (res.success && res.data) {
        setTransactions(res.data.transactions);
      }
    } catch (err: any) {
      toastError('Failed to load bank transactions', err.message);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadTransactions(selectedAccountId);
    }
  }, [selectedAccountId]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankCode.trim() || !bankName.trim() || !accountNumber.trim()) {
      toastError('Validation Error', 'Bank code, name, and account number are required.');
      return;
    }

    setSubmitting(true);
    try {
      const openCents = Math.round((parseFloat(openingBalance) || 0) * 100);
      const res = await window.curtissApi.financial.createBankAccount({
        account_code: bankCode.trim(),
        bank_name: bankName.trim(),
        branch_name: branchName.trim() || 'Head Office',
        account_number: accountNumber.trim(),
        account_type: accountType,
        opening_balance_cents: openCents,
      });

      if (res.success) {
        success('Created', 'Bank account registered successfully.');
        setModalOpen(false);
        setBankCode('');
        setBankName('');
        setBranchName('');
        setAccountNumber('');
        setOpeningBalance('');
        loadAccounts();
      } else {
        toastError('Failed to create account', res.error);
      }
    } catch (err: any) {
      toastError('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalBankCents = accounts.reduce((sum, a) => sum + a.current_balance_cents, 0);
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      <PageHeader
        title={tFinance('bank.title')}
        subtitle={tFinance('bank.subtitle')}
        badge={
          <Badge variant="info" size="md">
            <Building2 className="w-3.5 h-3.5 mr-1 inline" />
            {tFinance('bank.badge')}
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={loadAccounts} isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              <span>Refresh</span>
            </Button>
            {accounts.length === 0 && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Setup Institutional Bank Account
              </Button>
            )}
          </div>
        }
      />

      {/* Institutional Bank Account Overview */}
      {selectedAccount ? (
        <Card className="border-l-4 border-l-blue-600 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold uppercase">
                    {selectedAccount.account_code}
                  </span>
                  <Badge variant="neutral" size="sm">{selectedAccount.account_type.toUpperCase()}</Badge>
                  <span className="inline-flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Active Operating Account
                  </span>
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {selectedAccount.bank_name}
                </h2>
                <p className="text-xs text-zinc-500 font-mono">
                  Branch: {selectedAccount.branch_name} • Account No: <span className="font-bold text-zinc-800 dark:text-zinc-200">{selectedAccount.account_number}</span>
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider block">Current Ledger Balance</span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Rs. {(selectedAccount.current_balance_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <div className="p-8 text-center text-zinc-400 border border-dashed rounded-xl">
          No institutional bank account registered yet.
        </div>
      )}

      {/* Selected Account Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-zinc-400" />
            <span>Bank Account Ledger & Transactions — {selectedAccount?.bank_name} ({selectedAccount?.account_number})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.date')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tCommon('labels.category')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('funds.refChequeNo')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tFinance('expenses.payee')}</th>
                  <th className="py-2.5 px-3 font-semibold">{tCommon('labels.description')}</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{tFinance('expenses.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-zinc-400">
                      No transactions recorded for this account yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{tx.transaction_date}</td>
                      <td className="py-2.5 px-3 capitalize font-mono text-[11px] text-zinc-500">{tx.transaction_type.replace('_', ' ')}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-700 dark:text-zinc-300 font-semibold">{tx.reference_no || tx.cheque_number || '—'}</td>
                      <td className="py-2.5 px-3 text-zinc-900 dark:text-zinc-100 font-medium">{tx.payee_or_payer || '—'}</td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">{tx.description}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-semibold ${tx.amount_cents > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {tx.amount_cents > 0 ? '+' : '-'} Rs. {(Math.abs(tx.amount_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Bank Account Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Register Bank Account" maxWidth="md">
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <Input
            label="Account Code"
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            placeholder="e.g. BNK-BOC-01"
            required
          />
          <Input
            label="Bank Name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. People's Bank or Bank of Ceylon"
            required
          />
          <Input
            label="Branch Name"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="e.g. Maharagama Branch"
            required
          />
          <Input
            label="Account Number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="e.g. 081010048291"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Account Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
              >
                <option value="current">Current Account</option>
                <option value="savings">Savings Account</option>
                <option value="development">Development Fund Account</option>
              </select>
            </div>
            <Input
              label="Opening Balance (LKR)"
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Register Bank Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

