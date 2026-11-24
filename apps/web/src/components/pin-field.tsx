// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useId } from 'react';

interface PinFieldProps {
  label: string;
  value: string;
  onValue: (value: string) => void;
  /** What is wrong with the PIN. */
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  /** Left aligned in a form, centred when the PIN is all that is asked. */
  align?: 'start' | 'center';
}

/**
 * A field for a PIN of four to six digits. Takes digits only, hides them as
 * they are typed, and opens the number pad on a phone.
 */
export function PinField({
  label,
  value,
  onValue,
  error,
  hint,
  autoFocus,
  align = 'start',
}: PinFieldProps) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className={align === 'center' ? 'grid justify-items-center text-center' : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className="input h-14 w-full max-w-[13rem] px-3 text-center font-mono text-2xl tracking-[0.5em] [-webkit-text-security:disc]"
        // Not type="password": a browser would offer to save it as the password of the account.
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={6}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        value={value}
        onChange={(event) => onValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      {note ? (
        <p
          id={`${id}-note`}
          role={error ? 'alert' : undefined}
          className={`mt-1.5 text-sm ${error ? 'text-alarm' : 'text-smoke'}`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
