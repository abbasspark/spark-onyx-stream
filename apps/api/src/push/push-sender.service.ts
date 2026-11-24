// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { PushSettingsService } from './push-settings.service.js';
import { encryptPayload, isPushServiceAddress, vapidAuthorization } from './web-push.js';

/** A notification as a device gets it. The same for every kind of device. */
export interface PushMessage {
  id: string;
  topic: string;
  title: string;
  body: string;
  /** An absolute address of a picture, or null. */
  image: string | null;
  /** An absolute address on the website, or null. */
  link: string | null;
  /** What it is about, for apps that open their own screens. */
  data: Record<string, string>;
}

export interface PushTarget {
  provider: 'WEB' | 'FCM';
  token: string;
  p256dh: string | null;
  auth: string | null;
}

export type PushResult =
  | { status: 'sent' }
  /** The device is not there any more: forget it. */
  | { status: 'gone' }
  | { status: 'retry'; reason: string }
  | { status: 'failed'; reason: string };

/** How long a push service keeps a message for a device that is off. */
const KEEP_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 10_000;

/** Sends one notification to one device, through whatever reaches it. */
@Injectable()
export class PushSender {
  constructor(
    @Inject(PushSettingsService) private readonly settings: PushSettingsService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    return target.provider === 'WEB'
      ? this.toBrowser(target, message)
      : this.toApp(target, message);
  }

  private async toApp(target: PushTarget, message: PushMessage): Promise<PushResult> {
    const client = await this.settings.fcm();
    if (!client) {
      return { status: 'failed', reason: 'No Firebase key is stored' };
    }
    return client.send(target.token, {
      title: message.title,
      body: message.body,
      image: message.image,
      data: {
        ...message.data,
        id: message.id,
        topic: message.topic,
        ...(message.link ? { link: message.link } : {}),
      },
    });
  }

  private async toBrowser(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (!target.p256dh || !target.auth) {
      return { status: 'gone' };
    }
    // Checked when the browser subscribed, and again here: the list of
    // hosts may have changed, and nothing else is ever called.
    if (!isPushServiceAddress(target.token, this.webHosts())) {
      return { status: 'gone' };
    }
    try {
      const keys = await this.settings.vapidKeys();
      const body = encryptPayload(Buffer.from(JSON.stringify(message)), {
        p256dh: target.p256dh,
        auth: target.auth,
      });
      const response = await fetch(target.token, {
        method: 'POST',
        headers: {
          Authorization: vapidAuthorization(target.token, keys, this.config.pushContact),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(KEEP_SECONDS),
          Urgency: 'normal',
        },
        body: new Uint8Array(body),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status >= 200 && response.status < 300) {
        return { status: 'sent' };
      }
      // The subscription ended: the viewer withdrew the permission, or the browser is gone.
      if (response.status === 404 || response.status === 410) {
        return { status: 'gone' };
      }
      if (response.status === 429 || response.status >= 500) {
        return { status: 'retry', reason: `The push service answered ${response.status}` };
      }
      return { status: 'failed', reason: `The push service answered ${response.status}` };
    } catch (error) {
      return {
        status: 'retry',
        reason: `The push service could not be reached: ${(error as Error).message}`,
      };
    }
  }

  /** The hosts browsers may name beyond the known ones. */
  webHosts(): string[] {
    return this.config.pushServiceHosts.filter((host) => !host.startsWith('fcm='));
  }
}
