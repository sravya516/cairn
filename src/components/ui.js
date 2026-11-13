// Small reusable UI building blocks shared by pages.
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { offlineState, onOfflineChange } from '../services/offline/register.js';

export function cardLink({ href, iconName, title, subtitle }) {
  return h('a', { class: 'card card-link', href },
    h('span', { class: 'ico' }, icon(iconName || 'book')),
    h('span', { class: 'meta' }, h('strong', null, title), subtitle ? h('span', null, subtitle) : null),
    icon('chevron', 'width="20" height="20"'));
}

export function pageTitle(text, sub) {
  return h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, text), sub ? h('p', { class: 'muted' }, sub) : null);
}

/** Live offline/online pill. */
export function statusPill() {
  const el = h('a', { class: 'pill', href: '#/storage', role: 'status' });
  const paint = () => {
    const offline = !offlineState.online;
    el.className = 'pill' + (offline ? ' offline' : '');
    const ready = offlineState.controlled;
    el.textContent = offline
      ? (ready ? 'Offline · app is working from saved copy' : 'Offline')
      : ready ? 'Online · offline-ready' : offlineState.swSupported && !offlineState.registrationError ? 'Online · preparing offline copy…' : 'Online · offline mode unavailable';
  };
  paint();
  onOfflineChange(paint);
  return el;
}

export function emergencyNotice() {
  return h('div', { class: 'notice', role: 'note' },
    h('strong', null, 'Life-threatening emergency? Call 911 now (U.S.) '),
    'if service is available. Official instructions from emergency officials always take precedence over this app.');
}
