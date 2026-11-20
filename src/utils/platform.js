// Works out which phone and browser the person is using, so Cairn can show the right "add to Home Screen" steps.
// Pure function over a navigator-like object so it can be unit tested. It is only a hint: the Install page lets people switch.

/** @returns {{ os: 'ios'|'android'|'desktop', browser: 'safari'|'chrome'|'firefox'|'edge'|'samsung'|'opera'|'other', inApp: boolean, ipad: boolean }} */
export function detectPlatform(nav = globalThis.navigator || {}) {
  const ua = String(nav.userAgent || '');
  const touch = Number(nav.maxTouchPoints || 0);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1); // iPadOS 13+ pretends to be a Mac
  const ios = /iPhone|iPod/.test(ua) || ipad;
  const android = /Android/.test(ua);
  const os = ios ? 'ios' : android ? 'android' : 'desktop';

  let browser = 'other';
  if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /OPiOS/.test(ua) ? 'opera' : /Safari/.test(ua) ? 'safari' : 'other';
  else if (android) browser = /SamsungBrowser/.test(ua) ? 'samsung' : /EdgA/.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox/.test(ua) ? 'firefox' : /Chrome/.test(ua) ? 'chrome' : 'other';
  else browser = /Edg\//.test(ua) ? 'edge' : /Firefox/.test(ua) ? 'firefox' : /Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'other';

  // Browsers built into other apps (Facebook, Instagram, TikTok, Line, Android WebView) cannot add a Home Screen app.
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|Snapchat|Twitter|; wv\)/i.test(ua) || (ios && !/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua));
  return { os, browser, inApp, ipad };
}
