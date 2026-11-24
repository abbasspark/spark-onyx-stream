// SPDX-License-Identifier: AGPL-3.0-only
import type {
  Change,
  ChangeGroup,
  Ref,
  SnapshotCredit,
  SnapshotEpisode,
  SnapshotFields,
  SnapshotSeason,
  TitleSnapshot,
} from './title-snapshot.js';

interface FieldInfo {
  group: ChangeGroup;
  label: string;
  kind: 'text' | 'value';
  format?: Change['format'];
}

/** How each single-valued field is called and shown, in the order of the title's page. */
const FIELDS: Record<keyof SnapshotFields, FieldInfo> = {
  name: { group: 'texts', label: 'Name', kind: 'value' },
  originalName: { group: 'texts', label: 'Original name', kind: 'value' },
  tagline: { group: 'texts', label: 'Tagline', kind: 'text' },
  synopsis: { group: 'texts', label: 'Synopsis', kind: 'text' },
  releaseYear: { group: 'facts', label: 'Year', kind: 'value' },
  releaseDate: { group: 'facts', label: 'Release date', kind: 'value', format: 'date' },
  runtimeMinutes: { group: 'facts', label: 'Runtime in minutes', kind: 'value' },
  ageRating: { group: 'facts', label: 'Age rating', kind: 'value' },
  minAge: { group: 'facts', label: 'Suitable from age', kind: 'value' },
  originalLanguage: { group: 'facts', label: 'Original language', kind: 'value' },
  imdbId: { group: 'facts', label: 'IMDb id', kind: 'value' },
  seriesStatus: { group: 'facts', label: 'Running or ended', kind: 'value', format: 'status' },
  status: { group: 'publishing', label: 'Status', kind: 'value', format: 'status' },
  slug: { group: 'publishing', label: 'Address', kind: 'value' },
  isFeatured: { group: 'publishing', label: 'Featured', kind: 'value', format: 'yesno' },
  availableFrom: { group: 'publishing', label: 'Shown from', kind: 'value', format: 'datetime' },
  availableUntil: { group: 'publishing', label: 'Shown until', kind: 'value', format: 'datetime' },
  access: { group: 'access', label: 'Who may watch', kind: 'value', format: 'status' },
  purchaseOnly: {
    group: 'access',
    label: 'Only by renting or buying',
    kind: 'value',
    format: 'yesno',
  },
  rentAmount: { group: 'access', label: 'Rental price', kind: 'value', format: 'money' },
  buyAmount: { group: 'access', label: 'Purchase price', kind: 'value', format: 'money' },
};

const text = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

function valueChange(
  info: FieldInfo,
  field: string,
  before: unknown,
  after: unknown,
  label = info.label,
): Change | null {
  const [was, is] = [text(before), text(after)];
  if (was === is) {
    return null;
  }
  return {
    group: info.group,
    field,
    label,
    kind: info.kind,
    ...(info.format ? { format: info.format } : {}),
    before: was,
    after: is,
  };
}

/** What was added to and taken from a list of words, and whether only the order is new. */
function listChange(
  group: ChangeGroup,
  field: string,
  label: string,
  before: readonly string[],
  after: readonly string[],
  ordered = false,
): Change | null {
  const added = after.filter((item) => !before.includes(item));
  const removed = before.filter((item) => !after.includes(item));
  if (added.length === 0 && removed.length === 0) {
    const moved = ordered && before.some((item, index) => item !== after[index]);
    return moved ? { group, field, label, kind: 'list', added, removed, reordered: true } : null;
  }
  return { group, field, label, kind: 'list', added, removed };
}

/** The same for things kept by id: a renamed genre is not a genre taken away and another added. */
function refChange(
  group: ChangeGroup,
  field: string,
  label: string,
  before: readonly Ref[],
  after: readonly Ref[],
): Change | null {
  const added = after.filter((ref) => !before.some((old) => old.id === ref.id));
  const removed = before.filter((ref) => !after.some((now) => now.id === ref.id));
  if (added.length === 0 && removed.length === 0) {
    return null;
  }
  return {
    group,
    field,
    label,
    kind: 'list',
    added: added.map((ref) => ref.name),
    removed: removed.map((ref) => ref.name),
  };
}

const creditKey = (credit: SnapshotCredit) =>
  `${credit.personId}|${credit.kind}|${credit.role ?? ''}`;
const creditLine = (credit: SnapshotCredit) =>
  credit.role ? `${credit.name} (${credit.role})` : credit.name;

function creditChanges(before: SnapshotCredit[], after: SnapshotCredit[]): Change[] {
  return (['CAST', 'CREW'] as const).flatMap((kind) => {
    const was = before.filter((credit) => credit.kind === kind);
    const is = after.filter((credit) => credit.kind === kind);
    const added = is.filter((credit) => !was.some((old) => creditKey(old) === creditKey(credit)));
    const removed = was.filter((credit) => !is.some((now) => creditKey(now) === creditKey(credit)));
    const label = kind === 'CAST' ? 'Cast' : 'Crew';
    const field = kind === 'CAST' ? 'cast' : 'crew';
    if (added.length === 0 && removed.length === 0) {
      const moved = was.some(
        (credit, index) => creditKey(credit) !== creditKey(is[index] ?? credit),
      );
      return moved
        ? [{ group: 'people', field, label, kind: 'list', added: [], removed: [], reordered: true }]
        : [];
    }
    return [
      {
        group: 'people',
        field,
        label,
        kind: 'list',
        added: added.map(creditLine),
        removed: removed.map(creditLine),
      },
    ] satisfies Change[];
  });
}

const PICTURES = { poster: 'Poster', backdrop: 'Backdrop', logo: 'Logo' } as const;

function translationChanges(
  before: TitleSnapshot['translations'],
  after: TitleSnapshot['translations'],
): Change[] {
  const changes: Change[] = [];
  const languages = listChange(
    'translations',
    'languages',
    'Languages',
    Object.keys(before).sort(),
    Object.keys(after).sort(),
  );
  if (languages) {
    changes.push(languages);
  }
  for (const language of Object.keys(after).sort()) {
    const [was, is] = [before[language], after[language]];
    if (!was || !is) {
      continue;
    }
    for (const part of ['name', 'tagline', 'synopsis'] as const) {
      const change = valueChange(
        { group: 'translations', label: '', kind: part === 'name' ? 'value' : 'text' },
        `translation:${language}:${part}`,
        was[part],
        is[part],
        `${language}: ${part}`,
      );
      if (change) {
        changes.push(change);
      }
    }
  }
  return changes;
}

const episodeLine = (episode: SnapshotEpisode) => `${episode.number}. ${episode.name}`;
const seasonName = (season: SnapshotSeason) =>
  season.number === 0 ? 'Specials' : `Season ${season.number}`;

function seasonChanges(before: SnapshotSeason[], after: SnapshotSeason[]): Change[] {
  const changes: Change[] = [];
  const seasons = listChange(
    'episodes',
    'seasons',
    'Seasons',
    before.map(seasonName),
    after.map(seasonName),
  );
  if (seasons) {
    changes.push(seasons);
  }
  for (const season of after) {
    const old = before.find((entry) => entry.number === season.number);
    if (!old) {
      // A new season says how many episodes it came with, not each of them.
      if (season.episodes.length > 0) {
        changes.push({
          group: 'episodes',
          field: `season:${season.number}:episodes`,
          label: `${seasonName(season)}: episodes`,
          kind: 'list',
          added: season.episodes.map(episodeLine),
          removed: [],
        });
      }
      continue;
    }
    const prefix = `season:${season.number}`;
    for (const part of ['name', 'synopsis'] as const) {
      const change = valueChange(
        { group: 'episodes', label: '', kind: part === 'name' ? 'value' : 'text' },
        `${prefix}:${part}`,
        old[part],
        season[part],
        `${seasonName(season)}: ${part}`,
      );
      if (change) {
        changes.push(change);
      }
    }
    const added = season.episodes.filter(
      (episode) => !old.episodes.some((entry) => entry.number === episode.number),
    );
    const removed = old.episodes.filter(
      (episode) => !season.episodes.some((entry) => entry.number === episode.number),
    );
    if (added.length > 0 || removed.length > 0) {
      changes.push({
        group: 'episodes',
        field: `${prefix}:episodes`,
        label: `${seasonName(season)}: episodes`,
        kind: 'list',
        added: added.map(episodeLine),
        removed: removed.map(episodeLine),
      });
    }
    for (const episode of season.episodes) {
      const was = old.episodes.find((entry) => entry.number === episode.number);
      if (!was) {
        continue;
      }
      const where = `${seasonName(season)}, episode ${episode.number}`;
      const parts: [keyof SnapshotEpisode, FieldInfo][] = [
        ['name', { group: 'episodes', label: 'name', kind: 'value' }],
        ['synopsis', { group: 'episodes', label: 'synopsis', kind: 'text' }],
        ['status', { group: 'episodes', label: 'status', kind: 'value', format: 'status' }],
      ];
      for (const [part, info] of parts) {
        const change = valueChange(
          info,
          `${prefix}:episode:${episode.number}:${part}`,
          was[part],
          episode[part],
          `${where}: ${info.label}`,
        );
        if (change) {
          changes.push(change);
        }
      }
      if (was.assetId !== episode.assetId) {
        changes.push({
          group: 'episodes',
          field: `${prefix}:episode:${episode.number}:video`,
          label: `${where}: video`,
          kind: 'value',
          before: was.assetId ? 'A video' : null,
          after: episode.assetId ? (was.assetId ? 'Another video' : 'A video') : null,
        });
      }
    }
  }
  return changes;
}

/**
 * Everything that differs between two moments of a title, in the order of
 * its page: texts, facts, publishing, access, artwork, classification,
 * people, videos, translations, seasons and episodes.
 */
export function diffSnapshots(before: TitleSnapshot, after: TitleSnapshot): Change[] {
  const changes: Change[] = [];
  const push = (change: Change | null) => {
    if (change) {
      changes.push(change);
    }
  };

  for (const key of Object.keys(FIELDS) as (keyof SnapshotFields)[]) {
    // A field the older version was made without did not change: it was not there to change.
    if (before.fields[key] === undefined) {
      continue;
    }
    push(valueChange(FIELDS[key], key, before.fields[key], after.fields[key]));
  }
  push(listChange('facts', 'countries', 'Countries', before.countries, after.countries));
  push(listChange('facts', 'studios', 'Studios', before.studios, after.studios));
  push(refChange('access', 'packages', 'Packages', before.packages, after.packages));
  for (const key of Object.keys(PICTURES) as (keyof typeof PICTURES)[]) {
    if (before.images[key] !== after.images[key]) {
      changes.push({
        group: 'artwork',
        field: key,
        label: PICTURES[key],
        kind: 'value',
        format: 'picture',
        before: before.images[key],
        after: after.images[key],
      });
    }
  }
  push(refChange('classification', 'genres', 'Genres', before.genres, after.genres));
  push(
    refChange('classification', 'categories', 'Categories', before.categories, after.categories),
  );
  push(listChange('classification', 'keywords', 'Keywords', before.keywords, after.keywords));
  changes.push(...creditChanges(before.credits, after.credits));
  for (const [key, label] of [
    ['video', 'Video'],
    ['trailer', 'Trailer'],
  ] as const) {
    if (before[key]?.id !== after[key]?.id) {
      changes.push({
        group: 'videos',
        field: key,
        label,
        kind: 'value',
        before: before[key]?.name ?? null,
        after: after[key]?.name ?? null,
      });
    }
  }
  push(
    listChange(
      'videos',
      'extras',
      'Extras',
      before.extras.map((extra) => extra.name),
      after.extras.map((extra) => extra.name),
      true,
    ),
  );
  changes.push(...translationChanges(before.translations, after.translations));
  changes.push(...seasonChanges(before.seasons, after.seasons));
  return changes;
}

/** A short line for a list of revisions: "Synopsis, Genres and 3 more". */
export function summarize(changes: readonly Change[], total = changes.length): string {
  if (total === 0) {
    return 'Nothing changed';
  }
  const labels = [...new Set(changes.map((change) => change.label))];
  const shown = labels.slice(0, 2);
  const rest = total - shown.length;
  if (rest <= 0) {
    return shown.join(' and ');
  }
  return `${shown.join(', ')} and ${rest} more`;
}
