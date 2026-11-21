// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleType } from '@onyx/database';
import type { PublicImage } from '../catalog/public-catalog.views.js';

export interface WatchingEpisodeRef {
  id: string;
  seasonNumber: number;
  number: number;
  name: string;
}

/** A video the viewer began and did not finish, for the "Continue watching" row. */
export interface WatchingItem {
  /** Id of the video: of the episode, or of the title for a movie. */
  id: string;
  title: { slug: string; name: string; type: TitleType };
  episode: WatchingEpisodeRef | null;
  /** A wide picture: the still of the episode, or the backdrop of the title. */
  image: PublicImage | null;
  /** Seconds watched and seconds in total. */
  position: number;
  duration: number;
  watchedAt: Date;
}

/** How far the viewer is in one video of a title, for the title's own page. */
export interface TitleWatchState {
  id: string;
  /** 0 when there is nothing to resume. */
  position: number;
  duration: number;
  /** Whether the viewer has watched this to the end at some time. */
  completed: boolean;
  watchedAt: Date;
}

/** What a viewer watched, as an admin sees it. Includes what is no longer published. */
export interface ViewerWatchingAdminItem {
  id: string;
  /** Who of the account watched. */
  profile: { id: string; name: string };
  title: { id: string; name: string; type: TitleType };
  episode: WatchingEpisodeRef | null;
  position: number;
  duration: number;
  completedAt: Date | null;
  watchedAt: Date;
}

export interface ViewerWatchingAdminView {
  /** Videos begun or finished. */
  total: number;
  completed: number;
  /** The latest, newest first. */
  items: ViewerWatchingAdminItem[];
}
