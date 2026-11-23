// SPDX-License-Identifier: AGPL-3.0-only

/** Endings of the subtitle files the server can read. */
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'] as const;
export const SUBTITLE_ACCEPT = SUBTITLE_EXTENSIONS.map((ending) => `.${ending}`).join(',');
/** The largest file the server takes. */
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

/** Encodings to name when a file is not Unicode and the guess from its language is wrong. */
export const SUBTITLE_ENCODINGS = [
  { value: 'utf-8', label: 'Unicode (UTF-8)' },
  { value: 'utf-16le', label: 'Unicode (UTF-16)' },
  { value: 'windows-1252', label: 'Western European (Windows-1252)' },
  { value: 'windows-1250', label: 'Central European (Windows-1250)' },
  { value: 'iso-8859-2', label: 'Central European (ISO 8859-2)' },
  { value: 'windows-1251', label: 'Cyrillic (Windows-1251)' },
  { value: 'windows-1253', label: 'Greek (Windows-1253)' },
  { value: 'windows-1254', label: 'Turkish (Windows-1254)' },
  { value: 'windows-1255', label: 'Hebrew (Windows-1255)' },
  { value: 'windows-1256', label: 'Arabic (Windows-1256)' },
  { value: 'windows-1257', label: 'Baltic (Windows-1257)' },
  { value: 'windows-1258', label: 'Vietnamese (Windows-1258)' },
  { value: 'shift_jis', label: 'Japanese (Shift JIS)' },
  { value: 'gbk', label: 'Chinese, simplified (GBK)' },
  { value: 'big5', label: 'Chinese, traditional (Big5)' },
  { value: 'euc-kr', label: 'Korean (EUC-KR)' },
] as const;

export function isSubtitleFile(name: string): boolean {
  const ending = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(ending);
}

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
 * Reads what the name of a subtitle file says, the way the server does:
 * "film.de.srt" is German, "film.en.forced.srt" the forced English track.
 * Only the words between the last dots are read, so the name of the film is
 * never taken for a language.
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
            ? `-${region.length === 2 ? region.toUpperCase() : (region[0] as string).toUpperCase() + region.slice(1).toLowerCase()}`
            : '');
      } else {
        break;
      }
    }
  }
  return result;
}

/**
 * The name the server gives a track that gets none: the language in its own
 * words, as viewers look for it. Shown as the placeholder of the name field.
 */
export function defaultSubtitleLabel(
  language: string,
  flags: { forced?: boolean; sdh?: boolean },
): string {
  let name = !language || language === 'und' ? 'Subtitles' : language;
  if (language && language !== 'und') {
    try {
      const own = new Intl.DisplayNames([language], { type: 'language' }).of(language);
      if (own && own !== language) {
        name = own.charAt(0).toLocaleUpperCase(language) + own.slice(1);
      }
    } catch {
      // Not a tag the browser knows: the tag itself is the name.
    }
  }
  const notes = [flags.sdh ? 'SDH' : null, flags.forced ? 'Forced' : null].filter(Boolean);
  return notes.length > 0 ? `${name} (${notes.join(', ')})` : name;
}

export interface SubtitleCue {
  /** "00:01:02.345" */
  start: string;
  end: string;
  startMs: number;
  /** The words, without markup. */
  text: string;
}

function toMs(time: string): number {
  const [seconds = '0', minutes = '0', hours = '0'] = time.split(':').reverse();
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000);
}

/** Reads the subtitles of a WebVTT file as the server writes it, to show them in a list. */
export function parseVtt(vtt: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => line.includes('-->'));
    const match = at === -1 ? null : /^\s*(\S+)\s+-->\s+(\S+)/.exec(lines[at] as string);
    if (!match) {
      continue;
    }
    const text = lines
      .slice(at + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim();
    if (text) {
      cues.push({
        start: match[1] as string,
        end: match[2] as string,
        startMs: toMs(match[1] as string),
        text,
      });
    }
  }
  return cues;
}

/** "1:02:03" or "2:03" for a list of subtitles: no decimals, no empty hours. */
export function cueClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
