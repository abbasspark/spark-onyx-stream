// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, MailCheck, MailX, Send } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { mailApi } from '@/api/endpoints';
import type { MailStatus } from '@/api/types';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  Facts,
  PageHeader,
  Skeleton,
} from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { formatRelative } from '@/lib/format';
import { describeMailServer, ENV_EXAMPLE } from '@/lib/mail';

/** How the installation sends email, and a way to try it. */
export function EmailPage() {
  const { state, can } = useSession();
  const status = useQuery({
    queryKey: ['mail', 'status'],
    queryFn: ({ signal }) => mailApi.status(signal),
  });

  return (
    <>
      <PageHeader
        title="Email"
        description="Viewers get an email to confirm their address and to set a new password. The site sends them through your mail server."
      />
      <ErrorNote error={status.error} className="mb-4" />
      {status.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
      {status.data ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-6">
            <SetupCard status={status.data} />
            {status.data.enabled ? null : <HowToCard />}
          </div>
          <div className="grid gap-6">
            {status.data.enabled ? (
              <TestCard
                mayWrite={can('settings:write')}
                ownEmail={state.status === 'signedIn' ? state.me.email : ''}
              />
            ) : null}
            <WhatIsSentCard status={status.data} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function SetupCard({ status }: { status: MailStatus }) {
  const last = status.lastDelivery;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2.5">
            {status.enabled ? (
              <MailCheck className="size-5 text-success" aria-hidden="true" />
            ) : (
              <MailX className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
            {status.enabled ? 'Email is on' : 'Email is off'}
          </span>
        }
        description={
          status.enabled
            ? 'Set where the installation is configured. Changes apply after a restart.'
            : 'Nothing is sent. A viewer who forgets their password needs a new one from an admin, on the Viewers page.'
        }
      />
      {status.enabled && status.server ? (
        <CardContent className="grid gap-5">
          <Facts
            items={[
              ['Mail server', describeMailServer(status.server)],
              ['Signs in as', status.server.user ?? 'Nobody, the server asks for no sign-in'],
              ['Sender', status.from ?? ''],
              ['Site name in emails', status.siteName],
              ['Links lead to', status.siteUrl ?? ''],
              [
                'Confirmed address',
                status.verification === 'required'
                  ? 'Needed to watch, when playback needs a viewer'
                  : 'Not needed to watch',
              ],
            ]}
          />
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
              last?.error ? 'border-destructive/30 bg-destructive/5' : ''
            }`}
          >
            {last === null ? (
              <>
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-muted-foreground">
                  Nothing was sent since the API last started. Send a test email to see that the
                  mail server takes messages.
                </p>
              </>
            ) : last.error ? (
              <>
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-medium">
                    The last email could not be sent, {formatRelative(last.at)}
                  </p>
                  <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
                    {last.error}
                  </p>
                </div>
              </>
            ) : (
              <>
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <p>The mail server took the last email, {formatRelative(last.at)}.</p>
              </>
            )}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function HowToCard() {
  return (
    <Card>
      <CardHeader
        title="Turn email on"
        description="Add these lines to the .env file of the installation, with the details your mail provider gives you, and restart."
      />
      <CardContent className="grid gap-4">
        <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-xs leading-relaxed">
          {ENV_EXAMPLE}
        </pre>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <code className="font-mono">smtps://</code> is for port 465, where the connection is
            encrypted from the start. <code className="font-mono">smtp://</code> is for port 587 and
            25, where encryption starts after connecting.
          </li>
          <li>
            A user name or password with special characters such as{' '}
            <code className="font-mono">@</code> or <code className="font-mono">/</code> must be
            percent-encoded: <code className="font-mono">@</code> becomes{' '}
            <code className="font-mono">%40</code>.
          </li>
          <li>
            The sender must be an address your mail provider lets you send from, or the emails end
            in spam.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function TestCard({ mayWrite, ownEmail }: { mayWrite: boolean; ownEmail: string }) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState(ownEmail);
  useEffect(() => setTo((current) => current || ownEmail), [ownEmail]);

  const test = useMutation({
    mutationFn: () => mailApi.test(to.trim()),
    onSuccess: () => toast.success(`The mail server took the test email for ${to.trim()}`),
    // Either way the page shows what the mail server said last.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['mail', 'status'] }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    test.mutate();
  };

  return (
    <Card>
      <CardHeader
        title="Send a test email"
        description="Waits for the answer of the mail server, so a wrong password or host shows at once."
      />
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="To">
            {(id) => (
              <Input
                id={id}
                type="email"
                required
                maxLength={254}
                disabled={!mayWrite}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            )}
          </Field>
          <ErrorNote error={test.error} />
          {test.isSuccess ? (
            <p className="text-sm text-muted-foreground">
              Taken by the mail server. If it does not arrive within a few minutes, look in the spam
              folder and check the sender address with your mail provider.
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              variant="primary"
              loading={test.isPending}
              disabled={!mayWrite || !to.trim()}
            >
              <Send />
              Send test email
            </Button>
          </div>
          {mayWrite ? null : (
            <p className="text-xs text-muted-foreground">
              Your role can see this page and cannot send a test.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function WhatIsSentCard({ status }: { status: MailStatus }) {
  const mails: { name: string; when: string; lifetime: string | null }[] = [
    {
      name: 'Confirm your email address',
      when: 'After sign-up on the website, and when the viewer or an admin asks for it again.',
      lifetime: 'Link works for 3 days',
    },
    {
      name: 'Set a new password',
      when: 'When someone uses "Forgot your password?" with the address of an account, or an admin sends it.',
      lifetime: 'Link works for 1 hour',
    },
    {
      name: 'Your password was changed',
      when: 'After a new password was set with a link, so a viewer notices when it was not them.',
      lifetime: null,
    },
  ];
  return (
    <Card>
      <CardHeader
        title={status.enabled ? 'What viewers receive' : 'What viewers would receive'}
        description="A link works once. One viewer gets at most one email of a kind every two minutes."
      />
      <CardContent>
        <ul className="divide-y">
          {mails.map((mail) => (
            <li key={mail.name} className="py-3 first:pt-0 last:pb-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {mail.name}
                {mail.lifetime ? <Badge>{mail.lifetime}</Badge> : null}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{mail.when}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
