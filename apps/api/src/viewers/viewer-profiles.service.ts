// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, type Viewer, type ViewerProfile } from '@onyx/database';
import { assertUnrestricted, PROFILE_RESTRICTED } from '../audience/audience.js';
import { hashPassword, verifyPassword } from '../auth/password-hasher.js';
import { KIDS_DEFAULT_AGE } from '../catalog/age-rating.js';
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

/** Wrong PINs in a row before a profile takes no more tries for a while. */
export const MAX_PIN_TRIES = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;

/** A profile as its owner sees it. */
export interface ProfileView {
  id: string;
  name: string;
  color: string;
  /** The profile the account started with. It cannot be deleted, and has no age limit. */
  isMain: boolean;
  /** The highest age a title may be for and still show. Null: everything shows. */
  maxAge: number | null;
  /** A profile for a child: clients give it a simpler look. */
  isKids: boolean;
  /** Whether choosing it asks for a PIN. */
  locked: boolean;
  /**
   * The language this profile likes to hear, as a tag such as "de". Null:
   * each video in its own default. A player starts with the track of this
   * language when a video has one.
   */
  audioLanguage: string | null;
  /** The language this profile reads subtitles in. Null: subtitles are off. */
  subtitleLanguage: string | null;
}

/** What a profile likes to hear and to read. */
export interface PlaybackPreferences {
  audioLanguage: string | null;
  subtitleLanguage: string | null;
}

export function toProfileView(profile: ViewerProfile): ProfileView {
  return {
    id: profile.id,
    name: profile.name,
    color: profile.color,
    isMain: profile.isMain,
    maxAge: profile.maxAge,
    isKids: profile.isKids,
    locked: profile.pinHash !== null,
    audioLanguage: profile.audioLanguage,
    subtitleLanguage: profile.subtitleLanguage,
  };
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
   * @throws ForbiddenException from a profile with an age limit.
   * @throws ConflictException when the account is full or has a profile of that name.
   */
  async create(viewer: Viewer, input: CreateProfileInput): Promise<ViewerProfile> {
    assertUnrestricted();
    const profiles = await this.list(viewer);
    if (profiles.length >= MAX_PROFILES) {
      throw new ConflictException(`An account can have ${MAX_PROFILES} profiles`);
    }
    this.assertNameFree(profiles, input.name);
    // A colour no other profile has yet, so they are easy to tell apart.
    const taken = new Set(profiles.map((profile) => profile.color));
    const color =
      input.color ?? PROFILE_COLORS.find((candidate) => !taken.has(candidate)) ?? PROFILE_COLORS[0];
    const isKids = input.isKids ?? false;
    return this.prisma.viewerProfile.create({
      data: {
        viewerId: viewer.id,
        name: input.name,
        color,
        isKids,
        maxAge: input.maxAge ?? (isKids ? KIDS_DEFAULT_AGE : null),
        audioLanguage: input.audioLanguage ?? null,
        subtitleLanguage: input.subtitleLanguage ?? null,
      },
    });
  }

  /**
   * @throws ForbiddenException from a profile with an age limit.
   * @throws NotFoundException when the account has no such profile.
   * @throws ConflictException when another profile has that name, or for a limit on the main profile.
   */
  async update(viewer: Viewer, id: string, input: UpdateProfileInput): Promise<ViewerProfile> {
    assertUnrestricted();
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
    const isKids = input.isKids ?? profile.isKids;
    let maxAge = input.maxAge === undefined ? profile.maxAge : input.maxAge;
    if (isKids && maxAge === null) {
      if (input.maxAge === null) {
        throw new BadRequestException('A profile for a child has an age limit');
      }
      maxAge = KIDS_DEFAULT_AGE;
    }
    if (profile.isMain && (isKids || maxAge !== null)) {
      throw new ConflictException(
        'The main profile has no age limit: it is the way back into the account. Add a profile for the child instead.',
      );
    }
    return this.prisma.viewerProfile.update({
      where: { id },
      data: {
        name: input.name,
        color: input.color,
        isKids,
        maxAge,
        audioLanguage: input.audioLanguage,
        subtitleLanguage: input.subtitleLanguage,
      },
    });
  }

  /**
   * Changes what the profile in use likes to hear and to read. Open to a
   * profile with an age limit: a child may choose a language. A sign-in that
   * still has to choose a profile has none to change.
   *
   * @throws ForbiddenException while no profile was chosen.
   */
  async setPreferences(
    identity: ViewerIdentity,
    input: Partial<PlaybackPreferences>,
  ): Promise<ViewerProfile> {
    if (identity.session.profileLocked) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: PROFILE_RESTRICTED,
        message: 'Choose a profile first.',
      });
    }
    const profile = await this.current(identity);
    return this.prisma.viewerProfile.update({
      where: { id: profile.id },
      data: { audioLanguage: input.audioLanguage, subtitleLanguage: input.subtitleLanguage },
    });
  }

  /**
   * Puts a PIN on a profile, changes it, or takes it off. Asks for the
   * password of the account, so this is also the way out when a PIN is
   * forgotten, and nobody who only holds the remote can lift one.
   *
   * @throws BadRequestException for a wrong password.
   * @throws NotFoundException when the account has no such profile.
   */
  async setPin(
    viewer: Viewer,
    id: string,
    pin: string | null,
    password: string,
  ): Promise<ViewerProfile> {
    if (!(await verifyPassword(password, viewer.passwordHash))) {
      throw new BadRequestException('Password is incorrect');
    }
    const profile = await this.prisma.viewerProfile.findFirst({
      where: { id, viewerId: viewer.id },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    const updated = await this.prisma.viewerProfile.update({
      where: { id },
      data: {
        pinHash: pin === null ? null : await hashPassword(pin),
        pinFailed: 0,
        pinLockedUntil: null,
      },
    });
    // Without a PIN on the main profile, no sign-in waits for one.
    if (profile.isMain && pin === null) {
      await this.prisma.viewerSession.updateMany({
        where: { viewerId: viewer.id, profileLocked: true },
        data: { profileLocked: false },
      });
    }
    return updated;
  }

  /**
   * Takes the PIN off a profile without asking for anything: for an admin
   * who helps a viewer that forgot both.
   *
   * @throws NotFoundException
   */
  async clearPin(viewerId: string, id: string): Promise<ViewerProfile> {
    const profile = await this.prisma.viewerProfile.findFirst({ where: { id, viewerId } });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    const updated = await this.prisma.viewerProfile.update({
      where: { id },
      data: { pinHash: null, pinFailed: 0, pinLockedUntil: null },
    });
    if (profile.isMain) {
      await this.prisma.viewerSession.updateMany({
        where: { viewerId, profileLocked: true },
        data: { profileLocked: false },
      });
    }
    return updated;
  }

  /**
   * Deletes a profile with its watch history. Devices that used it go back to
   * the main profile.
   *
   * @throws ForbiddenException from a profile with an age limit.
   * @throws NotFoundException when the account has no such profile.
   * @throws ConflictException for the main profile.
   */
  async remove(viewer: Viewer, id: string): Promise<void> {
    assertUnrestricted();
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
    // Devices that used it fall back to the main profile. Where that has a PIN, they have to enter it.
    const main = await this.main(viewer);
    await this.prisma.$transaction([
      ...(main.pinHash
        ? [
            this.prisma.viewerSession.updateMany({
              where: { viewerId: viewer.id, profileId: id },
              data: { profileLocked: true },
            }),
          ]
        : []),
      this.prisma.viewerProfile.delete({ where: { id } }),
    ]);
  }

  /**
   * Chooses the profile used on the device of the request.
   *
   * @param pin Needed for a profile that has one.
   * @throws NotFoundException when the account has no such profile.
   * @throws ForbiddenException with code "pin_required" or "pin_wrong".
   * @throws HttpException 429 with code "pin_locked" after too many wrong PINs.
   */
  async select(identity: ViewerIdentity, id: string, pin?: string): Promise<ViewerProfile> {
    const profile = await this.prisma.viewerProfile.findFirst({
      where: { id, viewerId: identity.viewer.id },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    if (profile.pinHash) {
      await this.checkPin(profile, pin);
    }
    await this.prisma.viewerSession.update({
      where: { id: identity.session.id },
      data: { profileId: profile.id, profileLocked: false },
    });
    return profile;
  }

  private async checkPin(profile: ViewerProfile, pin: string | undefined): Promise<void> {
    const lockedFor = (profile.pinLockedUntil?.getTime() ?? 0) - Date.now();
    if (lockedFor > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          code: 'pin_locked',
          message: 'Too many wrong PINs. Try again in a few minutes.',
          retryAfterSeconds: Math.ceil(lockedFor / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!pin) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'pin_required',
        message: 'This profile asks for its PIN.',
      });
    }
    if (await verifyPassword(pin, profile.pinHash as string)) {
      if (profile.pinFailed > 0) {
        await this.prisma.viewerProfile.update({
          where: { id: profile.id },
          data: { pinFailed: 0, pinLockedUntil: null },
        });
      }
      return;
    }
    const failed = profile.pinFailed + 1;
    const lock = failed >= MAX_PIN_TRIES;
    await this.prisma.viewerProfile.update({
      where: { id: profile.id },
      data: {
        pinFailed: lock ? 0 : failed,
        pinLockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MS) : null,
      },
    });
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'pin_wrong',
      message: lock
        ? 'That PIN is not right. This profile takes no more tries for five minutes.'
        : 'That PIN is not right.',
      attemptsLeft: lock ? 0 : MAX_PIN_TRIES - failed,
    });
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
