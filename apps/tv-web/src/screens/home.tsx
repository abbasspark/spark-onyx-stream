// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Button, Card, ContinueCard, Message, Spinner } from '@/components/ui';
import { type Home as HomeData, type WatchingItem, api } from '@/lib/api';
import { focusFirst } from '@/lib/remote';

export interface Opening {
  slug: string;
  episodeId?: string;
}

/** The first screen: the viewer's started videos, then the rows of the site. */
export function Home({
  profileName,
  onSwitchProfile,
  onOpen,
}: {
  profileName: string;
  onSwitchProfile: () => void;
  onOpen: (opening: Opening) => void;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; home: HomeData; watching: WatchingItem[] }
    | { kind: 'trouble'; text: string }
  >({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let over = false;
    setState({ kind: 'loading' });
    Promise.all([api.home(), api.watching().catch(() => ({ items: [] as WatchingItem[] }))])
      .then(([home, watching]) => {
        if (!over) {
          setState({ kind: 'ready', home, watching: watching.items });
        }
      })
      .catch((error: Error) => {
        if (!over) {
          setState({ kind: 'trouble', text: error.message });
        }
      });
    return () => {
      over = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (state.kind !== 'loading') {
      focusFirst();
    }
  }, [state.kind]);

  if (state.kind === 'loading') {
    return <Spinner label="Loading" />;
  }
  if (state.kind === 'trouble') {
    return (
      <Message title="The catalog did not load">
        {state.text}
        <span className="actions">
          <Button primary autoFocus onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </span>
      </Message>
    );
  }

  const { home, watching } = state;
  // The rows the server fills for the viewer have no titles of their own here.
  const rows = home.rows.filter((row) => row.kind === 'titles' && row.titles.length > 0);
  let first = true;
  const claim = () => {
    const mine = first;
    first = false;
    return mine;
  };

  return (
    <div className="home">
      <div className="bar">
        <span className="who-am-i">{profileName}</span>
        <Button onClick={onSwitchProfile}>Switch profile</Button>
      </div>
      {watching.length > 0 ? (
        <section className="row">
          <h2>Continue watching</h2>
          <div className="cards">
            {watching.map((item) => (
              <ContinueCard
                key={item.id}
                item={item}
                autoFocus={claim()}
                onOpen={() => onOpen({ slug: item.title.slug })}
              />
            ))}
          </div>
        </section>
      ) : null}
      {rows.map((row) => (
        <section className="row" key={row.key}>
          <h2>{row.name}</h2>
          <div className="cards">
            {row.titles.map((title) => (
              <Card
                key={title.id}
                title={title}
                wide={row.layout === 'landscape'}
                autoFocus={claim()}
                onOpen={() => onOpen({ slug: title.slug })}
              />
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 && watching.length === 0 ? (
        <Message title="Nothing to watch yet">Titles appear here once they are published.</Message>
      ) : null}
    </div>
  );
}
