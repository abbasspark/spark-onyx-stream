// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { Permission, PermissionSection, Role } from '@/api/types';
import {
  changesOf,
  copyOf,
  draftOf,
  draftProblem,
  freeName,
  isDirty,
  levelOf,
  levelsOf,
  mayManage,
  roleFields,
  roleName,
  roleOptions,
  roleValue,
  samePermissions,
  sensitiveAreas,
  summarize,
  summaryText,
  withLevel,
  withSectionLevel,
} from './roles';

const catalog: PermissionSection[] = [
  {
    key: 'audience',
    label: 'Audience',
    description: '',
    areas: [
      {
        key: 'viewers',
        label: 'Viewers',
        read: { permission: 'viewers:read', description: '' },
        write: { permission: 'viewers:write', description: '' },
        sensitive: false,
      },
      {
        key: 'analytics',
        label: 'Analytics',
        read: { permission: 'analytics:read', description: '' },
        write: null,
        sensitive: false,
      },
      {
        key: 'billing',
        label: 'Billing',
        read: { permission: 'billing:read', description: '' },
        write: { permission: 'billing:write', description: '' },
        sensitive: true,
      },
    ],
  },
];
const [viewers, analytics, billing] = (catalog[0] as PermissionSection).areas as [
  PermissionSection['areas'][number],
  PermissionSection['areas'][number],
  PermissionSection['areas'][number],
];
const ALL: Permission[] = [
  'viewers:read',
  'viewers:write',
  'analytics:read',
  'billing:read',
  'billing:write',
];

function role(over: Partial<Role>): Role {
  return {
    id: 'r1',
    key: 'CUSTOM',
    builtIn: false,
    name: 'Support',
    description: 'Helps viewers',
    color: 'teal',
    permissions: ['viewers:read', 'viewers:write'],
    adminCount: 0,
    like: null,
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}
const owner = role({ id: null, key: 'OWNER', builtIn: true, name: 'Owner', permissions: ALL });
const editor = role({
  id: null,
  key: 'EDITOR',
  builtIn: true,
  name: 'Editor',
  description: 'Manages titles',
  permissions: ['viewers:read', 'analytics:read'],
});

describe('levels', () => {
  it('reads the level of an area', () => {
    expect(levelOf([], viewers)).toBe('none');
    expect(levelOf(['viewers:read'], viewers)).toBe('read');
    expect(levelOf(['viewers:read', 'viewers:write'], viewers)).toBe('write');
    expect(levelsOf(analytics)).toEqual(['none', 'read']);
  });

  it('sets one area and leaves the others', () => {
    expect(withLevel(['analytics:read'], viewers, 'write')).toEqual([
      'analytics:read',
      'viewers:read',
      'viewers:write',
    ]);
    expect(withLevel(['viewers:read', 'viewers:write', 'analytics:read'], viewers, 'none')).toEqual(
      ['analytics:read'],
    );
  });

  it('sets a whole section as far as the areas and the maker allow', () => {
    expect(withSectionLevel([], catalog[0] as PermissionSection, 'write', ALL)).toEqual(ALL);
    const limited = withSectionLevel([], catalog[0] as PermissionSection, 'write', [
      'viewers:read',
      'viewers:write',
      'billing:read',
    ]);
    expect(limited).toEqual(['viewers:read', 'viewers:write', 'billing:read']);
    expect(withSectionLevel(ALL, catalog[0] as PermissionSection, 'none', ALL)).toEqual([]);
  });
});

describe('summaries', () => {
  it('counts and words them', () => {
    expect(summarize(['viewers:read', 'viewers:write', 'analytics:read'], catalog)).toEqual({
      change: 1,
      see: 1,
      none: 1,
      areas: 3,
      everything: false,
    });
    expect(summaryText(summarize(ALL, catalog))).toBe('May do everything.');
    expect(summaryText(summarize([], catalog))).toBe('Reaches nothing yet.');
    expect(summaryText(summarize(['analytics:read'], catalog))).toBe(
      'Sees 1 area, changes nothing.',
    );
    expect(
      summaryText(summarize(['viewers:read', 'viewers:write', 'analytics:read'], catalog)),
    ).toBe('Changes 1 area, sees 1 more.');
  });

  it('names the sensitive areas a role may change', () => {
    expect(sensitiveAreas(['billing:read'], catalog)).toEqual([]);
    expect(sensitiveAreas(ALL, catalog)).toEqual([billing]);
  });
});

describe('drafts', () => {
  it('knows when something changed, and sends only that', () => {
    const stored = role({});
    const draft = draftOf(stored);
    expect(isDirty(draft, stored)).toBe(false);
    expect(samePermissions(['viewers:write', 'viewers:read'], stored.permissions)).toBe(true);

    draft.color = 'rose';
    draft.permissions = ['viewers:read'];
    expect(isDirty(draft, stored)).toBe(true);
    expect(changesOf(draft, stored)).toEqual({ color: 'rose', permissions: ['viewers:read'] });
  });

  it('says what keeps a draft from being saved', () => {
    const roles = [owner, role({})];
    expect(draftProblem({ ...draftOf(role({})), id: null, name: ' ' }, roles)).toMatch(/name/);
    expect(draftProblem({ ...draftOf(role({})), id: null, name: 'owner' }, roles)).toMatch(
      /built-in/,
    );
    expect(draftProblem({ ...draftOf(role({})), id: null, name: 'support' }, roles)).toMatch(
      /already/,
    );
    expect(draftProblem({ ...draftOf(role({})), permissions: [] }, roles)).toMatch(/at least one/);
    expect(draftProblem(draftOf(role({})), roles)).toBeNull();
  });

  it('copies a role under a free name, without what the maker does not hold', () => {
    const copy = copyOf(owner, ['viewers:read'], ['Owner', 'Owner copy']);
    expect(copy).toMatchObject({ id: null, name: 'Owner copy 2', permissions: ['viewers:read'] });
    expect(freeName('Support copy', ['Support'])).toBe('Support copy');
  });
});

describe('roles on admins', () => {
  const custom = {
    role: 'CUSTOM' as const,
    customRole: { id: 'r1', name: 'Support', color: 'teal' },
  };

  it('turns a role into a dropdown value and back', () => {
    expect(roleValue({ role: 'EDITOR', customRole: null })).toBe('EDITOR');
    expect(roleValue(custom)).toBe('custom:r1');
    expect(roleFields('custom:r1')).toEqual({ role: 'CUSTOM', customRoleId: 'r1' });
    expect(roleFields('VIEWER')).toEqual({ role: 'VIEWER' });
    expect(roleName(custom)).toBe('Support');
    expect(roleName({ role: 'ADMIN', customRole: null })).toBe('Admin');
  });

  it('offers only the roles the signed-in admin may hand out', () => {
    const options = roleOptions([owner, editor, role({})], {
      role: 'CUSTOM',
      permissions: ['viewers:read', 'viewers:write'],
    });
    expect(options.map((option) => [option.value, option.disabled])).toEqual([
      ['OWNER', true],
      ['EDITOR', true],
      ['custom:r1', false],
    ]);
    expect(options[0]?.description).toMatch(/Only an owner/);
    expect(options[1]?.description).toMatch(/more than your own/);
  });

  it('knows whom the signed-in admin may change', () => {
    const me = {
      role: 'CUSTOM' as const,
      permissions: ['viewers:read', 'viewers:write'] as Permission[],
    };
    const roles = [owner, editor, role({})];
    expect(mayManage(me, custom, roles)).toBe(true);
    expect(mayManage(me, { role: 'EDITOR', customRole: null }, roles)).toBe(false);
    expect(mayManage(me, { role: 'OWNER', customRole: null }, roles)).toBe(false);
    expect(
      mayManage({ role: 'OWNER', permissions: ALL }, { role: 'OWNER', customRole: null }, roles),
    ).toBe(true);
  });
});
