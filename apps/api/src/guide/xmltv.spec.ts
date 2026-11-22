// SPDX-License-Identifier: AGPL-3.0-only
import {
  parseXmltvTime,
  readXmltv,
  type XmltvChannel,
  XmltvError,
  type XmltvProgramme,
} from './xmltv.js';

const FILE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="test">
  <channel id="news.example">
    <display-name lang="en">News 24</display-name>
    <display-name lang="de">Nachrichten 24</display-name>
    <icon src="https://example.com/news.png"/>
  </channel>
  <channel id="kids.example"><display-name>Kids &amp; Co</display-name></channel>
  <programme start="20261122180000 +0100" stop="20261122183000 +0100" channel="news.example">
    <title lang="en">Evening   News</title>
    <title lang="de">Abendnachrichten</title>
    <sub-title>The day in brief</sub-title>
    <desc><![CDATA[Headlines, weather & sport.]]></desc>
    <category>News</category>
    <category>Current affairs</category>
    <credits><actor>Somebody</actor></credits>
  </programme>
  <programme start="20261122183000 +0100" stop="20261122190000 +0100" channel="kids.example">
    <title>Cartoon Hour</title>
  </programme>
  <programme start="20261122190000 +0100" channel="kids.example"><title>No end</title></programme>
  <programme start="20261122190000 +0100" stop="20261122200000 +0100" channel="kids.example"></programme>
</tv>`;

async function* pieces(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  for (let index = 0; index < bytes.length; index += size) {
    yield bytes.slice(index, index + size);
  }
}

async function read(text: string, size = 4096) {
  const channels: XmltvChannel[] = [];
  const programmes: XmltvProgramme[] = [];
  await readXmltv(pieces(text, size), {
    onChannel: (channel) => channels.push(channel),
    onProgramme: (programme) => {
      programmes.push(programme);
    },
  });
  return { channels, programmes };
}

describe('parseXmltvTime', () => {
  it('reads times with and without an offset', () => {
    expect(parseXmltvTime('20261122203000 +0100')?.toISOString()).toBe('2026-11-22T19:30:00.000Z');
    expect(parseXmltvTime('20261122203000 -0530')?.toISOString()).toBe('2026-11-23T02:00:00.000Z');
    expect(parseXmltvTime('20261122203000')?.toISOString()).toBe('2026-11-22T20:30:00.000Z');
    expect(parseXmltvTime('20261122203000 Z')?.toISOString()).toBe('2026-11-22T20:30:00.000Z');
    expect(parseXmltvTime('202611222030 +01:00')?.toISOString()).toBe('2026-11-22T19:30:00.000Z');
    expect(parseXmltvTime('20261122')?.toISOString()).toBe('2026-11-22T00:00:00.000Z');
  });

  it('refuses what is not a time', () => {
    expect(parseXmltvTime('')).toBeNull();
    expect(parseXmltvTime('tomorrow')).toBeNull();
    expect(parseXmltvTime('2026-11-22T20:30:00Z')).toBeNull();
  });
});

describe('readXmltv', () => {
  it('reads channels and programmes, keeping the first language', async () => {
    const { channels, programmes } = await read(FILE);
    expect(channels).toEqual([
      { id: 'news.example', name: 'News 24' },
      { id: 'kids.example', name: 'Kids & Co' },
    ]);
    expect(programmes).toEqual([
      {
        channel: 'news.example',
        startsAt: new Date('2026-11-22T17:00:00.000Z'),
        endsAt: new Date('2026-11-22T17:30:00.000Z'),
        title: 'Evening News',
        subtitle: 'The day in brief',
        description: 'Headlines, weather & sport.',
        category: 'News',
      },
      {
        channel: 'kids.example',
        startsAt: new Date('2026-11-22T17:30:00.000Z'),
        endsAt: new Date('2026-11-22T18:00:00.000Z'),
        title: 'Cartoon Hour',
        subtitle: null,
        description: null,
        category: null,
      },
    ]);
  });

  it('reads the same from a file that arrives in small pieces', async () => {
    // Seven bytes at a time also cuts letters of more than one byte in two.
    const text = FILE.replace('Cartoon Hour', 'Zeichentrick für Kinder – Stunde');
    const whole = await read(text);
    const small = await read(text, 7);
    expect(small).toEqual(whole);
    expect(small.programmes[1]?.title).toBe('Zeichentrick für Kinder – Stunde');
  });

  it('stops reading when told to', async () => {
    const seen: string[] = [];
    await readXmltv(pieces(FILE, 64), {
      onChannel: () => undefined,
      onProgramme: (programme) => {
        seen.push(programme.title);
        return false;
      },
    });
    expect(seen).toEqual(['Evening News']);
  });

  it('cuts texts that are far too long', async () => {
    const { programmes } = await read(
      FILE.replace('Headlines, weather & sport.', 'word '.repeat(2000)),
    );
    expect(programmes[0]?.description).toHaveLength(2000);
    expect(programmes[0]?.description?.endsWith('…')).toBe(true);
  });

  it('refuses what is not a guide', async () => {
    await expect(read('<html><body>Not found</body></html>')).rejects.toThrow('not an XMLTV guide');
    await expect(read('<tv><programme start="2026"></tv>')).rejects.toThrow(XmltvError);
    await expect(read('{"error":"denied"}')).rejects.toThrow('not valid XML');
    await expect(read('')).rejects.toThrow(XmltvError);
  });
});
