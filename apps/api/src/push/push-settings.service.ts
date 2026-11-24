// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { FcmClient, parseServiceAccount, type ServiceAccount } from './fcm.js';
import { generateVapidKeys, isPushServiceAddress, type VapidKeys } from './web-push.js';

export const PUSH_SETTINGS_KEY = 'push';

/** What viewers are told about by themselves, without anyone writing a message. */
export interface AutomaticSettings {
  /** A series somebody follows has a new episode. */
  newEpisodes: boolean;
  /** The catalog has new titles. */
  newTitles: boolean;
}

interface Stored {
  vapid?: { publicKey: string; privateKey: string; createdAt: string };
  fcm?: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    tokenUri: string;
    savedAt: string;
  } | null;
  automatic?: Partial<AutomaticSettings>;
}

export const DEFAULT_AUTOMATIC: AutomaticSettings = { newEpisodes: true, newTitles: false };

/** What a client needs to know to take notifications. */
export interface PushClientConfig {
  /** For browsers: the key to subscribe with. */
  web: { publicKey: string };
  /** For apps: the Firebase project messages come from. Null: apps cannot be reached. */
  fcm: { projectId: string } | null;
  topics: readonly string[];
}

export interface PushSetup {
  web: { publicKey: string; createdAt: string; contact: string };
  fcm: { projectId: string; clientEmail: string; savedAt: string } | null;
  automatic: AutomaticSettings;
}

/**
 * How the installation sends notifications: its own key pair for browsers,
 * made the first time it is needed, and the key of the operator's Firebase
 * project for apps. Private keys are kept encrypted with the master key.
 */
@Injectable()
export class PushSettingsService {
  private fcmClient: { savedAt: string; client: FcmClient } | null = null;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  private async read(): Promise<Stored> {
    const row = await this.prisma.setting.findUnique({ where: { key: PUSH_SETTINGS_KEY } });
    return (row?.value ?? {}) as Stored;
  }

  private async write(value: Stored): Promise<void> {
    const json = JSON.parse(JSON.stringify(value)) as object;
    await this.prisma.setting.upsert({
      where: { key: PUSH_SETTINGS_KEY },
      create: { key: PUSH_SETTINGS_KEY, value: json },
      update: { value: json },
    });
  }

  /** The key pair for browsers, made now when there is none. */
  private async vapid(stored: Stored): Promise<NonNullable<Stored['vapid']>> {
    if (stored.vapid) {
      return stored.vapid;
    }
    const keys = generateVapidKeys();
    const vapid = {
      publicKey: keys.publicKey,
      privateKey: this.secrets.encrypt(keys.privateKey),
      createdAt: new Date().toISOString(),
    };
    // Two requests may get here at once. The one that writes last wins, and
    // both answer with what is stored then.
    await this.write({ ...(await this.read()), vapid });
    return (await this.read()).vapid ?? vapid;
  }

  async vapidKeys(): Promise<VapidKeys> {
    const vapid = await this.vapid(await this.read());
    return { publicKey: vapid.publicKey, privateKey: this.secrets.decrypt(vapid.privateKey) };
  }

  async automatic(): Promise<AutomaticSettings> {
    return { ...DEFAULT_AUTOMATIC, ...(await this.read()).automatic };
  }

  async clientConfig(topics: readonly string[]): Promise<PushClientConfig> {
    const stored = await this.read();
    const vapid = await this.vapid(stored);
    return {
      web: { publicKey: vapid.publicKey },
      fcm: stored.fcm ? { projectId: stored.fcm.projectId } : null,
      topics,
    };
  }

  async setup(): Promise<PushSetup> {
    const stored = await this.read();
    const vapid = await this.vapid(stored);
    return {
      web: {
        publicKey: vapid.publicKey,
        createdAt: vapid.createdAt,
        contact: this.config.pushContact,
      },
      fcm: stored.fcm
        ? {
            projectId: stored.fcm.projectId,
            clientEmail: stored.fcm.clientEmail,
            savedAt: stored.fcm.savedAt,
          }
        : null,
      automatic: { ...DEFAULT_AUTOMATIC, ...stored.automatic },
    };
  }

  async setAutomatic(automatic: Partial<AutomaticSettings>): Promise<AutomaticSettings> {
    const stored = await this.read();
    const next = { ...DEFAULT_AUTOMATIC, ...stored.automatic, ...automatic };
    await this.write({ ...stored, automatic: next });
    return next;
  }

  /**
   * Takes the key of a Firebase service account and tries it: Google must
   * hand out an access token for it. Nothing is stored when it does not.
   *
   * @throws BadRequestException with what is wrong, in words for the admin.
   */
  async setFcm(json: string): Promise<ServiceAccount> {
    let account: ServiceAccount;
    try {
      account = parseServiceAccount(json);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (!this.isGoogle(account.tokenUri)) {
      throw new BadRequestException(
        'The file names an address for tokens that is not one of Google. It was not stored.',
      );
    }
    try {
      await new FcmClient(account, this.fcmApi()).accessToken();
    } catch (error) {
      throw new BadRequestException(
        `The key was not accepted. ${(error as Error).message}. Nothing was stored.`,
      );
    }
    const stored = await this.read();
    await this.write({
      ...stored,
      fcm: {
        projectId: account.projectId,
        clientEmail: account.clientEmail,
        privateKey: this.secrets.encrypt(account.privateKey),
        tokenUri: account.tokenUri,
        savedAt: new Date().toISOString(),
      },
    });
    this.fcmClient = null;
    return account;
  }

  /** Forgets the Firebase key. Apps are no longer reached, and their devices are forgotten. */
  async removeFcm(): Promise<number> {
    const stored = await this.read();
    await this.write({ ...stored, fcm: null });
    this.fcmClient = null;
    return (await this.prisma.pushDevice.deleteMany({ where: { provider: 'FCM' } })).count;
  }

  /**
   * Makes a new key pair for browsers. Every browser subscribed with the old
   * one and takes nothing signed with the new: their devices are forgotten,
   * and each browser subscribes again when its viewer next visits.
   */
  async renewVapid(): Promise<number> {
    const stored = await this.read();
    await this.write({ ...stored, vapid: undefined });
    await this.vapid(await this.read());
    return (await this.prisma.pushDevice.deleteMany({ where: { provider: 'WEB' } })).count;
  }

  /** The client for Firebase, or null when no key is stored. Kept until the key changes. */
  async fcm(): Promise<FcmClient | null> {
    const stored = (await this.read()).fcm;
    if (!stored) {
      return null;
    }
    if (this.fcmClient?.savedAt !== stored.savedAt) {
      this.fcmClient = {
        savedAt: stored.savedAt,
        client: new FcmClient(
          {
            projectId: stored.projectId,
            clientEmail: stored.clientEmail,
            privateKey: this.secrets.decrypt(stored.privateKey),
            tokenUri: stored.tokenUri,
          },
          this.fcmApi(),
        ),
      };
    }
    return this.fcmClient.client;
  }

  /** Where messages for apps are sent. An installation under test names its own. */
  private fcmApi(): string | undefined {
    const test = this.config.pushServiceHosts.find((host) => host.startsWith('fcm='));
    return test ? test.slice(4) : undefined;
  }

  private isGoogle(address: string): boolean {
    try {
      const url = new URL(address);
      const hosts = this.config.pushServiceHosts.filter((host) => !host.startsWith('fcm='));
      return (
        (url.protocol === 'https:' && /(^|\.)googleapis\.com$/i.test(url.hostname)) ||
        isPushServiceAddress(address, hosts)
      );
    } catch {
      return false;
    }
  }
}
