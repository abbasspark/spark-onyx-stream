// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Button, Message, Spinner } from '@/components/ui';
import { ApiError, type Profile, api } from '@/lib/api';
import { PIN_MAX, addDigit, isCompletePin, removeDigit } from '@/lib/pin';
import { colorOf, initialOf, onlyChoice, rememberProfile } from '@/lib/profiles';
import { focusFirst, useRemote } from '@/lib/remote';

type State =
  | { kind: 'loading' }
  | {
      kind: 'choosing';
      profiles: Profile[];
      asking: Profile | null;
      pin: string;
      trouble: string | null;
    }
  | { kind: 'trouble'; text: string };

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * "Who is watching?". Shown after signing in, and again when the viewer asks
 * to switch. A profile with a PIN asks for it on a pad made of buttons,
 * because a remote has no keyboard.
 */
export function Profiles({ onChosen }: { onChosen: (profile: Profile) => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);

  const take = (profile: Profile, pin: string | null) => {
    setWorking(true);
    api
      .selectProfile(profile.id, pin)
      .then((chosen) => {
        rememberProfile(chosen);
        onChosen(chosen);
      })
      .catch((error: Error) => {
        setWorking(false);
        // The server says how many tries are left, or how long the profile is closed.
        const text =
          error instanceof ApiError ? error.message : 'The service could not be reached.';
        setState((now) =>
          now.kind === 'choosing' ? { ...now, pin: '', trouble: text } : { kind: 'trouble', text },
        );
      });
  };

  useEffect(() => {
    let over = false;
    setState({ kind: 'loading' });
    api
      .profiles()
      .then((view) => {
        if (over) {
          return;
        }
        const only = onlyChoice(view.profiles);
        if (only) {
          take(only, null);
          return;
        }
        setState({
          kind: 'choosing',
          profiles: view.profiles,
          asking: null,
          pin: '',
          trouble: null,
        });
      })
      .catch((error: Error) => {
        if (!over) {
          setState({ kind: 'trouble', text: error.message });
        }
      });
    return () => {
      over = true;
    };
    // `take` only reads what is stable for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const asking = state.kind === 'choosing' ? state.asking : null;

  useEffect(() => {
    if (state.kind === 'trouble' || state.kind === 'choosing') {
      focusFirst();
    }
  }, [state.kind, asking?.id]);

  // Back closes the pad. With no pad open it is left to the app.
  useRemote((key) => {
    if (key === 'back' && asking) {
      setState((now) =>
        now.kind === 'choosing' ? { ...now, asking: null, pin: '', trouble: null } : now,
      );
      return true;
    }
    return false;
  });

  if (state.kind === 'loading' || working) {
    return <Spinner label="One moment" />;
  }
  if (state.kind === 'trouble') {
    return (
      <Message title="Could not load the profiles">
        {state.text}
        <span className="actions">
          <Button primary autoFocus onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </span>
      </Message>
    );
  }

  const { profiles, pin, trouble } = state;

  if (asking) {
    const press = (digit: string) =>
      setState({ ...state, pin: addDigit(pin, digit), trouble: null });
    return (
      <div className="who pin">
        <h1>PIN for {asking.name}</h1>
        <div className="dots" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: PIN_MAX }, (_, index) => (
            <span key={index} className={index < pin.length ? 'dot filled' : 'dot'} />
          ))}
        </div>
        <p className="trouble" role="alert">
          {trouble ?? ' '}
        </p>
        <div className="pad">
          {PAD.map((digit) => (
            <Button key={digit} autoFocus={digit === '5'} onClick={() => press(digit)}>
              {digit}
            </Button>
          ))}
          <Button onClick={() => setState({ ...state, pin: removeDigit(pin), trouble: null })}>
            Delete
          </Button>
          <Button onClick={() => press('0')}>0</Button>
          <Button
            primary
            onClick={() => {
              if (isCompletePin(pin)) {
                take(asking, pin);
              } else {
                setState({ ...state, trouble: 'A PIN has four to six digits.' });
              }
            }}
          >
            OK
          </Button>
        </div>
        <p className="hint">Back to choose someone else.</p>
      </div>
    );
  }

  return (
    <div className="who">
      <h1>Who is watching?</h1>
      <div className="people">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className="person"
            data-focus
            data-autofocus={profile.id === profiles[0]?.id ? '' : undefined}
            onClick={() =>
              profile.locked
                ? setState({ ...state, asking: profile, pin: '', trouble: null })
                : take(profile, null)
            }
          >
            <span
              className="face"
              style={{ background: colorOf(profile.color) }}
              aria-hidden="true"
            >
              {initialOf(profile.name)}
            </span>
            <span className="name">{profile.name}</span>
            {profile.locked ? <span className="lock">PIN</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
