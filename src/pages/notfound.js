import { h } from '../utils/dom.js';

export function notFoundPage() {
  return h('div', null,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Page not found'),
    h('p', null, 'That address does not exist in this app.'),
    h('a', { class: 'btn', href: '#/' }, 'Go to Home'));
}
