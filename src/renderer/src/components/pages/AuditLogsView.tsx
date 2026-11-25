import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, RefreshCw, Shield, Filter, Search } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { AuditLogItem } from '../../../shared/types/auth';

export const AuditLogsView: React.FC = () => {
  const { t: tCommon } = useTranslation('common');
  const { toast, error: toastError } = useToast();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      if (window.curtissApi?.audit) {
        const res = await window.curtissApi.audit.getLogs(100, 0);
        if (res.success && res.data) {
          setLogs(res.data);
        }
      }
    } catch (err: any) {
      toastError('Failed to load audit logs', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      (l.username && l.username.toLowerCase().includes(q)) ||
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.target_entity && l.target_entity.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      <PageHeader
        title="Institutional Audit Trail"
        subtitle="Immutable security logs tracking financial transactions, user authentications, and system governance."
        badge={
          <Badge variant="neutral" size="md">
            <Shield className="w-3.5 h-3.5 mr-1 inline" />
            Security & Governance
          </Badge>
        }
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={loadLogs} isLoading={loading}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="flex items-center space-x-3 max-w-md">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by action, user, or details..."
        />
      </div>

      {/* Audit Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span>Audit History ({filteredLogs.length} events)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-3 font-semibold">User</th>
                  <th className="py-2.5 px-3 font-semibold">Action</th>
                  <th className="py-2.5 px-3 font-semibold">Target Entity</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-zinc-400">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{log.created_at}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {log.username || 'System'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">
                        {log.target_entity || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={log.status === 'success' ? 'success' : 'error'} size="sm">
                          {log.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 max-w-sm truncate">
                        {log.details || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

