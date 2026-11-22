// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { createPlaybackToken } from '../playback/playback-token.js';

/** What the tokens for the tracker are signed for. The tracker knows the same words. */
const SUBJECT_CONNECT = 'tracker';
const SUBJECT_STATS = 'tracker-stats';

/** How long the tracker is given to answer when the panel asks for its figures. */
const STATUS_TIMEOUT_MS = 2500;

/** What a player needs to share what it plays with other viewers. */
export interface P2pInfo {
  /** Address of the tracker, with the token that lets this viewer in. */
  trackerUrl: string;
  /**
   * Names the group of viewers who watch the same files. Nobody can work it
   * out without being let watch, so it also keeps others out of the group.
   */
  swarmId: string;
}

/** What the tracker says about itself. */
export interface TrackerStats {
  version: string;
  connections: number;
  refusedConnections: number;
  /** Viewers in swarms. */
  peers: number;
  swarms: number;
  /** The sizes of the largest swarms, largest first. */
  largestSwarms: number[];
  announces: number;
  offersRelayed: number;
  answersRelayed: number;
  refused: number;
  startedAt: string;
}

export type P2pStatus =
  | { state: 'off' }
  | { state: 'unreachable'; trackerUrl: string; message: string }
  | { state: 'running'; trackerUrl: string; stats: TrackerStats };

/**
 * P2P between viewers: who is told about the tracker, and what the tracker
 * says about itself.
 */
@Injectable()
export class P2pService {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  /**
   * What a viewer's player gets for one playback session.
   *
   * @param content Says what is watched, such as "video:<id>:<processing>".
   *   Everything that changes the files has to be part of it.
   * @param expiresAtSeconds When the session ends. The token for the tracker ends with it.
   */
  forPlayback(content: string, expiresAtSeconds: number): P2pInfo | null {
    const p2p = this.config.p2p;
    if (!p2p) {
      return null;
    }
    const token = createPlaybackToken(SUBJECT_CONNECT, expiresAtSeconds, p2p.secret);
    return {
      trackerUrl: `${p2p.trackerUrl}?token=${token}`,
      swarmId: createHmac('sha256', p2p.secret)
        .update(`swarm:${content}`)
        .digest('hex')
        .slice(0, 40),
    };
  }

  /** Asks the tracker how it is doing, for the admin panel. */
  async status(): Promise<P2pStatus> {
    const p2p = this.config.p2p;
    if (!p2p) {
      return { state: 'off' };
    }
    // The secret itself never travels: the tracker gets a token that runs out in a minute.
    const token = createPlaybackToken(
      SUBJECT_STATS,
      Math.floor(Date.now() / 1000) + 60,
      p2p.secret,
    );
    try {
      const response = await fetch(`${p2p.internalUrl}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (response.status === 401) {
        return {
          state: 'unreachable',
          trackerUrl: p2p.trackerUrl,
          message:
            'The tracker refused the main server. Its ONYX_TRACKER_SECRET differs from P2P_TRACKER_SECRET.',
        };
      }
      if (!response.ok) {
        throw new Error(`it answered ${response.status}`);
      }
      return {
        state: 'running',
        trackerUrl: p2p.trackerUrl,
        stats: (await response.json()) as TrackerStats,
      };
    } catch (error) {
      return {
        state: 'unreachable',
        trackerUrl: p2p.trackerUrl,
        message: `The tracker at ${p2p.internalUrl} cannot be reached: ${reasonOf(error)}`,
      };
    }
  }
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return 'it did not answer in time';
    }
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? error.message;
  }
  return String(error);
}
