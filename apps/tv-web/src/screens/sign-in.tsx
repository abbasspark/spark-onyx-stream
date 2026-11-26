// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Button, Message, Spinner } from '@/components/ui';
import { type DeviceCodeStart, api } from '@/lib/api';
import { rememberProfile } from '@/lib/profiles';
import { focusFirst } from '@/lib/remote';
import { storage } from '@/lib/storage';

type Step =
  | { kind: 'starting' }
  | { kind: 'waiting'; code: DeviceCodeStart }
  | { kind: 'trouble'; text: string };

/**
 * Signing in on a television: it shows a short code, and the viewer enters it
 * on a phone or a computer where typing is easy and the password manager is.
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let over = false;
    let timer: number | undefined;
    setStep({ kind: 'starting' });

    const fail = (text: string) => {
      if (!over) {
        setStep({ kind: 'trouble', text });
      }
    };

    api
      .startDeviceCode()
      .then((code) => {
        if (over) {
          return;
        }
        setStep({ kind: 'waiting', code });
        const expires = Date.now() + code.expiresIn * 1000;
        const ask = () => {
          if (over) {
            return;
          }
          if (Date.now() > expires) {
            fail('The code has run out.');
            return;
          }
          api
            .pollDeviceCode(code.deviceCode)
            .then((answer) => {
              if (over) {
                return;
              }
              if (answer.status === 'approved') {
                storage.set('token', answer.token);
                // A main profile with a PIN means the viewer has to choose before anything shows.
                if (!answer.chooseProfile) {
                  rememberProfile(answer.profile);
                }
                onSignedIn();
              } else if (answer.status === 'denied') {
                fail('The sign-in was turned down on the other device.');
              } else if (answer.status === 'expired') {
                fail('The code has run out.');
              } else {
                timer = window.setTimeout(ask, Math.max(2, code.interval) * 1000);
              }
            })
            .catch(() => {
              // A dropped connection is not the end of the code. Ask again.
              timer = window.setTimeout(ask, Math.max(2, code.interval) * 1000);
            });
        };
        timer = window.setTimeout(ask, Math.max(2, code.interval) * 1000);
      })
      .catch((error: Error) => fail(error.message));

    return () => {
      over = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [attempt, onSignedIn]);

  useEffect(() => {
    if (step.kind === 'trouble') {
      focusFirst();
    }
  }, [step.kind]);

  if (step.kind === 'starting') {
    return <Spinner label="Getting a code" />;
  }
  if (step.kind === 'trouble') {
    return (
      <Message title="Could not sign in">
        {step.text}
        <span className="actions">
          <Button primary autoFocus onClick={() => setAttempt((n) => n + 1)}>
            Get a new code
          </Button>
        </span>
      </Message>
    );
  }
  return (
    <div className="sign-in">
      <h1>Sign in on your phone or computer</h1>
      <p className="lead">
        Open <strong>{step.code.verificationUrl}</strong> and enter this code.
      </p>
      <div className="code" aria-label={`Code ${step.code.userCode}`}>
        {step.code.userCode}
      </div>
      <p className="hint">This screen goes on by itself once you have signed in.</p>
    </div>
  );
}
