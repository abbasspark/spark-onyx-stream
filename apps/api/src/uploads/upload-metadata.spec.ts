// SPDX-License-Identifier: AGPL-3.0-only
import { encodeUploadMetadata, parseUploadMetadata } from './upload-metadata.js';

describe('parseUploadMetadata', () => {
  it('decodes pairs', () => {
    const header = encodeUploadMetadata({ assetId: 'abc-123', filename: 'Café movie.mp4' });

    expect(parseUploadMetadata(header)).toEqual({ assetId: 'abc-123', filename: 'Café movie.mp4' });
  });

  it('accepts a missing header and keys without a value', () => {
    expect(parseUploadMetadata(undefined)).toEqual({});
    expect(parseUploadMetadata('')).toEqual({});
    expect(parseUploadMetadata('is_confidential')).toEqual({ is_confidential: '' });
  });

  it('rejects malformed headers', () => {
    expect(parseUploadMetadata('key not-base64!')).toBeNull();
    expect(parseUploadMetadata('key dmFsdWU= extra')).toBeNull();
    expect(parseUploadMetadata('key dmFsdWU=,key dmFsdWU=')).toBeNull();
    expect(parseUploadMetadata(',')).toBeNull();
  });
});
