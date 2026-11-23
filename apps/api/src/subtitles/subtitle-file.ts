// SPDX-License-Identifier: AGPL-3.0-only

/** Endings of subtitle files that are text and can become WebVTT. */
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'] as const;
export type SubtitleFormat = 'srt' | 'vtt' | 'ass';

/** Encodings an uploader can name when a file is not Unicode and the guess is wrong. */
export const SUBTITLE_ENCODINGS = [
  'utf-8',
  'utf-16le',
  'windows-1250',
  'windows-1251',
  'windows-1252',
  'windows-1253',
  'windows-1254',
  'windows-1255',
  'windows-1256',
  'windows-1257',
  'windows-1258',
  'iso-8859-2',
  'shift_jis',
  'gbk',
  'big5',
  'euc-kr',
] as const;
export type SubtitleEncoding = (typeof SUBTITLE_ENCODINGS)[number];

/** The encoding old subtitle files of a language are usually in, when they are not Unicode. */
const LEGACY_ENCODING: Record<string, SubtitleEncoding> = {
  ar: 'windows-1256',
  fa: 'windows-1256',
  ur: 'windows-1256',
  he: 'windows-1255',
  el: 'windows-1253',
  tr: 'windows-1254',
  az: 'windows-1254',
  ru: 'windows-1251',
  uk: 'windows-1251',
  bg: 'windows-1251',
  sr: 'windows-1251',
  mk: 'windows-1251',
  pl: 'windows-1250',
  cs: 'windows-1250',
  sk: 'windows-1250',
  hu: 'windows-1250',
  ro: 'windows-1250',
  hr: 'windows-1250',
  sl: 'windows-1250',
  lt: 'windows-1257',
  lv: 'windows-1257',
  et: 'windows-1257',
  vi: 'windows-1258',
  ja: 'shift_jis',
  zh: 'gbk',
  ko: 'euc-kr',
};

/** Thrown for a file that is not a subtitle file this can read. The message is for the uploader. */
export class SubtitleFileError extends Error {}

export interface DecodedText {
  text: string;
  /** What the bytes were read as. */
  encoding: string;
}

/**
 * Turns the bytes of a subtitle file into text.
 *
 * Unicode is recognized by its mark or by being valid. Everything else is an
 * old one-byte encoding that cannot be told from the bytes alone, so the
 * language decides: an Arabic file is read as Windows-1256, a Russian one as
 * Windows-1251, and what is left as Windows-1252.
 */
export function decodeSubtitle(
  data: Buffer,
  language: string | null,
  encoding?: SubtitleEncoding,
): DecodedText {
  if (encoding) {
    return { text: new TextDecoder(encoding).decode(data), encoding };
  }
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(data.subarray(3)), encoding: 'utf-8' };
  }
  if (data[0] === 0xff && data[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(data.subarray(2)), encoding: 'utf-16le' };
  }
  if (data[0] === 0xfe && data[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(data.subarray(2)), encoding: 'utf-16be' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(data), encoding: 'utf-8' };
  } catch {
    const guess = LEGACY_ENCODING[(language ?? '').split('-')[0] ?? ''] ?? 'windows-1252';
    return { text: new TextDecoder(guess).decode(data), encoding: guess };
  }
}

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

const two = (value: number) => String(value).padStart(2, '0');

/** "00:01:02.345" */
export function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${two(hours)}:${two(minutes)}:${two(seconds)}.${String(total % 1000).padStart(3, '0')}`;
}

/** "1:02:03,456", "02:03.456" or "0:02:03.45" as milliseconds. Null for anything else. */
function parseTime(value: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const fraction = (match[4] ?? '0').padEnd(3, '0');
  return (
    Number(match[1] ?? 0) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1000 +
    Number(fraction)
  );
}

/**
 * Keeps the markup WebVTT knows (italic, bold, underline) and takes out the
 * rest: fonts and colours of SubRip, and position codes such as "{\an8}".
 */
function cleanText(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?(?!\/?(?:i|b|u)>)[^>]*>/gi, '')
    .replace(/-->/g, '->')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

const TIMING = /^\s*(\S+)\s+-->\s+(\S+)/;

/** Reads the cues of a SubRip or WebVTT file. Blocks that are not cues are passed over. */
function parseBlocks(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const at = lines.findIndex((line) => TIMING.test(line));
    // The line of times is the first, or the second after a number or a name.
    if (at === -1 || at > 1) {
      continue;
    }
    const match = TIMING.exec(lines[at] as string) as RegExpExecArray;
    const startMs = parseTime(match[1] as string);
    const endMs = parseTime(match[2] as string);
    const body = cleanText(lines.slice(at + 1).join('\n'));
    if (startMs === null || endMs === null || endMs <= startMs || body === '') {
      continue;
    }
    cues.push({ startMs, endMs, text: body });
  }
  return cues;
}

/** Reads the dialogue of an Advanced SubStation file. Styles and positions are dropped. */
function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  let inEvents = false;
  let fields: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inEvents = /^\[events\]/i.test(line);
      continue;
    }
    if (!inEvents) {
      continue;
    }
    if (/^format\s*:/i.test(line)) {
      fields = line
        .slice(line.indexOf(':') + 1)
        .split(',')
        .map((field) => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(line) || fields.length === 0) {
      continue;
    }
    // The text is the last field and may hold commas itself.
    const values = line.slice(line.indexOf(':') + 1).split(',');
    const value = (name: string) => values[fields.indexOf(name)]?.trim() ?? '';
    const startMs = parseTime(value('start'));
    const endMs = parseTime(value('end'));
    const body = values.slice(fields.length - 1).join(',');
    // Drawings are shapes, not words.
    if (startMs === null || endMs === null || endMs <= startMs || /\\p[1-9]/.test(body)) {
      continue;
    }
    const cleaned = cleanText(body.replace(/\\N/gi, '\n').replace(/\\h/g, ' '));
    if (cleaned !== '') {
      cues.push({ startMs, endMs, text: cleaned });
    }
  }
  return cues;
}

/** What kind of subtitle file a text is, by its content and then by its name. */
export function formatOf(text: string, fileName: string | null): SubtitleFormat | null {
  const start = text.trimStart();
  if (start.startsWith('WEBVTT')) {
    return 'vtt';
  }
  if (/^\[script info\]/i.test(start) || /^\[events\]/im.test(text)) {
    return 'ass';
  }
  if (TIMING.test(text.split('\n').find((line) => line.includes('-->')) ?? '')) {
    return 'srt';
  }
  const ending = fileName?.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return ending === 'vtt'
    ? 'vtt'
    : ending === 'srt'
      ? 'srt'
      : ending === 'ass' || ending === 'ssa'
        ? 'ass'
        : null;
}

export interface ConvertedSubtitle {
  vtt: string;
  cues: number;
  format: SubtitleFormat;
  encoding: string;
  /** Where the last cue ends. */
  endMs: number;
}

/**
 * Makes a WebVTT file of a subtitle file: SubRip (.srt), WebVTT (.vtt) or
 * SubStation (.ass, .ssa). The result is written anew from the cues, in the
 * order of their start, so a file with odd spacing, numbering or styles
 * comes out the same clean way.
 *
 * @throws SubtitleFileError when the file is not one of these, or holds no cue.
 */
export function toWebVtt(
  data: Buffer,
  options: { fileName?: string | null; language?: string | null; encoding?: SubtitleEncoding } = {},
): ConvertedSubtitle {
  if (data.length === 0) {
    throw new SubtitleFileError('The file is empty');
  }
  // Text has no zero bytes, unless it is UTF-16, which starts with its mark.
  const marked = (data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff);
  if (!marked && !options.encoding?.startsWith('utf-16') && data.subarray(0, 4096).includes(0)) {
    throw new SubtitleFileError(
      'The file is not text. Picture subtitles (.sub with .idx, .sup) cannot be used',
    );
  }
  const decoded = decodeSubtitle(data, options.language ?? null, options.encoding);
  const text = decoded.text.replace(/\r\n?/g, '\n');
  const format = formatOf(text, options.fileName ?? null);
  if (!format) {
    throw new SubtitleFileError(
      'The file is not a SubRip (.srt), WebVTT (.vtt) or SubStation (.ass) file',
    );
  }
  const cues = (format === 'ass' ? parseAss(text) : parseBlocks(text)).sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
  if (cues.length === 0) {
    throw new SubtitleFileError('No subtitle with a start and an end was found in the file');
  }
  const body = cues
    .map((cue) => `${vttTime(cue.startMs)} --> ${vttTime(cue.endMs)}\n${cue.text}`)
    .join('\n\n');
  return {
    vtt: `WEBVTT\n\n${body}\n`,
    cues: cues.length,
    format,
    encoding: decoded.encoding,
    endMs: Math.max(...cues.map((cue) => cue.endMs)),
  };
}

// --- Names of files --------------------------------------------------------------------

/** Three-letter codes and English names found in names of subtitle files. */
const LANGUAGE_WORDS: Record<string, string> = {
  eng: 'en',
  english: 'en',
  ger: 'de',
  deu: 'de',
  german: 'de',
  deutsch: 'de',
  fre: 'fr',
  fra: 'fr',
  french: 'fr',
  spa: 'es',
  esp: 'es',
  spanish: 'es',
  ita: 'it',
  italian: 'it',
  por: 'pt',
  portuguese: 'pt',
  dut: 'nl',
  nld: 'nl',
  dutch: 'nl',
  ara: 'ar',
  arabic: 'ar',
  tur: 'tr',
  turkish: 'tr',
  rus: 'ru',
  russian: 'ru',
  pol: 'pl',
  polish: 'pl',
  jpn: 'ja',
  japanese: 'ja',
  kor: 'ko',
  korean: 'ko',
  chi: 'zh',
  zho: 'zh',
  chinese: 'zh',
  hin: 'hi',
  hindi: 'hi',
  swe: 'sv',
  swedish: 'sv',
  dan: 'da',
  danish: 'da',
  nor: 'nb',
  norwegian: 'nb',
  fin: 'fi',
  finnish: 'fi',
  gre: 'el',
  ell: 'el',
  greek: 'el',
  heb: 'he',
  hebrew: 'he',
  per: 'fa',
  fas: 'fa',
  persian: 'fa',
  farsi: 'fa',
  ukr: 'uk',
  ukrainian: 'uk',
  cze: 'cs',
  ces: 'cs',
  czech: 'cs',
  hun: 'hu',
  hungarian: 'hu',
  rum: 'ro',
  ron: 'ro',
  romanian: 'ro',
  ind: 'id',
  indonesian: 'id',
  tha: 'th',
  thai: 'th',
  vie: 'vi',
  vietnamese: 'vi',
};

/** Two-letter words in names of files that are not languages. */
const NOT_LANGUAGES = new Set(['cc', 'hi', 'sd', 'hd', 'uk', 'us', 'tv', 'dl', 'bd', 'ep']);

export interface SubtitleName {
  /** A language tag such as "de" or "pt-BR". Null when the name does not say. */
  language: string | null;
  /** Only the parts spoken in another language. */
  forced: boolean;
  /** For the deaf and hard of hearing: with sounds and speakers. */
  sdh: boolean;
}

/**
 * Reads what the name of a subtitle file says: "film.de.srt" is German,
 * "film.en.forced.srt" the forced English track, "film.eng.sdh.srt" English
 * for the hard of hearing. Only the words between the last dots are read, so
 * the name of the film itself is never taken for a language.
 */
export function parseSubtitleName(fileName: string): SubtitleName {
  const name = fileName.slice(fileName.lastIndexOf('/') + 1);
  const words = name.split('.').slice(1, -1).slice(-3);
  const result: SubtitleName = { language: null, forced: false, sdh: false };
  for (const word of words.reverse()) {
    const lower = word.toLowerCase();
    if (lower === 'forced') {
      result.forced = true;
    } else if (lower === 'sdh' || lower === 'cc' || lower === 'hi') {
      // "hi" is "hearing impaired" far more often than Hindi in such names. Hindi is "hin".
      result.sdh = true;
    } else if (result.language === null) {
      const tag = /^([a-z]{2})(?:[-_]([a-z]{2}|[a-z]{4}))?$/i.exec(word);
      if (LANGUAGE_WORDS[lower]) {
        result.language = LANGUAGE_WORDS[lower];
      } else if (tag && !NOT_LANGUAGES.has(lower)) {
        const region = tag[2];
        result.language =
          (tag[1] as string).toLowerCase() +
          (region
            ? `-${region.length === 2 ? region.toUpperCase() : region[0]?.toUpperCase() + region.slice(1).toLowerCase()}`
            : '');
      } else {
        // The first word that says nothing ends the reading: what is before it is the name.
        break;
      }
    }
  }
  return result;
}

/**
 * The name a track gets in the player when nobody gave it one: the language
 * in its own words, as viewers look for it. "Deutsch", "العربية (SDH)".
 */
export function defaultLabel(language: string, flags: { forced?: boolean; sdh?: boolean }): string {
  let name = language === 'und' ? 'Subtitles' : language;
  if (language !== 'und') {
    try {
      const own = new Intl.DisplayNames([language], { type: 'language' }).of(language);
      if (own && own !== language) {
        name = own.charAt(0).toLocaleUpperCase(language) + own.slice(1);
      }
    } catch {
      // Not a tag the runtime knows: the tag itself is the name.
    }
  }
  const notes = [flags.sdh ? 'SDH' : null, flags.forced ? 'Forced' : null].filter(Boolean);
  return notes.length > 0 ? `${name} (${notes.join(', ')})` : name;
}
