// SPDX-License-Identifier: AGPL-3.0-only

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Formats a byte count, for example "12.4 MB". Accepts text because the API sends large counts as text. */
export function formatBytes(bytes: number | string | null | undefined): string {
  const value = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return '–';
  }

  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < BYTE_UNITS.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${unit === 0 || amount >= 100 ? Math.round(amount) : amount.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/** Formats a length as "1:02:03" or "2:03". */
export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || milliseconds < 0) {
    return '–';
  }

  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (part: number) => String(part).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Formats an ISO date for reading, in the browser's language and time zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '–';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '–' : dateTime.format(date);
}

const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

/** Formats a calendar day such as "2021-09-05" for reading. The day stays the same in every time zone. */
export function formatDay(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return '–';
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '–' : day.format(date);
}

/** Turns an API constant such as "AES_128" into "Aes 128" for display. */
export function humanize(constant: string | null | undefined): string {
  if (!constant) {
    return '–';
  }
  const words = constant.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Describes the picture of an asset, for example "1920×1080, 25 fps". */
export function formatResolution(
  width: number | null,
  height: number | null,
  frameRate?: number | null,
): string {
  if (!width || !height) {
    return '–';
  }
  const rate = frameRate ? `, ${Number(frameRate.toFixed(2))} fps` : '';
  return `${width}×${height}${rate}`;
}

/** Takes a title from a file name by removing the extension. */
export function titleFromFileName(fileName: string): string {
  const title = fileName.replace(/\.[^.]+$/, '').trim();
  return (title || fileName).slice(0, 200);
}

/** How long a job ran, or has been running, as "12 s" or "3 min 5 s". */
export function formatElapsed(
  startedAt: string | null,
  finishedAt: string | null,
  now: number = Date.now(),
): string {
  if (!startedAt) {
    return '–';
  }
  const end = finishedAt ? new Date(finishedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const GIGABYTE = 1024 ** 3;

/** Converts gigabytes typed into a form to the byte text the API expects. Null when the text is not a positive number. */
export function gigabytesToBytes(text: string): string | null {
  const value = Number(text.replace(',', '.'));
  if (!text.trim() || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return String(Math.round(value * GIGABYTE));
}

/** Converts a byte text from the API to gigabytes for a form field. */
export function bytesToGigabytes(bytes: string | null): string {
  if (!bytes) {
    return '';
  }
  return String(Number((Number(bytes) / GIGABYTE).toFixed(2)));
}

/** Formats a bitrate, for example "2.8 Mbit/s" or "128 kbit/s". */
export function formatBitrate(bitsPerSecond: number): string {
  return bitsPerSecond >= 1_000_000
    ? `${Number((bitsPerSecond / 1_000_000).toFixed(2))} Mbit/s`
    : `${Math.round(bitsPerSecond / 1000)} kbit/s`;
}

/** Share of a quota that is used, 0 to 100. Null without a quota. */
export function usagePercent(usedBytes: string, quotaBytes: string | null): number | null {
  if (!quotaBytes || Number(quotaBytes) <= 0) {
    return null;
  }
  return Math.min(100, (Number(usedBytes) / Number(quotaBytes)) * 100);
}

/** Formats a total playing time in words, for example "3 h 12 min" or "45 min". */
export function formatHours(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Says how long ago something happened, for example "5 minutes ago" or "yesterday". */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) {
    return '–';
  }
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) {
    return '–';
  }
  const steps: [limit: number, size: number, unit: Intl.RelativeTimeFormatUnit][] = [
    [60, 1, 'second'],
    [3600, 60, 'minute'],
    [86_400, 3600, 'hour'],
    [2_592_000, 86_400, 'day'],
    [31_536_000, 2_592_000, 'month'],
  ];
  for (const [limit, size, unit] of steps) {
    if (Math.abs(seconds) < limit) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }
  return relative.format(Math.round(seconds / 31_536_000), 'year');
}
