// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { EdgeSample, EdgeServer } from '@/api/types';
import {
  agentDockerCommand,
  agentEnvironment,
  cachePercent,
  chartOf,
  concernOf,
  formatRatio,
  loadPercent,
  publicUrlProblem,
  summarize,
} from './edges';

function edge(more: Partial<EdgeServer> = {}, now: Partial<NonNullable<EdgeServer['now']>> = {}) {
  const base: EdgeServer = {
    id: 'e1',
    name: 'Frankfurt 1',
    publicUrl: 'https://edge1.example.com',
    location: null,
    enabled: true,
    weight: 10,
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
