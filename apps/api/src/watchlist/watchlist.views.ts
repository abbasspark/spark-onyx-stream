// SPDX-License-Identifier: AGPL-3.0-only
import type { PublishStatus, TitleType } from '@onyx/database';
import type { PublicImage, PublicTitleCard } from '../catalog/public-catalog.views.js';

/** A title on the list of a profile, as clients get it. */
export interface ListItem {
  title: PublicTitleCard;
  addedAt: Date;
}

/** The list of the profile in use. */
export interface ViewerList {
  /** The titles the viewer can watch right now, the last added first. */
  items: ListItem[];
  /** How many more titles a list takes. */
  room: number;
}

/** A saved title as an admin sees it. Includes what is no longer published. */
export interface ViewerListAdminItem {
  /** Who of the account saved it. */
  profile: { id: string; name: string };
  title: { id: string; name: string; type: TitleType; status: PublishStatus };
  addedAt: Date;
  /** Whether this profile has begun the title since. */
  started: boolean;
}

export interface ViewerListAdminView {
  total: number;
  /** The latest, newest first. */
  items: ViewerListAdminItem[];
}

/** How often one title stands on lists. */
export interface SavedTitle {
  title: { id: string; name: string; type: TitleType; poster: PublicImage | null };
  /** Lists the title stands on now. */
  saves: number;
  /** Of them, added within the days asked for. */
  recent: number;
  /** Of them, those whose profile has begun the title. */
  started: number;
}

/** What viewers put on their lists, in figures. No viewer is named. */
export interface SavedTitles {
  days: number;
  /** Entries on all lists together. */
  saves: number;
  /** Of them, added within the days asked for. */
  recent: number;
  /** Profiles that have a list. */
  lists: number;
  /** Titles that stand on a list. */
  titles: number;
  /** The titles on the most lists. */
  top: SavedTitle[];
}
