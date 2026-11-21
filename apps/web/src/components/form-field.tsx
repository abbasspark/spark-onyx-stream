// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Eye, EyeOff } from 'lucide-react';
import { type InputHTMLAttributes, useId, useState } from 'react';

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange'> {
  label: string;
  /** Help under the field. */
  hint?: string;
  /** What is wrong with the value. Replaces the hint. */
  error?: string;
  onValue: (value: string) => void;
}

/**
 * A labelled text field. A password field gets a button to show what was
 * typed, which prevents more mistakes than typing it twice.
 */
export function FormField({ label, hint, error, type, onValue, ...input }: FormFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          {...input}
          id={id}
          type={isPassword && shown ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={`input ${isPassword ? 'pr-12' : ''}`}
          onChange={(event) => onValue(event.target.value)}
        />
        {isPassword ? (
          <button
            type="button"
            aria-label={shown ? 'Hide the password' : 'Show the password'}
            aria-pressed={shown}
            className="absolute top-0 right-0 flex size-12 items-center justify-center text-smoke hover:text-vein"
            onClick={() => setShown((value) => !value)}
          >
            {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        ) : null}
      </div>
      {error || hint ? (
        <p id={noteId} className={`mt-1.5 text-sm ${error ? 'text-alarm' : 'text-smoke'}`}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
