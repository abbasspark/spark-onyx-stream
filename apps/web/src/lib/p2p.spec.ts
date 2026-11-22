// SPDX-License-Identifier: AGPL-3.0-only
import { describeSharing, NO_SHARING, sharedRatio } from './p2p';

describe('sharing with other viewers', () => {
  it('tells which share of the video came from them', () => {
    expect(sharedRatio(NO_SHARING)).toBeNull();
    expect(sharedRatio({ peers: 2, fromServers: 750, fromViewers: 250, toViewers: 0 })).toBe(0.25);
    expect(sharedRatio({ peers: 0, fromServers: 100, fromViewers: 0, toViewers: 0 })).toBe(0);
  });

  it('says in a line how it goes', () => {
    expect(describeSharing(NO_SHARING, false)).toBe('Off: everything comes from the servers.');
    expect(describeSharing(NO_SHARING, true)).toBe('Nobody else to share with right now.');
    expect(
      describeSharing({ peers: 1, fromServers: 100, fromViewers: 0, toViewers: 0 }, true),
    ).toBe('Connected to 1 other viewer.');
    expect(
      describeSharing({ peers: 3, fromServers: 600, fromViewers: 400, toViewers: 90 }, true),
    ).toBe('Connected to 3 other viewers. 40% came from them.');
  });
});
