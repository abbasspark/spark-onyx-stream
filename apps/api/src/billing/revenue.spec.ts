// SPDX-License-Identifier: AGPL-3.0-only
import {
  csvCell,
  csvLine,
  decimalAmount,
  isTimeZone,
  monthlyValue,
  monthOf,
  monthsUpTo,
} from './revenue.js';

describe('months', () => {
  it('puts a moment into the month people in a time zone live in', () => {
    const newYear = new Date('2026-12-31T23:30:00Z');
    expect(monthOf(newYear, 'UTC')).toBe('2026-12');
    expect(monthOf(newYear, 'Europe/Berlin')).toBe('2027-01');
    expect(monthOf(new Date('2026-03-01T02:00:00Z'), 'America/New_York')).toBe('2026-02');
  });

  it('counts back across a turn of the year', () => {
    expect(monthsUpTo('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsUpTo('2026-11', 1)).toEqual(['2026-11']);
    expect(monthsUpTo('2026-12', 12)[0]).toBe('2026-01');
  });

  it('knows a time zone from a made-up name', () => {
    expect(isTimeZone('Europe/Berlin')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone("UTC'; DROP TABLE payments;--")).toBe(false);
  });
});

describe('monthlyValue', () => {
  it('counts a yearly subscription as a twelfth', () => {
    expect(monthlyValue(799, 'MONTH')).toBe(799);
    expect(monthlyValue(7990, 'YEAR')).toBe(666);
    expect(monthlyValue(500, null)).toBe(500);
  });
});

describe('CSV', () => {
  it('quotes what would break a line', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12)).toBe('12');
  });

  it('defuses a cell a spreadsheet would run', () => {
    expect(csvCell('=HYPERLINK("http://evil.example")')).toBe(
      '"\'=HYPERLINK(""http://evil.example"")"',
    );
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    // A number is a number, also below zero.
    expect(csvCell(-5)).toBe('-5');
  });

  it('joins cells', () => {
    expect(csvLine(['a', 1, null, 'b,c'])).toBe('a,1,,"b,c"');
  });

  it('writes amounts with the digits of their currency', () => {
    expect(decimalAmount(799, 'EUR')).toBe('7.99');
    expect(decimalAmount(980, 'JPY')).toBe('980');
    expect(decimalAmount(5, 'USD')).toBe('0.05');
  });
});
