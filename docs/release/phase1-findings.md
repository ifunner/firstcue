# FirstCue v1.0 — Phase 1 review findings

Reviewed: `index.html`, `styles.css`, `app.js` (876 lines), README, ARCHITECTURE, at commit state v0.2 (19–20 Oct 2026).
Method: read every line, then scripted all six personas in Chromium (Playwright) at 390 px and 1280 px, light and dark, with axe-core 4.10 accessibility scans of every view, PDF print to A4 and Letter, CSV round trip, and hand-built attack links. **No code was changed.**

**Summary:** 2 blockers, 9 high, 10 medium, 7 low. The blockers are both about trusting what's inside a link. The highs are mostly about couples silently losing work and about missing the WCAG 2.2 AA bar. None of them needs a backend.

## Phase 2 status (20 Oct 2026)

All 28 findings were fixed or, where a real device is needed, turned into a release-checklist item. Phase 2 also found and fixed three more issues.

| # | Status | How |
|---|---|---|
| 1 | Fixed | `js/html.js` escape-by-default templates for all views; IDs validated in `wire.validate`. Test: crafted IDs, no script runs. |
| 2 | Fixed | http(s) allow-list on decode, input and render (`safeUrl`, `href`). Test: no `javascript:`/`data:` links render. |
| 3 | Fixed | Type, enum and length checks for every field. Test: "wrong types everywhere" link renders without errors. |
| 4 | Fixed | Version vectors and per-moment stamps; conflict dialog with **Combine both** (can't be skipped). Tests: unit merge tests and the two-device persona. |
| 5 | Fixed | `storage` event sync between tabs. Test: two tabs keep both edits. |
| 6 | Fixed (device check pending) | `navigator.storage.persist()`, in-app browser banner (Instagram, Facebook, Messenger, WeChat, LINE, TikTok, X, LinkedIn, Snapchat, Pinterest, Google app), save-your-link nudge, backup file. The Safari 7-day behaviour can only be confirmed on a real iPhone (checklist). |
| 7 | Fixed | Couple-friendly "didn't come through in full" page with local planners and file open. |
| 8 | Fixed (app tests pending) | 4,000-character budget, warning, plan-file download and **Open a plan file**. v3 links are about 12% shorter than v0.2 for the same plan. Real messaging apps on the checklist. |
| 9 | Fixed | ▲▼ buttons for moments and must-plays, ⇄ between lists; focus stays on the moved item. Test: keyboard reorder. |
| 10 | Fixed | Native `<dialog>` with `showModal()`; focus returns to the opener. Test: 25 Tabs stay inside. |
| 11 | Fixed | `--gold` #865C10 (4.95:1). Test: axe on 10 views × light/dark, no serious or critical issues. |
| 12 | Fixed | Copy, WhatsApp and Email ask "Did you send it?"; only native share or **Yes** marks it sent. |
| 13 | Fixed | Prompt before delegating key moments; DJ follow-up mentions key moments left to the DJ. |
| 14 | Fixed | Over-cap drags revert with a toast; ⇄ respects the cap. |
| 15 | Fixed | "Saved · just now" chip in the top bar on every step, phones included. |
| 16 | Fixed | Libraries vendored in `/vendor` (chosen over SRI: no third-party runtime dependency, offline tests). |
| 17 | Fixed | Privacy page; fonts self-hosted, so only the song-name lookup talks to third parties. |
| 18 | Pending live check | Lookup sends `credentials: omit` and no referrer; CSP `connect-src` allows only Spotify and noembed. Needs the deployed site (checklist). |
| 19 | Fixed | `overflow-wrap:anywhere` plus clamps and `maxlength`. Test: crafted oversized link, no sideways scroll. |
| 20 | Fixed | OG and Twitter tags, 1200×630 image, icons, manifest. Absolute image URL to set after deploy. |
| 21 | Fixed | 29 unit and 90 browser tests; GitHub Actions runs them on Chromium, WebKit and Firefox before deploying. Version 1.0.0, CHANGELOG. |
| 22 | Fixed | Unknown sections map to Reception. |
| 23 | Fixed | Print layout: 2 pages on A4 and Letter (was 3). |
| 24 | Fixed | One key per plan, legacy data migrated, save failures shown in the status and a banner. |
| 25 | Fixed | DJs don't get "Edit plan"; couples get "Back to my planner". DJ preview is clearly labelled and never saved. |
| 26 | Fixed | Banners render inside `<main>`. |
| 27 | Fixed | Email validated; `@` no longer encoded. |
| 28 | Fixed | ES modules, no build step; artifact-only download code replaced by a generic hook; Sortable instances destroyed between renders. |
| 29 (new) | Fixed | Every unfinished song card had the expanded card's `open` class (also in v0.2), so all of them showed expanded styling. Renamed to `expanded`. |
| 30 (new) | Fixed | CSV formula injection: cells starting with `= + - @` are prefixed so they can't run in Excel. |
| 31 (new) | Fixed | Defence in depth: Content-Security-Policy on both pages; links over 60K characters or 1.5 MB decompressed are refused. |

## Findings

| # | Severity | Area | Finding | Evidence | User impact | Proposed fix | Effort |
|---|---|---|---|---|---|---|---|
| 1 | **Blocker** | Security | **Crafted links run code.** IDs from a link are kept as-is and written into HTML attributes unescaped. | `normalize()` app.js:110–112; used unescaped at :451, :453, :454, :500, :501, :515, :552, :407–409. Repro: a link with moment id `x"><img src=x onerror=alert(1)>` → the alert fired on opening the couple view and again on the Dance floor step. | Anyone can send a couple or DJ a link that runs script on the FirstCue site: it can read every plan stored in that browser and rewrite links. | One `decode → migrate → validate → normalize` module. IDs must match `^[a-z0-9]{1,24}$` or get regenerated. Every interpolation goes through an auto-escaping `html` tagged template, attributes included. | M |
| 2 | **Blocker** | Security | **Any URL scheme survives decoding.** `isUrl` is only checked on typing (:825), never on decode, so `javascript:` URLs reach `href`s. | app.js:484, :612–613, :515, :624. Repro: 2 `javascript:` hrefs rendered on the run sheet. Chromium opened `about:blank` instead of running it (because of `target=_blank`); Safari and Firefox are untested. | One click away from script execution in some browsers; also a phishing vector. | Allow only `http:`/`https:` on decode and on input; drop anything else. Same check for `mailto` targets. | S |
| 3 | High | Data integrity | **Wrong-typed fields crash the run sheet.** `vibe.langs` as a string throws `V.langs.join is not a function`. | app.js:639, :661, :673. Repro: link with `vibe:{langs:"English"}` → pageerror on `#p=`. | A slightly corrupted or hand-edited link breaks the DJ's view. | Validate types in the decode module (arrays, strings, enums for `seg`, `kind`, `end`, `explicit`), with defaults. | S |
| 4 | High | Data integrity | **Partners overwrite each other without warning.** Newest `updated` wins wholesale, with no merge and no message. | app.js:265–267. Repro: partner A picks "A Thousand Years"; partner B (same invite) picks the first dance and sends A a continue link; A opens it → A's song is gone, no toast. | Exactly the "two people planning" case. Lost picks the couple doesn't notice until the DJ asks. | Add a `rev` counter and per-moment `updated`. On opening a link that differs from local unsent changes: "You have changes on this device that aren't in this link. **Keep both** (merge per moment, newest wins) / Use the link / Keep mine." | M |
| 5 | High | Data integrity | **Two open tabs clobber each other.** Each tab saves its in-memory copy over the other's. | app.js:160 (no `storage` listener). Repro: tab 1 adds a must-play, tab 2 ticks Cantonese → stored copy has 0 must-plays. | Common on desktop (the couple reopens the email link). | Listen for `storage` events: reload `P` when another tab saves the same plan, and show "Updated from another tab". | S |
| 6 | High | Data integrity | **Saved progress can vanish on iPhone and in in-app browsers.** Safari can clear a site's script storage after 7 days without a visit; Instagram, Messenger, Gmail and LinkedIn in-app browsers keep separate storage. | Platform behaviour (sources below); not reproducible in this environment. The app never calls `navigator.storage.persist()` and has no in-app browser handling. | A couple returns two weeks later and the planner is empty, or starts in Gmail and finishes in Safari to an empty planner. | `persist()`; detect in-app browsers and show "Open in Safari/Chrome so your answers stay put"; nudge the couple to save their continue link after step 1 and at 50%; show "Last saved 2 min ago". | M |
| 7 | High | UX | **A broken or cut-off link lands couples on the DJ sign-up page.** | app.js:264; screenshot `broken-link.png`: "For DJs / Send your couple one link", with a 2.6-second toast. | A couple who gets a truncated link thinks they've got the wrong site. | A dedicated couple-facing error view: "This link didn't come through in full. Ask {DJ} to resend it, or open the last planner on this device" (if one exists). | S |
| 8 | High | Links | **Plan links run 3.4–6.2K characters.** | Measured: typical full plan (17 moments) 3,381; busy (25 moments with notes) 4,934; worst case (30 moments, long CJK notes) 6,217. Not tested in real messaging apps. | Some SMS apps, email link scanners and QR readers truncate or split long URLs; failures are silent (→ #7). | Set a 4,000-character soft budget. Above it, warn and offer **Download plan file** (`.firstcue`) plus an **Open a plan file** option on the setup page. Also trim notes from the `#i=` link where possible. Test WhatsApp, iMessage, Gmail and Outlook in Phase 4. | M |
| 9 | High | A11y | **Drag is the only way to reorder** moments and must-plays. Handles aren't focusable (0 of 17). | app.js:452, :515 (`<span aria-hidden>`). Fails WCAG 2.2 **2.5.7 Dragging Movements (AA)** and 2.1.1 Keyboard. | Keyboard and switch users, and anyone who finds dragging fiddly on a phone, can't reorder. | Add ▲/▼ buttons (visible on focus or hover, always visible on touch). Keep Sortable for pointer dragging. | S |
| 10 | High | A11y | **The Save & share sheet doesn't trap or return focus.** | app.js:321, :761. Repro: 8×Tab from inside the sheet → focus lands on the page logo behind it. | Screen-reader and keyboard users get lost behind the modal. | Use a `<dialog>` with `showModal()` (native trap) or a small trap; return focus to the "Save & share" button on close. | S |
| 11 | High | A11y | **"Key" pill text fails contrast:** 3.95:1 against the 4.5:1 required. | styles.css:6, :95; axe `color-contrast` (serious) in moments (10 nodes), songs, run sheet, light theme only. | Hard to read for low-vision users. That's the label telling them what matters. | Darken `--gold` in light mode: `#865C10` gives 4.95:1 on `--gold-soft` and 5.9:1 on white (`#7E560F` gives 5.45:1 if you want more margin). Then re-run axe. | S |
| 12 | Medium | UX | **Copying the plan counts as "Sent".** | app.js:772, :844, :548. Pressing "Copy message with link" immediately shows "✓ Sent to iFunner". | The couple believes it's done when they may never have pasted it. The DJ never receives it. | Say "Copied. Paste it into a message to {DJ}", then show "Did you send it? **Yes, sent** / Not yet". Only the native share sheet and Yes mark it as sent. | S |
| 13 | Medium | UX | **"Leave all of these to {DJ}" delegates key moments too, and the follow-up doesn't mention it.** | app.js:865; `followLines` only looks at open items (:582–590). | The first dance ends up "DJ's choice" without either side discussing it. | When key moments are included, ask: "Including your first dance and entrances?" Show delegated key moments as a soft line in the DJ follow-up ("You've left First dance to me. Happy to suggest a few?"). | S |
| 14 | Medium | Bug | **Dragging an 11th song into Must play pushes the last must-play into Do not play.** | app.js:742 (`P.dnp.unshift(...P.must.splice(MUST_MAX))`). | Inverts the couple's intent: a song they love becomes do-not-play. | Revert the drag and show a toast ("Must play holds 10. Remove one first"). | S |
| 15 | Medium | UX | **"Saved" reassurance is hidden on phones.** | styles.css:243 hides `.foot-meta` at ≤520 px. No "last saved" time anywhere. | Couples, mostly on phones, never see that their work is safe. | Show a small "Saved" chip next to "Save & share" on phones, with a timestamp. | S |
| 16 | Medium | Reliability | **Hard dependency on cdnjs.** If cdnjs is blocked or slow, `LZString` is undefined, so every invite link shows "That link looks cut off". | index.html:29–30; app.js:149 (the try/catch swallows it). Repro: with CDN blocked, `#demo` renders but links can't decode. | Misleading error on corporate or school networks, or during a CDN outage. | **Vendor both libraries** into `/vendor` (about 16 KB gzipped together). Recommended over SRI: no third-party runtime dependency, tests work offline, one less failure mode. | S |
| 17 | Medium | Privacy | **Third parties see some data.** Song-name lookup sends links to Spotify and noembed.com; fonts come from Google; libraries from cdnjs. | app.js:169–183; index.html:11, :29–30. | The "answers never reach a server" promise isn't quite true; the privacy note must be accurate. | Disclose in the privacy note. Optionally self-host fonts (Later). Lookup sends only the song link, never plan content; keep it that way. | S |
| 18 | Medium | Platform | **Song-title lookup has never run on a real host.** CORS behaviour of Spotify oEmbed and noembed from github.io is unknown. | app.js:169–183; container has no outbound network. | If it fails, couples see "Link saved. Type the song name too"; the fallback works. | Verify on the deployed site in Phase 4; if Spotify oEmbed is blocked, drop it and keep noembed + fallback. | S |
| 19 | Medium | Layout | **Long unbroken text overflows the run sheet on phones.** | Repro: a YouTube URL pasted in a note → 190 px sideways scroll at 390 px. (A crafted 5,000-character name → 127,816 px.) | The DJ checks the run sheet on their phone at the venue. | `overflow-wrap:anywhere` on notes, titles and names; clamp lengths in validation (names 120, notes 1,000, labels 80). | S |
| 20 | Medium | Release | **No link preview tags.** No Open Graph or Twitter tags, no preview image. | index.html head. | Links in WhatsApp and iMessage show a bare URL with no card. Lower trust for a link from "the DJ". | OG/Twitter tags plus a 1200×630 PNG (logo, "Your wedding song planner"). | S |
| 21 | Medium | Process | **No tests, no CI, no privacy note, no version.** | Repo. | Every fix risks regressions in the link format. | Phase 3 and Phase 4 as specified. | M |
| 22 | Low | Data | **A moment with an unknown section is counted but never shown**, so the planner can never reach 100%. | app.js:118–119 vs :448, :508, :607. Repro: "0 of 2 ready" with only 1 card visible. | Only from crafted or corrupted links. | Validation maps unknown sections to `reception`. | S |
| 23 | Low | Print | **The run sheet prints on 3 pages; the last is nearly empty** (must play, do not play, vibe). | styles.css:252 (`break-before:page`); A4 and Letter both 3 pages for the 16-moment demo. | Extra paper at the booth; must-plays separated from the timeline. | Drop the forced break; print the extras as a compact strip; try fitting 2 pages. | S |
| 24 | Low | Storage | **Storage failures are silent.** `_set` swallows quota and private-mode errors; every keystroke rewrites all plans. | app.js:157, :160. | Rare silent loss; a growing DJ list makes every write bigger. | Show a toast when a save fails; store one key per plan (`firstcue:plan:<id>`) plus an index. | S |
| 25 | Low | UX | **"Edit plan" from the DJ's run sheet drops the DJ into the couple flow** ("Save & share", "Send to iFunner"). | app.js:630. | Role confusion. | For DJs, label it "Edit as DJ" and hide couple-only actions; or remove it for v1.0. | S |
| 26 | Low | A11y | **The example banner sits outside landmarks** (axe `region`, moderate). | index.html:22. | Minor screen-reader navigation issue. | Move it inside `<main>` or give it `role="note"` inside the header. | S |
| 27 | Low | Email | The DJ's email is percent-encoded in `mailto:` (`ivan%40example.com`). | app.js:240. | Some desktop mail clients may not decode it. | Validate the email and leave `@` unencoded. | S |
| 28 | Low | Code health | One 876-line IIFE; HTML built from strings where escaping relies on memory; artifact-only `window.claude` download branch (:676–680); duplicated card-summary markup (:466 and :829); Sortable recreated every render. | app.js. | Slower, riskier fixes; harder Store swap. | Split into ES modules with no build step: `model`, `links` (decode/validate), `store`, `views`, `actions`, `share`. Add the `html` escaping helper. Remove the artifact branch. | M |

**Verified OK:** CSV has a UTF-8 BOM and Chinese titles survive (`月亮代表誰的心`, `卡拉永遠OK`). Text export works. Dark theme passes axe contrast. No horizontal overflow with realistic long names in the couple flow. The app still renders when Google Fonts fails. Total payload ≈ 41 KB gzipped (JS + CSS + libraries) plus fonts, so first load is fine on slow 4G. Couple C (leave everything to the DJ) sends in 6 taps.

## Top 5 UX frictions

1. **Partner's work silently disappears (#4).** Steps: open the same invite on two devices. Device A picks a song for "Wedding party walks in". Device B picks the first dance, then Save & share → Copy link → open it on device A. A's song is gone, no message.
2. **A cut-off link looks like the wrong website (#7).** Steps: open any invite link with the last third missing. You land on "For DJs: Send your couple one link", and a toast disappears after 2.6 s. (Screenshot: `broken-link.png`.)
3. **"Sent" when nothing was sent (#12).** Steps: on Send (desktop), press "Copy message with link" and don't paste it anywhere. The page shows "✓ Sent to iFunner on …".
4. **No sign that work is saved, on the device most couples use (#15).** Steps: any step at 390 px. The footer shows only Back and Next; "saved on this device" is hidden.
5. **Key moments quietly handed to the DJ (#13).** Steps: on Send, tap "Leave all of these to iFunner" while First dance is open. It becomes DJ's choice, and the DJ's follow-up box says nothing about it.

## Proposed v1.0 scope

**Fix in Phase 2 (in this order):**
1. Decode → validate → normalize module plus the `html` escaping helper (#1, #2, #3, #19 clamps, #22)
2. Vendor libraries (#16)
3. Data safety: `rev` counter and conflict prompt (#4), tab sync (#5), `persist()`, in-app browser banner, save-your-link nudges, "Saved" chip (#6, #15), save-failure toast (#24)
4. Couple-facing broken-link view (#7)
5. Link budget plus plan-file fallback (#8)
6. Accessibility: reorder buttons (#9), `<dialog>` focus handling (#10), gold contrast (#11), banner landmark (#26)
7. Honest "Sent" (#12), key-moment delegation prompt plus DJ follow-up line (#13), must-play overflow bug (#14)
8. Long-text wrapping (#19), print layout (#23), DJ "Edit" label (#25), mailto (#27)
9. Module split, only as far as tests need it (#28)

**Phase 3–4 as specified:** tests, CI, OG tags (#20), privacy note (#17), versioning and the release checklist, plus live-host checks of the lookup (#18) and link lengths in real apps (#8).

**Defer to the Later list:**
- Self-hosted fonts
- DJ backup and restore of the "Your couples" list (it's per-browser today)
- Real co-editing
- Audio uploads for custom edits
- A DJ dashboard across devices

All of these want the Supabase phase.

## Can v1.0 meet the must-haves without a backend?

**Yes, as written.** The bar is "no way for a couple to lose work *without being warned first*", and that's reachable with local persistence, conflict prompts, tab sync and nudges to keep the continue link. What a backend is needed for, and v1.0 shouldn't promise:
- two people editing at the same time with their changes merged automatically
- plans that follow the couple to any device with nothing to copy
- an inbox for the DJ
- audio uploads

Those belong in v1.1 with Supabase.

## Couldn't test here (moves to the Phase 4 checklist)

- Real iOS Safari, Android Chrome, Firefox and Edge; in-app browsers
- Safari's 7-day storage expiry
- The on-screen keyboard over the sticky footer
- WhatsApp, iMessage, Gmail and Outlook handling of 3–6K-character links
- Live song-title lookup
- Opening the CSV in Excel and Google Sheets (encoding was verified at byte level)

## Sources

- [Safari 13.1: Third-Party Cookie Blocking and 7-Day Script-Writeable Storage (Michael Tsai)](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/)
- [What Safari's 7-day cap on script-writeable storage means for PWA developers (Search Engine Land)](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519)
- [WCAG 2.5.7: Dragging Movements (Level AA)](https://wcag.dock.codes/documentation/wcag-success-criteria/wcag257/)
- [Dragging movements (DAISY Knowledge Base)](https://kb.daisy.org/publishing/docs/wcag/dragging-movements.html)
