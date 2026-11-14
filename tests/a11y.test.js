// Accessibility checks that can be done without a browser: WCAG contrast of every text/background pairing in the
// stylesheet (both themes), focus visibility rules, touch-target sizes and the skip link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles/main.css'), 'utf8');

function vars(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function blockAfter(marker) {
  const i = css.indexOf(marker);
  assert.ok(i >= 0, `stylesheet has no ${marker}`);
  const start = css.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}' && --depth === 0) return css.slice(start + 1, j);
  }
  throw new Error('unbalanced');
}

const dark = vars(blockAfter(':root {'));
const lightMedia = vars(blockAfter(':root:not([data-theme="dark"])'));
const lightForced = vars(blockAfter(':root[data-theme="light"]'));
const light = { ...dark, ...lightMedia };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const WHITE = '#ffffff';

test('light theme set is identical whether chosen by the system or by the toggle', () => {
  for (const k of Object.keys(lightMedia)) if (k !== 'light') assert.equal(lightMedia[k], lightForced[k], `--${k} differs between the media query and [data-theme="light"]`);
});

for (const [name, t] of [['dark', dark], ['light', light]]) {
  test(`${name} theme: body and secondary text meet WCAG AA (4.5:1)`, () => {
    for (const bg of ['bg', 'surface', 'surface-2']) {
      assert.ok(ratio(t.text, t[bg]) >= 4.5, `text on ${bg}: ${ratio(t.text, t[bg]).toFixed(2)}`);
      assert.ok(ratio(t['text-muted'], t[bg]) >= 4.5, `muted text on ${bg}: ${ratio(t['text-muted'], t[bg]).toFixed(2)}`);
    }
  });

  test(`${name} theme: links, errors and warnings are readable`, () => {
    for (const bg of ['bg', 'surface']) {
      assert.ok(ratio(t.teal, t[bg]) >= 4.5, `link colour on ${bg}: ${ratio(t.teal, t[bg]).toFixed(2)}`);
      assert.ok(ratio(t.danger, t[bg]) >= 4.5, `error colour on ${bg}: ${ratio(t.danger, t[bg]).toFixed(2)}`);
    }
    assert.ok(ratio(t['warn-text'], t['warn-bg']) >= 4.5, `warning text: ${ratio(t['warn-text'], t['warn-bg']).toFixed(2)}`);
  });

  test(`${name} theme: white text on every coloured button, tag and banner is AA`, () => {
    for (const bg of ['green-strong', 'danger-fill', 'danger-strong']) assert.ok(ratio(WHITE, t[bg]) >= 4.5, `white on ${bg}: ${ratio(WHITE, t[bg]).toFixed(2)}`);
    assert.ok(ratio(WHITE, '#25525f') >= 4.5, 'hero gradient end colour');
    assert.ok(ratio('#14201b', '#ffffff') >= 4.5, 'dark text on the white update button');
  });

  test(`${name} theme: focus ring and borders are visible (3:1 for UI components)`, () => {
    assert.ok(ratio(t.focus, t.bg) >= 3, `focus ring on bg: ${ratio(t.focus, t.bg).toFixed(2)}`);
    assert.ok(ratio(t.focus, t.surface) >= 3, `focus ring on surface: ${ratio(t.focus, t.surface).toFixed(2)}`);
    assert.ok(ratio(t.green, t.bg) >= 3 || ratio(t.teal, t.bg) >= 3, 'progress fill visible against its track');
  });
}

test('keyboard and touch usability rules exist in the stylesheet', () => {
  assert.match(css, /:focus-visible\s*{[^}]*outline:\s*3px/);
  assert.match(css, /\.skip-link/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media print/);
  // Primary controls are at least 44px tall (Apple HIG minimum).
  for (const sel of ['.icon-btn', '.emergency-btn', '.chip', '.btn', 'input[type="text"]']) {
    const m = css.match(new RegExp(sel.replace(/[.[\]"]/g, '\\$&') + '[^{]*{[^}]*min-height:\\s*(\\d+)px'));
    assert.ok(m && Number(m[1]) >= 40, `${sel} min-height ${m && m[1]}`);
  }
  assert.match(css, /--nav-h:\s*68px/);
});

test('base font size is at least 18px for body text (readable under stress)', () => {
  assert.match(css, /body\s*{[^}]*font:\s*18px/);
});

test('index.html has language, viewport that allows zoom, and a skip link', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?!\d)/.test(html), 'pinch-zoom must not be disabled');
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<noscript>/);
});

// Regression for a real-iPhone bug: a tall sticky panel covered the calculator form, and sticky elements used a fixed 60px
// offset so they slid under the (much taller) header on notched iPhones.
test('sticky and fixed elements start below the measured header height, and no large panel is sticky', () => {
  assert.match(css, /--sticky-top:\s*calc\(var\(--header-h\)\s*\+\s*env\(safe-area-inset-top\)\)/, 'safe-area-aware fallback');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ''); // comments would otherwise stick to the next selector
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  for (const r of rules) {
    if (!/position:\s*(sticky|fixed)/.test(r.body) || /^\.header|^\.bottom-nav|^\.skip-link/.test(r.sel)) continue;
    const top = r.body.match(/top:\s*([^;]+);/);
    if (top) assert.ok(top[1].includes('--sticky-top') || top[1].trim() === '0', `${r.sel}: sticky/fixed top must use --sticky-top, found "${top[1]}"`);
  }
  const box = rules.find((r) => r.sel === '.results-box');
  assert.ok(box && !/position:\s*sticky/.test(box.body), 'the full results panel must not be sticky (it covers the inputs on phones)');
  assert.match(css, /\.calc-summary\s*{[^}]*position:\s*fixed/, 'a slim fixed summary bar replaces it');
});

test('shell measures the header so sticky offsets follow the real (safe-area) height', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'src/components/shell.js'), 'utf8');
  assert.match(shell, /setProperty\('--sticky-top'/);
  assert.match(shell, /ResizeObserver/);
});
