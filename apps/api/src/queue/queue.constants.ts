// SPDX-License-Identifier: AGPL-3.0-only

/** Queue for asset processing jobs: probe, remux, transcode, package, thumbnails. */
export const PROCESSING_QUEUE = 'processing';

/** Prefix of every BullMQ key in Redis. */
export const QUEUE_PREFIX = 'onyx';
