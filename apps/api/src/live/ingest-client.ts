// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { INGEST_USER, ingestPassword, ingestPath } from './ingest.js';

/** Time the ingest server gets to answer. It is next door, so a slow answer is no answer. */
const TIMEOUT_MS = 2500;

/** "ready": an encoder is sending. "absent": none is. "unreachable": the ingest server did not answer. */
export type EncoderState = 'ready' | 'absent' | 'unreachable';

interface PathInfo {
  ready?: boolean;
  source?: { type?: string; id?: string } | null;
}

/** Kinds of connection the ingest server can be told to close, by the name it gives them. */
const KICK_ROUTES: Record<string, string> = {
  rtmpConn: 'rtmpconns',
  rtmpsConn: 'rtmpsconns',
  srtConn: 'srtconns',
  rtspSession: 'rtspsessions',
  rtspsSession: 'rtspssessions',
  webRTCSession: 'webrtcsessions',
};

/** Talks to the control API of the ingest server (MediaMTX). */
@Injectable()
export class IngestClient {
  private readonly authorization: string;

  constructor(@Inject(AppConfig) private readonly config: AppConfig) {
    const password = ingestPassword(config.playbackSigningSecret);
    this.authorization = `Basic ${Buffer.from(`${INGEST_USER}:${password}`).toString('base64')}`;
  }

  /** Whether an encoder is sending to a stream key right now. */
  async state(key: string): Promise<EncoderState> {
    const info = await this.path(key);
    if (info === 'unreachable') {
      return 'unreachable';
    }
    return info?.ready ? 'ready' : 'absent';
  }

  /**
   * Closes the connection of the encoder that sends to a stream key, if there
   * is one. Used when a channel is stopped or its key is replaced. Failing to
   * do so is not an error: the stream is no longer read either way.
   */
  async kick(key: string): Promise<void> {
    const info = await this.path(key);
    if (info === 'unreachable' || !info?.source?.type || !info.source.id) {
      return;
    }
    const route = KICK_ROUTES[info.source.type];
    if (route) {
      await this.request(`/v3/${route}/kick/${info.source.id}`, 'POST').catch(() => undefined);
    }
  }

  private async path(key: string): Promise<PathInfo | null | 'unreachable'> {
    try {
      const response = await this.request(`/v3/paths/get/${ingestPath(key)}`, 'GET');
      if (response.status === 404) {
        return null;
      }
      return response.ok ? ((await response.json()) as PathInfo) : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  private request(path: string, method: 'GET' | 'POST'): Promise<Response> {
    return fetch(`${this.config.ingest.apiUrl}${path}`, {
      method,
      headers: { Authorization: this.authorization },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}
