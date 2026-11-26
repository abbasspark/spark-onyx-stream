// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useState } from 'react';
import { Home, type Opening } from '@/screens/home';
import { Player } from '@/screens/player';
import { Profiles } from '@/screens/profiles';
import { SignIn } from '@/screens/sign-in';
import { type Playing, Title } from '@/screens/title';
import { token, whenSignedOut } from '@/lib/api';
import { chosenProfile, forgetProfile } from '@/lib/profiles';
import { detectPlatform, exitApp } from '@/lib/platform';
import { useRemote } from '@/lib/remote';

type Screen =
  { kind: 'home' } | { kind: 'title'; slug: string } | { kind: 'player'; playing: Playing };

const platform = detectPlatform(navigator.userAgent);

/**
 * The app is a short stack of screens: the home screen at the bottom, a title
 * on top of it, the player on top of that. Back takes the top one away, and
 * from the home screen leaves the app.
 */
export function App() {
  const [signedIn, setSignedIn] = useState(token() !== null);
  const [profile, setProfile] = useState(chosenProfile());
  const [stack, setStack] = useState<Screen[]>([{ kind: 'home' }]);

  whenSignedOut(() => {
    setSignedIn(false);
    setProfile(null);
    setStack([{ kind: 'home' }]);
  });

  const push = useCallback((screen: Screen) => setStack((now) => [...now, screen]), []);
  const pop = useCallback(() => {
    setStack((now) => (now.length > 1 ? now.slice(0, -1) : now));
  }, []);

  const switchProfile = useCallback(() => {
    forgetProfile();
    setProfile(null);
    setStack([{ kind: 'home' }]);
  }, []);

  useRemote((key) => {
    if (key !== 'back' || !signedIn) {
      return false;
    }
    if (stack.length > 1) {
      pop();
    } else {
      exitApp(platform);
    }
    return true;
  });

  if (!signedIn) {
    return (
      <SignIn
        onSignedIn={() => {
          setProfile(chosenProfile());
          setSignedIn(true);
        }}
      />
    );
  }
  if (!profile) {
    return <Profiles onChosen={(chosen) => setProfile({ id: chosen.id, name: chosen.name })} />;
  }

  const top = stack[stack.length - 1] as Screen;
  switch (top.kind) {
    case 'title':
      return (
        <Title
          key={top.slug}
          slug={top.slug}
          onPlay={(playing) => push({ kind: 'player', playing })}
        />
      );
    case 'player':
      return <Player playing={top.playing} onBack={pop} />;
    default:
      return (
        <Home
          profileName={profile.name}
          onSwitchProfile={switchProfile}
          onOpen={(opening: Opening) => push({ kind: 'title', slug: opening.slug })}
        />
      );
  }
}
