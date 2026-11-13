// Generates PNG app icons and iOS splash images with no dependencies.
// Rasterises a simple signed-distance-field design with 3x3 supersampling.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('public');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB, no alpha (iOS requires opaque icons)
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const BG = hex('#1a1f1e'), GREEN = hex('#2f6f4e'), TEAL = hex('#3a8f8a'), WHITE = hex('#ffffff');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Signed distance to a rounded rectangle centred at (cx,cy).
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r), dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

// Design is defined in unit space (0..1 across the shorter side), centred at (0.5,0.5).
function colourAt(u, v) {
  let col = BG;
  const d = Math.hypot(u - 0.5, v - 0.5);
  col = d < 0.335 ? col : col; // keep outside flat
  if (d < 0.335) col = TEAL;               // outer ring
  if (d < 0.305) col = GREEN;              // disc
  const arm = sdRoundRect(u, v, 0.5, 0.5, 0.17, 0.055, 0.03);
  const arm2 = sdRoundRect(u, v, 0.5, 0.5, 0.055, 0.17, 0.03);
  if (Math.min(arm, arm2) < 0) col = WHITE; // plus sign
  return col;
}

function render(w, h, scale = 1) {
  const buf = Buffer.alloc(w * h * 3);
  const short = Math.min(w, h) * scale;
  const ox = (w - short) / 2, oy = (h - short) / 2;
  const S = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S - ox) / short, v = (y + (sy + 0.5) / S - oy) / short;
        const c = colourAt(u, v);
        r += c[0]; g += c[1]; b += c[2];
      }
      const i = (y * w + x) * 3, n = S * S;
      buf[i] = Math.round(r / n); buf[i + 1] = Math.round(g / n); buf[i + 2] = Math.round(b / n);
    }
  }
  return encodePNG(w, h, buf);
}

fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'splash'), { recursive: true });

// Standard icons (design fills the canvas; iOS rounds the corners itself).
for (const s of [180, 192, 512]) fs.writeFileSync(path.join(OUT, 'icons', `icon-${s}.png`), render(s, s, 1));
// Maskable icon: same design, kept inside the central safe zone.
fs.writeFileSync(path.join(OUT, 'icons', 'icon-maskable-512.png'), render(512, 512, 0.8));

// iOS launch images (portrait). Icon is shown at ~35% of the shorter side.
const splash = [
  [750, 1334], [828, 1792], [1125, 2436], [1170, 2532], [1179, 2556],
  [1242, 2688], [1284, 2778], [1290, 2796], [1320, 2868], [1206, 2622],
];
for (const [w, h] of splash) fs.writeFileSync(path.join(OUT, 'splash', `splash-${w}x${h}.png`), render(w, h, 0.5));

// Vector icon.
fs.writeFileSync(path.join(OUT, 'icons', 'icon.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Cairn">
  <rect width="512" height="512" fill="#1a1f1e"/>
  <circle cx="256" cy="256" r="171" fill="#3a8f8a"/>
  <circle cx="256" cy="256" r="156" fill="#2f6f4e"/>
  <rect x="169" y="228" width="174" height="56" rx="15" fill="#fff"/>
  <rect x="228" y="169" width="56" height="174" rx="15" fill="#fff"/>
</svg>
`);
console.log('Icons and splash images written to public/');
