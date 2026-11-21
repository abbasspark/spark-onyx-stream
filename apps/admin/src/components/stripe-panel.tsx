// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  PlugZap,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { API_ORIGIN } from '@/api/client';
import { billingApi } from '@/api/endpoints';
import type { BillingOverview, StripeAccount, StripeEvent, StripeStatus } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, ErrorNote, Skeleton } from '@/components/ui/display';
import { describeEventType, webhookUrl } from '@/lib/billing';
import { formatDateTime, formatRelative } from '@/lib/format';

const EVENT_TONE = { handled: 'success', failed: 'danger', pending: 'warning' } as const;
const EVENT_LABEL = { handled: 'Handled', failed: 'Failed', pending: 'In progress' } as const;

/** How online payment is set up: connected to Stripe or not, and what Stripe last said. */
export function StripePanel({ overview }: { overview: BillingOverview }) {
  if (!overview.stripe) {
    return <NotConnected contactUrl={overview.contactUrl} />;
  }
  return <Connected status={overview.stripe} currency={overview.currency} />;
}

function NotConnected({ contactUrl }: { contactUrl: string | null }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
      <CreditCard className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Online payment is not connected</p>
        <p className="mt-1 text-muted-foreground">
          Viewers see the plans and their prices, and cannot pay on the site yet. You give access by
          hand: open a viewer on the{' '}
          <Link to="/viewers" className="underline underline-offset-4">
            Viewers
          </Link>{' '}
          page and choose "Grant access".{' '}
          {contactUrl
            ? 'The page of plans sends viewers to the contact address you set.'
            : 'Set BILLING_CONTACT_URL to tell viewers where to ask for a subscription.'}
        </p>
        <p className="mt-2 text-muted-foreground">
          To take payments, create a Stripe account and set <code>STRIPE_SECRET_KEY</code>,{' '}
          <code>STRIPE_WEBHOOK_SECRET</code> and <code>SITE_URL</code> in the settings of the
          installation, then restart it. The steps are in <code>docs/phase-3-billing.md</code>.
        </p>
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copying is blocked by the browser. Select the text and copy it by hand.');
    }
  };
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs select-all">
          {value}
        </code>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

function AccountResult({ account, currency }: { account: StripeAccount; currency: string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-success/25 bg-success/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        The key works: {account.name ?? account.id}
      </p>
      <p className="text-muted-foreground">
        Account {account.id}
        {account.country ? `, ${account.country}` : ''}
        {account.defaultCurrency ? `, pays out in ${account.defaultCurrency}` : ''}.
      </p>
      {account.chargesEnabled ? null : (
        <p className="flex items-start gap-2 text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This account cannot take payments yet. Finish setting it up in Stripe.
        </p>
      )}
      {account.currencyMismatch ? (
        <p className="flex items-start gap-2 text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Prices here are in {currency}, and the account pays out in {account.defaultCurrency}.
          Stripe converts each payment and charges for it.
        </p>
      ) : null}
    </div>
  );
}

function Events() {
  const events = useQuery({
    queryKey: ['billing', 'stripe-events'],
    queryFn: ({ signal }) => billingApi.stripeEvents(signal),
  });
  if (events.isPending) {
    return <Skeleton className="h-24 rounded-lg" />;
  }
  if (events.error) {
    return <ErrorNote error={events.error} />;
  }
  if (events.data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Nothing has arrived from Stripe yet. Messages are kept here for 30 days.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {events.data.map((event: StripeEvent) => (
        <li key={event.id} className="grid gap-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {describeEventType(event.type)}
              <Badge tone={EVENT_TONE[event.state]}>{EVENT_LABEL[event.state]}</Badge>
            </span>
            <span
              className="text-xs text-muted-foreground"
              title={formatDateTime(event.receivedAt)}
            >
              {formatRelative(event.receivedAt)}
            </span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{event.id}</span>
          {event.error ? <span className="text-xs text-destructive">{event.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Connected({ status, currency }: { status: StripeStatus; currency: string }) {
  const [showEvents, setShowEvents] = useState(false);
  const check = useMutation({ mutationFn: () => billingApi.checkStripe() });
  const endpoint = webhookUrl(API_ORIGIN, window.location.origin, status.webhookPath);
  const dashboard = `https://dashboard.stripe.com/${status.livemode ? '' : 'test/'}`;
  // Stripe cannot reach an address that only this computer knows.
  const local = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(endpoint);

  return (
    <Card>
      <CardHeader
        title={
          <>
            Online payment
            <Badge tone={status.livemode ? 'success' : 'warning'} dot>
              {status.livemode ? 'Live' : 'Test mode'}
            </Badge>
          </>
        }
        description={
          status.livemode
            ? 'Viewers pay on a page of Stripe. Renewals, cancellations and failed payments arrive here by themselves.'
            : 'Connected with a test key: the whole flow works, and no money moves. Pay with the card number 4242 4242 4242 4242.'
        }
        actions={
          <>
            <Button size="sm" loading={check.isPending} onClick={() => check.mutate()}>
              <PlugZap />
              Check connection
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={dashboard} target="_blank" rel="noreferrer">
                Stripe
                <ExternalLink />
              </a>
            </Button>
          </>
        }
      />
      <CardContent className="grid gap-5 p-5">
        {check.data ? <AccountResult account={check.data} currency={currency} /> : null}
        {check.error ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {check.error.message}
          </p>
        ) : null}
        {status.failedEvents > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {status.failedEvents === 1
              ? '1 message from Stripe could not be handled in the last day.'
              : `${status.failedEvents} messages from Stripe could not be handled in the last day.`}{' '}
            Stripe sends them again by itself. The list below says what went wrong.
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <CopyField label="Webhook endpoint, to enter at Stripe" value={endpoint} />
            {local ? (
              <p className="text-xs text-muted-foreground">
                Stripe cannot reach this computer. While testing here, let the Stripe CLI pass the
                messages on: <code>stripe listen --forward-to {endpoint}</code>
              </p>
            ) : null}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Events the endpoint listens to</p>
              <ul className="flex flex-wrap gap-1.5">
                {status.webhookEvents.map((event) => (
                  <li key={event}>
                    <code className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {event}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <dl className="grid content-start gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Last message from Stripe</dt>
              <dd className="mt-0.5">
                {status.lastEvent ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {describeEventType(status.lastEvent.type)}
                    <Badge tone={EVENT_TONE[status.lastEvent.state]}>
                      {EVENT_LABEL[status.lastEvent.state]}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatRelative(status.lastEvent.receivedAt)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    None yet. If viewers have paid already, the endpoint at Stripe is missing or its
                    secret is not the one set here.
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Viewers return to</dt>
              <dd className="mt-0.5 break-all">{status.siteUrl}/plans/thanks</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tax</dt>
              <dd className="mt-0.5">
                {status.automaticTax
                  ? 'Worked out by Stripe Tax. The prices of plans include it.'
                  : 'Not worked out here. Prices are charged as they are.'}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showEvents}
            onClick={() => setShowEvents((shown) => !shown)}
          >
            {showEvents ? 'Hide the messages from Stripe' : 'Show the messages from Stripe'}
          </Button>
          {showEvents ? (
            <div className="mt-3">
              <Events />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
