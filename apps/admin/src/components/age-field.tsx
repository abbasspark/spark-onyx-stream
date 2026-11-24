// SPDX-License-Identifier: AGPL-3.0-only
import { EyeOff } from 'lucide-react';
import { useId } from 'react';
import { Input, Label } from '@/components/ui/form';
import { AGE_STEPS, describeAge, MAX_TITLE_AGE } from '@/lib/age-rating';
import { cn } from '@/lib/cn';

interface AgeFieldProps {
  /** The age it suits from. Null: nobody said. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** What is rated: "title" or "channel", for the note under the field. */
  what: string;
  disabled?: boolean;
  /** The age the written rating reads as, offered when it differs from the value. */
  suggestion?: number | null;
  className?: string;
}

/**
 * From which age something suits: the common steps with one click, any other
 * age typed. Says what it means to leave it open, because that hides the
 * title from every profile with an age limit.
 */
export function AgeField({
  value,
  onChange,
  what,
  disabled,
  suggestion,
  className,
}: AgeFieldProps) {
  const id = useId();
  const isStep = value !== null && (AGE_STEPS as readonly number[]).includes(value);
  const option = (active: boolean) =>
    cn(
      'inline-flex h-8 items-center rounded px-2.5 text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
      active
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    );

  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label id={`${id}-label`}>Suitable from age</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          className="flex flex-wrap gap-1 rounded-md border p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            disabled={disabled}
            className={option(value === null)}
            onClick={() => onChange(null)}
          >
            Not rated
          </button>
          {AGE_STEPS.map((age) => (
            <button
              key={age}
              type="button"
              role="radio"
              aria-checked={value === age}
              disabled={disabled}
              className={option(value === age)}
              onClick={() => onChange(age)}
            >
              {describeAge(age)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="font-normal text-muted-foreground">
            Other
          </Label>
          <Input
            id={id}
            type="number"
            min={0}
            max={MAX_TITLE_AGE}
            step={1}
            inputMode="numeric"
            placeholder="–"
            disabled={disabled}
            className="w-16 text-center tabular-nums"
            value={value === null || isStep ? '' : value}
            onChange={(event) => {
              const text = event.target.value.trim();
              if (!text) {
                onChange(null);
              } else if (/^\d{1,2}$/.test(text) && Number(text) <= MAX_TITLE_AGE) {
                onChange(Number(text));
              }
            }}
          />
        </div>
      </div>
      {value === null ? (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <EyeOff className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Without an age, profiles with an age limit do not see this {what}.
            {suggestion !== null && suggestion !== undefined ? (
              <>
                {' '}
                <button
                  type="button"
                  disabled={disabled}
                  className="font-medium underline underline-offset-2 hover:no-underline"
                  onClick={() => onChange(suggestion)}
                >
                  Use {describeAge(suggestion)} from the rating
                </button>
              </>
            ) : null}
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {value === 0
            ? `Every profile sees this ${what}.`
            : `Profiles limited to under ${value} do not see this ${what}, and it does not play for them.`}
          {suggestion !== null && suggestion !== undefined && suggestion !== value ? (
            <>
              {' '}
              <button
                type="button"
                disabled={disabled}
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                onClick={() => onChange(suggestion)}
              >
                The rating reads as {describeAge(suggestion)}
              </button>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
