// SPDX-License-Identifier: AGPL-3.0-only

/** Whether a name is a time zone the runtime knows, such as "Europe/Berlin". */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The month a moment falls in for people in a time zone, as "2026-11". */
export function monthOf(moment: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(moment);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

/** The last months up to the one given, oldest first: ("2026-02", 3) gives December to February. */
export function monthsUpTo(last: string, count: number): string[] {
  const [year, month] = last.split('-').map(Number) as [number, number];
  const months: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = year * 12 + (month - 1) - back;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

/** What a subscription brings in per month: a yearly one counts a twelfth. */
export function monthlyValue(amount: number, interval: 'MONTH' | 'YEAR' | null): number {
  return interval === 'YEAR' ? Math.round(amount / 12) : amount;
}

/**
 * One cell of a CSV file. A cell that a spreadsheet would run as a formula
 * is defused with a leading apostrophe, since viewers choose their own names.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

/** "7.99" for 799 in a currency with two digits after the point, "980" for 980 yen. */
export function decimalAmount(amount: number, currency: string): string {
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // An unknown currency is written with two digits.
  }
  return (amount / 10 ** digits).toFixed(digits);
}
