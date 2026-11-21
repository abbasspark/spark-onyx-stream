// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, History, Loader2, LogOut, Mail, MonitorSmartphone, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  authHref,
  describeDevice,
  formatDay,
  ViewerApiError,
  viewerApi,
  type ViewerDevice,
} from '@/lib/viewer-api';
import { describeEnd, formatDate, type OwnSubscription, type Plans } from '@/lib/plans';
import { type Profile, profilesApi } from '@/lib/profiles';
import { clearHistory } from '@/lib/watch-sync';
import { FormField } from './form-field';
import { ProfileAvatar } from './profile-avatar';
import { useViewerSession } from './viewer-session';

const MIN_PASSWORD_LENGTH = 8;

function asError(caught: unknown): ViewerApiError {
  return caught instanceof ViewerApiError
    ? caught
    : new ViewerApiError(0, 'Something went wrong. Try again in a moment.');
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-12 gap-y-5 border-t border-line py-10 md:grid-cols-[14rem_minmax(0,28rem)]">
      <h2 className="heading text-xl">{heading}</h2>
      <div>{children}</div>
    </section>
  );
}

function Spinner() {
  return <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />;
}

/** Confirms a change next to its button for a few seconds. */
function Saved({ when, label = 'Saved' }: { when: number; label?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (when === 0) {
      return;
    }
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), 4000);
    return () => window.clearTimeout(timer);
  }, [when]);
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm text-sard">
      {shown ? (
        <>
          <Check className="size-4" aria-hidden="true" />
          {label}
        </>
      ) : null}
    </span>
  );
}

/** The viewer's own account: name, password, devices, and leaving. */
export function AccountScreen() {
  const router = useRouter();
  const { state, viewer, access, setViewer, signOut } = useViewerSession();
  // Set when the viewer signs out or deletes the account here. They are then
  // on their way to the home page and must not be sent to sign in instead.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (state === 'ready' && !viewer && !leaving) {
      router.replace(authHref('sign-in', '/account'));
    }
  }, [state, viewer, leaving, router]);

  const leave = () => {
    setLeaving(true);
    router.replace('/');
  };

  if (!viewer) {
    return (
      <div className="gutter flex min-h-[60dvh] items-center pt-28" role="status">
        <Loader2 className="size-10 animate-[player-spin_0.9s_linear_infinite]" />
        <span className="sr-only">Loading your account</span>
      </div>
    );
  }

  return (
    <div className="gutter pt-28">
      <h1 className="display text-4xl sm:text-5xl">Account</h1>
      <p className="mt-4 mb-10 text-lg text-smoke">{viewer.displayName}</p>

      <EmailSection
        email={viewer.email}
        verified={viewer.emailVerified}
        canSend={access?.email ?? false}
        required={access?.verification === 'required'}
      />
      <NameSection name={viewer.displayName} onSaved={setViewer} />
      <PasswordSection />
      <SubscriptionSection />
      <ProfilesSection />
      <DevicesSection />
      <HistorySection />
      <Section heading="Sign out">
        <p className="mb-5 text-smoke">Signs you out on this device only.</p>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            leave();
            void signOut();
          }}
        >
          <LogOut />
          Sign out
        </button>
      </Section>
      <DeleteSection
        onDeleted={() => {
          leave();
          setViewer(null);
        }}
      />
    </div>
  );
}

/** The address of the account, and whether the viewer confirmed it. */
function EmailSection({
  email,
  verified,
  canSend,
  required,
}: {
  email: string;
  verified: boolean;
  canSend: boolean;
  required: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [sentAt, setSentAt] = useState(0);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await viewerApi.sendVerification();
      setSentAt(Date.now());
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section heading="Email">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="break-all">{email}</span>
        {verified ? (
          <span className="inline-flex items-center gap-1 text-sm text-sard">
            <Check className="size-4" aria-hidden="true" />
            Confirmed
          </span>
        ) : (
          <span className="rounded-[3px] border border-line px-2 py-0.5 text-xs text-smoke">
            Not confirmed
          </span>
        )}
      </p>
      {verified ? null : (
        <>
          <p className="mt-3 mb-5 text-smoke">
            {required
              ? 'Confirm your address to watch. '
              : 'Confirming shows that the address is yours, so a forgotten password can be replaced. '}
            {canSend
              ? 'We sent you an email with a link when you signed up.'
              : 'This site does not send email at the moment.'}
          </p>
          {canSend ? (
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => void send()}
              >
                {busy ? <Spinner /> : <Mail />}
                Send the email again
              </button>
              <Saved when={sentAt} label="Sent. Check your inbox" />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-alarm">
              {error.message}
            </p>
          ) : null}
        </>
      )}
    </Section>
  );
}

function NameSection({
  name,
  onSaved,
}: {
  name: string;
  onSaved: (viewer: Awaited<ReturnType<typeof viewerApi.rename>>) => void;
}) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await viewerApi.rename(value.trim()));
      setSavedAt(Date.now());
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section heading="Name">
      <form onSubmit={(event) => void submit(event)} className="grid gap-5">
        <FormField
          label="Name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={value}
          error={error?.fields.displayName ?? (error ? error.message : undefined)}
          onValue={setValue}
        />
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="button button-quiet"
            disabled={busy || !value.trim() || value.trim() === name}
          >
            {busy ? <Spinner /> : null}
            Save name
          </button>
          <Saved when={savedAt} />
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await viewerApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setSavedAt(Date.now());
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  const general = error && Object.keys(error.fields).length === 0 ? error.message : undefined;

  return (
    <Section heading="Password">
      <form onSubmit={(event) => void submit(event)} className="grid gap-5">
        <FormField
          label="Current password"
          type="password"
          name="current-password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={current}
          error={error?.fields.currentPassword ?? general}
          onValue={setCurrent}
        />
        <FormField
          label="New password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Your other devices are signed out.`}
          value={next}
          error={error?.fields.newPassword}
          onValue={setNext}
        />
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="button button-quiet"
            disabled={busy || !current || !next}
          >
            {busy ? <Spinner /> : null}
            Change password
          </button>
          <Saved when={savedAt} />
        </div>
      </form>
    </Section>
  );
}

function DevicesSection() {
  const [devices, setDevices] = useState<ViewerDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await viewerApi.devices());
      setError(null);
    } catch (caught) {
      setError(asError(caught).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOutDevice = async (device: ViewerDevice) => {
    setBusyId(device.id);
    try {
      await viewerApi.signOutDevice(device.id);
      await load();
    } catch (caught) {
      setError(asError(caught).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section heading="Devices">
      <p className="mb-5 text-smoke">
        Where you are signed in. Sign out a device you no longer use or do not recognize.
      </p>
      {error ? (
        <p role="alert" className="mb-4 text-alarm">
          {error}
        </p>
      ) : null}
      {devices === null && !error ? <Spinner /> : null}
      {devices ? (
        <ul className="border-t border-line">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center gap-4 border-b border-line py-4">
              <MonitorSmartphone className="size-5 shrink-0 text-smoke" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {describeDevice(device.userAgent)}
                  {device.current ? (
                    <span className="ml-2 rounded-[2px] bg-sard px-1.5 py-0.5 text-xs font-semibold text-onyx">
                      This device
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-smoke">
                  Last used {formatDay(device.lastUsedAt)}, signed in {formatDay(device.createdAt)}
                </p>
              </div>
              {device.current ? null : (
                <button
                  type="button"
                  className="text-sm text-smoke underline underline-offset-4 hover:text-vein disabled:opacity-50"
                  disabled={busyId === device.id}
                  aria-label={`Sign out ${describeDevice(device.userAgent)}`}
                  onClick={() => void signOutDevice(device)}
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/** The plan the account watches through, if any. */
function SubscriptionSection() {
  const { entitled } = useViewerSession();
  const [own, setOwn] = useState<OwnSubscription | null | undefined>(undefined);
  const [plansOffered, setPlansOffered] = useState(false);
  // Set while Stripe's page for the subscription is being opened.
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetch('/v1/catalog/plans', { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? (response.json() as Promise<Plans>) : null))
      .then((offer) => {
        if (current) {
          setPlansOffered((offer?.plans.length ?? 0) > 0);
        }
      })
      .catch(() => {
        // Without an answer no link to the plans is shown.
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    viewerApi
      .subscription()
      .then((result) => {
        if (current) {
          setOwn(result.subscription);
        }
      })
      .catch(() => {
        // A site whose API is older than plans has no subscriptions: nothing is shown.
        if (current) {
          setOwn(undefined);
        }
      });
    return () => {
      current = false;
    };
  }, [entitled]);

  // Nothing to say on a site that sells no plans, unless the viewer has one anyway.
  if (own === undefined || (own === null && !plansOffered)) {
    return null;
  }

  async function manage() {
    setOpening(true);
    setProblem(null);
    try {
      const { url } = await viewerApi.billingPortal();
      // The page is Stripe's. The button stays busy until the browser has left.
      window.location.assign(url);
    } catch (caught) {
      setOpening(false);
      setProblem(asError(caught).message);
    }
  }
  const failed = own?.status === 'PAST_DUE';

  return (
    <Section heading="Subscription">
      {own ? (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{own.plan.name}</span>
            {failed ? (
              <span className="text-sm text-alarm">Payment failed</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-sard">
                <Check className="size-4" aria-hidden="true" />
                {own.cancelAtPeriodEnd && own.online
                  ? 'Cancelled'
                  : own.status === 'TRIALING'
                    ? 'Free trial'
                    : 'Running'}
              </span>
            )}
          </p>
          <p className="mt-2 text-smoke">
            {failed
              ? 'The last payment did not go through. You can still watch while it is tried again. Check your card so your subscription does not end.'
              : own.cancelAtPeriodEnd && own.online && own.endsAt
                ? `You cancelled. You can watch every title that needs a subscription until ${formatDate(own.endsAt)}, and nothing more is charged.`
                : `You can watch every title that needs a subscription, ${describeEnd(own)}.`}
          </p>
          {own.online ? (
            <>
              <button
                type="button"
                className={`button mt-5 ${failed ? 'button-play' : 'button-quiet'}`}
                disabled={opening}
                aria-busy={opening}
                onClick={() => void manage()}
              >
                {opening ? <Spinner /> : null}
                {failed
                  ? 'Update your card'
                  : own.cancelAtPeriodEnd
                    ? 'Manage or resume'
                    : 'Manage subscription'}
              </button>
              <p className="mt-3 text-sm text-dust">
                Opens a page of Stripe: change the card, read your invoices, or cancel.
              </p>
              {problem ? (
                <p role="alert" className="mt-3 text-sm text-alarm">
                  {problem}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="mb-5 text-smoke">
            You have no subscription. Titles marked with a lock need one.
          </p>
          <Link href="/plans" className="button button-quiet">
            See the plans
          </Link>
        </>
      )}
    </Section>
  );
}

/** The people who share the account, and the way to the page that manages them. */
function ProfilesSection() {
  const { profile } = useViewerSession();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);

  useEffect(() => {
    let current = true;
    profilesApi
      .list()
      .then((result) => {
        if (current) {
          setProfiles(result.profiles);
        }
      })
      .catch(() => {
        // The link below still leads to them.
      });
    return () => {
      current = false;
    };
  }, [profile]);

  return (
    <Section heading="Profiles">
      <p className="mb-5 text-smoke">
        For everyone who watches on this account. Each profile has its own "Continue watching".
      </p>
      {profiles ? (
        <ul className="mb-6 flex flex-wrap gap-x-5 gap-y-3">
          {profiles.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5">
              <ProfileAvatar profile={item} className="size-9" />
              <span>{item.name}</span>
              {item.id === profile?.id ? (
                <span className="text-sm text-sard">in use here</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Link href="/profiles" className="button button-quiet">
        <UsersRound />
        Manage profiles
      </Link>
    </Section>
  );
}

/** What the profile in use remembers of what was watched, and forgetting it. */
function HistorySection() {
  const { profile } = useViewerSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [clearedAt, setClearedAt] = useState(0);

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearHistory();
      setOpen(false);
      setClearedAt(Date.now());
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section heading="Watch history">
      <p className="mb-5 text-smoke">
        Each profile remembers where it stopped and what it finished, so you can go on with a video
        on any device you sign in on. This is the history of{' '}
        <span className="text-vein">{profile?.name ?? 'your profile'}</span>.
      </p>
      {open ? (
        <div className="grid gap-4">
          <p>
            Clearing empties "Continue watching" and removes the "Watched" marks of{' '}
            {profile?.name ?? 'this profile'}, on all your devices. Other profiles keep theirs. This
            cannot be undone.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-alarm">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="button button-danger"
              disabled={busy}
              onClick={() => void clear()}
            >
              {busy ? <Spinner /> : null}
              Clear my watch history
            </button>
            <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="button button-quiet" onClick={() => setOpen(true)}>
            <History />
            Clear watch history
          </button>
          <Saved when={clearedAt} label="Cleared" />
        </div>
      )}
    </Section>
  );
}

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await viewerApi.deleteAccount(password);
      onDeleted();
    } catch (caught) {
      setError(asError(caught));
      setBusy(false);
    }
  };

  return (
    <Section heading="Delete account">
      <p className="mb-5 text-smoke">
        Deletes your account and everything stored about it. This cannot be undone.
      </p>
      {open ? (
        <form onSubmit={(event) => void submit(event)} className="grid gap-5">
          <FormField
            label="Your password, to confirm"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            maxLength={128}
            value={password}
            error={error?.fields.password ?? error?.message}
            onValue={setPassword}
          />
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="button button-danger" disabled={busy || !password}>
              {busy ? <Spinner /> : null}
              Delete my account
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setError(null);
              }}
            >
              Keep my account
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="button button-danger" onClick={() => setOpen(true)}>
          Delete account
        </button>
      )}
    </Section>
  );
}
