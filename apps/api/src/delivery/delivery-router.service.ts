// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { deliveryHint } from './delivery-hint.js';
import { chooseEdge } from './delivery-pick.js';
import { edgeSigningKey } from './edge-credentials.js';
import { EdgeRegistry } from './edge-registry.service.js';

/** Who an address is for. Admins always watch from the main server. */
export type Audience = 'admin' | 'viewer';

/** Where the files of one playback session come from, and what signs its token. */
export interface DeliveryRoute {
  /** Origin of the server, without a path. Empty for the API itself. */
  baseUrl: string;
  signingSecret: string;
  /** Null for the main server. */
  edgeId: string | null;
}

/**
 * Chooses the server a viewer gets video from: an edge when one can take the
 * viewer, otherwise the main server.
 */
@Injectable()
export class DeliveryRouter {
  private readonly logger = new Logger(DeliveryRouter.name);

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(EdgeRegistry) private readonly edges: EdgeRegistry,
  ) {}

  /** The main server. */
  origin(): DeliveryRoute {
    return {
      baseUrl: this.config.mediaBaseUrl,
      signingSecret: this.config.playbackSigningSecret,
      edgeId: null,
    };
  }

  async route(kind: 'video' | 'live', contentId: string): Promise<DeliveryRoute> {
    const avoid = deliveryHint.getStore()?.avoid ?? null;
    try {
      const online = await this.edges.online();
      const edge = chooseEdge(
        kind,
        contentId,
        online.filter(
          (candidate) =>
            (kind === 'live' ? candidate.serveLive : candidate.serveVideo) &&
            // The viewer's player just failed on this one.
            candidate.publicUrl !== avoid,
        ),
      );
      if (edge) {
        return {
          baseUrl: edge.publicUrl,
          signingSecret: edgeSigningKey(
            this.config.playbackSigningSecret,
            edge.id,
            edge.secretHash,
          ),
          edgeId: edge.id,
        };
      }
    } catch (error) {
      // Playback must not depend on the edges being known.
      this.logger.warn(`Could not choose an edge, using the main server: ${String(error)}`);
    }
    return this.origin();
  }
}
