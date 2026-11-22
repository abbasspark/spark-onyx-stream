// SPDX-License-Identifier: AGPL-3.0-only
import type { HlsConfig } from 'hls.js';
import type { HlsJsP2PEngine } from 'p2p-media-loader-hlsjs';
import type { P2pInfo } from './types';

/**
 * Sharing video with other viewers.
 *
 * Players of viewers who watch the same video or channel pass parts of it to
 * each other over direct connections. Every part can always be had from a
 * server too: a viewer alone, or with slow peers, notices no difference.
 */

const PREFERENCE_KEY = 'onyx-sharing';

/** What a player took from where, and gave, since it started. */
export interface SharingFigures {
  /** Other viewers this player is connected to now. */
  peers: number;
  fromServers: number;
  fromViewers: number;
  toViewers: number;
}

export const NO_SHARING: SharingFigures = {
  peers: 0,
  fromServers: 0,
  fromViewers: 0,
  toViewers: 0,
};

/** Share of the video that came from other viewers, 0 to 1. Null before anything arrived. */
export function sharedRatio(figures: SharingFigures): number | null {
  const total = figures.fromServers + figures.fromViewers;
  return total > 0 ? figures.fromViewers / total : null;
}

/** One line for the viewer about how sharing goes. */
export function describeSharing(figures: SharingFigures, on: boolean): string {
  if (!on) {
    return 'Off: everything comes from the servers.';
  }
  if (figures.peers === 0) {
    return 'Nobody else to share with right now.';
  }
  const ratio = sharedRatio(figures);
  const viewers = figures.peers === 1 ? '1 other viewer' : `${figures.peers} other viewers`;
  return ratio === null || ratio < 0.005
    ? `Connected to ${viewers}.`
    : `Connected to ${viewers}. ${Math.round(ratio * 100)}% came from them.`;
}

/** Whether the viewer wants to share. On unless switched off in the player. */
export function sharingPreference(): boolean {
  try {
    return window.localStorage.getItem(PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSharingPreference(on: boolean): void {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, on ? 'on' : 'off');
  } catch {
    // Without storage the choice holds for this video.
  }
}

/**
 * Whether this browser and connection are fit for sharing: it needs direct
 * connections, and a viewer who asked their device to save data, or who is on
 * a mobile network, should not pay for other viewers' video.
 */
export function canShare(): boolean {
  if (typeof window === 'undefined' || typeof window.RTCPeerConnection === 'undefined') {
    return false;
  }
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }
  ).connection;
  return !(connection?.saveData === true || connection?.type === 'cellular');
}

let Engine: typeof HlsJsP2PEngine | null = null;

/**
 * Loads the sharing code, which is kept out of the page until a video that
 * can be shared is about to play. Never fails: without it the video plays
 * from the servers.
 */
export async function loadSharing(): Promise<void> {
  if (Engine || !canShare()) {
    return;
  }
  try {
    Engine = (await import('p2p-media-loader-hlsjs')).HlsJsP2PEngine;
  } catch {
    Engine = null;
  }
}

/** The sharing of one playback session. */
export interface Sharing {
  /** To be spread into the settings of the player library before it is created. */
  hlsConfig: Partial<HlsConfig>;
  /** Connects the sharing to the player, once that exists. */
  bind: (hls: unknown) => void;
  /** Switches sharing on or off while the video plays. */
  setOn: (on: boolean) => void;
  figures: () => SharingFigures;
  destroy: () => void;
}

/**
 * Sets up sharing for one playback session.
 *
 * @param onChange Called when the figures moved, at most about once a second.
 * @returns Null when there is nothing to share with: P2P is off on the
 *   platform, the browser cannot do it, or the code is not loaded.
 */
export function createSharing(
  info: P2pInfo | null | undefined,
  kind: 'video' | 'live',
  onChange: (figures: SharingFigures) => void,
): Sharing | null {
  if (!info || !Engine || !canShare()) {
    return null;
  }

  const engine = new Engine({
    core: {
      announceTrackers: [info.trackerUrl],
      swarmId: info.swarmId,
      rtcConfig: { iceServers: info.stunUrls.map((urls) => ({ urls })) },
      isP2PDisabled: !sharingPreference(),
      // What plays within these seconds is always fetched from a server, so
      // waiting for another viewer never holds the picture up. A live
      // channel has little ahead of it, so it leaves less to chance.
      highDemandTimeWindow: kind === 'live' ? 8 : 15,
      // Memory for what was watched, which is what this player can give.
      segmentMemoryStorageLimit: kind === 'live' ? 256 : 512,
    },
  });

  const peers = new Set<string>();
  const figures: SharingFigures = { ...NO_SHARING };
  let timer: number | undefined;
  const changed = () => {
    timer ??= window.setTimeout(() => {
      timer = undefined;
      figures.peers = peers.size;
      onChange({ ...figures });
    }, 1000);
  };

  engine.addEventListener('onPeerConnect', ({ peerId }) => {
    peers.add(peerId);
    changed();
  });
  engine.addEventListener('onPeerClose', ({ peerId }) => {
    peers.delete(peerId);
    changed();
  });
  engine.addEventListener('onChunkDownloaded', (bytes, source) => {
    if (source === 'p2p') {
      figures.fromViewers += bytes;
    } else {
      figures.fromServers += bytes;
    }
    changed();
  });
  engine.addEventListener('onChunkUploaded', (bytes) => {
    figures.toViewers += bytes;
    changed();
  });

  return {
    hlsConfig: engine.getConfigForHlsJs() as Partial<HlsConfig>,
    bind: (hls) => engine.bindHls(hls),
    setOn: (on) => engine.applyDynamicConfig({ core: { isP2PDisabled: !on } }),
    figures: () => ({ ...figures, peers: peers.size }),
    destroy: () => {
      window.clearTimeout(timer);
      engine.destroy();
    },
  };
}
