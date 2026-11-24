// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export interface Shortcut {
  /** The keys, as they are printed: ["Space"], ["←", "→"]. */
  keys: string[];
  what: string;
}

interface ShortcutsSheetProps {
  shortcuts: readonly Shortcut[];
  onClose: () => void;
}

/**
 * What the keyboard does, shown over the picture. A player with this many
 * keys has to be able to say so; pressing ? opens it.
 */
export function ShortcutsSheet({ shortcuts, onClose }: ShortcutsSheetProps) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What the keys do"
      data-own-keys
      className="absolute inset-0 z-30 flex items-center justify-center bg-onyx/80 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-full w-full max-w-lg overflow-auto border border-line bg-coal p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="heading text-lg">What the keys do</h2>
          <button
            ref={close}
            type="button"
            aria-label="Close"
            className="flex size-8 items-center justify-center text-smoke hover:text-vein"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>
        <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.what} className="flex items-baseline gap-3">
              <dt className="flex w-24 shrink-0 justify-end gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-7 border border-line bg-ash px-1.5 py-0.5 text-center text-xs text-vein"
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="text-sm leading-snug text-smoke">{shortcut.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
