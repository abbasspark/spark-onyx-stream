// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Loader2, Tag, X } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { tidyCode } from '@/lib/coupons';
import { ViewerApiError } from '@/lib/viewer-api';

interface CouponFieldProps<Quote> {
  /** The code that is applied, with what it gives in words. Null: none. */
  applied: { code: string; summary: string } | null;
  /** Asks the site what the code does. Rejects with the reason when it does nothing here. */
  check: (code: string) => Promise<Quote>;
  onApplied: (quote: Quote) => void;
  onRemoved: () => void;
  className?: string;
}

/**
 * Where a viewer enters a coupon code. It starts as one quiet line, because
 * most people have no code, opens into a field, and once a code is applied
 * shows it with what it gives.
 */
export function CouponField<Quote>({
  applied,
  check,
  onApplied,
  onRemoved,
  className = '',
}: CouponFieldProps<Quote>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const code = tidyCode(value);
    if (!code || busy) {
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      onApplied(await check(code));
      setValue('');
      setOpen(false);
    } catch (caught) {
      setProblem(
        caught instanceof ViewerApiError
          ? caught.status === 429
            ? 'Too many tries. Wait a few minutes before the next one.'
            : caught.message
          : 'The code could not be checked. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <p
        role="status"
        className={`flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}
      >
        <span className="flex items-center gap-2 rounded-[3px] border border-sard/60 px-2.5 py-1 font-medium text-sard">
          <Tag className="size-3.5" aria-hidden="true" />
          {applied.code}
        </span>
        <span>{applied.summary}</span>
        <button
          type="button"
          className="flex items-center gap-1 text-smoke underline underline-offset-4 hover:text-vein"
          onClick={onRemoved}
        >
          <X className="size-3.5" aria-hidden="true" />
          Remove
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        className={`flex items-center gap-2 text-sm text-smoke underline underline-offset-4 hover:text-vein ${className}`}
        onClick={() => setOpen(true)}
      >
        <Tag className="size-3.5" aria-hidden="true" />
        Have a code?
      </button>
    );
  }
  return (
    <form onSubmit={(event) => void submit(event)} className={`max-w-sm ${className}`}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        Coupon code
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="input uppercase placeholder:normal-case"
          value={value}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          placeholder="Your code"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
        />
        <button
          type="submit"
          className="button button-quiet shrink-0"
          disabled={busy || tidyCode(value) === ''}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />
          ) : null}
          Apply
        </button>
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="mt-2 text-sm text-alarm">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
