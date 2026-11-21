// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Settings } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export interface Choice {
  value: number;
  label: string;
}

export interface ChoiceGroup {
  name: string;
  choices: Choice[];
  selected: number;
  onChoose: (value: number) => void;
}

interface SettingsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ChoiceGroup[];
}

/** The gear of the player: quality, subtitles and speed, each a short list to pick from. */
export function SettingsMenu({ open, onOpenChange, groups }: SettingsMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    // Before the player's own keys, so Escape closes the menu and nothing else.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  const shown = groups.filter((group) => group.choices.length > 1);
  if (shown.length === 0) {
    return null;
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
          className="absolute right-0 bottom-full mb-3 flex max-h-[min(60dvh,26rem)] max-w-[calc(100vw-2rem)] gap-6 overflow-auto border border-line bg-coal/95 p-4 backdrop-blur-md"
        >
          {shown.map((group) => (
            <fieldset key={group.name} className="min-w-28">
              <legend className="mb-2 text-xs text-smoke">{group.name}</legend>
              <div role="radiogroup" aria-label={group.name} className="grid">
                {group.choices.map((choice) => {
                  const checked = choice.value === group.selected;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={`flex h-9 items-center gap-2 pr-3 text-left text-sm whitespace-nowrap hover:text-vein ${checked ? 'text-vein' : 'text-smoke'}`}
                      onClick={() => group.onChoose(choice.value)}
                    >
                      <Check
                        className={`size-4 text-sard ${checked ? '' : 'invisible'}`}
                        aria-hidden="true"
                      />
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
    </div>
  );
}
