# iPhone test plan

**Why this exists:** Cairn was built and tested on Windows with the Chrome/Edge engine. **Only informal, unlogged owner testing has been done on a real iPhone (install, calculator layout, Ask Cairn); the iOS-specific behavior below has not been tested systematically.** This is a script anyone with an iPhone can run in about 30 minutes. Record the results in the table at the bottom, and please report failures.

You need: an iPhone with Safari, the app served over **HTTPS** (for example GitHub Pages; a plain `http://` address on your network will not give you a service worker on iOS), and a way to turn on Airplane Mode.

## A. Install

| # | Step | Expected |
|---|------|----------|
| A1 | Open the app address in **Safari** (not an in-app browser). Wait 10 seconds. | Home screen appears. Pill says "Online · offline-ready". |
| A2 | Tap **My Plan → Offline and storage status**. | "Offline ready" or "Almost ready" with all items OK except possibly *Protected storage*. Note exactly what it says. |
| A3 | Tap **Share → Add to Home Screen**. Check the name and icon in the sheet. | Name "Cairn", the green plus icon. |
| A4 | Launch from the Home Screen icon. | Launch image (dark with the icon) appears briefly, then the app opens **without Safari's address bar or toolbar**. |
| A5 | Check the top of the screen. | Header sits **below** the status bar and notch (not overlapped). Bottom navigation sits **above** the home indicator. |

## B. Offline

| # | Step | Expected |
|---|------|----------|
| B1 | Turn on **Airplane Mode** (and make sure Wi-Fi is off). Force-quit Cairn, then reopen it. | Opens normally. Pill says "Offline · app is working from saved copy". |
| B2 | Open **Emergency Now → Severe Bleeding**. | Card shows with large text and a Call 911 button. |
| B3 | Open **Guides**, then any guide. Use **Search** for "boil water". | Content and results appear. |
| B4 | Open **Checklists → 72-Hour Emergency Kit**. Tick 3 items. Add a custom item. Force-quit and reopen. | Ticks and the custom item are still there. |
| B5 | Open **Calculators → Water**. Enter 2 adults, 1 child, 3 days. | Result **9 gallons** (34.1 liters). |
| B6 | Open **My Plan → Household members**. Add a person with a name and age. Close and reopen. | The person is still saved. Enter a bad phone number in **Emergency contacts**: it should show an error. |
| B7 | **Home**: tap the **Call 911** or a contact number. | The phone's dialer opens (do not place a real call). |

## C. Backup, handbook and sharing

| # | Step | Expected |
|---|------|----------|
| C1 | **My Plan → Backup and restore → Download backup file**. | File downloads or the share sheet opens. Can you save it to **Files**? Note which path works. |
| C2 | Tap **Share or save to Files…** if shown. | Share sheet opens with a `.json` file. |
| C3 | Choose the saved file under **Restore from a backup**. | Summary shows the right counts. **Merge** works. |
| C4 | **Printable handbook → Download handbook file**. Open the saved file in Safari. | Handbook opens and is readable. |
| C5 | In Safari, **Share → Print**, then pinch outward on the preview. | A multi-page PDF preview you can save to Files (about 117 pages for Essentials). |
| C6 | In the Home Screen app, tap **Print or save as PDF**. | Note whether a print dialog opens. It may not (known iOS limitation). |

## D. Updates and storage

| # | Step | Expected |
|---|------|----------|
| D1 | After the app is updated on the server: open it **online**, wait, then reopen. | An "update ready" bar appears. Tap **Update**: the app reloads with the new version, and your data is intact. |
| D2 | Leave the app unused for 1–2 weeks (if you can), then open it **offline**. | Still opens with your data. (This is the main iOS eviction risk; report what happens.) |
| D3 | Back in the status screen, tap **Request protected storage**. | Note whether iOS grants it. |

## E. Accessibility and comfort

| # | Step | Expected |
|---|------|----------|
| E1 | Settings → Display & Brightness → Text Size / Larger Text: increase. Reopen Cairn. | Text may grow; nothing is cut off or overlapping. (Dynamic Type is not specifically supported; note what happens.) |
| E2 | Turn on **VoiceOver**. Go through Home, an Emergency card, a checklist item and a calculator. | Headings, buttons and fields are announced sensibly. **Not tested before.** Please note problems. |
| E3 | Switch between light and dark mode in iOS settings, and with the in-app toggle. | Text stays readable in both. |
| E4 | Rotate to landscape. | Layout remains usable. |
| E5 | Use one hand only, thumb only, on **Emergency Now**. | Every control is reachable and easy to hit. |

## Results

| Date | iPhone model and iOS | Steps that failed (ID and what happened) | Tester |
|------|----------------------|--------------------------------------------|--------|
|      |                      |                                            |        |

Anything in section A or B that fails means the app is **not** ready to be relied on for offline use on iPhone until fixed.
