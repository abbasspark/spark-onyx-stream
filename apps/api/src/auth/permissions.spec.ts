// SPDX-License-Identifier: AGPL-3.0-only
import {
  effectiveApiKeyPermissions,
  hasAllPermissions,
  PERMISSIONS,
  permissionsOfRole,
} from './permissions.js';

describe('permissionsOfRole', () => {
  it('gives owners and admins every permission', () => {
    expect(permissionsOfRole('OWNER')).toEqual(PERMISSIONS);
    expect(permissionsOfRole('ADMIN')).toEqual(PERMISSIONS);
  });

  it('lets editors manage content but not admins, keys, settings or the audit log', () => {
    const editor = permissionsOfRole('EDITOR');

    expect(editor).toContain('assets:write');
    expect(editor).toContain('jobs:write');
    expect(editor).not.toContain('admins:read');
    expect(editor).not.toContain('api-keys:write');
    expect(editor).not.toContain('settings:write');
    expect(editor).not.toContain('audit:read');
    expect(editor).not.toContain('storage:write');
  });

  it('gives viewers read access to content only', () => {
    const viewer = permissionsOfRole('VIEWER');

    expect(viewer.every((permission) => permission.endsWith(':read'))).toBe(true);
    expect(viewer).not.toContain('admins:read');
  });
});

describe('effectiveApiKeyPermissions', () => {
  it('keeps scopes the creator holds', () => {
    expect(effectiveApiKeyPermissions(['assets:read', 'assets:write'], 'EDITOR')).toEqual([
      'assets:read',
      'assets:write',
    ]);
  });

  it('drops scopes the creator no longer holds', () => {
    expect(effectiveApiKeyPermissions(['assets:write', 'settings:write'], 'EDITOR')).toEqual([
      'assets:write',
    ]);
  });

  it('never grants non-delegable permissions, even for an owner', () => {
    expect(
      effectiveApiKeyPermissions(['admins:write', 'api-keys:write', 'admins:read'], 'OWNER'),
    ).toEqual(['admins:read']);
  });

  it('ignores unknown scopes', () => {
    expect(effectiveApiKeyPermissions(['assets:read', 'everything'], 'OWNER')).toEqual([
      'assets:read',
    ]);
  });
});

describe('hasAllPermissions', () => {
  it('requires every listed permission', () => {
    expect(hasAllPermissions(['assets:read', 'jobs:read'], ['assets:read'])).toBe(true);
    expect(hasAllPermissions(['assets:read'], ['assets:read', 'assets:write'])).toBe(false);
  });

  it('allows anything when nothing is required', () => {
    expect(hasAllPermissions([], [])).toBe(true);
  });
});
