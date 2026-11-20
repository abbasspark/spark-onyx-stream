// SPDX-License-Identifier: AGPL-3.0-only
//
// Runs the driver contract against a real S3-compatible service.
// Skipped unless TEST_S3_ENDPOINT is set. The bucket must already exist.
// Each test works under its own random folder in the bucket and the suite
// removes those folders afterwards.
import { randomBytes } from 'node:crypto';
import { describeStorageDriverContract } from './driver-contract.js';
import { S3StorageDriver } from './s3.driver.js';

const endpoint = process.env.TEST_S3_ENDPOINT;

describe.skipIf(!endpoint)('S3StorageDriver (real S3-compatible service)', () => {
  const runPrefix = `onyx-test-${randomBytes(4).toString('hex')}`;

  function createDriver(keyPrefix: string): S3StorageDriver {
    return new S3StorageDriver({
      endpoint,
      region: process.env.TEST_S3_REGION ?? 'us-east-1',
      bucket: process.env.TEST_S3_BUCKET ?? 'onyx-test',
      accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? '',
      forcePathStyle: true,
      keyPrefix,
    });
  }

  afterAll(async () => {
    const cleaner = createDriver(runPrefix);
    for (const folder of ['assets', 'a', 'file.txt', 'stream.bin', 'range.txt', 'info.txt']) {
      await cleaner.deletePrefix(folder).catch(() => undefined);
      await cleaner.delete(folder).catch(() => undefined);
    }
    await cleaner.close();
  });

  describeStorageDriverContract(async () =>
    createDriver(`${runPrefix}/${randomBytes(4).toString('hex')}`),
  );

  it('keeps pools with different key prefixes apart', async () => {
    const first = createDriver(`${runPrefix}/pool-one`);
    const second = createDriver(`${runPrefix}/pool-two`);

    await first.write('shared-name.txt', Buffer.from('one'));

    expect(await second.exists('shared-name.txt')).toBe(false);

    await first.delete('shared-name.txt');
    await first.close();
    await second.close();
  });
});
