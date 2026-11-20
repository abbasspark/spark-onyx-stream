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
