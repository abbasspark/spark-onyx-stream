// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, type Viewer, type ViewerProfile } from '@onyx/database';
import type { CreateProfileInput, UpdateProfileInput } from './viewer.schemas.js';
import type { ViewerIdentity } from './viewer-session.service.js';

/** How many people can share one account. */
export const MAX_PROFILES = 5;
/** Longest name of a profile. It is shown under a small picture. */
export const MAX_PROFILE_NAME_LENGTH = 40;

/**
 * Names of the colours a profile can have. Clients decide what each looks
 * like, so a phone app and the website can each fit them to their design.
 */
export const PROFILE_COLORS = [
  'amber',
  'coral',
  'rose',
  'violet',
  'blue',
  'teal',
  'green',
  'slate',
] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

/** A profile as its owner sees it. */
export interface ProfileView {
  id: string;
  name: string;
  color: string;
  /** The profile the account started with. It cannot be deleted. */
  isMain: boolean;
}

export function toProfileView(profile: ViewerProfile): ProfileView {
  return { id: profile.id, name: profile.name, color: profile.color, isMain: profile.isMain };
}

/** Two names are the same when they differ only in capital letters or outer spaces. */
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The people who share a viewer account. Each has their own watch history.
 * Every account has a main profile: it is made when it is first needed, so
 * accounts created in any way, at any time, have one.
 */
@Injectable()
export class ViewerProfilesService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** The profiles of an account, the main one first, then in the order they were added. */
  async list(viewer: Pick<Viewer, 'id' | 'displayName'>): Promise<ViewerProfile[]> {
    const profiles = await this.prisma.viewerProfile.findMany({
      where: { viewerId: viewer.id },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return profiles.some((profile) => profile.isMain)
      ? profiles
      : [await this.createMain(viewer), ...profiles];
  }

  /** The main profile of an account. */
  async main(viewer: Pick<Viewer, 'id' | 'displayName'>): Promise<ViewerProfile> {
    const found = await this.prisma.viewerProfile.findFirst({
      where: { viewerId: viewer.id, isMain: true },
    });
    return found ?? this.createMain(viewer);
  }

  /**
   * The profile in use on the device of a request: the one chosen there, or
   * the main one when none was chosen or the chosen one is gone.
   */
  async current(identity: ViewerIdentity): Promise<ViewerProfile> {
    const { viewer, session } = identity;
    if (session.profileId) {
      const chosen = await this.prisma.viewerProfile.findFirst({
        where: { id: session.profileId, viewerId: viewer.id },
      });
      if (chosen) {
        return chosen;
      }
    }
    return this.main(viewer);
  }

  /**
   * @throws ConflictException when the account is full or has a profile of that name.
   */
  async create(viewer: Viewer, input: CreateProfileInput): Promise<ViewerProfile> {
    const profiles = await this.list(viewer);
    if (profiles.length >= MAX_PROFILES) {
      throw new ConflictException(`An account can have ${MAX_PROFILES} profiles`);
    }
    this.assertNameFree(profiles, input.name);
    // A colour no other profile has yet, so they are easy to tell apart.
    const taken = new Set(profiles.map((profile) => profile.color));
    const color =
      input.color ?? PROFILE_COLORS.find((candidate) => !taken.has(candidate)) ?? PROFILE_COLORS[0];
    return this.prisma.viewerProfile.create({
      data: { viewerId: viewer.id, name: input.name, color },
    });
  }

  /**
   * @throws NotFoundException when the account has no such profile.
   * @throws ConflictException when another profile has that name.
   */
  async update(viewer: Viewer, id: string, input: UpdateProfileInput): Promise<ViewerProfile> {
    const profiles = await this.list(viewer);
    const profile = profiles.find((candidate) => candidate.id === id);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    if (input.name !== undefined) {
      this.assertNameFree(
        profiles.filter((candidate) => candidate.id !== id),
        input.name,
      );
    }
    return this.prisma.viewerProfile.update({ where: { id }, data: input });
  }

  /**
   * Deletes a profile with its watch history. Devices that used it go back to
   * the main profile.
   *
   * @throws NotFoundException when the account has no such profile.
   * @throws ConflictException for the main profile.
   */
  async remove(viewer: Viewer, id: string): Promise<void> {
    const profile = await this.prisma.viewerProfile.findFirst({
      where: { id, viewerId: viewer.id },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    if (profile.isMain) {
      throw new ConflictException(
        'The main profile stays with the account. Rename it, or delete the account.',
      );
    }
    await this.prisma.viewerProfile.delete({ where: { id } });
  }

  /**
   * Chooses the profile used on the device of the request.
   *
   * @throws NotFoundException when the account has no such profile.
   */
  async select(identity: ViewerIdentity, id: string): Promise<ViewerProfile> {
    const profile = await this.prisma.viewerProfile.findFirst({
      where: { id, viewerId: identity.viewer.id },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    await this.prisma.viewerSession.update({
      where: { id: identity.session.id },
      data: { profileId: profile.id },
    });
    return profile;
  }

  private assertNameFree(profiles: readonly ViewerProfile[], name: string): void {
    if (profiles.some((profile) => sameName(profile.name, name))) {
      throw new ConflictException('Another profile has this name');
    }
  }

  /**
   * Makes the main profile, named like the account. Two requests of a new
   * account can arrive together: a lock on the account makes one wait and
   * find what the other made.
   */
  private createMain(viewer: Pick<Viewer, 'id' | 'displayName'>): Promise<ViewerProfile> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${viewer.id}))`;
      const existing = await tx.viewerProfile.findFirst({
        where: { viewerId: viewer.id, isMain: true },
      });
      return (
        existing ??
        tx.viewerProfile.create({
          data: {
            viewerId: viewer.id,
            name: viewer.displayName.slice(0, MAX_PROFILE_NAME_LENGTH),
            color: PROFILE_COLORS[0],
            isMain: true,
          },
        })
      );
    });
  }
}
