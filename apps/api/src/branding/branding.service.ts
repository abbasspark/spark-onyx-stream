// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { type Image, type Prisma, PrismaClient } from '@onyx/database';
import { type ImageView, toImageView } from '../catalog/catalog.views.js';
import { AppConfig } from '../config/app-config.js';
import {
  BRANDING_SETTINGS_KEY,
  type BrandingInput,
  type BrandingSettings,
  DEFAULT_ACCENT,
  DEFAULT_BRANDING,
  DEFAULT_DESCRIPTION,
  type FooterLink,
  iconProblem,
  readBranding,
} from './branding.rules.js';
import { contrastOnBlack, deepen, MIN_ACCENT_CONTRAST, readableOnBlack } from './color.js';

/** The branding as the panel edits it. */
export interface BrandingView {
  settings: BrandingSettings;
  logo: ImageView | null;
  icon: ImageView | null;
  /** What shows where a setting is left empty. */
  defaults: { name: string; description: string; accent: string };
  /** How light the accent has to be against black. */
  minimumContrast: number;
}

/** How the website presents itself, as the website reads it. */
export interface PublicSite {
  name: string;
  description: string;
  logo: { url: string; width: number; height: number } | null;
  logoShowsName: boolean;
  icon: { url: string; width: number; height: number } | null;
  /** Null: the colours the website ships with. */
  accent: { color: string; deep: string } | null;
  footerText: string | null;
  footerLinks: FooterLink[];
}

/** How long a process trusts what it read, in milliseconds. A change reaches every process within it. */
const KEPT_MS = 10_000;

/**
 * The name, logo, colour and footer of the site.
 *
 * Available everywhere: emails and sign-in codes carry the name, and they
 * are sent from every kind of process.
 */
@Injectable()
export class BrandingService {
  private kept: { settings: BrandingSettings; at: number } | null = null;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async settings(): Promise<BrandingSettings> {
    // Tests empty the database between cases, behind the back of this memory.
    const remember = this.config.nodeEnv !== 'test';
    if (remember && this.kept && Date.now() - this.kept.at < KEPT_MS) {
      return this.kept.settings;
    }
    const stored = await this.prisma.setting.findUnique({ where: { key: BRANDING_SETTINGS_KEY } });
    const settings = readBranding(stored?.value);
    this.kept = { settings, at: Date.now() };
    return settings;
  }

  /**
   * The name of the site, for emails and everything else that speaks in its
   * name. Never fails: without a database answer it is the installation's own.
   */
  async siteName(): Promise<string> {
    try {
      return (await this.settings()).name ?? this.config.siteName;
    } catch {
      return this.config.siteName;
    }
  }

  private async images(settings: BrandingSettings): Promise<Map<string, Image>> {
    const ids = [settings.logoId, settings.iconId].filter((id): id is string => id !== null);
    if (ids.length === 0) {
      return new Map();
    }
    const images = await this.prisma.image.findMany({ where: { id: { in: ids } } });
    return new Map(images.map((image) => [image.id, image]));
  }

  async view(): Promise<BrandingView> {
    const settings = await this.settings();
    const images = await this.images(settings);
    const view = (id: string | null) => {
      const image = id ? images.get(id) : undefined;
      return image ? toImageView(image, this.config.mediaBaseUrl) : null;
    };
    return {
      settings,
      logo: view(settings.logoId),
      icon: view(settings.iconId),
      defaults: {
        name: this.config.siteName,
        description: DEFAULT_DESCRIPTION,
        accent: DEFAULT_ACCENT,
      },
      minimumContrast: MIN_ACCENT_CONTRAST,
    };
  }

  /** What the website shows. A picture that is gone is left out, not an error. */
  async site(): Promise<PublicSite> {
    const settings = await this.settings();
    const images = await this.images(settings);
    const picture = (id: string | null) => {
      const image = id ? images.get(id) : undefined;
      if (!image) {
        return null;
      }
      const { url, width, height } = toImageView(image, this.config.mediaBaseUrl);
      return { url, width, height };
    };
    return {
      name: settings.name ?? this.config.siteName,
      description: settings.description ?? DEFAULT_DESCRIPTION,
      logo: picture(settings.logoId),
      logoShowsName: settings.logoShowsName,
      icon: picture(settings.iconId),
      accent: settings.accent ? { color: settings.accent, deep: deepen(settings.accent) } : null,
      footerText: settings.footerText,
      footerLinks: settings.footerLinks,
    };
  }

  /**
   * @throws UnprocessableEntityException when a picture does not exist, the
   *   icon is not a square PNG, or the colour cannot be read on the black
   *   page. For the colour the answer names the nearest one that can
   *   (`suggestion`).
   */
  async update(input: BrandingInput): Promise<BrandingView> {
    const images = await this.images(input);
    if (input.logoId && !images.has(input.logoId)) {
      throw new UnprocessableEntityException('The chosen logo does not exist (any more)');
    }
    if (input.iconId) {
      const icon = images.get(input.iconId);
      if (!icon) {
        throw new UnprocessableEntityException('The chosen icon does not exist (any more)');
      }
      const problem = iconProblem(icon);
      if (problem) {
        throw new UnprocessableEntityException(problem);
      }
    }
    if (input.accent && contrastOnBlack(input.accent) < MIN_ACCENT_CONTRAST) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: 'accent_too_dark',
        message:
          'This colour is too dark for the black page: text in it, and black text on buttons in it, could not be read',
        suggestion: readableOnBlack(input.accent),
      });
    }
    await this.write(input);
    return this.view();
  }

  /** Back to how the site ships. */
  async reset(): Promise<BrandingView> {
    await this.prisma.setting.deleteMany({ where: { key: BRANDING_SETTINGS_KEY } });
    this.kept = { settings: DEFAULT_BRANDING, at: Date.now() };
    return this.view();
  }

  private async write(settings: BrandingSettings): Promise<void> {
    const value = { ...settings } as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key: BRANDING_SETTINGS_KEY },
      create: { key: BRANDING_SETTINGS_KEY, value },
      update: { value },
    });
    this.kept = { settings, at: Date.now() };
  }

  /** Whether the branding shows this picture, so it is not deleted from under it. */
  async usesImage(id: string): Promise<boolean> {
    const stored = await this.prisma.setting.findUnique({ where: { key: BRANDING_SETTINGS_KEY } });
    const settings = readBranding(stored?.value);
    return settings.logoId === id || settings.iconId === id;
  }
}
