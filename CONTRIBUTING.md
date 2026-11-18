# Contributing to Cairn

Cairn is life-safety information. **Accuracy matters more than volume.** A short, correct, sourced guide is better than a long one that is wrong.

## Ground rules for content

1. **Original wording.** Explain public guidance in your own words. Do not paste passages from FEMA, the Red Cross or anyone else.
2. **Cite real sources.** Every guide and card lists source IDs from `src/data/meta.json` (`ready-gov`, `fema`, `cdc`, `red-cross`, `nws`, `noaa`, `nfpa`, `osha`, `epa`, `usgs`, `aha`, `usfs`, `usda`, `cpsc`). Never invent a citation, and never claim professional review that has not happened.
3. **No medication doses. Ever.** Say "follow the label and your clinician". A test fails if a dose appears in medical content.
4. **Safety-critical numbers need a verified source.** Boil times, bleach drops per gallon, CPR rate and depth, generator distances, food-safety hours, temperature thresholds. Add or change one only after checking the live source, then record it in `CONTENT_SOURCES.md`.
5. **Plain language, short steps.** Write for someone who is frightened and in a hurry. Imperative verbs. One action per step.
6. **Tell people when to call 911** on anything that can be life-threatening.
7. **Defensive and lawful only** in the security section. No weapons instructions, no vigilantism.
8. **Warnings belong near the action** they apply to.

## Adding or editing a guide

Guides live in `src/data/guides/*.md`, many per file, separated by a header line.

```markdown
# water-boiling | Boiling Water
category: water
priority: critical
tags: boil water, boiling, rolling boil, boil advisory
sources: cdc, epa, ready-gov
related: guide:water-treatment-overview, checklist:water-storage, calc:water
summary: One sentence that says what the guide helps you do.

## Overview
A paragraph. Consecutive lines join into one paragraph.

## Steps
1. Numbered steps become large numbered cards.
2. Use **bold** sparingly for the one thing that must not be missed.

- Bullets are plain lists.

!! Warning callouts start with two exclamation marks.
>> Tips start with two angle brackets.
```

Rules the build enforces (it fails with a clear message if you break one):

- `id` is lowercase letters, digits and hyphens, and unique across all guides.
- `category` is a category ID from `meta.json`. `priority` is `critical`, `high` or `normal`.
- At least 2 tags, 2 sections and 1 source. Every section has content.
- `related:` entries are `guide:ID`, `checklist:ID` or `calc:ID`. Tests check that every ID exists.
- **Disaster guides** (`category: disasters`) must contain these ten sections in order: *Understanding the threat, Preparing beforehand, Supplies required, Warning signs, During the event, Evacuation considerations, Shelter considerations, Afterward, Common mistakes, Special considerations for families.*
- Guides must be at least about 130 words. Medical guides need at least one `!!` warning.

## Adding a checklist

Edit a file in `src/data/checklists/`. Each item is `[name, description, quantity, priority]` with priority `critical`, `high` or `normal`. Item names must be unique within a checklist (progress is tied to the name). Keep the `group` to one of *Kits & bags*, *Supplies*, *Plans & hazards*.

## Adding an Emergency Now card

Edit `src/data/emergency/quick.json`. A card has 4 to 7 short steps (each under about 240 characters), at most 4 "do not" lines and 2 warnings, a `guide` it links to, and `sources`. Numbers on a card must agree with the full guide; a test compares the key ones.

## Adding a calculator

1. Create `src/calculators/yourcalc.js` exporting a default object with `id`, `title`, `summary`, `fields` (schema), `defaults()`, `compute()`, `assumptions[]` and `limitations[]`. Use `makeCompute` from `common.js` so validation is uniform.
2. Register it in `src/calculators/registry.js`.
3. Add tests with hand-computed expected values in `tests/calculators.test.js`. The fuzz test covers hostile input automatically.

## Ask Cairn (the question assistant)

The assistant in `src/services/assistant/` answers only by quoting your guides, cards and checklists, so new content is found automatically with no extra step. Write guides so a section heading and its first sentence say what the section answers ("How to treat a burn", not "Notes"): that is what questions match against.

If you change the engine, run `npm test` and read both reports it prints: the tuning set (`tests/assistant.test.js`) and the held-out set (`tests/assistant-heldout.test.js`). Never tune against the held-out file; add new questions as a new batch. Rules that must never be loosened: medicine-dose questions are refused (`medicineGuard`), present-emergency wording shows the emergency card first, and every line shown must exist word for word in the content (tested). `npm run ask -- "your question"` shows the ranked passages.

## The sources register

`CONTENT_SOURCES.md` records, for every guide and card, which sources it uses and **when a human last verified it against the live source**.

- After adding or changing a guide or card, run `npm run sources`. It regenerates the tables and preserves existing dates. A test fails if the file is stale.
- **Only fill in a "Last verified" date after you opened the live source and compared.** Never guess and never batch-fill. If the source disagrees with the guide, fix the guide first.

## Before you open a pull request

```bash
npm test                 # unit, content, accessibility, PWA, security tests
npm run sources -- --check
npm run e2e              # real-browser offline test (needs Chrome or Edge)
```

Checklist:

- [ ] Content is original, sourced and free of doses
- [ ] Safety-critical numbers were checked against the live source (and recorded)
- [ ] `npm test` passes, including the content and accessibility tests
- [ ] No new runtime dependency, external request, CDN, font or analytics
- [ ] New text is readable at 18px on a phone and works in light and dark themes
- [ ] If a screen changed, you looked at it at phone width

## Code conventions

- No dependencies. Plain ES modules. Do not add a build step that fetches from the network.
- Render text with the `h()` helper (it creates text nodes). Never assign `innerHTML` with user or content data; a test blocks it.
- Anything that touches stored data must tolerate missing, damaged or hostile data (see `getValid`, `sanitizePlan`, `restoreInputs`).
- Keep pure logic (calculations, validation, parsing) in modules that run in Node, so they can be unit-tested.
