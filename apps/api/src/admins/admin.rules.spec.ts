// SPDX-License-Identifier: AGPL-3.0-only
import {
  type AdminSubject,
  createDenialReason,
  removesActiveOwner,
  requiresSessionRevocation,
  updateDenialReason,
} from './admin.rules.js';

const owner: AdminSubject = { id: 'owner-1', role: 'OWNER', isActive: true };
const otherOwner: AdminSubject = { id: 'owner-2', role: 'OWNER', isActive: true };
const admin: AdminSubject = { id: 'admin-1', role: 'ADMIN', isActive: true };
const editor: AdminSubject = { id: 'editor-1', role: 'EDITOR', isActive: true };

describe('createDenialReason', () => {
  it('lets an admin create non-owner roles', () => {
    expect(createDenialReason(admin, 'ADMIN')).toBeNull();
    expect(createDenialReason(admin, 'EDITOR')).toBeNull();
  });

  it('lets only an owner create an owner', () => {
    expect(createDenialReason(admin, 'OWNER')).toMatch(/Only an owner/);
    expect(createDenialReason(owner, 'OWNER')).toBeNull();
  });
});

describe('updateDenialReason', () => {
  it('stops an admin from changing an owner', () => {
    expect(updateDenialReason(admin, owner, { displayName: 'New name' })).toMatch(/Only an owner/);
    expect(updateDenialReason(admin, owner, { isActive: false })).toMatch(/Only an owner/);
  });

  it('stops an admin from promoting someone to owner', () => {
    expect(updateDenialReason(admin, editor, { role: 'OWNER' })).toMatch(/Only an owner/);
  });

  it('lets an owner change another owner', () => {
    expect(updateDenialReason(owner, otherOwner, { role: 'ADMIN' })).toBeNull();
  });

  it('lets an admin change lower roles', () => {
    expect(updateDenialReason(admin, editor, { role: 'VIEWER', isActive: false })).toBeNull();
  });

  it('stops anyone from changing their own role, deactivating or resetting themselves', () => {
    expect(updateDenialReason(owner, owner, { role: 'ADMIN' })).toMatch(/own role/);
    expect(updateDenialReason(admin, admin, { isActive: false })).toMatch(/own account/);
    expect(updateDenialReason(admin, admin, { password: 'x' })).toMatch(/own password/);
  });

  it('lets anyone rename themselves', () => {
    expect(updateDenialReason(editor, editor, { displayName: 'New name' })).toBeNull();
    expect(updateDenialReason(owner, owner, { role: 'OWNER' })).toBeNull();
  });
});

describe('removesActiveOwner', () => {
  it('detects demotion and deactivation of an active owner', () => {
    expect(removesActiveOwner(owner, { role: 'ADMIN' })).toBe(true);
    expect(removesActiveOwner(owner, { isActive: false })).toBe(true);
  });

  it('ignores other changes and other roles', () => {
    expect(removesActiveOwner(owner, { displayName: 'x', role: 'OWNER' })).toBe(false);
    expect(removesActiveOwner(admin, { isActive: false })).toBe(false);
    expect(removesActiveOwner({ ...owner, isActive: false }, { role: 'ADMIN' })).toBe(false);
  });
});

describe('requiresSessionRevocation', () => {
  it('signs the target out after deactivation, a password reset or a role change', () => {
    expect(requiresSessionRevocation(editor, { isActive: false })).toBe(true);
    expect(requiresSessionRevocation(editor, { password: 'new-password-123' })).toBe(true);
    expect(requiresSessionRevocation(editor, { role: 'VIEWER' })).toBe(true);
  });

  it('keeps sessions for harmless changes', () => {
    expect(requiresSessionRevocation(editor, { displayName: 'x' })).toBe(false);
    expect(requiresSessionRevocation(editor, { role: 'EDITOR', isActive: true })).toBe(false);
  });
});
