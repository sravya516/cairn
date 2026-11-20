import { buildShell } from './components/shell.js';
import { startRouter } from './navigation/router.js';
import { initOffline } from './services/offline/register.js';
import { initInstall } from './services/install.js';
import { getStore, requestPersistence } from './services/storage/index.js';
import { loadContent } from './services/content.js';
import { h } from './utils/dom.js';
import { routes } from './routes.js';
import { notFoundPage } from './pages/notfound.js';

async function render(shell, match, ctx) {
  const token = (render.token = (render.token || 0) + 1);
  let page;
  try {
    page = match ? await match.route.page(match.params, ctx) : notFoundPage();
  } catch (err) {
    page = h('div', null, h('h1', { tabindex: '-1', id: 'page-title' }, 'Something went wrong'),
      h('div', { class: 'notice' }, 'This screen could not be displayed: ' + (err && err.message || err)),
      h('a', { class: 'btn', href: '#/' }, 'Go to Home'));
  }
  if (token !== render.token) return; // a newer navigation superseded this one
  shell.view.replaceChildren(page);
  shell.setActive(ctx.path);
  document.title = (match ? match.route.title : 'Not found') + ' · Cairn';
  window.scrollTo(0, 0);
  const t = shell.view.querySelector('#page-title') || shell.view;
  t.focus({ preventScroll: true });
  document.documentElement.dataset.route = location.hash || '#/'; // lets tests know the screen finished rendering
}

function boot() {
  const shell = buildShell();
  document.getElementById('app').replaceChildren(shell.root);
  // Warm the content + database in the background so screens open instantly.
  loadContent().catch(() => {});
  getStore().then(() => requestPersistence()).catch(() => {});
  // The skip link must not change the hash (it is the router's state): move focus instead.
  document.querySelector('.skip-link')?.addEventListener('click', (e) => { e.preventDefault(); shell.view.focus(); shell.view.scrollIntoView(); });
  initInstall(); // capture the browser's install offer before any screen asks for it
  startRouter(routes, (match, ctx) => { render(shell, match, ctx); });
  initOffline();
}

boot();
