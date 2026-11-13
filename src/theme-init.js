// Runs before first paint (loaded synchronously in <head>) so there is no flash of the wrong theme.
// Theme preference is a harmless per-device convenience, so localStorage is fine; failures are ignored.
(function () {
  try {
    var t = localStorage.getItem('cairn.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable: follow system theme */ }
})();
