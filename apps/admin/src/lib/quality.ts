// SPDX-License-Identifier: AGPL-3.0-only
import type { QualityDay, QualityFigures } from '@/api/types';

/** How a figure stands: fine, worth a look, or a problem. */
export type Grade = 'good' | 'fair' | 'poor';

export const GRADE_LOOKS: Record<Grade, { label: string; tone: 'success' | 'warning' | 'danger' }> =
  {
    good: { label: 'Good', tone: 'success' },
    fair: { label: 'Fair', tone: 'warning' },
    poor: { label: 'Poor', tone: 'danger' },
  };

/**
 * Where "good" ends and where "poor" begins, for each figure. They are the
 * marks streaming services commonly hold themselves to: a start within two
 * seconds, less than half a percent of the time spent waiting, and fewer
 * than one playback in a hundred lost to a problem.
 */
export const THRESHOLDS = {
  startupMs: { good: 2000, fair: 4000 },
  rebufferRatio: { good: 0.005, fair: 0.02 },
  startFailureRate: { good: 0.01, fair: 0.03 },
  playbackFailureRate: { good: 0.01, fair: 0.03 },
} as const;
export type QualityMetric = keyof typeof THRESHOLDS;

/** Below this many playbacks a share says little: one failure in four is not 25 % of anything. */
export const MIN_TO_GRADE = 10;

/** The share of playbacks a problem ended before the first picture. */
export const startFailureRate = (figures: QualityFigures): number =>
  figures.attempts > 0 ? figures.startFailures / figures.attempts : 0;

/** The share of started playbacks a problem ended. */
export const playbackFailureRate = (figures: QualityFigures): number =>
  figures.started > 0 ? figures.playbackFailures / figures.started : 0;

/** The value of a figure, or null when there is nothing to measure it on. */
export function valueOf(metric: QualityMetric, figures: QualityFigures): number | null {
  switch (metric) {
    case 'startupMs':
      return figures.startupP50Ms;
    case 'rebufferRatio':
      return figures.started > 0 ? figures.rebufferRatio : null;
    case 'startFailureRate':
      return figures.attempts > 0 ? startFailureRate(figures) : null;
    case 'playbackFailureRate':
      return figures.started > 0 ? playbackFailureRate(figures) : null;
  }
}

/** How a value stands. Null: nothing to say, or too few playbacks to say it. */
export function gradeOf(
  metric: QualityMetric,
  figures: QualityFigures,
  minimum = MIN_TO_GRADE,
): Grade | null {
  const value = valueOf(metric, figures);
  if (value === null || figures.attempts < minimum) {
    return null;
  }
  const { good, fair } = THRESHOLDS[metric];
  return value <= good ? 'good' : value <= fair ? 'fair' : 'poor';
}

/** "1.4 s", "850 ms", "12 s". */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return '–';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
}

/** A share as a percentage that still shows small ones: "0.4 %", "2.3 %", "18 %". */
export function formatRate(share: number | null | undefined): string {
  if (share === null || share === undefined) {
    return '–';
  }
  const percent = share * 100;
  if (percent === 0) {
    return '0 %';
  }
  if (percent < 0.1) {
    return '< 0.1 %';
  }
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)} %`;
}

/** A figure as it is written, by its kind. */
export function formatMetric(metric: QualityMetric, value: number | null): string {
  return metric === 'startupMs' ? formatMs(value) : formatRate(value);
}

/** "5.2 Mbit/s", "800 kbit/s". */
export function formatKbps(kbps: number | null | undefined): string {
  if (!kbps) {
    return '–';
  }
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbit/s` : `${Math.round(kbps)} kbit/s`;
}

export interface QualityChange {
  /** Whether it got better or worse. For these figures, less is better. */
  direction: 'better' | 'worse' | 'same';
  label: string;
}

/**
 * How a figure changed against the stretch before. Shares are compared in
 * points ("+1.2 pt"), since "200 % more failures" of almost none says little;
 * the time to start in percent.
 */
export function qualityChange(
  metric: QualityMetric,
  current: number | null,
  previous: number | null,
): QualityChange | null {
  if (current === null || previous === null) {
    return null;
  }
  if (metric === 'startupMs') {
    if (previous === 0) {
      return null;
    }
    const percent = Math.round(((current - previous) / previous) * 100);
    return percent === 0
      ? { direction: 'same', label: '0 %' }
      : {
          direction: percent < 0 ? 'better' : 'worse',
          label: `${percent > 0 ? '+' : '−'}${Math.abs(percent)} %`,
        };
  }
  const points = Math.round((current - previous) * 1000) / 10;
  return points === 0
    ? { direction: 'same', label: '0 pt' }
    : {
        direction: points < 0 ? 'better' : 'worse',
        label: `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)} pt`,
      };
}

export const METRIC_LOOKS: Record<QualityMetric, { label: string; about: string; goal: string }> = {
  startupMs: {
    label: 'Time to start',
    about: 'From pressing play to the first picture. Half of the starts were faster than this.',
    goal: 'Good up to 2 s',
  },
  rebufferRatio: {
    label: 'Waiting',
    about: 'The share of the time viewers spent looking at a loading video instead of watching.',
    goal: 'Good up to 0.5 %',
  },
  startFailureRate: {
    label: 'Failed to start',
    about: 'Playbacks a problem ended before the first picture.',
    goal: 'Good up to 1 %',
  },
  playbackFailureRate: {
    label: 'Broke while playing',
    about: 'Started playbacks a problem ended.',
    goal: 'Good up to 1 %',
  },
};
export const QUALITY_METRICS = Object.keys(METRIC_LOOKS) as QualityMetric[];

/** The whole picture in a sentence, from the worst of the four figures. */
export function verdictOf(figures: QualityFigures): {
  grade: Grade | null;
  title: string;
  detail: string;
} {
  if (figures.attempts === 0) {
    return {
      grade: null,
      title: 'No reports in these days',
      detail: 'Figures appear once players report on what they played.',
    };
  }
  if (figures.attempts < MIN_TO_GRADE) {
    return {
      grade: null,
      title: 'Too few playbacks to judge',
      detail: `${figures.attempts} ${figures.attempts === 1 ? 'playback was' : 'playbacks were'} reported on. From ${MIN_TO_GRADE} on the figures are graded.`,
    };
  }
  const graded = QUALITY_METRICS.map((metric) => ({ metric, grade: gradeOf(metric, figures) }));
  const worst = (grade: Grade) => graded.filter((entry) => entry.grade === grade);
  const say = (entries: typeof graded) =>
    entries
      .map(
        ({ metric }) =>
          `${METRIC_LOOKS[metric].label.toLowerCase()} ${formatMetric(metric, valueOf(metric, figures))}`,
      )
      .join(', ');
  if (worst('poor').length > 0) {
    return { grade: 'poor', title: 'Playback needs attention', detail: say(worst('poor')) };
  }
  if (worst('fair').length > 0) {
    return { grade: 'fair', title: 'Playback is fair', detail: say(worst('fair')) };
  }
  return {
    grade: 'good',
    title: 'Playback is healthy',
    detail: 'Videos start quickly, rarely stop to load, and almost never fail.',
  };
}

/** Several days as one: counts add up, and the time to start is averaged by how many started. */
export function mergeDays(days: readonly QualityDay[]): QualityFigures {
  const sum = (pick: (day: QualityDay) => number) =>
    days.reduce((total, day) => total + pick(day), 0);
  const weighted = (pick: (day: QualityDay) => number | null) => {
    const known = days.filter((day) => pick(day) !== null && day.started > 0);
    const weight = known.reduce((total, day) => total + day.started, 0);
    return weight > 0
      ? Math.round(
          known.reduce((total, day) => total + (pick(day) as number) * day.started, 0) / weight,
        )
      : null;
  };
  const stallMs = sum((day) => day.stallMs);
  const playedSeconds = sum((day) => day.playedSeconds);
  const total = playedSeconds * 1000 + stallMs;
  return {
    attempts: sum((day) => day.attempts),
    started: sum((day) => day.started),
    startFailures: sum((day) => day.startFailures),
    leftBeforeStart: sum((day) => day.leftBeforeStart),
    playbackFailures: sum((day) => day.playbackFailures),
    startupP50Ms: weighted((day) => day.startupP50Ms),
    startupP95Ms: weighted((day) => day.startupP95Ms),
    stalledSessions: sum((day) => day.stalledSessions),
    stallCount: sum((day) => day.stallCount),
    stallMs,
    playedSeconds,
    rebufferRatio: total > 0 ? stallMs / total : 0,
    bitrateKbps: weighted((day) => day.bitrateKbps),
  };
}

const ERROR_LOOKS: Record<string, { label: string; about: string }> = {
  network: {
    label: 'Could not load',
    about:
      'A playlist or a piece of the video did not arrive. Look at the server it came from, and at the connection of the viewers.',
  },
  media: {
    label: 'Could not decode',
    about: 'The device got the video and could not show it. Often one file, or one kind of device.',
  },
  unsupported: {
    label: 'Device cannot play it',
    about: 'The device does not play this kind of video at all: its codec, or HLS itself.',
  },
  expired: {
    label: 'Addresses refused',
    about:
      'The server refused the signed addresses: they ran out, or the clocks of the servers disagree.',
  },
  key: {
    label: 'Key not available',
    about: 'The key of a protected video could not be had.',
  },
  timeout: {
    label: 'Gave up waiting',
    about:
      'Nothing arrived for so long that the player gave up. For a live channel: the picture stood still.',
  },
  other: { label: 'Other problem', about: 'A problem the player could not name.' },
};

/** What a problem is called, and what it usually means. A code of an app's own is shown as sent. */
export function errorLook(code: string): { label: string; about: string } {
  return (
    ERROR_LOOKS[code] ?? { label: code, about: 'A problem an app reported under its own name.' }
  );
}

/** "1080p", and "4K" from 2160 on. */
export function heightLabel(height: number): string {
  return height >= 2160 ? '4K' : `${height}p`;
}

/** "origin" in words. An edge is named by its host. */
export const serverLabel = (server: string): string =>
  server === 'origin' ? 'Main server' : server;

/** The share each height has of the time played, the highest first. */
export function heightShares(
  heights: readonly { height: number; playedSeconds: number }[],
): { height: number; label: string; share: number }[] {
  const total = heights.reduce((sum, entry) => sum + entry.playedSeconds, 0);
  if (total <= 0) {
    return [];
  }
  return [...heights]
    .sort((a, b) => b.height - a.height)
    .map((entry) => ({
      height: entry.height,
      label: heightLabel(entry.height),
      share: entry.playedSeconds / total,
    }));
}
