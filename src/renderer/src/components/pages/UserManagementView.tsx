import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Shield,
  FileText,
  UserPlus,
  KeyRound,
  Edit2,
  UserX,
  UserCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { Modal, ConfirmationDialog } from '../ui/Modal';
import { DataTable, Column } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { User, Role, Permission, AuditLogItem } from '../../../shared/types/auth';

interface UserManagementViewProps {
  currentUser: User;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser }) => {
  const { t } = useTranslation('users');
  const { t: tCommon } = useTranslation('common');
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit'>('users');

  // Users Tab State
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [confirmStatusModalOpen, setConfirmStatusModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form Fields
  const [formFullName, setFormFullName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formConfirmPassword, setFormConfirmPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState<number>(5); // default clerk
  const [formError, setFormError] = useState<string | null>(null);

  // Role Permissions Tab State
  const [selectedRoleId, setSelectedRoleId] = useState<number>(1);
  const [rolePermSet, setRolePermSet] = useState<Set<string>>(new Set());
  const [isSavingPerms, setIsSavingPerms] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    try {
      if (window.curtissApi) {
        const [usersRes, rolesRes, permsRes, auditRes] = await Promise.all([
          window.curtissApi.users.getAll(),
          window.curtissApi.roles.getAll(),
          window.curtissApi.roles.getPermissions(),
          window.curtissApi.audit.getLogs(50, 0),
        ]);

        if (usersRes.success && usersRes.data) setUsers(usersRes.data);
        if (rolesRes.success && rolesRes.data) {
          setRoles(rolesRes.data);
          const initialRole = rolesRes.data.find((r) => r.id === selectedRoleId) || rolesRes.data[0];
          if (initialRole) {
            setSelectedRoleId(initialRole.id);
            setRolePermSet(new Set(initialRole.permissions || []));
          }
        }
        if (permsRes.success && permsRes.data) setPermissions(permsRes.data);
        if (auditRes.success && auditRes.data) setAuditLogs(auditRes.data);
      }
    } catch (e) {
      console.error('Failed to load user management data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Update permissions set when selected role changes
  useEffect(() => {
    const role = roles.find((r) => r.id === selectedRoleId);
    if (role) {
      setRolePermSet(new Set(role.permissions || []));
    }
  }, [selectedRoleId, roles]);

  // Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formFullName.trim() || !formUsername.trim() || !formPassword || !formConfirmPassword) {
      setFormError('All fields are required.');
      return;
    }

    if (formPassword !== formConfirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    try {
      const res = await window.curtissApi.users.create({
        fullName: formFullName.trim(),
        username: formUsername.trim(),
        password: formPassword,
        roleId: formRoleId,
      });

      if (res.success && res.data) {
        success('Staff user created', `User @${res.data.username} registered.`);
        setCreateModalOpen(false);
        setFormFullName('');
        setFormUsername('');
        setFormPassword('');
        setFormConfirmPassword('');
        loadAllData();
      } else {
        setFormError(res.error || 'Failed to create user.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    }
  };

  // Edit User Handler
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError(null);

    if (!formFullName.trim()) {
      setFormError('Full name is required.');
      return;
    }

    try {
      const res = await window.curtissApi.users.update(selectedUser.id, {
        fullName: formFullName.trim(),
        roleId: formRoleId,
      });

      if (res.success) {
        success('User updated', `Updated details for @${selectedUser.username}.`);
        setEditModalOpen(false);
        loadAllData();
      } else {
        setFormError(res.error || 'Failed to update user.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    }
  };

  // Reset Password Handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError(null);

    if (!formPassword || !formConfirmPassword) {
      setFormError('Password fields are required.');
      return;
    }

    if (formPassword !== formConfirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    try {
      const res = await window.curtissApi.users.resetPassword(selectedUser.id, formPassword);
      if (res.success) {
        success('Password reset', `Password updated for @${selectedUser.username}.`);
        setResetModalOpen(false);
        setFormPassword('');
        setFormConfirmPassword('');
      } else {
        setFormError(res.error || 'Failed to reset password.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    }
  };

  // Status Toggle Handler
  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await window.curtissApi.users.setStatus(selectedUser.id, nextStatus);
      if (res.success) {
        success('Status updated', `@${selectedUser.username} is now ${nextStatus}.`);
        setConfirmStatusModalOpen(false);
        loadAllData();
      } else {
        toastError('Status update failed', res.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError('Status update failed', msg);
    }
  };

  // Save Role Permissions
  const handleSavePermissions = async () => {
    setIsSavingPerms(true);
    try {
      const permArray = Array.from(rolePermSet);
      const res = await window.curtissApi.roles.updatePermissions(selectedRoleId, permArray);
      if (res.success) {
        success('Permissions saved', `Updated permissions for selected role.`);
        loadAllData();
      } else {
        toastError('Failed to save permissions', res.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError('Error saving permissions', msg);
    } finally {
      setIsSavingPerms(false);
    }
  };

  // Toggle a single permission checkbox
  const togglePermission = (key: string) => {
    const next = new Set(rolePermSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setRolePermSet(next);
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'ALL' || String(u.role_id) === roleFilter;
    const matchStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // Table Columns
  const userColumns: Column<User>[] = [
    {
      key: 'full_name',
      header: t('columns.name'),
      render: (u) => (
        <div>
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{u.full_name}</div>
          <div className="text-[11px] text-zinc-400 font-mono">@{u.username}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('columns.role'),
      render: (u) => (
        <Badge variant={u.role_key === 'admin' ? 'neutral' : 'info'} size="sm">
          {u.role_name_en}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (u) => (
        <Badge
          variant={
            u.status === 'active'
              ? 'success'
              : u.status === 'locked'
              ? 'error'
              : 'warning'
          }
          size="sm"
        >
          {u.status.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'last_login_at',
      header: t('columns.lastLogin'),
      render: (u) => (
        <span className="font-mono text-[11px] text-zinc-500">
          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: t('columns.created'),
      render: (u) => (
        <span className="font-mono text-[11px] text-zinc-500">
          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end space-x-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedUser(u);
              setFormFullName(u.full_name);
              setFormRoleId(u.role_id);
              setFormError(null);
              setEditModalOpen(true);
            }}
            title={t('actions.editUser')}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedUser(u);
              setFormPassword('');
              setFormConfirmPassword('');
              setFormError(null);
              setResetModalOpen(true);
            }}
            title={t('actions.resetPassword')}
          >
            <KeyRound className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={u.status === 'active' ? 'text-amber-500 hover:text-amber-600' : 'text-emerald-500 hover:text-emerald-600'}
            onClick={() => {
              setSelectedUser(u);
              setConfirmStatusModalOpen(true);
            }}
            title={u.status === 'active' ? t('actions.deactivate') : t('actions.activate')}
          >
            {u.status === 'active' ? (
              <UserX className="w-3.5 h-3.5" />
            ) : (
              <UserCheck className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  // Group permissions by module
  const permissionsByModule = permissions.reduce<Record<string, Permission[]>>((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {});

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 select-none font-sans">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        badge={
          <Badge variant="neutral" size="md">
            <Users className="w-3 h-3 mr-1 inline" />
            {users.length} Registered Accounts
          </Badge>
        }
        actions={
          activeTab === 'users' ? (
            <Button
              size="sm"
              onClick={() => {
                setFormFullName('');
                setFormUsername('');
                setFormPassword('');
                setFormConfirmPassword('');
                setFormRoleId(5);
                setFormError(null);
                setCreateModalOpen(true);
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              <span>{t('actions.addUser')}</span>
            </Button>
          ) : activeTab === 'roles' ? (
            <Button
              size="sm"
              onClick={handleSavePermissions}
              isLoading={isSavingPerms}
              disabled={selectedRole?.role_key === 'admin'}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              <span>{t('actions.savePermissions')}</span>
            </Button>
          ) : null
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'users', label: t('tabs.users'), badge: users.length },
          { id: 'roles', label: t('tabs.roles'), badge: roles.length },
          { id: 'audit', label: t('tabs.audit'), badge: auditLogs.length },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as any)}
      />

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder={tCommon('actions.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs py-1.5 px-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
              >
                <option value="ALL">All Roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name_en}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs py-1.5 px-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="locked">Locked</option>
              </select>
            </div>
          </div>

          <DataTable
            columns={userColumns}
            data={filteredUsers}
            isLoading={loading}
            emptyMessage="No staff users match the criteria."
          />
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSIONS MATRIX */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Roles Selector Sidebar */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
              {t('rolesTab.selectRole')}
            </h4>
            <div className="space-y-1">
              {roles.map((r) => {
                const isSelected = r.id === selectedRoleId;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`w-full text-left p-3 rounded-lg border text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{r.name_en}</span>
                      <span className="text-[10px] opacity-75 font-mono">
                        {r.user_count || 0} users
                      </span>
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80 truncate">{r.name_si}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Permission Matrix */}
          <div className="md:col-span-3 space-y-4">
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {selectedRole?.name_en} ({selectedRole?.name_si})
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {selectedRole?.description}
                  </p>
                </div>
                {selectedRole?.role_key === 'admin' && (
                  <Badge variant="neutral" size="sm">
                    System Master Role (All Permissions Granted)
                  </Badge>
                )}
              </div>

              {/* Module-by-Module Permission Grid */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-900 pt-2 space-y-4">
                {Object.entries(permissionsByModule).map(([moduleName, perms]) => (
                  <div key={moduleName} className="pt-3">
                    <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 uppercase tracking-wide mb-2">
                      Module: {moduleName}
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {perms.map((p) => {
                        const isChecked =
                          selectedRole?.role_key === 'admin' || rolePermSet.has(p.permission_key);
                        const disabled = selectedRole?.role_key === 'admin';

                        return (
                          <label
                            key={p.id}
                            className={`flex items-start space-x-2.5 p-2 rounded-md border text-xs cursor-pointer select-none transition-colors ${
                              isChecked
                                ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60'
                                : 'border-zinc-200 dark:border-zinc-800 bg-transparent opacity-60'
                            } ${disabled ? 'cursor-not-allowed' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={disabled}
                              onChange={() => togglePermission(p.permission_key)}
                              className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                            />
                            <div>
                              <div className="font-medium text-zinc-900 dark:text-zinc-200">
                                {p.name_en}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono">
                                {p.permission_key}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <DataTable
            columns={[
              {
                key: 'created_at',
                header: t('auditTab.timestamp'),
                render: (l) => (
                  <span className="font-mono text-[11px] text-zinc-500">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'username',
                header: t('auditTab.user'),
                render: (l) => (
                  <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    @{l.username}
                  </span>
                ),
              },
              {
                key: 'action',
                header: t('auditTab.action'),
                render: (l) => (
                  <Badge variant="neutral" size="sm">
                    {l.action}
                  </Badge>
                ),
              },
              {
                key: 'result',
                header: t('auditTab.result'),
                render: (l) => (
                  <Badge variant={l.result === 'success' ? 'success' : 'error'} size="sm">
                    {l.result.toUpperCase()}
                  </Badge>
                ),
              },
              {
                key: 'details',
                header: t('auditTab.details'),
                render: (l) => (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {l.details || '—'}
                  </span>
                ),
              },
            ]}
            data={auditLogs}
            emptyMessage={t('auditTab.noLogs')}
          />
        </div>
      )}

      {/* Modal: Create User */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={t('modals.createTitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-3">
          {formError && (
            <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-md text-red-600 dark:text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <Input
            id="create-fullname"
            label={t('modals.fullName')}
            value={formFullName}
            onChange={(e) => setFormFullName(e.target.value)}
            placeholder="e.g., Sunil Perera"
            required
          />

          <Input
            id="create-username"
            label={t('modals.username')}
            value={formUsername}
            onChange={(e) => setFormUsername(e.target.value)}
            placeholder="e.g., sunil.p"
            required
          />

          <Select
            id="create-role"
            label={t('modals.role')}
            value={String(formRoleId)}
            onChange={(e) => setFormRoleId(Number(e.target.value))}
            options={roles.map((r) => ({
              value: String(r.id),
              label: `${r.name_en} (${r.name_si})`,
            }))}
          />

          <Input
            id="create-password"
            type="password"
            label={t('modals.password')}
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            required
          />

          <Input
            id="create-confirm-password"
            type="password"
            label={t('modals.confirmPassword')}
            value={formConfirmPassword}
            onChange={(e) => setFormConfirmPassword(e.target.value)}
            required
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-900">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" size="sm">
              {tCommon('actions.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit User */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={t('modals.editTitle')}
        maxWidth="sm"
      >
        <form onSubmit={handleEditUser} className="space-y-3">
          {formError && (
            <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-md text-red-600 dark:text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="text-xs text-zinc-500 font-mono">
            Username: @{selectedUser?.username}
          </div>

          <Input
            id="edit-fullname"
            label={t('modals.fullName')}
            value={formFullName}
            onChange={(e) => setFormFullName(e.target.value)}
            required
          />

          <Select
            id="edit-role"
            label={t('modals.role')}
            value={String(formRoleId)}
            onChange={(e) => setFormRoleId(Number(e.target.value))}
            options={roles.map((r) => ({
              value: String(r.id),
              label: `${r.name_en} (${r.name_si})`,
            }))}
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-900">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditModalOpen(false)}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" size="sm">
              {tCommon('actions.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reset Password */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={t('modals.resetTitle')}
        maxWidth="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-3">
          {formError && (
            <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-md text-red-600 dark:text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="text-xs text-zinc-500 font-mono">
            Target User: @{selectedUser?.username}
          </div>

          <Input
            id="reset-password"
            type="password"
            label={t('modals.newPassword')}
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            required
          />

          <Input
            id="reset-confirm-password"
            type="password"
            label={t('modals.confirmNewPassword')}
            value={formConfirmPassword}
            onChange={(e) => setFormConfirmPassword(e.target.value)}
            required
          />

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-900">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResetModalOpen(false)}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" size="sm">
              {tCommon('actions.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation: Deactivate / Activate */}
      <ConfirmationDialog
        isOpen={confirmStatusModalOpen}
        onClose={() => setConfirmStatusModalOpen(false)}
        onConfirm={handleToggleStatus}
        title={
          selectedUser?.status === 'active'
            ? t('modals.deactivateConfirmTitle')
            : 'Reactivate Staff User?'
        }
        message={
          selectedUser?.status === 'active'
            ? t('modals.deactivateConfirmMessage')
            : `Reactivate account @${selectedUser?.username}? The staff member will be able to sign in immediately.`
        }
        confirmLabel={selectedUser?.status === 'active' ? t('actions.deactivate') : t('actions.activate')}
        variant={selectedUser?.status === 'active' ? 'destructive' : 'primary'}
      />
    </div>
  );
};

