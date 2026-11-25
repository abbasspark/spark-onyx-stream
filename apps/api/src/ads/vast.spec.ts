// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { mergeExtras, parseClock, parseVast, skipOffsetOf } from './vast.js';
import { parseXml } from './xml.js';

const INLINE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- an ad -->
<VAST version="4.0">
  <Ad id="1">
    <InLine>
      <AdSystem>Test</AdSystem>
      <Impression><![CDATA[https://ads.example.com/imp?a=1&b=2]]></Impression>
      <Error>https://ads.example.com/err?code=[ERRORCODE]</Error>
      <Creatives>
        <Creative>
          <Linear skipoffset="00:00:05">
            <Duration>00:00:15.500</Duration>
            <TrackingEvents>
              <Tracking event="start">https://t.example.com/start</Tracking>
              <Tracking event="midpoint">https://t.example.com/mid</Tracking>
              <Tracking event="complete">https://t.example.com/done</Tracking>
              <Tracking event="mute">https://t.example.com/mute</Tracking>
            </TrackingEvents>
            <VideoClicks>
              <ClickThrough>https://brand.example.com/?x=1&amp;y=2</ClickThrough>
              <ClickTracking>https://t.example.com/click</ClickTracking>
            </VideoClicks>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="1920" height="1080" bitrate="4000">https://cdn.example.com/1080.mp4</MediaFile>
              <MediaFile delivery="progressive" type="video/mp4" width="1280" height="720" bitrate="2000">https://cdn.example.com/720.mp4</MediaFile>
              <MediaFile delivery="progressive" type="video/mp4" width="640" height="360" bitrate="800">https://cdn.example.com/360.mp4</MediaFile>
              <MediaFile delivery="progressive" type="application/javascript" apiFramework="VPAID" width="640" height="360">https://cdn.example.com/vpaid.js</MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

describe('parseXml', () => {
  it('reads elements, attributes, text, entities and CDATA', () => {
    const root = parseXml(
      '<a x="1&amp;2"><b>one &lt; two</b><c><![CDATA[<raw & text>]]></c><d/></a>',
    );
    expect(root?.name).toBe('a');
    expect(root?.attributes.x).toBe('1&2');
    expect(root?.children.map((node) => node.name)).toEqual(['b', 'c', 'd']);
    expect(root?.children[0]?.text).toBe('one < two');
    expect(root?.children[1]?.text).toBe('<raw & text>');
  });

  it('drops namespace prefixes and returns null for what is not XML', () => {
    expect(parseXml('<ns:a><ns:b>x</ns:b></ns:a>')?.children[0]?.name).toBe('b');
    expect(parseXml('just words')).toBeNull();
    expect(parseXml('')).toBeNull();
  });
});

describe('clock values', () => {
  it('turn times into milliseconds', () => {
    expect(parseClock('00:00:05')).toBe(5000);
    expect(parseClock('01:02:03.5')).toBe(3_723_500);
    expect(parseClock('soon')).toBeNull();
    expect(parseClock(undefined)).toBeNull();
  });

  it('turn a skip offset given as a share into milliseconds of the duration', () => {
    expect(skipOffsetOf('25%', 20_000)).toBe(5000);
    expect(skipOffsetOf('25%', null)).toBeNull();
    expect(skipOffsetOf('00:00:03', null)).toBe(3000);
  });
});

describe('parseVast', () => {
  it('reads an inline ad, with the picture it chooses and everything to tell', () => {
    const parsed = parseVast(INLINE);
    expect(parsed.kind).toBe('inline');
    if (parsed.kind !== 'inline') {
      return;
    }
    expect(parsed.ad).toMatchObject({
      mediaUrl: 'https://cdn.example.com/720.mp4',
      mimeType: 'video/mp4',
      durationMs: 15_500,
      skipOffsetMs: 5000,
      clickThrough: 'https://brand.example.com/?x=1&y=2',
      clickTracking: ['https://t.example.com/click'],
      impressions: ['https://ads.example.com/imp?a=1&b=2'],
      errors: ['https://ads.example.com/err?code=[ERRORCODE]'],
    });
    expect(parsed.ad.tracking.start).toEqual(['https://t.example.com/start']);
    expect(parsed.ad.tracking.skip).toEqual([]);
  });

  it('prefers a playlist over files', () => {
    const parsed = parseVast(
      INLINE.replace(
        '</MediaFiles>',
        '<MediaFile delivery="streaming" type="application/x-mpegURL" width="1280" height="720">https://cdn.example.com/ad.m3u8</MediaFile></MediaFiles>',
      ),
    );
    expect(parsed.kind === 'inline' && parsed.ad.mediaUrl).toBe('https://cdn.example.com/ad.m3u8');
  });

  it('is empty when there is no file a browser can play', () => {
    const parsed = parseVast(
      INLINE.replace(/<MediaFile [^>]*type="video\/mp4"[\s\S]*?<\/MediaFile>/g, ''),
    );
    expect(parsed.kind).toBe('empty');
  });

  it('is empty for an ad server that has no ad, and tells where to say so', () => {
    const parsed = parseVast(
      '<VAST version="3.0"><Error>https://e.example.com/none</Error></VAST>',
    );
    expect(parsed).toEqual({ kind: 'empty', errors: ['https://e.example.com/none'] });
    expect(parseVast('<html>nope</html>')).toEqual({ kind: 'empty', errors: [] });
  });

  it('follows a wrapper to the tag it names, keeping what it asks to be told', () => {
    const wrapper = parseVast(`<VAST version="3.0"><Ad><Wrapper>
      <VASTAdTagURI><![CDATA[https://next.example.com/vast]]></VASTAdTagURI>
      <Impression>https://w.example.com/imp</Impression>
      <Creatives><Creative><Linear><TrackingEvents>
        <Tracking event="complete">https://w.example.com/done</Tracking>
      </TrackingEvents></Linear></Creative></Creatives>
    </Wrapper></Ad></VAST>`);
    expect(wrapper.kind).toBe('wrapper');
    const inline = parseVast(INLINE);
    if (wrapper.kind !== 'wrapper' || inline.kind !== 'inline') {
      throw new Error('unexpected');
    }
    expect(wrapper.tagUri).toBe('https://next.example.com/vast');
    const merged = mergeExtras(wrapper.extras, inline.ad);
    expect(merged.impressions).toEqual([
      'https://w.example.com/imp',
      'https://ads.example.com/imp?a=1&b=2',
    ]);
    expect(merged.tracking.complete).toEqual([
      'https://w.example.com/done',
      'https://t.example.com/done',
    ]);
  });

  it('ignores addresses that are not web addresses', () => {
    const parsed = parseVast(INLINE.replace('https://t.example.com/start', 'javascript:alert(1)'));
    expect(parsed.kind === 'inline' && parsed.ad.tracking.start).toEqual([]);
  });
});
