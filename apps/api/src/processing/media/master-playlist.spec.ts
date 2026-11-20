// SPDX-License-Identifier: AGPL-3.0-only
import { parseMasterPlaylist } from './master-playlist.js';

const PLAYLIST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=3220800,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=985600,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
360p/playlist.m3u8
`;

describe('parseMasterPlaylist', () => {
  it('reads every variant', () => {
    expect(parseMasterPlaylist(PLAYLIST)).toEqual([
      {
        uri: '720p/playlist.m3u8',
        bandwidth: 3220800,
        width: 1280,
        height: 720,
        codecs: 'avc1.64001f,mp4a.40.2',
      },
      {
        uri: '360p/playlist.m3u8',
        bandwidth: 985600,
        width: 640,
        height: 360,
        codecs: 'avc1.64001e,mp4a.40.2',
      },
    ]);
  });

  it('handles missing attributes and Windows line endings', () => {
    expect(
      parseMasterPlaylist(
        '#EXTM3U\r\n#EXT-X-STREAM-INF:BANDWIDTH=500000\r\naudio/playlist.m3u8\r\n',
      ),
    ).toEqual([
      { uri: 'audio/playlist.m3u8', bandwidth: 500000, width: null, height: null, codecs: null },
    ]);
  });

  it('returns nothing for a playlist without variants', () => {
    expect(parseMasterPlaylist('#EXTM3U\n#EXT-X-ENDLIST\n')).toEqual([]);
  });
});
