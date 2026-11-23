// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AdminRole,
  CustomRoleRef,
  Permission,
  PermissionArea,
  PermissionSection,
  Role,
  RoleInput,
} from '@/api/types';
import type { SelectOption } from '@/components/ui/form';

/** How far a role reaches into one area of the panel. */
export type AccessLevel = 'none' | 'read' | 'write';

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: 'No access',
  read: 'Can see',
  write: 'Can change',
};

/** How far a list of permissions reaches into an area. */
export function levelOf(permissions: readonly Permission[], area: PermissionArea): AccessLevel {
  if (area.write && permissions.includes(area.write.permission)) {
    return 'write';
  }
  return permissions.includes(area.read.permission) ? 'read' : 'none';
}

/** The levels an area offers: one that can only be seen has no "Can change". */
export function levelsOf(area: PermissionArea): AccessLevel[] {
  return area.write ? ['none', 'read', 'write'] : ['none', 'read'];
}

/** The permissions a level of an area stands for. Changing includes seeing. */
export function permissionsOfLevel(area: PermissionArea, level: AccessLevel): Permission[] {
  if (level === 'none') {
    return [];
  }
  return level === 'write' && area.write
    ? [area.read.permission, area.write.permission]
    : [area.read.permission];
}

/** A list of permissions with one area set to a level. */
export function withLevel(
  permissions: readonly Permission[],
  area: PermissionArea,
  level: AccessLevel,
): Permission[] {
  const own = new Set<string>([area.read.permission, area.write?.permission ?? '']);
  return [
    ...permissions.filter((permission) => !own.has(permission)),
    ...permissionsOfLevel(area, level),
  ];
}

/**
 * The highest level of an area someone with `mine` may hand out. Nobody
 * gives a role more than they hold themselves.
 */
export function grantableLevel(mine: readonly Permission[], area: PermissionArea): AccessLevel {
  return levelOf(mine, area);
}

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2 };

/** Whether a level is within what may be handed out. */
export function isWithin(level: AccessLevel, limit: AccessLevel): boolean {
  return RANK[level] <= RANK[limit];
}

/**
 * A list of permissions with a whole section set to a level, as far as the
 * areas offer it and `mine` allows it.
 */
export function withSectionLevel(
  permissions: readonly Permission[],
  section: PermissionSection,
  level: AccessLevel,
  mine: readonly Permission[],
): Permission[] {
  return section.areas.reduce<Permission[]>(
    (result, area) => {
      const limit = grantableLevel(mine, area);
      const offered = level === 'write' && !area.write ? 'read' : level;
      return withLevel(result, area, isWithin(offered, limit) ? offered : limit);
    },
    [...permissions],
  );
}

export interface AccessSummary {
  /** Areas the role may change. */
  change: number;
  /** Areas it may see and not change. */
  see: number;
  /** Areas it cannot reach. */
  none: number;
  areas: number;
  /** True when every area is at the highest level it offers. */
  everything: boolean;
}

export function summarize(
  permissions: readonly Permission[],
  catalog: readonly PermissionSection[],
): AccessSummary {
  const summary: AccessSummary = { change: 0, see: 0, none: 0, areas: 0, everything: true };
  for (const area of catalog.flatMap((section) => section.areas)) {
    const level = levelOf(permissions, area);
    if (level !== (area.write ? 'write' : 'read')) {
      summary.everything = false;
    }
    summary.areas += 1;
    summary[level === 'write' ? 'change' : level === 'read' ? 'see' : 'none'] += 1;
  }
  return summary;
}

const areas = (count: number) => `${count} ${count === 1 ? 'area' : 'areas'}`;

/** A summary in a sentence: "Changes 3 areas, sees 2 more." */
export function summaryText(summary: AccessSummary): string {
  if (summary.change === 0 && summary.see === 0) {
    return 'Reaches nothing yet.';
  }
  if (summary.everything) {
    return 'May do everything.';
  }
  if (summary.change === 0) {
    return `Sees ${areas(summary.see)}, changes nothing.`;
  }
  if (summary.see === 0) {
    return `Changes ${areas(summary.change)}.`;
  }
  return `Changes ${areas(summary.change)}, sees ${summary.see} more.`;
}

/** The areas marked sensitive that a list of permissions may change. */
export function sensitiveAreas(
  permissions: readonly Permission[],
  catalog: readonly PermissionSection[],
): PermissionArea[] {
  return catalog
    .flatMap((section) => section.areas)
    .filter((area) => area.sensitive && levelOf(permissions, area) === 'write');
}

/** Whether two lists hold the same permissions, in any order. */
export function samePermissions(a: readonly Permission[], b: readonly Permission[]): boolean {
  return a.length === b.length && a.every((permission) => b.includes(permission));
}

/** Whether someone with `mine` holds everything in `wanted`. */
export function covers(mine: readonly Permission[], wanted: readonly Permission[]): boolean {
  return wanted.every((permission) => mine.includes(permission));
}

/** What the editor works on. */
export interface RoleDraft extends RoleInput {
  /** The id of the role being changed. Null for a new one. */
  id: string | null;
}

export function draftOf(role: Role): RoleDraft {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    color: role.color,
    permissions: [...role.permissions],
  };
}

/** A new role that starts as a copy of another, limited to what `mine` may hand out. */
export function copyOf(
  role: Role,
  mine: readonly Permission[],
  taken: readonly string[],
): RoleDraft {
  return {
    id: null,
    name: freeName(`${role.name} copy`, taken),
    description: role.builtIn ? '' : role.description,
    color: role.color,
    permissions: role.permissions.filter((permission) => mine.includes(permission)),
  };
}

/** A name nobody uses yet: "Support copy", then "Support copy 2". */
export function freeName(wanted: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!used.has(wanted.toLowerCase())) {
    return wanted;
  }
  for (let number = 2; ; number += 1) {
    const candidate = `${wanted} ${number}`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

export function isDirty(draft: RoleDraft, role: Role | null): boolean {
  if (!role) {
    return true;
  }
  return (
    draft.name.trim() !== role.name ||
    draft.description.trim() !== role.description ||
    draft.color !== role.color ||
    !samePermissions(draft.permissions, role.permissions)
  );
}

/** Why a draft cannot be saved yet, in words for under the form. Null when it can. */
export function draftProblem(draft: RoleDraft, roles: readonly Role[]): string | null {
  const name = draft.name.trim();
  if (name.length < 2) {
    return 'Give the role a name.';
  }
  const clash = roles.find(
    (role) =>
      role.name.toLowerCase() === name.toLowerCase() && (role.builtIn || role.id !== draft.id),
  );
  if (clash) {
    return clash.builtIn
      ? `${clash.name} is the name of a built-in role. Choose another one.`
      : 'Another role has this name already.';
  }
  if (draft.permissions.length === 0) {
    return 'Choose at least one thing this role may do.';
  }
  return null;
}

/** The body of a save: only what differs from the stored role. */
export function changesOf(draft: RoleDraft, role: Role): Partial<RoleInput> {
  const changes: Partial<RoleInput> = {};
  if (draft.name.trim() !== role.name) {
    changes.name = draft.name.trim();
  }
  if (draft.description.trim() !== role.description) {
    changes.description = draft.description.trim();
  }
  if (draft.color !== role.color) {
    changes.color = draft.color;
  }
  if (!samePermissions(draft.permissions, role.permissions)) {
    changes.permissions = draft.permissions;
  }
  return changes;
}

// --- Roles on admins -------------------------------------------------------------

/** The role of an admin as one value for a dropdown: "EDITOR", or "custom:<id>". */
export function roleValue(holder: { role: AdminRole; customRole: CustomRoleRef | null }): string {
  return holder.customRole ? `custom:${holder.customRole.id}` : holder.role;
}

export function roleValueOf(role: Role): string {
  return role.id ? `custom:${role.id}` : role.key;
}

/** The fields of a request for a dropdown value. */
export function roleFields(value: string): { role: AdminRole; customRoleId?: string } {
  return value.startsWith('custom:')
    ? { role: 'CUSTOM', customRoleId: value.slice('custom:'.length) }
    : { role: value as AdminRole };
}

const BUILT_IN_NAMES: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

/** The name of the role an admin holds. */
export function roleName(holder: { role: AdminRole; customRole: CustomRoleRef | null }): string {
  return holder.customRole?.name ?? BUILT_IN_NAMES[holder.role] ?? 'No role';
}

const BUILT_IN_COLORS: Record<string, string> = {
  OWNER: 'amber',
  ADMIN: 'violet',
  EDITOR: 'blue',
  VIEWER: 'slate',
};

export function roleColor(holder: { role: AdminRole; customRole: CustomRoleRef | null }): string {
  return holder.customRole?.color ?? BUILT_IN_COLORS[holder.role] ?? 'slate';
}

/**
 * The roles as options of a dropdown. A role the signed-in admin may not
 * hand out is shown and cannot be chosen, with the reason.
 */
export function roleOptions(
  roles: readonly Role[],
  me: { role: AdminRole; permissions: readonly Permission[] },
): SelectOption[] {
  return roles.map((role) => {
    const ownerOnly = role.key === 'OWNER' && me.role !== 'OWNER';
    const tooBig = !covers(me.permissions, role.permissions);
    return {
      value: roleValueOf(role),
      label: role.name,
      description: ownerOnly
        ? 'Only an owner can make someone an owner'
        : tooBig
          ? 'May do more than your own role'
          : role.description || undefined,
      disabled: ownerOnly || tooBig,
    };
  });
}

/** Whether the signed-in admin may change this admin at all. */
export function mayManage(
  me: { role: AdminRole; permissions: readonly Permission[] },
  target: { role: AdminRole; customRole: CustomRoleRef | null },
  roles: readonly Role[],
): boolean {
  if (target.role === 'OWNER') {
    return me.role === 'OWNER';
  }
  const held = roles.find((role) => roleValueOf(role) === roleValue(target));
  return held ? covers(me.permissions, held.permissions) : true;
}

/** Classes of a role badge, per colour. Unknown colours fall back to slate. */
export const ROLE_COLOR_CLASSES: Record<string, { badge: string; dot: string }> = {
  slate: {
    badge: 'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
  blue: {
    badge: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  cyan: {
    badge: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-500',
  },
  teal: {
    badge: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  green: {
    badge: 'border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300',
    dot: 'bg-green-500',
  },
  amber: {
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  orange: {
    badge: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  rose: {
    badge: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  violet: {
    badge: 'border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
};

export function roleColorClasses(color: string): { badge: string; dot: string } {
  return ROLE_COLOR_CLASSES[color] ?? (ROLE_COLOR_CLASSES.slate as { badge: string; dot: string });
}
