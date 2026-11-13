// Hash router: works on GitHub Pages (no server rewrites) and fully offline.
// Pure functions are exported separately so they can be unit-tested in Node.

export function parseHash(hash) {
  let raw = (hash || '').replace(/^#/, '');
  if (!raw.startsWith('/')) raw = '/' + raw;
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch (_) { return s; }
  });
  const query = {};
  for (const pair of queryPart.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try { query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (_) { query[k] = v; }
  }
  return { path, query };
}

/** routes: [{ pattern: 'guide/:id', ...rest }]. Returns { route, params } or null. */
export function matchRoute(routes, path) {
  for (const route of routes) {
    const parts = route.pattern.split('/').filter(Boolean);
    if (parts.length !== path.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = path[i];
      else if (parts[i] !== path[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function buildHash(path, query) {
  const p = '#/' + path.map(encodeURIComponent).join('/');
  const q = query ? Object.entries(query).filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  return q ? `${p}?${q}` : p;
}

export function startRouter(routes, onRoute) {
  const run = () => {
    const { path, query } = parseHash(location.hash);
    const match = matchRoute(routes, path);
    onRoute(match, { path, query });
  };
  window.addEventListener('hashchange', run);
  run();
  return run;
}
