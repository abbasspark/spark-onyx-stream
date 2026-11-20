// SPDX-License-Identifier: AGPL-3.0-only
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JobEndedError, JobExecutor } from '../../src/processing/job-executor.js';
import { encodeUploadMetadata } from '../../src/uploads/upload-metadata.js';
import type { TestApp } from './test-app.js';

export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

/** Whether FFmpeg can be started. Suites that need it are skipped otherwise. */
export const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0;

const TUS = { 'Tus-Resumable': '1.0.0' };

/** Creates a short test video with FFmpeg's built-in test pattern and tone. */
export function generateVideo(target: string, options: string[]): void {
  const result = spawnSync(FFMPEG, ['-v', 'error', '-y', ...options, target]);
  if (result.status !== 0) {
    throw new Error(`Could not generate ${target}: ${result.stderr.toString()}`);
  }
}

/** Options for a small H.264 and AAC video with a keyframe every 2 s, which can be copied. */
export function copyableVideoOptions(seconds = 9): string[] {
  return [
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=640x360:rate=30:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=880:duration=${seconds}`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    '-b:v',
    '300k',
    '-c:a',
    'aac',
  ];
}

/**
 * Creates an asset, uploads a file to it with the tus protocol and waits
 * until processing has been queued.
 *
 * @returns The id of the asset.
 */
export async function uploadSource(
  testApp: TestApp,
  token: string,
  file: string,
  body: Record<string, unknown> = {},
): Promise<string> {
  const auth = testApp.bearer(token);
  const content = await readFile(file);

  const created = await testApp
    .http()
    .post('/v1/assets')
    .set(auth)
    .send({ title: path.basename(file), ...body })
    .expect(201);
  const assetId = created.body.asset.id as string;

  await testApp
    .http()
    .post('/v1/uploads')
    .set(auth)
    .set(TUS)
    .set('Upload-Length', String(content.length))
    .set('Upload-Metadata', encodeUploadMetadata({ assetId, filename: path.basename(file) }))
    .expect(201);
  await testApp
    .http()
    .patch(`/v1/uploads/${assetId}`)
    .set(auth)
    .set(TUS)
    .set('Upload-Offset', '0')
    .set('Content-Type', 'application/offset+octet-stream')
    .send(content)
    .expect(204);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (testApp.queue.waiting.some((job) => job.data.assetId === assetId)) {
      return assetId;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Processing was not queued after the upload');
}

/**
 * Runs the queued jobs, including the ones they queue in turn, until none is
 * left. Each job gets one attempt, so a failing job ends at once.
 */
export async function drainQueue(testApp: TestApp): Promise<void> {
  const executor = testApp.app.get(JobExecutor);

  while (testApp.queue.waiting.length > 0) {
    const next = testApp.queue.waiting.shift();
    if (!next) {
      break;
    }
    try {
      await executor.execute({
        jobId: next.data.jobId,
        assetId: next.data.assetId,
        type: next.name as never,
        attempt: 1,
        maxAttempts: 1,
        workerId: 'test-worker',
      });
    } catch (error) {
      if (!(error instanceof JobEndedError)) {
        throw error;
      }
    }
  }
}
