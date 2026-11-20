# Acceptance audit

An honest, criterion-by-criterion account of the original requirements. **"Verified" means a test or a real-browser run I executed demonstrated it. "Not verified" means it was not demonstrated.** All automated browser evidence is from the Chrome/Edge engine on Windows. The only iPhone/Safari evidence is informal owner testing (installed, calculators, Ask Cairn) with no device, iOS version or step log recorded; the full iPhone test plan has not been worked through.

Legend: ✅ met and verified · 🟡 met in the Chrome/Edge engine only, or self-assessed · ⚠️ implemented but **not verified** · ❌ not met

## Final acceptance criteria

| # | Criterion | Status | Evidence and caveats |
|---|-----------|--------|----------------------|
| 1 | Professional, polished user interface | 🟡 | Reviewed in screenshots at phone width and checked for overflow at 390, 768 and 1280 px. No user testing. Subjective. |
| 2 | Installable on iPhone through Safari | ⚠️ | Manifest, 180/192/512 icons (opaque, as iOS requires), maskable icon, iOS meta tags and 10 launch images are present and tested (`tests/pwa.test.js`). Owner reports it installed and worked on a real iPhone (no device, iOS version or step log recorded). Run [IPHONE_TEST_PLAN.md](IPHONE_TEST_PLAN.md) section A to log it properly. |
| 3 | Works as a standalone home-screen application | ⚠️ | `display: standalone`, safe-area padding and iOS standalone meta are in place. Owner reports it works on a real iPhone; not logged in detail. |
| 4 | Opens without internet after initial caching | 🟡 | e2e: server killed (port refuses connections) and browser offline, then cold start succeeds, at root and at `/cairn/`. Chrome/Edge engine only. Safari's service-worker behavior is not tested. |
| 5 | All essential emergency content available offline | ✅ | 67 files pre-cached; the status screen and e2e verify every file against its SHA-256. All 247 screens open offline. |
| 6 | Comprehensive emergency-preparedness encyclopedia | 🟡 | 146 guides, about 37,000 words, 12 categories. Some listed topics are merged into one guide (see *Deviations*); a test confirms ~100 topic queries find the right guide. Not professionally reviewed. |
| 7 | Detailed natural-disaster instructions | ✅ | All 15 listed disasters, each with the ten required sections in order (enforced by a test). Content accuracy: see criterion 8 caveat. |
| 8 | First-aid and medical reference | ⚠️ | 18 medical guides plus emergency cards, with warnings, 911 guidance and no doses (tested). **Not professionally reviewed and no source verified against a live page.** |
| 9 | Water and food planning guides | ✅ | 10 + 10 guides; water guides distinguish filtration, purification and disinfection (tested). Numbers still need source verification (`CONTENT_SOURCES.md`). |
| 10 | Power and communication guides | ✅ | 11 + 8 guides, including GPS reception vs downloaded map data (tested) and runtime math with examples. |
| 11 | Interactive checklists | ✅ | 21 checklists, 316 items; check, notes, custom items, autosave; persistence verified offline across reloads. |
| 12 | Working offline calculators | ✅ | 7 calculators, hand-computed expected values, fuzz-tested with hostile input, verified offline in browser. |
| 13 | Household emergency planning | ✅ | All requested fields, validated, autosaved, corrupted data tolerated. |
| 14 | Offline search | ✅ | Guides, headings, tags, checklist items, cards and calculators; typo tolerance, synonyms, suggestions, filters; verified offline. |
| — | Ask Cairn question assistant (extra, not in the original brief) | 🟡 | Offline, extractive (quotes the guides; no generative AI). 69-question tuning set: right guide in top 3 for 69/69. Held-out set of 39 questions: 77% on first run, 82% after fixing defects it exposed. About 1 in 5 answerable questions still gets a wrong or incomplete answer. e2e verifies it offline: how-to answer with source, 911 button for a present emergency, calculator sum, declining live data, refusing medicine doses, `?q=` links. |
| 15 | Bookmarks | ✅ | Plus recently viewed; persistence verified. |
| 16 | Export and restore | 🟡 | Round trip (export → erase → restore) verified against real IndexedDB; tamper, truncation, oversize and hostile-content cases unit-tested. The actual **file download on iOS and saving to Files is not tested.** |
| 17 | Printable emergency handbook | 🟡 | Generated offline; Chrome's print engine produced a real **117-page PDF** with the server down. iOS printing / PDF is not tested; the Home Screen app may not open a print dialog (fallback documented). |
| 18 | No required accounts or login | ✅ | None exist. |
| 19 | No paid APIs | ✅ | No API calls at all. A CSP restricts the page to its own origin (tested). |
| 20 | No paid hosting requirements | ✅ | GitHub Pages, free for **public** repositories. Private repositories need a paid GitHub plan. |
| 21 | No subscription requirements | ✅ | None. |
| 22 | No unnecessary data collection | ✅ | No analytics, tracking or network calls; data stays on the device. |
| 23 | GitHub Pages deployment ready | 🟡 | Relative URLs, hash routing and the service worker verified at a `/cairn/` subpath locally **and live**: the workflow ran on GitHub (tests, Linux browser test, deploy all passed), and every file in the live cache list returns 200 with a matching checksum at https://sravya516.github.io/cairn/. Not yet opened on a real iPhone. |
| 24 | Automated tests passing | ✅ | See *Test results* below. |
| 25 | Offline functionality verified | 🟡 | Yes in Chrome/Edge (71 checks). **Not in Safari/iOS.** |
| 26 | Complete documentation | ✅ | README, CONTRIBUTING, this audit, the iPhone test plan, CONTENT_SOURCES. |

## The sixteen required test areas

| # | Area | Status | How it was tested |
|---|------|--------|-------------------|
| 1 | Initial application loading | ✅ | e2e cold load; startup measured offline at about 0.22–0.25 s (headless, median of 3) |
| 2 | Installation readiness | 🟡 | Manifest, icons and iOS tags asserted. **Lighthouse and a real install were not run.** |
| 3 | Manifest validity | ✅ | `pwa.test.js`: name, scope, icons exist, maskable icon, relative URLs |
| 4 | Service worker registration | ✅ | e2e; scope equals the deploy path (root and `/cairn/`) |
| 5 | Offline startup | 🟡 | Server killed, browser offline, cold reload (Chrome/Edge engine) |
| 6 | Offline navigation | ✅ | All 247 screens opened and audited offline |
| 7 | Offline search | ✅ | e2e plus ~100 coverage queries in unit tests |
| 8 | Offline checklist functionality | ✅ | e2e toggle, add, persist across reload |
| 9 | IndexedDB persistence | ✅ | e2e writes and reads across reloads and a simulated outage |
| 10 | Calculator accuracy | ✅ | Hand-computed values, unit conversions, monotonic and fuzz tests |
| 11 | Data export | 🟡 | Backup build, checksum and round trip tested; the browser download click is not exercised headless |
| 12 | Data import | ✅ | Valid, tampered, truncated, wrong-app, newer-format, oversized, hostile and merge/replace/undo cases |
| 13 | PDF generation | 🟡 | Real PDF from Chrome's engine (offline). iOS path untested |
| 14 | Cache updates | ✅ | e2e: new build detected, waits for approval, old cache retained until accepted, then replaced entirely |
| 15 | Error handling | ✅ | Invalid input on forms and calculators; corrupted saved data across 11 screens; missing content fallback for Emergency Now |
| 16 | Mobile responsiveness | 🟡 | No horizontal overflow on 247 screens at 390 px and on sample screens at 768 and 1280 px. **Not tested on real devices** or other screen sizes. |

### Test results at the time of writing

- `npm test`: all unit, content, accessibility, PWA, security and documentation tests pass.
- `npm run e2e`: 63 of 71 checks pass at the site root.
- `npm run e2e:subpath`: 63 of 71 checks pass at `/cairn/`.
- GitHub Actions: the first run on push passed all three jobs (tests and build; Linux real-browser offline test; deploy). The live site's file list was checked against its checksums. Only one run has happened so far.

## Bugs found by this testing (and fixed)

The tests were not decorative. Examples of real defects they caught:

- Offline verifier could not read its own file list because `precache.json` was not in the cache (Phase 2).
- Corrupted device list crashed the power calculator; a literal `null` appeared in calculator results (native `replaceChildren`) (Phases 4 and 6).
- `telHref` dialed junk and extensions as part of the number (Phase 5).
- "Skip to content" link navigated to a non-existent route in a hash-routed app (Phase 6).
- Red Emergency/Call 911 buttons failed WCAG AA contrast in dark mode (3.89:1), as did error text and the update banner (Phase 6).
- `Heat Stroke` ranked above `Stroke` for the query "stroke" (Phase 5).

## Deviations from the original brief

| Brief | What was done | Why |
|-------|---------------|-----|
| "React with Vite, if appropriate" | Plain ES modules, no framework, no bundler | Zero dependencies means nothing to download, patch or break offline, and a smaller app. The brief allowed "if appropriate". |
| 50–100 MB storage target | **0.74 MB** (270 KB compressed) | The app is text and code. Padding it to hit a number would add nothing. The brief said not to compromise completeness to meet a target; none was compromised, and none was needed. No images, diagrams or video yet. |
| Individual guides for every listed topic | Some are merged (e.g. canned food, dry goods, rice, beans and grains are one guide; tourniquets are inside Bleeding Control) | Avoids near-duplicate stubs. Every listed topic is findable by search (tested). The 15 disasters are individual guides as required. |
| "Every guide includes Overview … Related calculators" | Each guide includes the sections that apply, plus warnings, related links and sources | Forcing e.g. a "Recovery" section onto a guide about handwashing would be padding. Disaster guides have all ten sections. |
| "Last-reviewed dates" | Shows **last updated** and states **not professionally reviewed**; verification dates are in `CONTENT_SOURCES.md` and are all blank | Claiming review that did not happen would be dishonest. |
| Downloadable emergency handbook / PDF | A print-ready HTML handbook, printable or savable as PDF by the browser, plus a downloadable `.html` file | No PDF library or service is allowed. A generated binary PDF would need a bundled library. A real PDF was produced through Chrome's print engine to prove it works. |
| Suggested folders `hooks/`, `images/` | Not present | Nothing needed them. |

## Not done, and why

- **Professional review** of medical and safety content, and **live verification** of every source. This needs people with the right expertise.
- **Testing on iOS and Safari.** No device was available.
- **VoiceOver and other assistive-technology testing.**
- **Images and diagrams** (for example CPR hand placement, tourniquet placement, shelter-in-place sealing). Text alone is weaker than pictures for some first-aid steps.
- **Languages other than English**, and non-U.S. emergency numbers.
- **Running the GitHub Actions workflow.**
