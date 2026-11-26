// SPDX-License-Identifier: AGPL-3.0-only

/** Which television the app is on, from what it says about itself. */
export type Platform = 'tizen' | 'webos' | 'browser';

export function detectPlatform(userAgent: string): Platform {
  if (/Tizen/i.test(userAgent)) {
    return 'tizen';
  }
  if (/Web0S|webOS|NetCast/i.test(userAgent)) {
    return 'webos';
  }
  return 'browser';
}

/** What the app calls itself to the API, so an installation can tell the apps apart. */
export function clientName(platform: Platform, version: string): string {
  return `${platform === 'browser' ? 'tv-web' : platform}/${version}`;
}

/** The name of the television, as far as it says: "Samsung TV", "LG webOS TV". */
export function deviceName(platform: Platform): string {
  switch (platform) {
    case 'tizen':
      return 'Samsung TV';
    case 'webos':
      return 'LG TV';
    default:
      return 'Browser';
  }
}

/** What a press of a remote means to the app. */
export type Key =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'stop'
  | 'forward'
  | 'rewind';

/**
 * The codes the remotes send. Arrows and OK are the same everywhere; the back
 * key and the media keys are the television's own, and differ by maker.
 */
const BY_CODE: Record<number, Key> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  // Back: Tizen 10009, webOS 461, a keyboard's Backspace and Escape.
  10009: 'back',
  461: 'back',
  8: 'back',
  27: 'back',
  415: 'play',
  19: 'pause',
  10252: 'playPause',
  413: 'stop',
  417: 'forward',
  412: 'rewind',
};

export function keyOf(code: number): Key | null {
  return BY_CODE[code] ?? null;
}

/**
 * Keys that Tizen only sends once the app has asked for them. Without this
 * the media keys do nothing and the back key closes the app.
 */
export function registerKeys(platform: Platform): void {
  if (platform !== 'tizen') {
    return;
  }
  const tizen = (
    window as unknown as {
      tizen?: { tvinputdevice?: { registerKey(name: string): void } };
    }
  ).tizen;
  for (const name of [
    'MediaPlay',
    'MediaPause',
    'MediaPlayPause',
    'MediaStop',
    'MediaFastForward',
    'MediaRewind',
  ]) {
    try {
      tizen?.tvinputdevice?.registerKey(name);
    } catch {
      // A key this model does not have.
    }
  }
}

/** Closes the app. Only a television knows how. */
export function exitApp(platform: Platform): void {
  try {
    if (platform === 'tizen') {
      (
        window as unknown as {
          tizen?: { application: { getCurrentApplication(): { exit(): void } } };
        }
      ).tizen?.application
        .getCurrentApplication()
        .exit();
    } else if (platform === 'webos') {
      (window as unknown as { webOS?: { platformBack?: () => void } }).webOS?.platformBack?.();
    }
  } catch {
    // Nothing to close in a browser.
  }
}
