// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import {
  Bell,
  BellOff,
  Check,
  History,
  Loader2,
  LogOut,
  type LucideIcon,
  Mail,
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Tablet,
  Ticket,
  Tv,
  UsersRound,
} from 'lucide-react';
import { languageFromCookies } from '@/lib/language';
import {
  currentSubscription,
  disablePush,
  enablePush,
  type NotificationSettings,
  notificationsApi,
  type PushSupport,
  pushSupport,
  type Topic,
  TOPIC_LOOKS,
  TOPICS,
} from '@/lib/notifications';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  authHref,
  describeDevice,
  formatDay,
  type OwnPurchase,
  viewerApi,
  ViewerApiError,
  type ViewerDevice,
} from '@/lib/viewer-api';
import {
  describeEnd,
  describeOwned,
  describeRefund,
  formatDate,
  formatMoney,
  type OwnPayment,
  type OwnSubscription,
  type Plans,
} from '@/lib/plans';
import { type Profile, profilesApi } from '@/lib/profiles';
import { describeKind, type DeviceRef, devicesApi } from '@/lib/devices';
import { clearHistory } from '@/lib/watch-sync';
import { FormField } from './form-field';
import { ProfileAvatar } from './profile-avatar';
import {
  describePlaying,
  describeStreamDevice,
  devicesPhrase,
  type OwnStreams,
  streamsApi,
} from '@/lib/streams';
import { useViewerSession } from './viewer-session';

const MIN_PASSWORD_LENGTH = 8;

const DEVICE_ICONS: Record<string, LucideIcon> = {
  TV: Tv,
  MOBILE: Smartphone,
  TABLET: Tablet,
  DESKTOP: Monitor,
};

function asError(caught: unknown): ViewerApiError {
  return caught instanceof ViewerApiError
    ? caught
    : new ViewerApiError(0, 'Something went wrong. Try again in a moment.');
}

function Section({
  heading,
  id,
  children,
}: {
  heading: string;
  /** For a link that leads straight to the section. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-24 gap-x-12 gap-y-5 border-t border-line py-10 md:grid-cols-[14rem_minmax(0,28rem)]"
    >
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

/**
 * Which kinds of notification the account wants, and whether this browser
 * takes them. The kinds hold for the whole account, the switch for this
 * browser only.
 */
function NotificationsSection() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [support, setSupport] = useState<PushSupport>('unsupported');
  const [here, setHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    setSupport(pushSupport());
    notificationsApi
      .settings()
      .then(setSettings)
      .catch((caught) => setError(asError(caught).message));
    // What the server knows of this sign-in and what the browser holds can differ.
    void currentSubscription()
      .then((subscription) => setHere(subscription !== null && pushSupport() === 'allowed'))
      .catch(() => undefined);
  }, []);

  const toggle = async (topic: Topic, on: boolean) => {
    if (!settings) {
      return;
    }
    const before = settings;
    setSettings({ ...settings, topics: { ...settings.topics, [topic]: on } });
    try {
      setSettings(await notificationsApi.setTopics({ [topic]: on }));
      setError(null);
      setSavedAt(Date.now());
    } catch (caught) {
      setSettings(before);
      setError(asError(caught).message);
    }
  };

  const switchHere = async () => {
    setBusy(true);
    setError(null);
    try {
      if (here) {
        await disablePush();
        setHere(false);
      } else {
        const allowed = await enablePush(languageFromCookies(document.cookie));
        setHere(allowed);
        setSupport(pushSupport());
      }
      setSettings(await notificationsApi.settings());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : asError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section heading="Notifications" id="notifications">
      <p className="mb-5 text-smoke">
        What we tell you about. You find everything in the bell at the top, and on the devices you
        allow.
      </p>
      {settings ? (
        <ul className="mb-6 divide-y divide-line border-y border-line">
          {TOPICS.map((topic) => (
            <li key={topic}>
              <label className="flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-sard"
                  checked={settings.topics[topic]}
                  onChange={(event) => void toggle(topic, event.target.checked)}
                />
                <span>
                  <span className="block font-medium">{TOPIC_LOOKS[topic].label}</span>
                  <span className="block text-sm text-smoke">{TOPIC_LOOKS[topic].about}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : error ? null : (
        <p className="mb-6 text-smoke">One moment…</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {support === 'unsupported' ? (
          <p className="text-sm text-smoke">
            This browser cannot show notifications. On an iPhone or iPad, add this website to the
            home screen first.
          </p>
        ) : support === 'blocked' ? (
          <p className="text-sm text-smoke">
            Notifications are blocked for this website in your browser. Allow them in the
            browser&apos;s settings for this site, then come back.
          </p>
        ) : (
          <button
            type="button"
            className={here ? 'button button-quiet' : 'button button-play'}
            disabled={busy}
            onClick={() => void switchHere()}
          >
            {busy ? <Spinner /> : here ? <BellOff /> : <Bell />}
            {here ? 'Stop notifications in this browser' : 'Notify me in this browser'}
          </button>
        )}
        <Saved when={savedAt} />
      </div>
      {settings && settings.devices > 0 ? (
        <p className="mt-4 text-sm text-smoke">
          {settings.devices === 1
            ? 'One device of your account takes notifications.'
            : `${settings.devices} devices of your account take notifications.`}{' '}
          A device stops when you sign out on it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </Section>
  );
}

/** The viewer's own account: name, password, devices, and leaving. */
export function AccountScreen() {
  const router = useRouter();
  const { state, viewer, profile, restricted, access, setViewer, signOut } = useViewerSession();
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

  if (restricted) {
    // A profile with an age limit watches. The account is for the others.
    return (
      <div className="gutter grid min-h-[60dvh] content-center pt-28">
        <h1 className="display text-4xl sm:text-5xl">Account</h1>
        <p className="mt-5 max-w-prose text-lg text-smoke">
          {profile?.name ?? 'This profile'} has an age limit. The account, its payments and its
          devices are managed from a profile without one.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/profiles?next=/account" className="button button-play">
            Switch profile
          </Link>
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
        </div>
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
      <PurchasesSection />
      <PaymentsSection />
      <ProfilesSection />
      <NotificationsSection />
      <DevicesSection />
      <PlayingSection />
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

  /** The device whose name is being changed, with what is typed. */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming || !renaming.name.trim()) {
      return;
    }
    setBusyId(renaming.id);
    try {
      await devicesApi.rename(renaming.id, renaming.name);
      setRenaming(null);
      await load();
    } catch (caught) {
      setError(asError(caught).message);
    } finally {
      setBusyId(null);
    }
  };

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
          {devices.map((device) => {
            const app = device.device ?? null;
            const name = app?.name ?? describeDevice(device.userAgent);
            const Icon = app ? (DEVICE_ICONS[app.kind] ?? MonitorSmartphone) : MonitorSmartphone;
            const editing = app && renaming?.id === app.id ? renaming : null;
            return (
              <li key={device.id} className="flex items-center gap-4 border-b border-line py-4">
                <Icon className="size-5 shrink-0 text-smoke" aria-hidden="true" />
                {editing ? (
                  <form
                    onSubmit={(event) => void rename(event)}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  >
                    <input
                      className="input h-10 min-w-0 flex-1"
                      aria-label={`New name for ${name}`}
                      autoFocus
                      required
                      maxLength={40}
                      value={editing.name}
                      onChange={(event) =>
                        setRenaming({ id: editing.id, name: event.target.value })
                      }
                    />
                    <button
                      type="submit"
                      className="text-sm text-vein underline underline-offset-4 disabled:opacity-50"
                      disabled={busyId === editing.id}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {name}
                        {device.current ? (
                          <span className="ml-2 rounded-[2px] bg-sard px-1.5 py-0.5 text-xs font-semibold text-onyx">
                            This device
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-smoke">
                        {app ? `${describeKind(app as DeviceRef)}. ` : ''}
                        Last used {formatDay(device.lastUsedAt)}, signed in{' '}
                        {formatDay(device.createdAt)}
                      </p>
                    </div>
                    {app ? (
                      <button
                        type="button"
                        className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
                        aria-label={`Rename ${name}`}
                        onClick={() => setRenaming({ id: app.id, name: app.name })}
                      >
                        Rename
                      </button>
                    ) : null}
                    {device.current ? null : (
                      <button
                        type="button"
                        className="text-sm text-smoke underline underline-offset-4 hover:text-vein disabled:opacity-50"
                        disabled={busyId === device.id}
                        aria-label={`Sign out ${name}`}
                        onClick={() => void signOutDevice(device)}
                      >
                        Sign out
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-5 text-smoke">
        A television shows a code instead of asking for your password.{' '}
        <Link href="/activate" className="text-vein underline underline-offset-4">
          Enter a code
        </Link>
      </p>
    </Section>
  );
}

/** What the devices of the account are playing right now, and how many may. */
function PlayingSection() {
  const [playing, setPlaying] = useState<OwnStreams | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlaying(await streamsApi.list());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
    // What plays changes without this page doing anything.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const stop = async (id: string) => {
    setBusyId(id);
    await streamsApi.stop(id);
    await load();
    setBusyId(null);
  };

  return (
    <Section heading="Playing now">
      <p className="mb-5 text-smoke">
        {playing?.limit
          ? `Your account plays ${devicesPhrase(playing.limit)} at the same time.`
          : 'What your account is playing right now.'}{' '}
        Stop a device to free its place. It stops within half a minute.
      </p>
      {failed ? (
        <p role="alert" className="mb-4 text-alarm">
          What is playing could not be loaded. Reload the page to try again.
        </p>
      ) : null}
      {playing === null && !failed ? <Spinner /> : null}
      {playing && playing.streams.length === 0 ? (
        <p className="border-y border-line py-4 text-smoke">Nothing is playing.</p>
      ) : null}
      {playing && playing.streams.length > 0 ? (
        <ul className="border-t border-line">
          {playing.streams.map((stream) => (
            <li key={stream.id} className="flex items-center gap-4 border-b border-line py-4">
              <MonitorSmartphone className="size-5 shrink-0 text-smoke" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {describePlaying(stream)}
                  {stream.here ? (
                    <span className="ml-2 rounded-[2px] bg-sard px-1.5 py-0.5 text-xs font-semibold text-onyx">
                      This device
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-smoke">
                  {describeStreamDevice(stream)}
                  {stream.profile ? `, ${stream.profile.name}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-smoke underline underline-offset-4 hover:text-vein disabled:opacity-50"
                disabled={busyId === stream.id}
                aria-label={`Stop ${describePlaying(stream).toLowerCase()}`}
                onClick={() => void stop(stream.id)}
              >
                Stop
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/** The plan the account watches through, if any. */
function SubscriptionSection() {
  const { entitled, opens } = useViewerSession();
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
  // A plan with chosen packages does not open everything.
  const what =
    opens && !opens.all ? 'the titles your plan includes' : 'every title that needs a subscription';

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
                ? `You cancelled. You can watch ${what} until ${formatDate(own.endsAt)}, and nothing more is charged.`
                : `You can watch ${what}, ${describeEnd(own)}.`}
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
          ) : own.endsAt ? (
            <>
              <Link href="/redeem" className="button button-quiet mt-5">
                <Ticket />
                {own.prepaid ? 'Add days with a code' : 'Enter a prepaid code'}
              </Link>
              <p className="mt-3 text-sm text-dust">
                {own.prepaid
                  ? 'Nothing renews by itself. A further code for the same plan adds its days to the end.'
                  : 'A code for the same plan adds its days to the end.'}
              </p>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="mb-5 text-smoke">
            You have no subscription. Titles marked with a lock need one.
          </p>
          <div className="flex flex-wrap gap-3">
            {plansOffered ? (
              <Link href="/plans" className="button button-quiet">
                See the plans
              </Link>
            ) : null}
            <Link href="/redeem" className="button button-quiet">
              <Ticket />
              Enter a prepaid code
            </Link>
          </div>
        </>
      )}
    </Section>
  );
}

/** The titles the viewer rented or bought. Not shown to someone who has none. */
function PurchasesSection() {
  const [items, setItems] = useState<OwnPurchase[]>([]);

  useEffect(() => {
    let current = true;
    viewerApi
      .purchases()
      .then((result) => {
        if (current) {
          setItems(result.items);
        }
      })
      .catch(() => {
        // A site whose API is older than renting has none to show.
      });
    return () => {
      current = false;
    };
  }, []);

  // What ran out is left out, unless nothing else is there to show.
  const valid = items.filter((item) => item.valid);
  const shown = valid.length > 0 ? valid : items.slice(0, 3);
  if (shown.length === 0) {
    return null;
  }

  return (
    <Section heading="Rented and bought">
      <ul className="divide-y divide-line border-y border-line">
        {shown.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className={item.valid ? '' : 'text-dust'}>{item.title.name}</p>
              <p className="mt-0.5 text-sm text-dust">
                {item.valid ? describeOwned(item) : 'The rental ran out.'}
              </p>
            </div>
            <Link
              href={item.valid ? `/watch/${item.title.slug}` : `/title/${item.title.slug}`}
              className="shrink-0 text-sm text-smoke underline underline-offset-4 hover:text-vein"
            >
              {item.valid ? 'Watch' : 'Rent again'}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** What the viewer paid, with the way to each invoice. Not shown to someone who never paid. */
/** " for Standard", " to rent Night Train", or nothing when it is not known. */
function paidFor(payment: OwnPayment): string {
  if (payment.kind === 'RENTAL' || payment.kind === 'PURCHASE') {
    return ` to ${payment.kind === 'RENTAL' ? 'rent' : 'buy'} ${payment.titleName ?? 'a title'}`;
  }
  return payment.planName ? ` for ${payment.planName}` : '';
}

function PaymentsSection() {
  const [payments, setPayments] = useState<OwnPayment[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let current = true;
    viewerApi
      .payments()
      .then((result) => {
        if (current) {
          setPayments(result.items);
        }
      })
      .catch(() => {
        // A site whose API is older than payments has none to show.
      });
    return () => {
      current = false;
    };
  }, []);

  if (payments.length === 0) {
    return null;
  }
  const shown = all ? payments : payments.slice(0, 4);

  return (
    <Section heading="Payments">
      <ul className="divide-y divide-line border-y border-line">
        {shown.map((payment) => {
          const refund = describeRefund(payment);
          return (
            <li key={payment.id} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p>
                  <span className={payment.status === 'REFUNDED' ? 'line-through opacity-60' : ''}>
                    {formatMoney(payment.amount, payment.currency)}
                  </span>
                  <span className="text-smoke">{paidFor(payment)}</span>
                </p>
                <p className="mt-0.5 text-sm text-dust">
                  {formatDate(payment.paidAt)}
                  {refund ? `, ${refund.charAt(0).toLowerCase()}${refund.slice(1)}` : ''}
                </p>
              </div>
              {payment.invoiceUrl ? (
                <a
                  href={payment.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-sm text-smoke underline underline-offset-4 hover:text-vein"
                >
                  Invoice<span className="sr-only"> {payment.invoiceNumber ?? ''}</span>
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {payments.length > shown.length ? (
        <button
          type="button"
          className="mt-4 text-sm text-smoke underline underline-offset-4 hover:text-vein"
          onClick={() => setAll(true)}
        >
          Show all {payments.length}
        </button>
      ) : null}
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
