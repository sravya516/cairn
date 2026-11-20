# Cairn — Your Complete Offline Emergency Guide

Cairn is a free, installable web app (a PWA) for emergency preparedness. After the first visit it runs from files saved on your phone, so the guides, checklists, calculators and your household plan keep working with **no Wi-Fi and no cell service**.

> **If you are in a life-threatening emergency in the United States, call 911.** Cairn is educational. It does not replace emergency services, professional medical care or instructions from local officials.

> **Live beta:** <https://sravya516.github.io/cairn/>

> Cairn is an independent project. It is **not affiliated with, endorsed by or sponsored by** FEMA, Ready.gov, the American Red Cross, the CDC or any other organization it cites as a source.

- **No account, no login, no tracking, no ads, no paid services.** Your data never leaves your device.
- **Zero dependencies.** Plain HTML, CSS and JavaScript (ES modules). Nothing to install to run or deploy it.
- **Free to host** on GitHub Pages.

## Read this first: what is and is not verified

This project was built and tested on Windows. Everything below is marked honestly.

| Area | Status |
|------|--------|
| Unit, content, accessibility, security and PWA tests | Passing (`npm test`) |
| Offline end-to-end test in a real browser (Edge/Chrome engine) with the server **killed**: 71 checks, including a 247-screen audit and notched-iPhone layout checks, real PDF generation, IndexedDB persistence, update flow, corrupted-data handling | Passing at the site root **and** at a `/cairn/` project-site subpath |
| WCAG AA colour contrast, both themes | Passing (computed from the stylesheet) |
| **Installing on a real iPhone**, home-screen standalone look, launch screens, iOS storage behaviour, print/PDF from Safari, saving backups to Files | **Partly tested by the owner, not logged.** The project owner reported on a real iPhone (2026-11-14 to 2026-11-20) that the installed live site worked, the calculator layout fix worked, and four Ask Cairn checks passed (the answer shows above the keyboard, it answers in airplane mode, and the Call 911 button appears for a present emergency). **No device model, iOS version or per-step log was recorded**, and the full [docs/IPHONE_TEST_PLAN.md](docs/IPHONE_TEST_PLAN.md) has not been worked through, so print/PDF from Safari, saving backups to Files and VoiceOver remain unconfirmed. |
| **Medical and safety content** | Written from general knowledge of public guidance. **Not professionally reviewed. No source has been verified against its live page** (every "last verified" cell in [CONTENT_SOURCES.md](CONTENT_SOURCES.md) is `—`). Verify the safety-critical table before relying on it |
| GitHub Actions workflow and live site | Ran successfully on first push (2026-11-13): unit tests, the Linux real-browser offline test and the deploy all passed, and every cached file on the live site matches its checksum. **A real device has still not opened the live site** |

A full criterion-by-criterion audit is in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Features

- **Emergency Now** — 40 quick-reference cards (bleeding, CPR/AED, choking, allergic reaction, stroke/heart attack, burns, poisoning, drowning, asthma, diabetic emergency, seizure, head injury, bites, childbirth, electric shock and lightning strike, carbon monoxide, gas leak, fire, tornado, flood, earthquake, tsunami, volcano, wildfire, wildfire smoke, boat emergencies, hurricane, heat, cold, **nuclear explosion and radiation**, chemical spills, active violence, explosions, building collapse, power outage, evacuation, communication, emergency numbers abroad…) with large text and short steps. A **Call 911** button is always one tap away.
- **146 guides** (about 37,000 words) in 12 topics: general preparedness, water, food, first aid and medical, 15 natural-disaster guides, shelter and sanitation, power, communication and navigation, evacuation, security, long-term self-reliance, and **other emergencies and threats** (nuclear and radiological events, chemical releases, gas leaks, tsunami, volcano, pandemics, active violence, bombings, cyberattacks, solar storms, civil unrest, building collapse, avalanche, dam failure, sinkholes, wildfire smoke and air quality, boating and marine emergencies), plus travel emergencies abroad and electric shock and lightning-strike first aid. Each lists its sources and last-updated date.
- **21 checklists** (316 items): 72-hour, two-week and 30-day supplies, go-bags, vehicle and first-aid kits, hazard preparation and recovery. Check items, add notes and custom items. Progress saves automatically.
- **7 calculators**: water, food, power, battery, fuel planning, budget and storage. Each states its assumptions and limits, and is tested against hand-computed values.
- **My Plan**: household members, medical notes, contacts, meeting places, evacuation plan, pets, vehicles. Validated, autosaved, stored only on the device.
- **Ask Cairn** (`#/ask`): type a question in plain words and get the matching passage from the guides, emergency cards or checklists, quoted word for word with its guide, section, sources and date. It can also do the water, food and battery sums from a sentence, sends "someone is not breathing"-type questions straight to the emergency card with a Call 911 button, refuses medicine-dose questions, and says so when it has no answer. **It is not a generative AI**: it cannot write new advice, search the internet or know today's weather, so it cannot invent anything. It runs on the device, offline, and nothing typed leaves it. Measured accuracy is in [Ask Cairn: how well does it work?](#ask-cairn-how-well-does-it-work) below.
- **Offline search** across guides, checklist items, emergency cards and calculators, with typo tolerance and suggestions.
- **Printable handbook**, generated on the device, as a print/PDF view or a downloadable HTML file.
- **Backup and restore** with checksum validation, merge or replace, and undo.
- **Offline status screen** that checks every cached file against its checksum.
- Light and dark themes, large touch targets, keyboard navigation, safe-area support for iPhone.

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer. There is no `npm install`.

```bash
npm run build      # builds the app into dist/
npm run serve      # serves dist/ at http://localhost:4173
```

Open <http://localhost:4173>. Service workers work on `localhost`.

## Install on an iPhone

1. Open the app's address in **Safari** (it must be Safari for installing).
2. Wait a few seconds on the first visit while the offline copy is saved. Open **My Plan → Offline and storage status** and look for **Offline ready**.
3. Tap **Share**, then **Add to Home Screen**.
4. Launch Cairn from the new icon.

### iOS limits, stated honestly

- iOS saves the offline copy only after a first visit **with internet**.
- Safari can delete website data if the phone is critically low on space, and for sites not installed to the Home Screen after about a week of non-use. Installed Home Screen apps are treated more generously, **but there is no guarantee**. Export a backup occasionally.
- **Deleting the Home Screen app or clearing Safari website data erases your plan and checklist progress.**
- Updates install the next time you open the app while online. An "update ready" bar appears and you choose when to apply it.
- `window.print()` may not open a print dialog from a Home Screen app. Use **Download** in the handbook screen and print the file from Safari.
- Offline GPS needs map data downloaded in advance: GPS reception itself does not need internet, but map tiles do (this is explained in the navigation guide).

## Deploy to GitHub Pages (free)

Cairn uses only relative URLs and hash routing, so it works at `https://you.github.io/` **and** at a project site like `https://you.github.io/cairn/` with no configuration.

1. Create a new **public** GitHub repository (on github.com, empty, no README), then push this folder to its `main` branch. (GitHub Pages on private repositories requires a paid plan; public repositories are free.)
   ```bash
   git init -b main
   git add .
   git commit -m "Cairn offline emergency guide"
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   git push -u origin main
   ```
2. In the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`. The workflow in [.github/workflows/pages.yml](.github/workflows/pages.yml) runs the tests, builds, and publishes `dist/`.
4. Open the URL shown in the workflow's *deploy* step (or in Settings → Pages).

No domain, secrets or paid service is needed. A custom domain is optional.

To rehearse the subpath locally: `npm run build && npm run serve:subpath`, then open <http://localhost:4174/cairn/>.

## Testing

| Command | What it does |
|---------|--------------|
| `npm test` | Rebuilds, then runs all unit and content tests (Node's built-in test runner) |
| `npm run check` | Builds, then runs `npm test` (a quick pre-commit check) |
| `npm run e2e` | Real-browser offline test (see below). Needs Chrome or Edge installed |
| `npm run e2e:subpath` | The same, served at `/cairn/` to prove project-site deployment |
| `npm run ask -- "how do I stop bleeding"` | Asks the assistant a question from the command line (after `npm run build`) and shows the ranked passages, for tuning |
| `npm run sources` | Regenerates the guide and card tables in `CONTENT_SOURCES.md` (`-- --check` to verify only) |
| `npm run icons` | Regenerates the app icons and iPhone launch screens (dependency-free PNG encoder) |

### What the offline end-to-end test does

`npm run e2e` launches headless Chrome/Edge against a fresh build, then:

1. Loads the app, waits for the service worker to install, and verifies every file is cached with a matching checksum.
2. **Kills the web server** (and confirms the port refuses connections) and switches the browser offline.
3. Cold-starts the app, opens every route, searches, toggles checklists, uses calculators, edits the plan, makes and restores a backup, generates the handbook as a real PDF, and audits all **247 screens** for headings, labels, accessible names, dead links, stray text and horizontal overflow at phone, tablet and desktop widths.
4. Corrupts saved data on purpose to prove the app recovers.
5. Brings the server back with a **new build** and verifies the update flow: the new version waits for approval, then replaces the old cache completely.

### Test it yourself, offline

- **Desktop Chrome/Edge:** open the app, wait for "Offline ready" on the status screen, open DevTools → *Network* → tick **Offline** (or *Application → Service Workers → Offline*), and reload. Everything should still work.
- **iPhone:** after installing, turn on **Airplane Mode**, force-quit the app, reopen it. See [docs/IPHONE_TEST_PLAN.md](docs/IPHONE_TEST_PLAN.md).

## Your data and backups

Everything you enter is stored on the device in **IndexedDB** (falling back to `localStorage`, then memory, if a browser blocks it). The app asks the browser for protected ("persistent") storage, which not every browser grants.

- **Export:** *My Plan → Backup and restore → Download backup file* (or share to Files, or copy the text). The file contains your plan, checklist progress, bookmarks and calculator settings.
- **Restore:** choose the file, review the summary, then **Merge** (keep what you have, add what is missing) or **Replace**. Cairn saves a snapshot first, so you can **Undo last restore**.
- **Corrupted or edited files** are detected by a checksum and rejected with an explanation.
- **Backup files are not encrypted.** They may contain medical and family details. Keep them private.
- **Erase all data** is available on the same screen (type `ERASE` to confirm).

Export a backup after you finish your plan and again every few months. The backup screen reminds you after 90 days.

## Privacy and security

- No analytics, tracking, accounts or network calls. A Content Security Policy limits the page to its own origin; a test fails if that changes.
- All user text is rendered as text, never as HTML. The code contains no `eval` or HTML-injection sinks (also tested).
- Imported backups are validated and sanitized; prototype-pollution and oversized-file cases are tested.
- Backups are unencrypted (see above) and a phone without a passcode exposes the data in the app.

## Project structure

```
public/            index.html, manifest, service worker template, offline page, icons, iOS launch images
src/
  main.js, routes.js
  pages/           one module per screen
  components/      app shell, shared UI
  navigation/      hash router
  services/        storage/ (IndexedDB), search/, offline/ (service worker + verification),
                   backup/, content, checklists, plan, handbook, library
  calculators/     seven pure calculators + shared validation
  utils/           DOM helpers, icons, text, guide-file parser
  styles/          main.css, handbook.css
  data/            ALL content, separate from code: guides/*.md, checklists/*.json, emergency/*.json, meta.json
scripts/           build, serve, icons, sources register, e2e
tests/             unit, content, accessibility, PWA and end-to-end helpers
docs/              iPhone test plan, acceptance audit
CONTENT_SOURCES.md every source, which guide uses it, and when a human last verified it
```

Why these choices: a no-dependency stack means nothing to patch, nothing to download at build time, and no supply-chain exposure. Hash routing works on any static host with no server rewrites. The service worker pre-caches the **entire** app (every script, style, icon, data file) in one versioned cache, so a half-installed version can never become active.

## Contributing content

Guides are written in a compact Markdown-style format in `src/data/guides/`. The build validates structure, categories and sources. See [CONTRIBUTING.md](CONTRIBUTING.md) for the format, safety rules (no medication doses, always cite sources) and the verification process.

## Ask Cairn: how well does it work?

Ask Cairn finds passages; it does not understand or reason. Two question sets measure it (both in `tests/`, run by `npm test`):

- **Tuning set** (`assistant.test.js`, 69 answerable questions): the right guide is in the top 3 for 69/69 and first for 63/69. These questions were used while building the engine, so this number is optimistic.
- **Held-out set** (`assistant-heldout.test.js`, 39 answerable questions written afterwards in different words): on the first run the right guide was in the top 3 for **77%**, and the right guide with the key fact shown for **72%**. After fixing general defects it exposed (words like "safest", compounds like "snowstorm", live-data questions) it reads 82% and 77%, but those fixes mean the set is no longer fully held out. Roughly **one answerable question in five still gets a wrong or incomplete answer**. When it is unsure it says which words it could not match, and every answer links to the full guide so you can check it.

Out-of-scope questions (weather, news, recipes, car repair) are declined in 7 of 8 held-out cases; the miss shows a weakly related passage with a "may not fully answer" warning. It will never give medicine doses.

## Known limitations

- Ask Cairn is keyword retrieval, not AI: it can miss a question that the guides do answer, and it cannot combine information from several guides. Use Search or browse the guides when it does not find what you need.

- Not professionally reviewed; sources not yet verified (see above).
- United States focus (911, Poison Help, NWS, FEMA).
- The app is about 0.74 MB (270 KB compressed), far below the 50–100 MB planning target. That is deliberate: it is text and code only, and nothing essential was cut. There are **no images, diagrams or videos** yet.
- The handbook is an HTML print view, not a generated binary PDF. Saving as PDF uses the browser's print dialog.
- Automated tests run only on the Chrome/Edge engine. Safari/iPhone has had informal owner testing only (see the table at the top), not the full test plan.
- Accessibility was tested with automated checks and structural audits. It has **not** been tested with VoiceOver or other assistive technology.

## License

MIT. See [LICENSE](LICENSE). The emergency information is provided for education only, with no warranty.
