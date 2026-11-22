// SPDX-License-Identifier: AGPL-3.0-only
import { SaxesParser } from 'saxes';

/** A channel as a guide file lists it. */
export interface XmltvChannel {
  id: string;
  name: string;
}

/** A programme as a guide file lists it. */
export interface XmltvProgramme {
  channel: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
}

export interface XmltvHandlers {
  onChannel(channel: XmltvChannel): void;
  /** Return false to leave the rest of the file unread. */
  onProgramme(programme: XmltvProgramme): boolean | void;
}

/** Thrown when a file is not XMLTV, or is broken. The message is for the admin. */
export class XmltvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmltvError';
  }
}

const TIME_PATTERN =
  /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2})|Z)?$/;

/**
 * Reads a time as XMLTV writes it: "20261122203000 +0100". Seconds, minutes,
 * hours and the offset may be left out. A time without an offset is UTC.
 *
 * @returns Null when the text is not a time.
 */
export function parseXmltvTime(text: string): Date | null {
  const match = TIME_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const [
    ,
    year,
    month,
    day,
    hour = '00',
    minute = '00',
    second = '00',
    sign,
    offsetHours,
    offsetMinutes,
  ] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const offset =
    sign === undefined ? 0 : (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000;
  const time = sign === '-' ? utc + offset : utc - offset;
  return Number.isNaN(time) ? null : new Date(time);
}

/** Texts are cut to these lengths: a guide is read at a glance. */
const LIMITS = { title: 200, subtitle: 200, description: 2000, category: 80, name: 120, id: 200 };

function tidy(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

/**
 * Reads an XMLTV file piece by piece, so a guide of any size is read with
 * little memory. Only what the platform shows is kept: for a channel its
 * name, for a programme its times, title, subtitle, description and first
 * category. When a text is given in several languages, the first one wins.
 *
 * @throws XmltvError when the text is not XML, or not an XMLTV file.
 */
export async function readXmltv(
  chunks: AsyncIterable<Uint8Array | string>,
  handlers: XmltvHandlers,
): Promise<void> {
  const parser = new SaxesParser();
  const decoder = new TextDecoder('utf-8');
  let failure: Error | null = null;
  let sawRoot = false;
  let done = false;

  let channel: { id: string; name: string | null } | null = null;
  let programme: {
    channel: string;
    startsAt: Date | null;
    endsAt: Date | null;
    fields: Partial<Record<'title' | 'sub-title' | 'desc' | 'category', string>>;
  } | null = null;
  /** The element whose text is being collected, and the text so far. */
  let field: string | null = null;
  let text = '';
  let depth = 0;

  parser.on('error', (error) => {
    failure ??= new XmltvError(`The file is not valid XML: ${error.message.split('\n')[0]}`);
  });
  parser.on('opentag', (tag) => {
    depth += 1;
    if (depth === 1) {
      if (tag.name !== 'tv') {
        failure ??= new XmltvError('The file is not an XMLTV guide: it does not start with <tv>');
      }
      sawRoot = true;
      return;
    }
    const attributes = tag.attributes as Record<string, string>;
    if (depth === 2 && tag.name === 'channel') {
      channel = { id: tidy(attributes.id ?? '', LIMITS.id), name: null };
    } else if (depth === 2 && tag.name === 'programme') {
      programme = {
        channel: tidy(attributes.channel ?? '', LIMITS.id),
        startsAt: parseXmltvTime(attributes.start ?? ''),
        endsAt: parseXmltvTime(attributes.stop ?? ''),
        fields: {},
      };
    } else if (depth === 3 && (channel || programme)) {
      field = tag.name;
      text = '';
    }
  });
  parser.on('text', (value) => {
    if (field !== null && text.length < 8000) {
      text += value;
    }
  });
  parser.on('cdata', (value) => {
    if (field !== null && text.length < 8000) {
      text += value;
    }
  });
  parser.on('closetag', (tag) => {
    depth -= 1;
    if (depth === 2 && field !== null) {
      if (channel && field === 'display-name') {
        channel.name ??= tidy(text, LIMITS.name) || null;
      } else if (
        programme &&
        (field === 'title' || field === 'sub-title' || field === 'desc' || field === 'category')
      ) {
        // The first one given is kept: files list the main language first.
        programme.fields[field] ??= text;
      }
      field = null;
      return;
    }
    if (depth !== 1) {
      return;
    }
    if (tag.name === 'channel' && channel) {
      if (channel.id) {
        handlers.onChannel({ id: channel.id, name: channel.name ?? channel.id });
      }
      channel = null;
    } else if (tag.name === 'programme' && programme) {
      const { startsAt, endsAt, fields } = programme;
      const title = tidy(fields.title ?? '', LIMITS.title);
      // A programme without a channel, a title or an end cannot be shown and is left out.
      if (programme.channel && title && startsAt && endsAt && endsAt > startsAt) {
        const more = handlers.onProgramme({
          channel: programme.channel,
          startsAt,
          endsAt,
          title,
          subtitle: tidy(fields['sub-title'] ?? '', LIMITS.subtitle) || null,
          description: tidy(fields.desc ?? '', LIMITS.description) || null,
          category: tidy(fields.category ?? '', LIMITS.category) || null,
        });
        done = more === false;
      }
      programme = null;
    }
  });

  for await (const chunk of chunks) {
    parser.write(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
    if (failure) {
      throw failure;
    }
    if (done) {
      return;
    }
  }
  parser.close();
  if (failure) {
    throw failure;
  }
  if (!sawRoot) {
    throw new XmltvError('The file is empty');
  }
}
