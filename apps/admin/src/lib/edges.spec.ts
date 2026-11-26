// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type {
  DeliveryOverview,
  EdgeSample,
  EdgeServer,
  EdgeTraffic,
  SharingTraffic,
} from '@/api/types';
import {
  agentDockerCommand,
  answerRatio,
  newTrackerSecret,
  p2pSettings,
  agentEnvironment,
  cachePercent,
  chartOf,
  concernOf,
  formatRatio,
  labelEvery,
  loadPercent,
  MAX_CHART_SERIES,
  niceCeiling,
  offloadOf,
  overviewChartOf,
  sharingChartOf,
  publicUrlProblem,
  summarize,
  trafficChartOf,
} from './edges';

function edge(more: Partial<EdgeServer> = {}, now: Partial<NonNullable<EdgeServer['now']>> = {}) {
  const base: EdgeServer = {
    id: 'e1',
    name: 'Frankfurt 1',
    publicUrl: 'https://edge1.example.com',
    location: null,
    enabled: true,
    weight: 10,
    maxMbps: null,
    serveVideo: true,
    serveLive: true,
    status: 'ONLINE',
    lastSeenAt: '2026-11-22T10:00:00.000Z',
    version: '0.1.0',
    hostname: 'edge-fra-1',
    remoteIp: '203.0.113.5',
    bytesServed: '1000',
    requestsServed: '10',
    now: {
      bitsPerSecond: 8_000_000,
      requestsPerSecond: 20,
      activeRequests: 4,
      hitRatio: 0.9,
      startedAt: '2026-11-22T09:00:00.000Z',
      cache: { bytes: 25, files: 3, limitBytes: 100 },
      system: { cpus: 4, load1: 1, diskFreeBytes: 500, diskTotalBytes: 1000 },
      refused: 0,
      originErrors: 0,
      ...now,
    },
    samples: [],
    purging: [],
    createdAt: '2026-11-20T10:00:00.000Z',
  };
  return { ...base, ...more };
}

describe('edges together', () => {
  it('add up, with the hit ratio weighted by traffic', () => {
    const summary = summarize([
      edge(),
      edge(
        { id: 'e2', bytesServed: '500' },
        { requestsPerSecond: 60, hitRatio: 0.5, bitsPerSecond: 2_000_000 },
      ),
      edge({ id: 'e3', status: 'OFFLINE', now: null, bytesServed: '7' }),
    ]);
    expect(summary).toMatchObject({
      total: 3,
      online: 2,
      bitsPerSecond: 10_000_000,
      requestsPerSecond: 80,
      activeRequests: 8,
      bytesServed: 1507,
    });
    expect(summary.hitRatio).toBeCloseTo(0.6, 2);
  });

  it('have no hit ratio before anything was asked for', () => {
    expect(summarize([edge({}, { hitRatio: null })]).hitRatio).toBeNull();
    expect(summarize([]).hitRatio).toBeNull();
    expect(formatRatio(null)).toBe('–');
    expect(formatRatio(0.874)).toBe('87%');
  });
});

describe('one edge', () => {
  it('shows load against its processors and how full the cache is', () => {
    expect(loadPercent(edge().now)).toBe(25);
    expect(
      loadPercent(
        edge({}, { system: { cpus: 4, load1: null, diskFreeBytes: null, diskTotalBytes: null } })
          .now,
      ),
    ).toBeNull();
    expect(loadPercent(null)).toBeNull();
    expect(cachePercent(edge().now)).toBe(25);
    expect(cachePercent(null)).toBe(0);
  });

  it('names what stands out as wrong', () => {
    expect(concernOf(edge())).toBeNull();
    expect(
      concernOf(
        edge({}, { system: { cpus: 2, load1: 3.2, diskFreeBytes: 500, diskTotalBytes: 1000 } }),
      ),
    ).toMatch(/overloaded/);
    expect(
      concernOf(
        edge({}, { system: { cpus: 2, load1: 0.1, diskFreeBytes: 10, diskTotalBytes: 1000 } }),
      ),
    ).toMatch(/disk/);
    expect(concernOf(edge({ publicUrl: 'http://edge1.example.com' }))).toMatch(/HTTPS/);
    expect(concernOf(edge({ status: 'OFFLINE', now: null }))).toBeNull();
  });
});

describe('the traffic chart', () => {
  const now = 10_000;
  const samples: EdgeSample[] = [
    [now - 30, 1_000_000, 5],
    [now - 20, 4_000_000, 9],
    [now - 10, 2_000_000, 7],
  ];

  it('needs two points', () => {
    expect(chartOf([], 100, 20, now)).toBeNull();
    expect(chartOf(samples.slice(0, 1), 100, 20, now)).toBeNull();
  });

  it('puts the peak at the top and time along the width', () => {
    const chart = chartOf(samples, 360, 20, now);
    expect(chart?.peak).toBe(4_000_000);
    expect(chart?.line).toBe('M357 14.5L358 1L359 10');
    expect(chart?.area.endsWith('L359 20L357 20Z')).toBe(true);
  });

  it('breaks the line where the agent was away, and leaves out what is older than the hour', () => {
    const chart = chartOf(
      [
        [now - 4000, 9_000_000, 1],
        [now - 600, 1_000_000, 1],
        [now - 590, 1_000_000, 1],
        ...samples,
      ],
      360,
      20,
      now,
    );
    expect(chart?.peak).toBe(4_000_000);
    expect(chart?.line.match(/M/g)).toHaveLength(2);
  });
});

describe('setting up an agent', () => {
  it('writes the settings with the address and the token', () => {
    const environment = agentEnvironment('https://stream.example.com', 'onyx-edge.id.secret');
    expect(environment.split('\n').slice(0, 2)).toEqual([
      'ONYX_ORIGIN_URL=https://stream.example.com',
      'ONYX_EDGE_TOKEN=onyx-edge.id.secret',
    ]);
    const docker = agentDockerCommand('https://stream.example.com', 'onyx-edge.id.secret');
    expect(docker).toContain('-e ONYX_EDGE_TOKEN=onyx-edge.id.secret');
    expect(docker.split('\n').at(-1)).toBe('  onyx-edge-agent');
  });

  it('checks the address of an edge', () => {
    expect(publicUrlProblem('')).toBeNull();
    expect(publicUrlProblem('https://edge1.example.com')).toBeNull();
    expect(publicUrlProblem('http://10.0.0.5:8080/')).toBeNull();
    expect(publicUrlProblem('edge1.example.com')).not.toBeNull();
    expect(publicUrlProblem('https://edge1.example.com/video')).not.toBeNull();
  });
});

describe('the history of what was delivered', () => {
  const HOUR = 3_600_000;
  const now = new Date(2026, 10, 22, 14, 30).getTime();
  const thisHour = new Date(2026, 10, 22, 14).getTime();
  const seconds = (at: number) => Math.round(at / 1000);

  it('makes a bar per hour for a day, also for hours without traffic', () => {
    const traffic: EdgeTraffic = {
      range: '24h',
      from: new Date(thisHour - 23 * HOUR).toISOString(),
      hours: 24,
      edges: [
        { id: 'b', name: 'Paris', points: [[seconds(thisHour), 300, 3, 2, 1, 100]] },
        {
          id: 'a',
          name: 'Frankfurt',
          points: [
            [seconds(thisHour - HOUR), 1000, 10, 9, 1, 150],
            [seconds(thisHour), 700, 7, 7, 0, 50],
          ],
        },
      ],
    };
    const chart = trafficChartOf(traffic, now);

    expect(chart.buckets).toHaveLength(24);
    // The older edge comes first and keeps the first colour.
    expect(chart.series.map((series) => [series.name, series.slot, series.bytes])).toEqual([
      ['Frankfurt', 0, 1700],
      ['Paris', 1, 300],
    ]);
    expect(chart.buckets.at(-1)).toMatchObject({ bytes: 1000, requests: 10, parts: [700, 300] });
    expect(chart.buckets.at(-2)).toMatchObject({ bytes: 1000, parts: [1000, 0] });
    expect(chart.buckets[0]).toMatchObject({ bytes: 0, parts: [0, 0] });
    expect(chart).toMatchObject({ peak: 1000, bytes: 2000, requests: 20 });
    // 300 of 2000 bytes had to come from the main server.
    expect(chart.fetched).toBe(300);
    expect(chart.offload).toBeCloseTo(0.85, 5);
    expect(chart.buckets.at(-1)?.fetched).toBe(150);
    expect(chart.hitRatio).toBeCloseTo(0.9, 5);
  });

  it('makes a bar per day of this time zone for longer ranges', () => {
    const today = new Date(2026, 10, 22).getTime();
    const traffic: EdgeTraffic = {
      range: '7d',
      from: new Date(thisHour - (7 * 24 - 1) * HOUR).toISOString(),
      hours: 168,
      edges: [
        {
          id: 'a',
          name: 'Frankfurt',
          points: [
            [seconds(today - 2 * HOUR), 100, 1, 1, 0, 0],
            [seconds(today + HOUR), 200, 1, 1, 0, 0],
            [seconds(today + 9 * HOUR), 300, 1, 0, 1, 0],
          ],
        },
      ],
    };
    const chart = trafficChartOf(traffic, now);

    // The hour the range starts in belongs to a day of its own.
    expect(chart.buckets).toHaveLength(8);
    expect(chart.buckets.at(-1)).toMatchObject({ start: today, bytes: 500 });
    expect(chart.buckets.at(-2)).toMatchObject({ bytes: 100 });
    expect(chart.hitRatio).toBeCloseTo(2 / 3, 5);
  });

  it('shows edges beyond the colours there are as one', () => {
    const edges = Array.from({ length: MAX_CHART_SERIES + 2 }, (_value, index) => ({
      id: `edge-${String(index).padStart(2, '0')}`,
      name: `Edge ${index}`,
      points: [[seconds(thisHour), 10, 1, 1, 0, 0]] as EdgeTraffic['edges'][number]['points'],
    }));
    const chart = trafficChartOf(
      { range: '24h', from: new Date(thisHour).toISOString(), hours: 1, edges },
      now,
    );
    expect(chart.series).toHaveLength(MAX_CHART_SERIES + 1);
    expect(chart.series.at(-1)).toMatchObject({ name: '2 more', bytes: 20 });
    expect(chart.buckets[0]?.parts.at(-1)).toBe(20);
  });

  it('has no hit ratio without requests', () => {
    const chart = trafficChartOf(
      { range: '24h', from: new Date(thisHour).toISOString(), hours: 1, edges: [] },
      now,
    );
    expect(chart).toMatchObject({ peak: 0, bytes: 0, hitRatio: null, series: [] });
  });

  it('rounds the top of the scale up to a number that reads well', () => {
    expect(niceCeiling(0)).toBe(1024 ** 2);
    expect(niceCeiling(1.3 * 1024 ** 3)).toBe(1.5 * 1024 ** 3);
    expect(niceCeiling(37 * 1024 ** 2)).toBe(40 * 1024 ** 2);
    expect(niceCeiling(600 * 1024 ** 2)).toBe(750 * 1024 ** 2);
    expect(niceCeiling(900 * 1024 ** 2)).toBe(1024 ** 3);
    expect(niceCeiling(5 * 1024 ** 3)).toBe(5 * 1024 ** 3);
  });

  it('thins out the labels under the bars', () => {
    expect(labelEvery(24, 8)).toBe(3);
    expect(labelEvery(7, 8)).toBe(1);
    expect(labelEvery(31, 8)).toBe(4);
  });
});

describe('P2P', () => {
  it('tells how many offers were answered', () => {
    expect(answerRatio({ offersRelayed: 0, answersRelayed: 0 })).toBeNull();
    expect(answerRatio({ offersRelayed: 80, answersRelayed: 60 })).toBe(0.75);
    expect(answerRatio({ offersRelayed: 5, answersRelayed: 9 })).toBe(1);
  });

  it('makes a secret that is long enough and safe in a settings file', () => {
    const secret = newTrackerSecret((bytes) => bytes.fill(255));
    expect(secret).toHaveLength(48);
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('writes the settings for both sides with the same secret', () => {
    const settings = p2pSettings('https://stream.example.com', 'the-secret');
    expect(settings.api.split('\n')).toEqual([
      'P2P_TRACKER_URL=wss://stream.example.com/tracker',
      'P2P_TRACKER_INTERNAL_URL=http://127.0.0.1:8070',
      'P2P_TRACKER_SECRET=the-secret',
    ]);
    expect(settings.tracker).toContain('ONYX_TRACKER_SECRET=the-secret');
    expect(settings.tracker).toContain('ONYX_TRACKER_ALLOWED_ORIGINS=stream.example.com');
    expect(p2pSettings('http://localhost:8080', 's').api).toContain('ws://localhost:8080/tracker');
  });
});

describe('what edges and viewers took off the main server', () => {
  it('is the share an edge did not have to fetch', () => {
    expect(offloadOf(1000, 250)).toBe(0.75);
    expect(offloadOf(1000, 1200)).toBe(0);
    // Nothing delivered, or an agent that does not say what it fetched.
    expect(offloadOf(0, 0)).toBeNull();
    expect(offloadOf(1000, 0)).toBeNull();
  });

  const HOUR = 3_600_000;
  const now = new Date(2026, 10, 22, 14, 30).getTime();
  const thisHour = new Date(2026, 10, 22, 14).getTime();
  const seconds = (at: number) => Math.round(at / 1000);
  const traffic: SharingTraffic = {
    range: '24h',
    from: new Date(thisHour - 23 * HOUR).toISOString(),
    hours: 24,
    video: [[seconds(thisHour), 600, 400, 380, 12]],
    live: [
      [seconds(thisHour - HOUR), 100, 300, 300, 4],
      [seconds(thisHour), 200, 800, 790, 9],
    ],
  };

  it('adds films and live up, with the share that came from viewers', () => {
    const chart = sharingChartOf(traffic, 'all', now);
    expect(chart.buckets).toHaveLength(24);
    expect(chart.buckets.at(-1)).toMatchObject({
      bytes: 2000,
      fromViewers: 1200,
      fromServers: 800,
      reports: 21,
      parts: [1200, 800],
    });
    expect(chart).toMatchObject({ fromViewers: 1500, fromServers: 900, peak: 2000 });
    expect(chart.ratio).toBeCloseTo(0.625, 5);
    expect(chart.series.map((series) => [series.name, series.bytes])).toEqual([
      ['From other viewers', 1500],
      ['From servers', 900],
    ]);
  });

  it('can show films or live alone', () => {
    expect(sharingChartOf(traffic, 'video', now)).toMatchObject({
      fromViewers: 400,
      fromServers: 600,
    });
    expect(sharingChartOf(traffic, 'live', now).ratio).toBeCloseTo(1100 / 1400, 5);
    expect(sharingChartOf({ ...traffic, video: [], live: [] }, 'all', now).ratio).toBeNull();
  });
});

describe('who delivered what', () => {
  const HOUR = 3_600_000;
  const now = new Date(2026, 10, 22, 14, 30).getTime();
  const thisHour = new Date(2026, 10, 22, 14).getTime();
  const seconds = (at: number) => Math.round(at / 1000);
  const data: DeliveryOverview = {
    range: '24h',
    from: new Date(thisHour - 23 * HOUR).toISOString(),
    hours: 24,
    gatewayCounted: true,
    points: [
      // direct, by edges, fetched by edges, between viewers
      [seconds(thisHour - HOUR), 1000, 8000, 2000, 1000],
      [seconds(thisHour), 0, 500, 900, 0],
    ],
  };

  it('counts what an edge fetched for the main server, and the rest for the edge', () => {
    const chart = overviewChartOf(data, now);
    expect(chart.buckets.at(-2)).toMatchObject({
      fromMain: 3000,
      fromEdges: 6000,
      fromViewers: 1000,
      bytes: 10_000,
      parts: [3000, 6000, 1000],
    });
    // An edge that was filling up delivered nothing of its own in that hour.
    expect(chart.buckets.at(-1)).toMatchObject({ fromMain: 500, fromEdges: 0, bytes: 500 });
    expect(chart).toMatchObject({
      bytes: 10_500,
      fromMain: 3500,
      fromEdges: 6000,
      fromViewers: 1000,
    });
    expect(chart.offload).toBeCloseTo(7000 / 10_500, 5);
    expect(chart.series.map((series) => series.name)).toEqual([
      'Main server',
      'Edges, from their copies',
      'Other viewers',
    ]);
  });

  it('has no figure before anything was delivered', () => {
    expect(overviewChartOf({ ...data, points: [] }, now)).toMatchObject({
      bytes: 0,
      offload: null,
    });
  });
});
