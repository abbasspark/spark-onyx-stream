// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminSubject } from '../admins/admin.rules.js';
import { PERMISSIONS, permissionsOfRole } from '../auth/permissions.js';
import {
  closestBuiltIn,
  isReservedRoleName,
  permissionChanges,
  roleChangeDenialReason,
  roleCreateDenialReason,
} from './role.rules.js';

const admin: AdminSubject = {
  id: 'admin-1',
  isActive: true,
  role: 'ADMIN',
  customRoleId: null,
  permissions: permissionsOfRole('ADMIN'),
};
const hr: AdminSubject = {
  id: 'hr-1',
  isActive: true,
  role: 'CUSTOM',
  customRoleId: 'role-hr',
  permissions: ['admins:read', 'admins:write', 'viewers:read'],
};

describe('isReservedRoleName', () => {
  it('keeps the names of the built-in roles free', () => {
    expect(isReservedRoleName('Owner')).toBe(true);
    expect(isReservedRoleName('  editor ')).toBe(true);
    expect(isReservedRoleName('Support')).toBe(false);
  });
});

describe('roleCreateDenialReason', () => {
  it('lets an admin build any role', () => {
    expect(roleCreateDenialReason(admin, [...PERMISSIONS])).toBeNull();
  });

  it('names what the maker does not hold', () => {
    expect(roleCreateDenialReason(hr, ['viewers:read', 'billing:read', 'billing:write'])).toBe(
      'You cannot put into a role what you may not do yourself: billing:read, billing:write',
    );
    expect(roleCreateDenialReason(hr, ['viewers:read'])).toBeNull();
  });
});

describe('roleChangeDenialReason', () => {
  it('keeps people away from their own role', () => {
    expect(
      roleChangeDenialReason(hr, { id: 'role-hr', permissions: hr.permissions }, ['viewers:read']),
    ).toMatch(/hold yourself/);
  });

  it('keeps people away from roles bigger than theirs', () => {
    expect(roleChangeDenialReason(hr, { id: 'role-money', permissions: ['billing:read'] })).toMatch(
      /more than your own/,
    );
  });

  it('checks the permissions after the change too', () => {
    const support = { id: 'role-support', permissions: ['viewers:read'] as const };
    expect(roleChangeDenialReason(hr, support, ['viewers:read', 'audit:read'])).toMatch(
      /audit:read/,
    );
    expect(roleChangeDenialReason(hr, support, ['viewers:read', 'admins:read'])).toBeNull();
    expect(roleChangeDenialReason(hr, support)).toBeNull();
  });
});

describe('permissionChanges', () => {
  it('lists what was added and what was taken away', () => {
    expect(
      permissionChanges(['catalog:read', 'viewers:read'], ['catalog:read', 'audit:read']),
    ).toEqual({ added: ['audit:read'], removed: ['viewers:read'] });
  });
});

describe('closestBuiltIn', () => {
  it('finds the built-in role a list of permissions covers', () => {
    expect(closestBuiltIn([...PERMISSIONS])).toBe('ADMIN');
    expect(closestBuiltIn([...permissionsOfRole('EDITOR'), 'viewers:read'])).toBe('EDITOR');
    expect(closestBuiltIn([...permissionsOfRole('VIEWER')])).toBe('VIEWER');
    expect(closestBuiltIn(['viewers:read'])).toBeNull();
  });
});
