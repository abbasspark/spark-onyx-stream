// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import { Globe, Info, TriangleAlert } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { webhooksApi } from '@/api/endpoints';
import type { Webhook, WebhookEventInfo, WebhookReference, WebhookWithSecret } from '@/api/types';
import { JsonView } from '@/components/json-view';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/ui/display';
import { Checkbox, Field, Input, Switch } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import {
  draftOf,
  draftProblem,
  EMPTY_DRAFT,
  groupEvents,
  groupState,
  inputOf,
  isPlainHttp,
  toggleGroup,
  urlProblem,
  type WebhookDraft,
} from '@/lib/webhooks';

interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The webhook to change. Without one, a new webhook is made. */
  webhook: Webhook | null;
  reference: WebhookReference;
  onCreated: (webhook: WebhookWithSecret) => void;
  onSaved: (webhook: Webhook) => void;
}

/** The form of a webhook: where it goes and what it is told about. */
export function WebhookDialog({
  open,
  onOpenChange,
  webhook,
  reference,
  onCreated,
  onSaved,
}: WebhookDialogProps) {
  const [draft, setDraft] = useState<WebhookDraft>(EMPTY_DRAFT);
  /** The event whose example shows beside the list. */
  const [shown, setShown] = useState<string | null>(null);
  const [touchedUrl, setTouchedUrl] = useState(false);
  const groups = useMemo(() => groupEvents(reference.events), [reference.events]);

  const save = useMutation({
    mutationFn: async () => {
      const input = inputOf(draft, reference.events);
      if (webhook) {
        onSaved(await webhooksApi.update(webhook.id, input));
      } else {
        onCreated(await webhooksApi.create(input));
      }
    },
  });

  useEffect(() => {
    if (open) {
      save.reset();
      setDraft(webhook ? draftOf(webhook) : { ...EMPTY_DRAFT, events: new Set() });
      setShown(null);
      setTouchedUrl(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, webhook]);

  const set = (changes: Partial<WebhookDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const toggle = (name: string) => {
    const events = new Set(draft.events);
    if (events.has(name)) {
      events.delete(name);
    } else {
      events.add(name);
    }
    set({ events });
    setShown(name);
  };

  const addressProblem = touchedUrl ? urlProblem(draft.url) : null;
  const problem = draftProblem(draft);
  const example: WebhookEventInfo | undefined =
    reference.events.find((event) => event.name === shown) ?? reference.events[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem) {
      save.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        size="lg"
        title={webhook ? `Change "${webhook.name}"` : 'New webhook'}
        description="Another system is told at this address when something happens here."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody className="gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <Field label="Name" hint="What receives it.">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={60}
                    placeholder="Newsletter tool"
                    value={draft.name}
                    onChange={(event) => set({ name: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Address" hint="Requests are sent here with POST, as JSON.">
                {(id) => (
                  <Input
                    id={id}
                    required
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={2000}
                    className="font-mono text-[13px]"
                    placeholder="https://example.com/hooks/onyx"
                    aria-invalid={addressProblem ? true : undefined}
                    value={draft.url}
                    onChange={(event) => set({ url: event.target.value })}
                    onBlur={() => setTouchedUrl(true)}
                  />
                )}
              </Field>
            </div>
            {addressProblem ? (
              <p className="-mt-3 text-sm text-destructive" role="alert">
                {addressProblem}
              </p>
            ) : isPlainHttp(draft.url) ? (
              <p className="-mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                This address is not encrypted. Anyone on the way can read what is sent, such as
                email addresses of viewers. Fine inside your own network, not across the internet.
              </p>
            ) : null}
            {reference.targets === 'public' ? (
              <p className="-mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <Globe className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                This installation only sends to public addresses. Addresses inside a private network
                are refused.
              </p>
            ) : null}

            <section className="grid gap-3" aria-labelledby="webhook-events-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-0.5">
                  <h3 id="webhook-events-heading" className="text-sm font-medium">
                    What it is told about
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {draft.everything
                      ? 'All events, also those that later versions add.'
                      : draft.events.size === 0
                        ? 'Choose the events this system needs.'
                        : `${draft.events.size} of ${reference.events.length} events`}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.everything}
                    onCheckedChange={(everything) => set({ everything })}
                  />
                  Everything
                </label>
              </div>

              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
                <div
                  className={cn(
                    'grid gap-3 transition-opacity',
                    draft.everything && 'pointer-events-none opacity-50',
                  )}
                  aria-disabled={draft.everything}
                >
                  {groups.map((group) => {
                    const state = draft.everything ? true : groupState(group, draft.events);
                    return (
                      <fieldset key={group.name} className="overflow-hidden rounded-lg border">
                        <legend className="sr-only">{group.name}</legend>
                        <label className="flex items-center gap-2.5 border-b bg-muted/50 px-3 py-2 text-[13px] font-medium">
                          <Checkbox
                            checked={state}
                            disabled={draft.everything}
                            onCheckedChange={() =>
                              set({ events: toggleGroup(group, draft.events) })
                            }
                            aria-label={`All of ${group.name}`}
                          />
                          {group.name}
                        </label>
                        <div className="divide-y">
                          {group.events.map((event) => {
                            const checked = draft.everything || draft.events.has(event.name);
                            return (
                              <label
                                key={event.name}
                                className={cn(
                                  'flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/60',
                                  example?.name === event.name && 'bg-accent/40',
                                )}
                                onMouseEnter={() => setShown(event.name)}
                              >
                                <Checkbox
                                  className="mt-0.5"
                                  checked={checked}
                                  disabled={draft.everything}
                                  onCheckedChange={() => toggle(event.name)}
                                  onFocus={() => setShown(event.name)}
                                />
                                <span className="grid min-w-0 gap-0.5">
                                  <span className="text-sm">{event.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {event.description}
                                  </span>
                                  <code className="font-mono text-[11px] text-muted-foreground">
                                    {event.name}
                                  </code>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>

                {example ? (
                  <aside className="grid gap-2 md:sticky md:top-0" aria-live="polite">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Info className="size-3.5" aria-hidden="true" />
                      What is sent for{' '}
                      <code className="font-mono text-foreground">{example.name}</code>
                    </p>
                    <JsonView
                      label={`Example of ${example.name}`}
                      value={{
                        id: '0193a5d3-1f20-7a55-8c1b-6d2e9f0a4b17',
                        event: example.name,
                        createdAt: '2026-01-15T09:30:00.000Z',
                        data: example.sample,
                      }}
                    />
                  </aside>
                ) : null}
              </div>
            </section>
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            {problem && (draft.name || draft.url) ? (
              <p className="mr-auto text-sm text-muted-foreground">{problem}</p>
            ) : null}
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={problem !== null}
            >
              {webhook ? 'Save changes' : 'Create webhook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shows a signing secret once. It does not close by a click outside, so it is not lost by accident. */
export function WebhookSecretDialog({
  webhook,
  replaced,
  onClose,
}: {
  webhook: WebhookWithSecret | null;
  /** Whether this secret took the place of an older one. */
  replaced: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={webhook !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={replaced ? 'New signing secret' : `"${webhook?.name ?? ''}" is ready`}
        description={
          replaced
            ? 'Requests are signed with this secret from now on. The old one no longer works.'
            : 'Every request is signed with this secret, so the receiver can tell it is from here.'
        }
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogBody>
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            Copy the secret now and store it with the receiving system. This is the only time it is
            shown.
          </p>
          {webhook ? <SecretValue secret={webhook.secret} /> : null}
          <p className="text-sm text-muted-foreground">
            How the receiver checks a signature is on the Setup tab of the webhook, with code to
            copy.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            I have stored it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretValue({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // The clipboard can be blocked. The secret stays visible to copy by hand.
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-2 pl-3">
      <code
        className="min-w-0 flex-1 font-mono text-[13px] break-all select-all"
        data-testid="webhook-secret"
      >
        {secret}
      </code>
      <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
    </div>
  );
}
