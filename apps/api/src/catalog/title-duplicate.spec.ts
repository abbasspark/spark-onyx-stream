// SPDX-License-Identifier: AGPL-3.0-only
import { copyName, duplicateTitleSchema } from './title-duplicate.js';

describe('copyName', () => {
  it('adds "(copy)" once', () => {
    expect(copyName('Harbour Lights')).toBe('Harbour Lights (copy)');
    expect(copyName('Harbour Lights (copy)')).toBe('Harbour Lights (copy)');
  });

  it('cuts a long name so the result still fits', () => {
    const name = copyName('x'.repeat(200));
    expect(name).toHaveLength(200);
    expect(name.endsWith(' (copy)')).toBe(true);
  });
});

describe('duplicateTitleSchema', () => {
  it('starts from a safe choice when nothing is said', () => {
    expect(duplicateTitleSchema.parse({})).toEqual({
      parts: {
        artwork: true,
        classification: true,
        collections: false,
        credits: true,
        translations: true,
        pricing: true,
        availability: false,
        videos: false,
        seasons: 'structure',
        metadataLink: false,
      },
    });
  });

  it('takes single choices and keeps the rest', () => {
    const parsed = duplicateTitleSchema.parse({
      name: '  Director’s cut ',
      parts: { videos: true, seasons: 'none' },
    });
    expect(parsed.name).toBe('Director’s cut');
    expect(parsed.parts).toMatchObject({ videos: true, seasons: 'none', credits: true });
  });

  it('refuses what it does not know', () => {
    expect(duplicateTitleSchema.safeParse({ parts: { seasons: 'all' } }).success).toBe(false);
    expect(duplicateTitleSchema.safeParse({ name: ' ' }).success).toBe(false);
  });
});
