// SPDX-License-Identifier: AGPL-3.0-only
import type { AdSource } from '@onyx/database';
import type { AdSettings } from './ad-rules.js';

export interface AdSourceView {
  id: string;
  name: string;
  kind: 'VAST_TAG' | 'HOUSE';
  vastUrl: string | null;
  /** The video of a house ad, with its name for the panel. */
  asset: { id: string; title: string } | null;
  clickUrl: string | null;
  skipAfterSeconds: number | null;
  weight: number;
  isActive: boolean;
  createdAt: Date;
}

export type AdSourceRow = AdSource & { asset: { id: string; title: string } | null };

export function adSourceView(row: AdSourceRow): AdSourceView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    vastUrl: row.vastUrl,
    asset: row.asset ? { id: row.asset.id, title: row.asset.title } : null,
    clickUrl: row.clickUrl,
    skipAfterSeconds: row.skipAfterSeconds,
    weight: row.weight,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export interface AdFigures {
  impressions: number;
  firstQuartile: number;
  midpoint: number;
  thirdQuartile: number;
  completes: number;
  skips: number;
  clicks: number;
  errors: number;
}

export interface AdReport {
  days: number;
  totals: AdFigures;
  /** One entry per day of the period, the oldest first, days without ads included. */
  perDay: ({ day: string } & AdFigures)[];
  perSource: ({ sourceId: string; name: string } & AdFigures)[];
}

export interface AdBreakPlan {
  id: string;
  position: 'PRE' | 'MID' | 'POST';
  /** Milliseconds from the start of the video, for a break in the middle. */
  atMs: number | null;
  /**
   * The source this break takes its ad from. The player asks for the ad when
   * the break comes, so that what it gets is fresh.
   */
  sourceId: string;
}

/** What a player does about ads while it plays one video. */
export interface AdPlan {
  breaks: AdBreakPlan[];
}

export interface AdSettingsView extends AdSettings {
  /** Whether a break would find a source to play now. */
  hasActiveSource: boolean;
}
