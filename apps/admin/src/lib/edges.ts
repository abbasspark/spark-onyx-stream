// SPDX-License-Identifier: AGPL-3.0-only
import type { BadgeTone } from '@/components/ui/display';
import type {
  EdgeSample,
  EdgeServer,
  EdgeStatus,
  EdgeTraffic,
  PurgeScope,
  TrafficRange,
} from '@/api/types';

export const EDGE_STATUS_LOOKS: Record<
  EdgeStatus,
  { label: string; tone: BadgeTone; live: boolean; explain: string }
> = {
  ONLINE: {
    label: 'Online',
    tone: 'success',
    live: true,
    explain: 'Connected and taking viewers.',
  },
  DISABLED: {
    label: 'Paused',
    tone: 'warning',
    live: false,
    explain: 'Connected, but switched off: it gets no new viewers.',
  },
  OFFLINE: {
    label: 'Offline',
    tone: 'danger',
    live: false,
    explain: 'The agent stopped reporting. Viewers are sent elsewhere.',
  },
  NEVER_CONNECTED: {
    label: 'Waiting for the agent',
    tone: 'neutral',
    live: false,
    explain: 'No agent has connected with the token of this edge yet.',
  },
};

/** What all edges together do at this moment. */
export interface EdgeSummary {
  total: number;
  online: number;
  bitsPerSecond: number;
  requestsPerSecond: number;
  activeRequests: number;
  /** Share of requests answered from copies, weighted by traffic. Null without traffic. */
  hitRatio: number | null;
  bytesServed: number;
}

export function summarize(edges: readonly EdgeServer[]): EdgeSummary {
  const connected = edges.filter((edge) => edge.now !== null);
  const requests = connected.reduce((sum, edge) => sum + (edge.now?.requestsPerSecond ?? 0), 0);
  const withRatio = connected.filter((edge) => edge.now?.hitRatio != null);
  // An idle edge has a ratio too. Counting each edge at least a little keeps it in the picture.
  const weightOf = (edge: EdgeServer) => (edge.now?.requestsPerSecond ?? 0) + 0.01;
  const weights = withRatio.reduce((sum, edge) => sum + weightOf(edge), 0);

  return {
    total: edges.length,
    online: edges.filter((edge) => edge.status === 'ONLINE').length,
    bitsPerSecond: connected.reduce((sum, edge) => sum + (edge.now?.bitsPerSecond ?? 0), 0),
    requestsPerSecond: Math.round(requests * 10) / 10,
    activeRequests: connected.reduce((sum, edge) => sum + (edge.now?.activeRequests ?? 0), 0),
    hitRatio:
      withRatio.length === 0
        ? null
        : withRatio.reduce((sum, edge) => sum + (edge.now?.hitRatio ?? 0) * weightOf(edge), 0) /
          weights,
    bytesServed: edges.reduce((sum, edge) => sum + Number(edge.bytesServed), 0),
  };
}

/** "87%", or a dash when there is nothing to say. */
export function formatRatio(ratio: number | null | undefined): string {
  return ratio == null ? '–' : `${Math.round(ratio * 100)}%`;
}

/** Load of the machine as a share of its processors, 0 to 100 and beyond. Null when unknown. */
export function loadPercent(now: EdgeServer['now']): number | null {
  if (!now || now.system.load1 === null || now.system.cpus <= 0) {
    return null;
  }
  return Math.round((now.system.load1 / now.system.cpus) * 100);
}

/** Share of the cache that is filled, 0 to 100. */
export function cachePercent(now: EdgeServer['now']): number {
  if (!now || now.cache.limitBytes <= 0) {
    return 0;
  }
  return Math.min(100, (now.cache.bytes / now.cache.limitBytes) * 100);
}

/** What stands out as wrong with an edge that is connected. Null when nothing does. */
export function concernOf(edge: EdgeServer): string | null {
  const { now } = edge;
  if (!now) {
    return null;
  }
  const load = loadPercent(now);
  if (load !== null && load >= 150) {
    return 'The machine is overloaded.';
  }
  const { diskFreeBytes, diskTotalBytes } = now.system;
  if (diskFreeBytes !== null && diskTotalBytes && diskFreeBytes / diskTotalBytes < 0.05) {
    return 'The disk is almost full.';
  }
  if (edge.publicUrl.startsWith('http://')) {
    return 'Served without HTTPS: browsers refuse it on a site that uses HTTPS.';
  }
  return null;
}

export interface ChartShape {
  /** Outline of the filled area, as an SVG path in a box of the given size. */
  area: string;
  /** The line on top of it. */
  line: string;
  /** The highest value, which touches the top. */
  peak: number;
}

/**
 * Turns the traffic history into a chart of the last hour. Time runs along
 * the width by the clock, so a gap while the agent was away shows as a gap.
 */
export function chartOf(
  samples: readonly EdgeSample[],
  width: number,
  height: number,
  nowSeconds: number,
  spanSeconds = 3600,
): ChartShape | null {
  const from = nowSeconds - spanSeconds;
  const points = samples.filter(([at]) => at >= from);
  if (points.length < 2) {
    return null;
  }
  const peak = Math.max(1, ...points.map(([, bits]) => bits));
  const x = (at: number) => round(((at - from) / spanSeconds) * width);
  const y = (bits: number) => round(height - (bits / peak) * (height - 2) - 1);

  // Reports come every ten seconds. A longer silence breaks the line.
  const runs: EdgeSample[][] = [];
  for (const point of points) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run && last && point[0] - last[0] <= 45) {
      run.push(point);
    } else {
      runs.push([point]);
    }
  }

  let line = '';
  let area = '';
  for (const run of runs) {
    const first = run[0] as EdgeSample;
    const last = run.at(-1) as EdgeSample;
    const path = run.map(([at, bits], index) => `${index === 0 ? 'M' : 'L'}${x(at)} ${y(bits)}`);
    line += path.join('');
    area += `${path.join('')}L${x(last[0])} ${height}L${x(first[0])} ${height}Z`;
  }
  return { area, line, peak };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** The settings of an agent, as lines of an environment file. */
export function agentEnvironment(originUrl: string, token: string): string {
  return [
    `ONYX_ORIGIN_URL=${originUrl}`,
    `ONYX_EDGE_TOKEN=${token}`,
    'ONYX_EDGE_CACHE_DIR=/var/lib/onyx-edge',
    'ONYX_EDGE_CACHE_SIZE=50GB',
  ].join('\n');
}

/** The same as a Docker command, for an image built from services/edge-agent. */
export function agentDockerCommand(originUrl: string, token: string): string {
  return [
    'docker run -d --name onyx-edge --restart unless-stopped \\',
    '  -p 8080:8080 -v onyx-edge-cache:/var/lib/onyx-edge \\',
    `  -e ONYX_ORIGIN_URL=${originUrl} \\`,
    `  -e ONYX_EDGE_TOKEN=${token} \\`,
    '  -e ONYX_EDGE_CACHE_SIZE=50GB \\',
    '  onyx-edge-agent',
  ].join('\n');
}

/** What an address of an edge is missing, or null when it is fine. */
export function publicUrlProblem(value: string): string | null {
  const text = value.trim().replace(/\/+$/, '');
  if (text === '') {
    return null;
  }
  return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(text)
    ? null
    : 'Write it like https://edge1.example.com, without a path.';
}

export const PURGE_CHOICES: { value: PurgeScope; label: string; explain: string }[] = [
  {
    value: 'all',
    label: 'Everything',
    explain: 'All copies. The edge starts empty and fetches again what viewers ask for.',
  },
  {
    value: 'video',
    label: 'Films and episodes',
    explain: 'Copies of video on demand. Live channels are not touched.',
  },
  {
    value: 'live',
    label: 'Live channels',
    explain: 'Segments of live channels, also those kept for going back in time.',
  },
];

export const TRAFFIC_RANGES: { value: TrafficRange; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

/** How many edges get a colour of their own in the history. The rest are shown together. */
export const MAX_CHART_SERIES = 7;
export const OTHER_SERIES = 'other';

export interface TrafficSeries {
  /** Id of the edge, or OTHER_SERIES for the rest taken together. */
  id: string;
  name: string;
  /** Position in the colour order. It belongs to the edge and does not move with the figures. */
  slot: number;
  bytes: number;
}

export interface TrafficBucket {
  /** Start of the hour or the day, in milliseconds. */
  start: number;
  /** For the axis: "14:00" or "Nov 22". */
  label: string;
  /** For the tooltip: "Nov 22, 14:00 to 15:00" or "Sunday, Nov 22". */
  title: string;
  bytes: number;
  requests: number;
  hits: number;
  misses: number;
  /** Bytes per series, in the order of the series. */
  parts: number[];
}

export interface TrafficChart {
  series: TrafficSeries[];
  buckets: TrafficBucket[];
  /** The highest bucket, for the scale. */
  peak: number;
  bytes: number;
  requests: number;
  /** Share answered from copies over the whole range. Null without requests. */
  hitRatio: number | null;
}

/**
 * Turns the hours of the API into the bars of the history: one per hour for a
 * day, one per day (of this computer's time zone) for longer ranges.
 *
 * Edges get their colour by the order they were added in, so an edge keeps
 * its colour when others come and go or deliver more.
 */
export function trafficChartOf(traffic: EdgeTraffic, now: number = Date.now()): TrafficChart {
  const daily = traffic.range !== '24h';
  const startOf = (at: number) => {
    const date = new Date(at);
    return daily
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      : Math.floor(at / 3_600_000) * 3_600_000;
  };

  // Ids are made in the order of time, so sorting by id is sorting by age.
  const byAge = [...traffic.edges].sort((a, b) => a.id.localeCompare(b.id));
  const own = byAge.slice(0, MAX_CHART_SERIES);
  const rest = byAge.slice(MAX_CHART_SERIES);
  const series: TrafficSeries[] = own.map((edge, slot) => ({
    id: edge.id,
    name: edge.name,
    slot,
    bytes: 0,
  }));
  if (rest.length > 0) {
    series.push({
      id: OTHER_SERIES,
      name: `${rest.length} more`,
      slot: MAX_CHART_SERIES,
      bytes: 0,
    });
  }
  const seriesIndex = new Map<string, number>(own.map((edge, index) => [edge.id, index]));
  for (const edge of rest) {
    seriesIndex.set(edge.id, MAX_CHART_SERIES);
  }

  const buckets: TrafficBucket[] = [];
  const bucketAt = new Map<number, TrafficBucket>();
  const first = startOf(new Date(traffic.from).getTime());
  for (let start = first; start <= now; start = nextStart(start, daily)) {
    const bucket: TrafficBucket = {
      start,
      label: bucketLabel(start, daily),
      title: bucketTitle(start, daily),
      bytes: 0,
      requests: 0,
      hits: 0,
      misses: 0,
      parts: series.map(() => 0),
    };
    buckets.push(bucket);
    bucketAt.set(start, bucket);
  }

  for (const edge of traffic.edges) {
    const index = seriesIndex.get(edge.id) as number;
    for (const [seconds, bytes, requests, hits, misses] of edge.points) {
      const bucket = bucketAt.get(startOf(seconds * 1000));
      if (!bucket) {
        continue;
      }
      bucket.bytes += bytes;
      bucket.requests += requests;
      bucket.hits += hits;
      bucket.misses += misses;
      bucket.parts[index] = (bucket.parts[index] ?? 0) + bytes;
      (series[index] as TrafficSeries).bytes += bytes;
    }
  }

  const sum = (pick: (bucket: TrafficBucket) => number) =>
    buckets.reduce((total, bucket) => total + pick(bucket), 0);
  const answered = sum((bucket) => bucket.hits + bucket.misses);
  return {
    series,
    buckets,
    peak: Math.max(0, ...buckets.map((bucket) => bucket.bytes)),
    bytes: sum((bucket) => bucket.bytes),
    requests: sum((bucket) => bucket.requests),
    hitRatio: answered > 0 ? sum((bucket) => bucket.hits) / answered : null,
  };
}

function nextStart(start: number, daily: boolean): number {
  if (!daily) {
    return start + 3_600_000;
  }
  // By the calendar, so a day with a clock change is still one bar.
  const date = new Date(start);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

function bucketLabel(start: number, daily: boolean): string {
  const date = new Date(start);
  return daily
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function bucketTitle(start: number, daily: boolean): string {
  const date = new Date(start);
  if (daily) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  const clock = (value: Date) =>
    value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${clock(date)} to ${clock(new Date(start + 3_600_000))}`;
}

const STEPS = [
  1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1024,
];

/**
 * A round number at or above the peak for the top of the scale, in bytes,
 * that reads well in the unit the peak is shown in.
 */
export function niceCeiling(peak: number): number {
  if (peak <= 0) {
    return 1024 * 1024;
  }
  const unit = 1024 ** Math.floor(Math.log(peak) / Math.log(1024));
  const inUnit = peak / unit;
  const step = STEPS.find((value) => value >= inUnit) ?? 1024;
  return step * unit;
}

/** Which bars carry a label under them, so labels never run into each other. */
export function labelEvery(count: number, room: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, room)));
}

/**
 * How many of the offers the tracker passed on were answered, 0 to 1. An
 * offer that got no answer went to a viewer who had left or could not connect.
 * Null before any offer.
 */
export function answerRatio(stats: {
  offersRelayed: number;
  answersRelayed: number;
}): number | null {
  return stats.offersRelayed > 0 ? Math.min(1, stats.answersRelayed / stats.offersRelayed) : null;
}

/** A random secret for the tracker and the main server to share: 48 characters. */
export function newTrackerSecret(random: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(new ArrayBuffer(36));
  random(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

/** The settings that switch P2P on, for the main server and for the tracker. */
export function p2pSettings(origin: string, secret: string): { api: string; tracker: string } {
  const url = new URL(origin);
  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    api: [
      `P2P_TRACKER_URL=${scheme}//${url.host}/tracker`,
      'P2P_TRACKER_INTERNAL_URL=http://127.0.0.1:8070',
      `P2P_TRACKER_SECRET=${secret}`,
    ].join('\n'),
    tracker: [
      `ONYX_TRACKER_SECRET=${secret}`,
      'ONYX_TRACKER_LISTEN=:8070',
      `ONYX_TRACKER_ALLOWED_ORIGINS=${url.host}`,
      'ONYX_TRACKER_TRUST_PROXY=true',
    ].join('\n'),
  };
}
