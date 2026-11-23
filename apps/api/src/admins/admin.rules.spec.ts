// SPDX-License-Identifier: AGPL-3.0-only
import { type Permission, permissionsOfRole } from '../auth/permissions.js';
import {
  type AdminSubject,
  createDenialReason,
  grantDenialReason,
  manageDenialReason,
  type RoleAssignment,
  removesActiveOwner,
  requiresSessionRevocation,
  updateDenialReason,
} from './admin.rules.js';

function builtIn(role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'): RoleAssignment {
  return { role, customRoleId: null, permissions: permissionsOfRole(role) };
}

function custom(id: string, permissions: Permission[]): RoleAssignment {
  return { role: 'CUSTOM', customRoleId: id, permissions };
}

const owner: AdminSubject = { id: 'owner-1', isActive: true, ...builtIn('OWNER') };
const otherOwner: AdminSubject = { id: 'owner-2', isActive: true, ...builtIn('OWNER') };
const admin: AdminSubject = { id: 'admin-1', isActive: true, ...builtIn('ADMIN') };
const editor: AdminSubject = { id: 'editor-1', isActive: true, ...builtIn('EDITOR') };

/** May manage admins and see viewers, and nothing else. */
const hrRole = custom('role-hr', ['admins:read', 'admins:write', 'viewers:read']);
const hr: AdminSubject = { id: 'hr-1', isActive: true, ...hrRole };
const supportRole = custom('role-support', ['viewers:read']);
const support: AdminSubject = { id: 'support-1', isActive: true, ...supportRole };

describe('createDenialReason', () => {
  it('lets an admin create non-owner roles', () => {
    expect(createDenialReason(admin, builtIn('ADMIN'))).toBeNull();
    expect(createDenialReason(admin, builtIn('EDITOR'))).toBeNull();
    expect(createDenialReason(admin, hrRole)).toBeNull();
  });

  it('lets only an owner create an owner', () => {
    expect(createDenialReason(admin, builtIn('OWNER'))).toMatch(/Only an owner/);
    expect(createDenialReason(owner, builtIn('OWNER'))).toBeNull();
  });

  it('stops anyone from creating an admin who may do more than they can', () => {
    expect(createDenialReason(hr, builtIn('ADMIN'))).toMatch(/more than your own/);
    expect(createDenialReason(hr, builtIn('EDITOR'))).toMatch(/more than your own/);
    expect(createDenialReason(hr, supportRole)).toBeNull();
    expect(createDenialReason(hr, hrRole)).toBeNull();
  });
});

describe('grantDenialReason', () => {
  it('compares what the roles may do, not their names', () => {
    const everything = custom('role-all', [...permissionsOfRole('ADMIN')]);
    expect(grantDenialReason(admin, everything)).toBeNull();
    expect(grantDenialReason({ ...hr, ...everything }, builtIn('ADMIN'))).toBeNull();
    expect(grantDenialReason({ ...hr, ...everything }, builtIn('OWNER'))).toMatch(/Only an owner/);
  });
});

describe('manageDenialReason', () => {
  it('keeps an admin with a small role away from one with a bigger role', () => {
    expect(manageDenialReason(hr, admin)).toMatch(/more than you/);
    expect(manageDenialReason(hr, editor)).toMatch(/more than you/);
    expect(manageDenialReason(hr, support)).toBeNull();
    expect(manageDenialReason(admin, hr)).toBeNull();
  });

  it('keeps everyone but owners away from owners', () => {
    expect(manageDenialReason(admin, owner)).toMatch(/Only an owner/);
    expect(manageDenialReason(owner, otherOwner)).toBeNull();
  });
});

describe('updateDenialReason', () => {
  it('stops an admin from changing an owner', () => {
    expect(updateDenialReason(admin, owner, { displayName: 'New name' })).toMatch(/Only an owner/);
    expect(updateDenialReason(admin, owner, { isActive: false })).toMatch(/Only an owner/);
  });

  it('stops an admin from promoting someone to owner', () => {
    expect(updateDenialReason(admin, editor, { role: builtIn('OWNER') })).toMatch(/Only an owner/);
  });

  it('lets an owner change another owner', () => {
    expect(updateDenialReason(owner, otherOwner, { role: builtIn('ADMIN') })).toBeNull();
  });

  it('lets an admin change lower roles', () => {
    expect(
      updateDenialReason(admin, editor, { role: builtIn('VIEWER'), isActive: false }),
    ).toBeNull();
    expect(updateDenialReason(admin, editor, { role: hrRole })).toBeNull();
  });

  it('stops a password reset on an admin who may do more', () => {
    expect(updateDenialReason(hr, admin, { password: 'a-new-password-1' })).toMatch(
      /more than you/,
    );
    expect(updateDenialReason(hr, support, { password: 'a-new-password-1' })).toBeNull();
  });

  it('stops a move to a role that may do more than the actor', () => {
    expect(updateDenialReason(hr, support, { role: builtIn('EDITOR') })).toMatch(
      /more than your own/,
    );
    expect(updateDenialReason(hr, support, { role: hrRole })).toBeNull();
  });

  it('stops anyone from changing their own role, deactivating or resetting themselves', () => {
    expect(updateDenialReason(owner, owner, { role: builtIn('ADMIN') })).toMatch(/own role/);
    expect(updateDenialReason(hr, hr, { role: supportRole })).toMatch(/own role/);
    expect(updateDenialReason(admin, admin, { isActive: false })).toMatch(/own account/);
    expect(updateDenialReason(admin, admin, { password: 'x' })).toMatch(/own password/);
  });

  it('lets anyone rename themselves', () => {
    expect(updateDenialReason(editor, editor, { displayName: 'New name' })).toBeNull();
    expect(updateDenialReason(owner, owner, { role: builtIn('OWNER') })).toBeNull();
    expect(updateDenialReason(hr, hr, { role: hrRole })).toBeNull();
  });
});

describe('removesActiveOwner', () => {
  it('detects demotion and deactivation of an active owner', () => {
    expect(removesActiveOwner(owner, { role: builtIn('ADMIN') })).toBe(true);
    expect(removesActiveOwner(owner, { role: hrRole })).toBe(true);
    expect(removesActiveOwner(owner, { isActive: false })).toBe(true);
  });

  it('ignores other changes and other roles', () => {
    expect(removesActiveOwner(owner, { displayName: 'x', role: builtIn('OWNER') })).toBe(false);
    expect(removesActiveOwner(admin, { isActive: false })).toBe(false);
    expect(removesActiveOwner({ ...owner, isActive: false }, { role: builtIn('ADMIN') })).toBe(
      false,
    );
  });
});

describe('requiresSessionRevocation', () => {
  it('signs the target out after deactivation, a password reset or a role change', () => {
    expect(requiresSessionRevocation(editor, { isActive: false })).toBe(true);
    expect(requiresSessionRevocation(editor, { password: 'new-password-123' })).toBe(true);
    expect(requiresSessionRevocation(editor, { role: builtIn('VIEWER') })).toBe(true);
    expect(requiresSessionRevocation(hr, { role: supportRole })).toBe(true);
  });

  it('keeps sessions for harmless changes', () => {
    expect(requiresSessionRevocation(editor, { displayName: 'x' })).toBe(false);
    expect(requiresSessionRevocation(editor, { role: builtIn('EDITOR'), isActive: true })).toBe(
      false,
    );
  });
});
