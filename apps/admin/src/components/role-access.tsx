// SPDX-License-Identifier: AGPL-3.0-only
import { Eye, Lock, Minus, Pencil, TriangleAlert } from 'lucide-react';
import { type KeyboardEvent, useRef } from 'react';
import type { Permission, PermissionArea, PermissionSection, Role } from '@/api/types';
import { Tooltip } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import {
  type AccessLevel,
  grantableLevel,
  isWithin,
  LEVEL_LABEL,
  levelOf,
  levelsOf,
  roleColorClasses,
  summarize,
  withLevel,
  withSectionLevel,
} from '@/lib/roles';

const LEVEL_ICON = { none: Minus, read: Eye, write: Pencil } as const;

/** The name of a role in its colour. */
export function RoleBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  const classes = roleColorClasses(color);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        classes.badge,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * How far a role reaches, as a thin bar: the part it changes, the part it
 * only sees, and the rest.
 */
export function AccessBar({
  permissions,
  catalog,
  className,
}: {
  permissions: readonly Permission[];
  catalog: readonly PermissionSection[];
  className?: string;
}) {
  const summary = summarize(permissions, catalog);
  const share = (count: number) => `${(count / Math.max(summary.areas, 1)) * 100}%`;
  return (
    <div
      className={cn('flex h-1.5 overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={`Changes ${summary.change} of ${summary.areas} areas, sees ${summary.see} more`}
    >
      <span className="bg-primary" style={{ width: share(summary.change) }} />
      <span className="bg-primary/35" style={{ width: share(summary.see) }} />
    </div>
  );
}

/** One level as a quiet label, for roles that cannot be changed here. */
function LevelLabel({ level }: { level: AccessLevel }) {
  const Icon = LEVEL_ICON[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
        level === 'write' && 'bg-primary/12 text-primary',
        level === 'read' && 'bg-muted text-foreground',
        level === 'none' && 'text-muted-foreground',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {LEVEL_LABEL[level]}
    </span>
  );
}

interface LevelPickerProps {
  area: PermissionArea;
  value: AccessLevel;
  /** The highest level that may be chosen. Higher ones are shown locked. */
  limit: AccessLevel;
  onChange: (level: AccessLevel) => void;
}

/** Chooses between no access, seeing and changing. Works with the arrow keys. */
function LevelPicker({ area, value, limit, onChange }: LevelPickerProps) {
  const group = useRef<HTMLDivElement>(null);
  const levels = levelsOf(area);
  const open = levels.filter((level) => isWithin(level, limit));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0 || open.length === 0) {
      return;
    }
    event.preventDefault();
    const at = Math.max(open.indexOf(value), 0);
    const next = open[(at + step + open.length) % open.length] as AccessLevel;
    onChange(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-level="${next}"]`)?.focus();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={`Access to ${area.label}`}
      onKeyDown={onKeyDown}
      className="grid w-full auto-cols-fr grid-flow-col rounded-lg border bg-muted/60 p-0.5 sm:w-auto"
    >
      {levels.map((level) => {
        const Icon = LEVEL_ICON[level];
        const checked = level === value;
        const locked = !isWithin(level, limit);
        const button = (
          <button
            key={level}
            type="button"
            role="radio"
            data-level={level}
            aria-checked={checked}
            aria-disabled={locked}
            tabIndex={checked ? 0 : -1}
            onClick={() => (locked ? undefined : onChange(level))}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs sm:px-2.5 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              checked && level === 'write' && 'bg-primary text-primary-foreground shadow-xs',
              checked && level === 'read' && 'bg-card text-foreground shadow-xs',
              checked && level === 'none' && 'bg-card text-muted-foreground shadow-xs',
              !checked && !locked && 'text-muted-foreground hover:text-foreground',
              locked && 'cursor-not-allowed text-muted-foreground/45',
            )}
          >
            {locked ? (
              <Lock className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              // On a phone three labels fill the row, so the pictures step aside.
              <Icon className="size-3.5 shrink-0 max-sm:hidden" aria-hidden="true" />
            )}
            {LEVEL_LABEL[level]}
          </button>
        );
        return locked ? (
          <Tooltip
            key={level}
            content="Your own role does not reach this far, so you cannot give it."
          >
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}

/** What the chosen level of an area means, in the sentence of the catalogue. */
function levelSentence(area: PermissionArea, level: AccessLevel): string {
  if (level === 'write' && area.write) {
    return `${area.read.description} ${area.write.description}`;
  }
  if (level === 'read') {
    return area.read.description;
  }
  return `No access to ${area.label}.`;
}

interface PermissionMatrixProps {
  catalog: readonly PermissionSection[];
  value: readonly Permission[];
  /** Leave out to show the role without controls. */
  onChange?: (permissions: Permission[]) => void;
  /** The permissions of the signed-in admin: the most they may hand out. */
  mine: readonly Permission[];
}

/**
 * Every area of the panel with the level a role has in it. With `onChange`,
 * each level can be set, one area at a time or a whole section at once.
 */
export function PermissionMatrix({ catalog, value, onChange, mine }: PermissionMatrixProps) {
  return (
    <div className="grid gap-6">
      {catalog.map((section) => (
        <section key={section.key} aria-labelledby={`section-${section.key}`}>
          <header className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="grid gap-0.5">
              <h3 id={`section-${section.key}`} className="text-sm font-semibold">
                {section.label}
              </h3>
              <p className="text-xs text-muted-foreground">{section.description}</p>
            </div>
            {onChange ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="mr-1">Set all to</span>
                {(['none', 'read', 'write'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onChange(withSectionLevel(value, section, level, mine))}
                    className="rounded-md border px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {LEVEL_LABEL[level]}
                  </button>
                ))}
              </div>
            ) : null}
          </header>

          <ul className="divide-y rounded-lg border">
            {section.areas.map((area) => {
              const level = levelOf(value, area);
              return (
                <li
                  key={area.key}
                  className="grid gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {area.label}
                      {area.sensitive ? (
                        <Tooltip content="Reaches further than its own page. Give the right to change it with care.">
                          <TriangleAlert
                            className={cn(
                              'size-3.5',
                              level === 'write' ? 'text-warning' : 'text-muted-foreground/60',
                            )}
                            aria-label="Sensitive"
                          />
                        </Tooltip>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{levelSentence(area, level)}</p>
                  </div>
                  {onChange ? (
                    <LevelPicker
                      area={area}
                      value={level}
                      limit={grantableLevel(mine, area)}
                      onChange={(next) => onChange(withLevel(value, area, next))}
                    />
                  ) : (
                    <LevelLabel level={level} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Every role next to every other: one column each, one row per area. */
export function RoleComparison({
  roles,
  catalog,
  onSelect,
}: {
  roles: readonly Role[];
  catalog: readonly PermissionSection[];
  onSelect: (role: Role) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-40 border-b bg-card px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Area
            </th>
            {roles.map((role) => (
              <th key={role.id ?? role.key} className="border-b px-3 py-3 text-center font-normal">
                <button
                  type="button"
                  onClick={() => onSelect(role)}
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open ${role.name}`}
                >
                  <RoleBadge name={role.name} color={role.color} className="max-w-36" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {catalog.map((section) => (
            <SectionRows key={section.key} section={section} roles={roles} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRows({ section, roles }: { section: PermissionSection; roles: readonly Role[] }) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={roles.length + 1}
          className="border-b bg-muted/40 px-4 py-1.5 text-left text-xs font-semibold"
        >
          <span className="sticky left-4">{section.label}</span>
        </th>
      </tr>
      {section.areas.map((area) => (
        <tr key={area.key} className="group">
          <th
            scope="row"
            className="sticky left-0 z-10 border-b bg-card px-4 py-2.5 text-left font-medium whitespace-nowrap group-hover:bg-accent"
          >
            {area.label}
          </th>
          {roles.map((role) => {
            const level = levelOf(role.permissions, area);
            const Icon = LEVEL_ICON[level];
            return (
              <td
                key={role.id ?? role.key}
                className="border-b px-3 py-2.5 text-center group-hover:bg-accent"
              >
                <Tooltip content={`${role.name}: ${LEVEL_LABEL[level].toLowerCase()}`}>
                  <span
                    className={cn(
                      'relative inline-flex size-7 items-center justify-center rounded-md',
                      level === 'write' && 'bg-primary/12 text-primary',
                      level === 'read' && 'bg-muted text-foreground',
                      level === 'none' && 'text-muted-foreground/40',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">{LEVEL_LABEL[level]}</span>
                  </span>
                </Tooltip>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
