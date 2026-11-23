// SPDX-License-Identifier: AGPL-3.0-only
import { CalendarClock, CalendarOff, CalendarRange, Infinity as Always } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TitleDetail, UpdateTitleInput } from '@/api/types';
import {
  availabilityOf,
  availabilityProblem,
  type AvailabilityState,
  fromLocalInput,
  toLocalInput,
} from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/display';
import { Field, Input } from './ui/form';

export const AVAILABILITY_LOOKS: Record<
  AvailabilityState,
  { label: string; icon: typeof Always; className: string }
> = {
  always: { label: 'No dates', icon: Always, className: 'text-muted-foreground' },
  scheduled: { label: 'Scheduled', icon: CalendarClock, className: 'text-info' },
  current: { label: 'Showing now', icon: CalendarRange, className: 'text-success' },
  ended: { label: 'Ended', icon: CalendarOff, className: 'text-warning' },
};

/** The sentence under the card's title: what the dates mean right now. */
function describe(title: TitleDetail, state: AvailabilityState): string {
  const published = title.status === 'PUBLISHED';
  if (state === 'scheduled') {
    return published
      ? `Viewers see it ${formatRelative(title.availableFrom)}.`
      : `Once published, viewers see it from ${formatDateTime(title.availableFrom)}.`;
  }
  if (state === 'ended') {
    return `It left the site ${formatRelative(title.availableUntil)}.`;
  }
  if (state === 'current' && title.availableUntil) {
    return `It leaves the site ${formatRelative(title.availableUntil)}.`;
  }
  return state === 'current'
    ? 'Its start has passed, and it has no end.'
    : 'Shown from the moment it is published, without an end.';
}

interface TitleAvailabilityProps {
  title: TitleDetail;
  disabled: boolean;
  save: (changes: UpdateTitleInput) => Promise<unknown>;
}

/** The dates between which a published title is shown to viewers. */
export function TitleAvailability({ title, disabled, save }: TitleAvailabilityProps) {
  const savedFrom = toLocalInput(title.availableFrom);
  const savedUntil = toLocalInput(title.availableUntil);
  const [from, setFrom] = useState(savedFrom);
  const [until, setUntil] = useState(savedUntil);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFrom(savedFrom);
    setUntil(savedUntil);
  }, [savedFrom, savedUntil]);

  const state = availabilityOf(title);
  const look = AVAILABILITY_LOOKS[state];
  const dirty = from !== savedFrom || until !== savedUntil;
  const problem = availabilityProblem(from, until);

  const submit = async (nextFrom: string, nextUntil: string) => {
    setBusy(true);
    try {
      await save({
        availableFrom: fromLocalInput(nextFrom),
        availableUntil: fromLocalInput(nextUntil),
      });
      toast.success(nextFrom || nextUntil ? 'Availability saved' : 'Dates removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The dates could not be saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <>
            Availability
            <span
              className={cn('inline-flex items-center gap-1 text-xs font-medium', look.className)}
            >
              <look.icon className="size-3.5" aria-hidden="true" />
              {look.label}
            </span>
          </>
        }
        description={describe(title, state)}
      />
      <CardContent className="grid gap-4">
        <Field label="Show from" hint="Empty: as soon as it is published.">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              disabled={disabled}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <Field label="Show until" hint="Empty: without an end. For licences that run out.">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              disabled={disabled}
              min={from || undefined}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          )}
        </Field>
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}
        {disabled ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={busy}
              disabled={!dirty || problem !== null}
              onClick={() => void submit(from, until)}
            >
              Save dates
            </Button>
            {savedFrom || savedUntil ? (
              <Button disabled={busy} onClick={() => void submit('', '')}>
                Remove dates
              </Button>
            ) : null}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Times are in your own time zone. The dates only matter while the title is published.
        </p>
      </CardContent>
    </Card>
  );
}
