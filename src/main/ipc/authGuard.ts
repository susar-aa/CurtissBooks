import { getCurrentSessionToken } from './authHandlers';
import { AuthService } from '../services/authService';
import { AuthSession } from '../../shared/types/auth';

export function assertAuthorized(requiredPermission?: string): AuthSession {
  const token = getCurrentSessionToken();
  if (!token) {
    throw new Error('Authentication required.');
  }

  const session = AuthService.validateSession(token);
  if (!session) {
    throw new Error('Session expired or invalid.');
  }

  if (session.isLocked) {
    throw new Error('Session is locked. Please unlock first.');
  }

  if (requiredPermission) {
    // Admin role (role_id === 1 or role_key === 'admin') has universal access
    if (session.user.role_key === 'admin' || session.user.role_id === 1) {
      return session;
    }

    const perms = session.permissions || [];
    const hasPerm =
      perms.includes(requiredPermission) ||
      (requiredPermission === 'bank.manage' && (perms.includes('bank.manage') || perms.includes('bank.create') || perms.includes('bank.edit') || perms.includes('bank.view') || perms.includes('financialYear.manage'))) ||
      (requiredPermission === 'bank.view' && (perms.includes('bank.view') || perms.includes('bank.create') || perms.includes('bank.edit') || perms.includes('financialYear.view'))) ||
      (requiredPermission === 'fund.manage' && (perms.includes('funds.create') || perms.includes('funds.edit') || perms.includes('funds.manage') || perms.includes('funds.view') || perms.includes('financialYear.manage') || perms.includes('expense.manage'))) ||
      (requiredPermission === 'fund.view' && (perms.includes('funds.view') || perms.includes('fund.view') || perms.includes('financialYear.view'))) ||
      (requiredPermission === 'funds.create' && (perms.includes('fund.manage') || perms.includes('funds.manage') || perms.includes('funds.create') || perms.includes('funds.view') || perms.includes('financialYear.manage') || perms.includes('expense.manage'))) ||
      (requiredPermission === 'funds.edit' && (perms.includes('fund.manage') || perms.includes('funds.manage') || perms.includes('funds.edit') || perms.includes('financialYear.manage'))) ||
      (requiredPermission === 'funds.view' && (perms.includes('funds.view') || perms.includes('fund.view') || perms.includes('financialYear.view')));

    if (!hasPerm) {
      throw new Error(`Access Denied: Missing permission "${requiredPermission}".`);
    }
  }

  return session;
}

