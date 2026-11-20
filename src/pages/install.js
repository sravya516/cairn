// Install Cairn on a phone: plain step-by-step help for iPhone/iPad (both Share-button layouts), Android and computers.
// The steps are data (STEPS) so tests can check them. Menu names differ a little between phones and software versions,
// so every list says what to look for, not only what to tap.
import { h, fill } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { detectPlatform } from '../utils/platform.js';
import { canPromptInstall, promptInstall, onInstallChange, isStandalone } from '../services/install.js';

const ico = (name) => h('span', { class: 'inline-ico', 'aria-hidden': 'true' }, icon(name));

/** Each step: { title, detail?, choices?: [{ heading, text, icon? }] }. `native: true` marks the one-tap Install button slot. */
export const STEPS = {
  ios: [
    { title: 'Open Cairn in Safari', detail: 'Use the Safari app (the blue compass). If you opened this link from WhatsApp, Instagram, Messages or another app, tap its menu and choose “Open in Safari”, or copy the address into Safari.' },
    {
      title: 'Find the Share button', icon: 'share',
      detail: 'Share looks like a square with an arrow pointing up. Where it is depends on your iPhone and iOS version. Look for one of these:',
      choices: [
        { heading: 'Share is in the bar', icon: 'share', text: 'You can see the Share button in the bar at the bottom of the screen, or next to the web address at the top. Tap it.' },
        { heading: 'Share is hidden in a menu', icon: 'dots', text: 'Newer iPhones with the new Safari layout hide it. Tap the three dots (•••) or the three lines (☰) next to the web address, then tap Share in the list that opens.' },
      ],
    },
    { title: 'Tap “Add to Home Screen”', detail: 'Scroll down the list that opened. If you do not see it, tap “View More” or “More” first.', icon: 'plus' },
    { title: 'Tap “Add”', detail: 'It is in the top right corner. If you see “Open as Web App”, leave it switched on.' },
    { title: 'Open Cairn from your Home Screen', detail: 'Use the new Cairn icon, not Safari. Open it once while you have internet and wait about a minute, so it can save everything for offline use.' },
  ],
  android: [
    { title: 'Open Cairn in Chrome', detail: 'Use the Chrome app. If you opened this link from another app, tap its menu and choose “Open in Chrome” (or “Open in browser”).' },
    { title: 'Tap Install', native: true, detail: 'If you see the Install button below, tap it, then tap “Install” in the box that appears. If you do not see it, use the menu instead:' },
    { title: 'Or use the menu', icon: 'dotsv', detail: 'Tap the three dots (⋮) at the top right of Chrome, then tap “Install app” (on some phones it says “Add to Home screen”). Tap “Install” or “Add” to confirm.' },
    { title: 'Open Cairn from your Home Screen or app list', detail: 'Open it once while you have internet and wait about a minute, so it can save everything for offline use.' },
  ],
  androidOther: [
    { heading: 'Samsung Internet', text: 'Tap the three lines (☰) at the bottom right, then “Add page to”, then “Home screen”, then “Add”.' },
    { heading: 'Firefox', text: 'Tap the three dots (⋮), then “Install”, then “Add”.' },
    { heading: 'Microsoft Edge', text: 'Tap the three dots (•••) at the bottom, then “Add to phone”, then “Install”.' },
  ],
  computer: [
    { title: 'Open Cairn in Chrome or Edge', detail: 'Safari on a Mac can use File, then “Add to Dock”. Firefox on a computer cannot install apps.' },
    { title: 'Click the Install icon', detail: 'It is a small monitor with a down arrow at the right end of the address bar. Or open the browser menu (⋮) and choose “Install Cairn” (Chrome) or “Apps”, then “Install this site as an app” (Edge).' },
    { title: 'Open Cairn from your apps', detail: 'It now opens in its own window and works without internet.' },
  ],
};

const AFTER = [
  'Open Cairn once with internet, then go to My Plan, then Offline and storage status. It should say “Offline ready”.',
  'To test it, turn on Airplane Mode and open Cairn from the Home Screen. It should still open.',
];

function stepList(steps, nativeSlot) {
  return h('ol', { class: 'install-steps' }, steps.map((s) => h('li', { class: 'install-step' },
    h('div', { class: 'step-body' },
      h('strong', { class: 'step-title' }, s.icon ? [ico(s.icon), ' '] : null, s.title),
      s.detail ? h('p', { class: 'step-detail' }, s.detail) : null,
      s.native ? nativeSlot : null,
      s.choices ? h('div', { class: 'step-choices' }, s.choices.map((c) => h('div', { class: 'step-choice' },
        h('strong', null, c.icon ? [ico(c.icon), ' '] : null, c.heading), h('p', null, c.text)))) : null))));
}

export async function installPage() {
  const detected = detectPlatform();
  let tab = detected.os === 'ios' ? 'ios' : detected.os === 'android' ? 'android' : 'computer';

  const root = h('div', { class: 'install' });
  const body = h('div', null);
  const tabs = h('div', { class: 'chips', role: 'group', 'aria-label': 'Choose your device' });
  const nativeSlot = h('div', { class: 'native-slot' });

  const paintNative = () => {
    nativeSlot.replaceChildren(canPromptInstall()
      ? h('button', { type: 'button', class: 'btn block', onclick: async (e) => {
        const r = await promptInstall();
        e.target.textContent = r === 'accepted' ? 'Installing… open Cairn from your Home Screen' : 'Install';
        paintNative();
      } }, icon('download'), 'Install Cairn')
      : h('p', { class: 'muted small' }, 'The Install button is not showing on this device right now. Use the menu steps below.'));
  };

  const paint = () => {
    tabs.replaceChildren(...[['ios', 'iPhone or iPad'], ['android', 'Android'], ['computer', 'Computer']].map(([id, label]) => h('button', {
      type: 'button', class: 'chip' + (tab === id ? ' on' : ''), 'aria-pressed': tab === id ? 'true' : 'false', onclick: () => { tab = id; paint(); },
    }, label)));
    if (tab === 'ios') {
      fill(body, 
        detected.os === 'ios' && detected.browser !== 'safari' && !detected.inApp ? h('div', { class: 'notice' }, 'You are not using Safari. Newer iPhones can add Cairn from other browsers too, but the steps below are for Safari, which always works.') : null,
        stepList(STEPS.ios));
    } else if (tab === 'android') {
      paintNative();
      fill(body, 
        stepList(STEPS.android, nativeSlot),
        h('details', { class: 'card install-other' }, h('summary', null, 'Using Samsung Internet, Firefox or Edge?'),
          h('ul', { class: 'step-other' }, STEPS.androidOther.map((o) => h('li', null, h('strong', null, o.heading + ': '), o.text)))));
    } else {
      fill(body, stepList(STEPS.computer));
    }
  };

  const standaloneNote = isStandalone()
    ? h('div', { class: 'notice', role: 'status' }, 'Cairn is already installed on this device. You are using the installed app.') : null;
  const inAppNote = detected.inApp
    ? h('div', { class: 'notice', role: 'note' }, 'It looks like you opened Cairn inside another app (such as Facebook, Instagram or a messaging app). Those cannot install Cairn. Tap the menu and choose “Open in Safari” or “Open in Chrome”, then follow the steps.') : null;

  fill(root,
    h('h1', { tabindex: '-1', id: 'page-title' }, 'Install Cairn on your phone'),
    h('p', { class: 'lead' }, 'Installing puts a Cairn icon on your Home Screen. It opens like an app, full screen, and works with no internet. It is free and takes about a minute.'),
    standaloneNote, inAppNote,
    h('h2', { class: 'visually-small' }, 'Which phone do you have?'), tabs, body,
    h('div', { class: 'card' }, h('h2', null, 'After you install'), h('ul', null, AFTER.map((t) => h('li', null, t)))),
    h('p', { class: 'muted small' }, 'Menu names change a little between phones and software versions. If a word is different on your phone, look for “Install” or “Add to Home Screen”. You can also use Cairn in the browser without installing. Installing makes it easier to find and helps your phone keep the saved copy.'),
    h('a', { class: 'btn secondary block', href: '#/storage' }, icon('wifi'), 'Offline and storage status'));

  const off = onInstallChange(() => { if (!root.isConnected) { off(); return; } if (tab === 'android') paintNative(); });
  paint();
  return root;
}
