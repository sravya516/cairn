// Install help: platform detection and the written steps for iPhone, Android and computers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { detectPlatform } from '../src/utils/platform.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0',
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  androidWebview: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

test('detectPlatform recognises common phones and browsers', () => {
  const d = (ua, touch = 0) => detectPlatform({ userAgent: ua, maxTouchPoints: touch });
  assert.deepEqual([d(UA.iphoneSafari, 5).os, d(UA.iphoneSafari, 5).browser], ['ios', 'safari']);
  assert.deepEqual([d(UA.iphoneChrome, 5).os, d(UA.iphoneChrome, 5).browser], ['ios', 'chrome']);
  assert.equal(d(UA.iphoneInstagram, 5).inApp, true);
  assert.equal(d(UA.ipadAsMac, 5).os, 'ios'); // iPadOS reports a Mac with a touch screen
  assert.equal(d(UA.macSafari, 0).os, 'desktop'); // a real Mac has no touch points
  assert.deepEqual([d(UA.androidChrome).os, d(UA.androidChrome).browser, d(UA.androidChrome).inApp], ['android', 'chrome', false]);
  assert.equal(d(UA.androidSamsung).browser, 'samsung');
  assert.equal(d(UA.androidFirefox).browser, 'firefox');
  assert.equal(d(UA.androidWebview).inApp, true);
  assert.deepEqual([d(UA.windowsEdge).os, d(UA.windowsEdge).browser], ['desktop', 'edge']);
  assert.equal(d(UA.iphoneSafari, 5).inApp, false);
});

test('detectPlatform never throws on odd input', () => {
  for (const n of [undefined, {}, { userAgent: null }, { userAgent: 42 }, { userAgent: '', maxTouchPoints: 'x' }]) {
    const r = detectPlatform(n);
    assert.ok(['ios', 'android', 'desktop'].includes(r.os));
  }
});

test('iPhone steps cover both Share-button layouts, in plain words', async () => {
  const dom = globalThis.document;
  // the steps module imports DOM helpers; read the data from source so this test needs no DOM
  const src = fs.readFileSync(path.join(import.meta.dirname, '../src/pages/install.js'), 'utf8');
  const ios = src.slice(src.indexOf('ios: ['), src.indexOf('android: ['));
  assert.match(ios, /Share/);
  assert.match(ios, /square with an arrow pointing up/);
  assert.match(ios, /three dots \(•••\) or the three lines \(☰\)/, 'the hidden-in-a-menu layout must be explained');
  assert.match(ios, /Add to Home Screen/);
  assert.match(ios, /View More/);
  assert.match(ios, /Open as Web App/);
  assert.match(ios, /Open it once while you have internet/);
  assert.equal(dom, undefined);
});

test('Android steps cover the Install button, the Chrome menu, and Samsung, Firefox and Edge', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '../src/pages/install.js'), 'utf8');
  const android = src.slice(src.indexOf('android: ['), src.indexOf('computer: ['));
  assert.match(android, /Install app/);
  assert.match(android, /Add to Home screen/);
  assert.match(android, /three dots \(⋮\)/);
  for (const name of ['Samsung Internet', 'Firefox', 'Microsoft Edge']) assert.ok(android.includes(name), name);
});

test('the manifest meets Android install requirements (name, icons 192 and 512, standalone, start_url, service worker)', () => {
  const root = path.join(import.meta.dirname, '..');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(fs.existsSync(path.join(root, 'public/sw.js')));
});

test('pages never call native root.append(): it prints the text "null" for empty optional parts (use appendAll or fill)', () => {
  const dir = path.join(import.meta.dirname, '../src/pages');
  const offenders = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && /\broot\.append\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(offenders, []);
});
