// SPDX-License-Identifier: AGPL-3.0-only
'use client';

// The gear of the player. There is far too much behind it for one flat list
// of radio buttons, so it works the way a television does: a short list of
// what can be set, each row saying what it is set to, and a page of its own
// behind the rows that need one. One step in, one step back.

import { Check, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

export interface Choice {
  value: number;
  label: string;
}

/** A row that opens a page of choices, one of which is on. */
export interface ChoiceSetting {
  kind: 'choice';
  name: string;
  choices: Choice[];
  selected: number;
  onChoose: (value: number) => void;
  /** A line under the choices that says more, such as how sharing goes. */
  note?: string;
}

/** A row with a slider, set where it stands. */
export interface RangeSetting {
  kind: 'range';
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** The value as the viewer reads it: "120%", "+0.5 s". */
  format: (value: number) => string;
  onChange: (value: number) => void;
  /** A button beside the slider that puts it back where it started. */
  onReset?: () => void;
}

/** A row that is on or off. */
export interface SwitchSetting {
  kind: 'switch';
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
  note?: string;
}

/** A row that opens a page holding more rows. */
export interface PageSetting {
  kind: 'page';
  name: string;
  /** What the row says on the right, standing for what is inside. */
  summary: string;
  items: Setting[];
}

export type Setting = ChoiceSetting | RangeSetting | SwitchSetting | PageSetting;

/** A setting with nothing to choose is left out; one choice is not a choice. */
function worthShowing(setting: Setting): boolean {
  if (setting.kind === 'choice') {
    return setting.choices.length > 1;
  }
  if (setting.kind === 'page') {
    return setting.items.some(worthShowing);
  }
  return true;
}

function selectedLabel(setting: ChoiceSetting): string {
  return setting.choices.find((choice) => choice.value === setting.selected)?.label ?? '';
}

interface SettingsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Setting[];
}

export function SettingsMenu({ open, onOpenChange, settings }: SettingsMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  /** The way into the page that is showing, by the name of each row taken. */
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setPath([]);
      return undefined;
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      // Escape steps back a page before it closes the menu.
      setPath((current) => {
        if (current.length > 0) {
          return current.slice(0, -1);
        }
        onOpenChange(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
        return current;
      });
    };
    document.addEventListener('pointerdown', onPointer);
    // Before the player's own keys, so Escape does this and nothing else.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  const shown = settings.filter(worthShowing);
  if (shown.length === 0) {
    return null;
  }

  // Walk down to the page that is showing. A row that has gone away — a
  // track list that emptied — takes the viewer back out with it.
  let items = shown;
  let heading: string | null = null;
  let note: string | undefined;
  let radio: ChoiceSetting | null = null;
  for (const step of path) {
    const next = items.find((setting) => setting.name === step);
    if (!next) {
      items = shown;
      heading = null;
      radio = null;
      break;
    }
    heading = next.name;
    if (next.kind === 'page') {
      items = next.items.filter(worthShowing);
      radio = null;
    } else if (next.kind === 'choice') {
      radio = next;
      note = next.note;
      items = [];
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={panelId}
        className="player-button"
        onClick={() => onOpenChange(!open)}
      >
        <Settings className={`transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>
      {open ? (
        <div
          id={panelId}
          data-own-keys
          className="absolute right-0 bottom-full mb-3 flex max-h-[min(66dvh,30rem)] w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-line bg-coal/95 backdrop-blur-md"
        >
          {heading ? (
            <button
              type="button"
              className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-sm font-medium text-vein hover:bg-vein/10"
              onClick={() => setPath((current) => current.slice(0, -1))}
            >
              <ChevronLeft className="size-4 text-smoke" aria-hidden="true" />
              {heading}
            </button>
          ) : null}
          <div className="overflow-y-auto p-1.5">
            {radio ? (
              <Radios setting={radio} note={note} />
            ) : (
              items.map((setting) => (
                <Row
                  key={setting.name}
                  setting={setting}
                  onOpen={() => setPath((current) => [...current, setting.name])}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ setting, onOpen }: { setting: Setting; onOpen: () => void }) {
  if (setting.kind === 'choice' || setting.kind === 'page') {
    const value = setting.kind === 'page' ? setting.summary : selectedLabel(setting);
    return (
      <button
        type="button"
        className="flex h-11 w-full items-center gap-3 px-2.5 text-left text-sm hover:bg-vein/10"
        onClick={onOpen}
      >
        <span className="shrink-0 text-vein">{setting.name}</span>
        <span className="ml-auto truncate text-smoke">{value}</span>
        <ChevronRight className="size-4 shrink-0 text-smoke" aria-hidden="true" />
      </button>
    );
  }

  if (setting.kind === 'switch') {
    return (
      <div className="px-2.5 py-1">
        <button
          type="button"
          role="switch"
          aria-checked={setting.on}
          className="flex h-9 w-full items-center gap-3 text-left text-sm"
          onClick={() => setting.onChange(!setting.on)}
        >
          <span className="text-vein">{setting.name}</span>
          <span
            aria-hidden="true"
            className={`ml-auto flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              setting.on ? 'bg-sard' : 'bg-vein/25'
            }`}
          >
            <span
              className={`size-4 rounded-full bg-vein transition-transform ${
                setting.on ? 'translate-x-4 bg-onyx' : ''
              }`}
            />
          </span>
        </button>
        {setting.note ? (
          <p className="pb-1.5 text-xs leading-snug text-smoke">{setting.note}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="px-2.5 py-2">
      <div className="mb-1 flex items-baseline gap-3 text-sm">
        <span className="text-vein">{setting.name}</span>
        <span className="ml-auto text-smoke tabular-nums">{setting.format(setting.value)}</span>
        {setting.onReset ? (
          <button
            type="button"
            className="text-xs text-smoke underline underline-offset-2 hover:text-vein"
            onClick={setting.onReset}
          >
            Reset
          </button>
        ) : null}
      </div>
      <input
        type="range"
        aria-label={setting.name}
        min={setting.min}
        max={setting.max}
        step={setting.step}
        value={setting.value}
        onChange={(event) => setting.onChange(Number(event.target.value))}
        // The player's own arrow keys must not move this a second time.
        onKeyDown={(event) => event.stopPropagation()}
        style={{
          ['--filled' as string]: `${
            ((setting.value - setting.min) / (setting.max - setting.min)) * 100
          }%`,
        }}
        className="player-range w-full"
      />
    </div>
  );
}

function Radios({ setting, note }: { setting: ChoiceSetting; note?: string }): ReactNode {
  return (
    <div role="radiogroup" aria-label={setting.name} className="grid">
      {setting.choices.map((choice) => {
        const checked = choice.value === setting.selected;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`flex h-10 items-center gap-2.5 px-2.5 text-left text-sm hover:bg-vein/10 ${
              checked ? 'text-vein' : 'text-smoke'
            }`}
            onClick={() => setting.onChoose(choice.value)}
          >
            <Check
              className={`size-4 shrink-0 text-sard ${checked ? '' : 'invisible'}`}
              aria-hidden="true"
            />
            <span className="truncate">{choice.label}</span>
          </button>
        );
      })}
      {note ? <p className="px-2.5 py-2 text-xs leading-snug text-smoke">{note}</p> : null}
    </div>
  );
}
