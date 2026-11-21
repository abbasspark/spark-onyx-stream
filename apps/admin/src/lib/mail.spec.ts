// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { describeMailServer } from './mail';

describe('describeMailServer', () => {
  it('says where mail goes and how the connection is protected', () => {
    expect(
      describeMailServer({ host: 'smtp.example.com', port: 465, secure: true, user: 'mailer' }),
    ).toBe('smtp.example.com, port 465, encrypted from the start');
    expect(describeMailServer({ host: 'localhost', port: 587, secure: false, user: null })).toBe(
      'localhost, port 587, encryption starts after connecting',
    );
  });
});
