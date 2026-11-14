// App chrome: sticky header (brand, Emergency Now, theme toggle) and bottom navigation.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { offlineState, onOfflineChange, applyUpdate } from '../services/offline/register.js';

export const NAV = [
  { id: 'home', label: 'Home', href: '#/', icon: 'home', match: (p) => p.length === 0 },
  { id: 'guides', label: 'Guides', href: '#/guides', icon: 'book', match: (p) => ['guides', 'guide'].includes(p[0]) },
  { id: 'checklists', label: 'Checklists', href: '#/checklists', icon: 'check', match: (p) => ['checklists', 'checklist'].includes(p[0]) },
  { id: 'calculators', label: 'Calculators', href: '#/calculators', icon: 'calc', match: (p) => ['calculators', 'calc'].includes(p[0]) },
  { id: 'plan', label: 'My Plan', href: '#/plan', icon: 'plan', match: (p) => ['plan', 'backup', 'storage'].includes(p[0]) },
];

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('cairn.theme', next); } catch (_) { /* ignore */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#eef2f0' : '#1a1f1e');
  return next;
}

/** Theme toggle button. `labelled` shows text (used on the Home screen for narrow phones). */
export function themeButton({ labelled = false, cls = 'icon-btn' } = {}) {
  const btn = h('button', { class: cls, type: 'button', 'aria-label': 'Switch light or dark theme' });
  const paint = () => {
    const light = currentTheme() === 'light';
    const label = labelled ? (light ? ' Switch to dark mode' : ' Switch to light mode') : '';
    btn.replaceChildren(icon(light ? 'moon' : 'sun'), label);
  };
  btn.addEventListener('click', () => { toggleTheme(); document.querySelectorAll('[data-theme-btn]').forEach((b) => b.__paint && b.__paint()); });
  btn.setAttribute('data-theme-btn', '');
  btn.__paint = paint;
  paint();
  return btn;
}

export function buildShell() {
  const themeBtn = themeButton();
  themeBtn.classList.add('hide-narrow');

  const header = h('header', { class: 'header' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Cairn home' },
      h('img', { src: './icons/icon-192.png', width: 36, height: 36, alt: '' }),
      h('span', { class: 'brand-text' },
        h('span', { class: 'brand-name' }, 'CAIRN'),
        h('span', { class: 'brand-sub' }, 'OFFLINE EMERGENCY GUIDE'))),
    h('a', { class: 'icon-btn', href: '#/search', 'aria-label': 'Search all guides' }, icon('search')),
    themeBtn,
    h('a', { class: 'emergency-btn', href: '#/emergency', 'aria-label': 'Emergency Now' }, icon('alert'), 'Emergency'));

  const links = NAV.map((n) => h('a', { href: n.href, dataset: { nav: n.id } }, icon(n.icon), h('span', null, n.label)));
  const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Primary' }, links);

  const banner = h('div', { class: 'update-banner', role: 'status', hidden: true },
    h('span', null, 'A new version of Cairn is ready to install.'),
    h('button', { class: 'btn', type: 'button', onclick: applyUpdate }, 'Update'));
  const syncBanner = () => { banner.hidden = !offlineState.updateReady; };
  onOfflineChange(syncBanner);
  syncBanner();

  const view = h('main', { id: 'view', tabindex: '-1' });
  const root = h('div', { class: 'app' }, header, banner, view, nav);

  // The header's real height varies: on iPhones with a notch it includes the safe-area inset. Sticky and fixed
  // elements below it (guide section bar, calculator summary) must start exactly where the header ends.
  const syncHeaderHeight = () => document.documentElement.style.setProperty('--sticky-top', header.offsetHeight + 'px');
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncHeaderHeight).observe(header, { box: 'border-box' }); // border-box: the safe-area inset changes padding, not content
  window.addEventListener('resize', syncHeaderHeight);
  window.addEventListener('orientationchange', syncHeaderHeight);

  function setActive(path) {
    NAV.forEach((n, i) => {
      if (n.match(path)) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    });
  }
  return { root, view, setActive };
}
