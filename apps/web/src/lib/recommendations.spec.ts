// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { rowHeading, usableRows } from './recommendations';

describe('rowHeading', () => {
  it('puts the title behind the words of the row', () => {
    expect(rowHeading('Because you watched', 'Signal Fires')).toBe(
      'Because you watched Signal Fires',
    );
    expect(rowHeading('  More like ', 'Signal Fires')).toBe('More like Signal Fires');
    expect(rowHeading('', 'Signal Fires')).toBe('Signal Fires');
  });
});

describe('usableRows', () => {
  const card = { id: 'a', name: 'A' };

  it('keeps rows with a title to name them after and something in them', () => {
    const rows = [
      { because: card, titles: [card] },
      { because: card, titles: [] },
      { because: null, titles: [card] },
      { titles: [card] },
      null,
    ];
    expect(usableRows(rows)).toEqual([rows[0]]);
  });

  it('shows nothing for an answer of another shape', () => {
    expect(usableRows(undefined)).toEqual([]);
    expect(usableRows({ rows: [] })).toEqual([]);
  });
});
