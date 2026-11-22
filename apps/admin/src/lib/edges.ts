// SPDX-License-Identifier: AGPL-3.0-only
import type { BadgeTone } from '@/components/ui/display';
import type { EdgeSample, EdgeServer, EdgeStatus } from '@/api/types';

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
