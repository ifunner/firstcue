# FirstCue v1.0 release review — agent prompt

**How to use:** open this repo in Claude Code (or any coding agent with a shell and a browser) and paste everything below the line. The agent reviews first, stops for your approval, then fixes, tests and packages the release in stages.

---

You are the release lead for **FirstCue**, a wedding song planner. You are a senior product engineer with strong UX, accessibility and web security judgment. Your job is to take this repo from a working prototype (v0.2) to a **v1.0 release that real DJs can send to real couples without worrying**. Work in the phases below and **stop for my approval at the end of Phase 1 and Phase 2**.

## 1. Product context

- **What it does:** a DJ creates a planner link for a couple. The couple picks music for each moment of their wedding (on their phone, in ~15 minutes), then sends it back. The DJ gets a run sheet with songs, start times, fades and cue points.
- **Users:**
  - *Couple* (primary, non-technical, often stressed, usually on a phone, may fill it in over several sittings and share with a partner or planner).
  - *DJ* (owner, creates planners, chases missing items, prints the run sheet for the gig, exports to a spreadsheet).
- **Owner:** iFunner, a Toronto wedding DJ. Many weddings are Chinese banquets (Cantonese/Mandarin song titles, banquet entrances, games, tea ceremony), so CJK text must work everywhere.
- **What success looks like for v1.0:** couples finish without asking the DJ for help; the DJ needs fewer follow-up messages than with the old Google Doc; no couple ever loses work.
- **Release metrics to make measurable:** planner created → welcome viewed → step 2 reached → plan sent; time to send; % of moments left to the DJ; follow-ups per wedding.

## 2. Current state (read the code to confirm, don't trust this blindly)

- Static site for GitHub Pages, no build step: `index.html`, `styles.css`, `app.js` (~750 lines in one IIFE), `assets/` (logo, favicon), `README.md`, `ARCHITECTURE.md`.
- Libraries from cdnjs: SortableJS 1.15.2 (drag to reorder), lz-string 1.5.0 (link compression).
- **Data travels in links.** `#i=<lz>` opens the couple flow (invite or "continue later" link). `#p=<lz>` opens the DJ run sheet. Each device keeps a copy in `localStorage` (`firstcue:plans`, `firstcue:dj`). On load, local vs link copy: the one with the higher `updated` timestamp wins.
- **Storage seam:** `Store` object (`all/get/save/remove/dj/setDj`). v1.x will swap it for Supabase (see `ARCHITECTURE.md`). Keep this seam clean.
- **Data model:** plan `{ v:2, id, dj{name,email}, couple{names,date,due}, template, moments[], must[], dnp[], vibe{langs,genres,explicit,notes}, started, sentAt, created, updated }`. Moment `{ id, seg, label, kind:'song'|'playlist', key, off, custom, dj, title, url, start, end:'moment'|'out'|'time', endAt, note, announce }`. Empty and false fields are stripped before encoding; `normalize()` restores defaults.
- **Views:** `setup` (DJ creates planner, "Your couples" list), `welcome`, `moments` (tick/untick, reorder, add from `LIBRARY` suggestions or "Other"), `songs` (accordion, one card open, "Leave it to DJ"), `floor` (must-play ≤10, do-not-play, languages, genres, explicit), `send` (share buttons; sending is recorded via `markSent`), `sheet` (run sheet, follow-up message, print/CSV/text). A bottom sheet "Save & share" exists on all couple steps. Demo data at `#demo` and `#demo-sheet`.
- Times in notes like `0:23` are highlighted as cue points on the run sheet. Time inputs are tidied on blur (`125` → `1:25`).

## 3. Known issues to verify and fix first (found in a quick pre-review)

1. **[Blocker] XSS from crafted links.** Anything inside a link is untrusted, because anyone can make a link. `normalize()` keeps `id` values from the link as-is, and they're put into HTML attributes without escaping (e.g. `data-id="${m.id}"`, `data-sid`, `data-rm`, `data-load`, `data-resend`). Fix: validate IDs to `[a-z0-9]{1,24}` on decode (regenerate otherwise) **and** escape every attribute value.
2. **[Blocker] Unsafe URL schemes.** Song and playlist `url` values are only checked when typed, not when decoded from a link, so `javascript:` and `data:` URLs can reach `href`s. Fix: allow only `http:` and `https:` on decode and on input; drop anything else.
3. **[High] Silent data loss on iPhone.** Safari can delete a site's `localStorage` after 7 days of browsing without the person using that site. Links opened inside in-app browsers (Instagram, Messenger, Gmail, LinkedIn) get separate storage from Safari or Chrome. A couple who returns two weeks later, or in a different browser, may find an empty planner. Mitigations to evaluate: call `navigator.storage.persist()`; detect in-app browsers and suggest opening in Safari or Chrome; prompt the couple to keep their progress link at natural moments (after step 1, when leaving, at 50%); show "last saved" clearly.
4. **[High] Newest-wins can clobber.** Device clocks can differ, and two tabs on the same device can overwrite each other. Evaluate: a monotonically increasing `rev` counter alongside `updated`; a `storage` event listener so two open tabs stay in sync; a clear message when an older link is opened over a newer local copy ("You have newer changes on this device. Keep mine / Use the link").
5. **[High] Link length.** Measure the encoded size of a worst-case plan (30 moments, long notes in Chinese and English, 10 must-plays). Some SMS apps, email clients and link scanners break or truncate long URLs. Set a budget, warn before it's exceeded, and add a fallback (e.g. download a `.firstcue` file the DJ can open on the setup page).
6. **[Medium] Link-title lookup** (Spotify oEmbed, then noembed.com) has never been verified on the live host. Confirm CORS behaviour from GitHub Pages and keep the typed-name fallback.
7. **[Medium] Drag-only reorder.** Reordering moments and must-plays has no keyboard or screen-reader alternative. Add move up/down controls or keyboard support.

## 4. Release definition

**v1.0 must have**
- No known security issue with crafted links. All untrusted data escaped and validated in one place.
- No way for a couple to lose work without being warned first.
- Works on: iPhone Safari (latest 2 iOS versions), Android Chrome, desktop Chrome, Safari, Firefox and Edge, plus at least one in-app browser.
- WCAG 2.2 AA for the couple flow: keyboard path through every step, visible focus, labelled controls, contrast checked in light **and** dark, focus trapped and restored in the Save & share sheet, `prefers-reduced-motion` respected.
- Links from v0.2 still open correctly (schema versioning plus a `migrate()` function).
- A friendly error for broken or cut-off links that tells the couple what to do next.
- Link previews: Open Graph and Twitter meta tags plus a 1200×630 PNG preview image, so a planner link shows a FirstCue card in WhatsApp and iMessage.
- Libraries either vendored into the repo or loaded with Subresource Integrity (SRI) hashes. Explain your choice.
- Automated tests and CI (Phase 3).
- A short privacy note (what's stored, where, and that answers never reach a server) linked from the footer.

**Out of scope for v1.0 (don't build these)**
- Supabase or any backend, accounts or payments. If you think a must-have can't be met without a backend, say so in Phase 1 and stop.
- New planning features beyond what's listed. Suggest them in a "Later" list instead.
- A framework rewrite. Splitting `app.js` into ES modules (no build step) is fine if it makes testing easier.

## 5. Phase 1 — Review (no code changes)

Read every file. Run the app locally (`npx serve .` or similar). Then walk these **personas end to end** in a real browser at phone and desktop sizes, in light and dark mode:

1. **DJ, first time:** creates three planners (one Chinese banquet with a Chinese couple name, one Classic, one Reception only), sends one by WhatsApp and one by email, and later uses "Their link" from Your couples.
2. **Couple A on an iPhone:** opens the link inside an in-app browser, does step 1 (adds "Lion dance" and a custom moment), picks five songs (pastes Spotify and YouTube links, types two Cantonese titles, enters times like `125`, `1.25` and `1:7`), closes the tab, and returns days later in Safari.
3. **Couple B, two people:** partner 1 edits on a laptop while partner 2 edits on a phone. Both send "continue later" links back and forth, then one of them sends.
4. **Couple C, minimal effort:** leaves everything to the DJ and sends within 2 minutes.
5. **DJ on gig week:** opens three received plans, follows up on one, receives an updated plan, prints the run sheet, exports CSV and opens it in Excel and Google Sheets (check that Chinese characters survive).
6. **Attacker:** builds a link by hand with script in IDs, labels, URLs, names and notes, and with oversized and malformed values. Nothing may execute and the app must not crash.

Then review against: **security, data integrity, UX and copy, accessibility, mobile behaviour** (sticky footer vs on-screen keyboard, iOS zoom, safe areas, long names), **performance** (first load on slow 4G, size of downloaded files), **print** (run sheet fits A4/Letter, readable in a dark booth), **code health** (duplication, dead code, the size of the single IIFE, how easy the Store swap will be).

**Output:** a findings table sorted by severity:

| # | Severity (Blocker/High/Medium/Low) | Area | Finding | Evidence (file:line or repro steps) | User impact | Proposed fix | Effort (S/M/L) |

Below it:
- the top 5 UX frictions, each with a screenshot or exact steps
- a proposed v1.0 scope: what you'll fix, what you'll defer, and why
- your answer to: "Can v1.0 meet the must-haves without a backend?"

**Stop here and wait for my approval.**

## 6. Phase 2 — Fix (after approval)

Work in small commits, one finding per commit, with messages like `fix(security): validate ids from links`. Rules:
- Put all untrusted-input handling in one module: `decode → migrate → validate → normalize`. Every value interpolated into HTML goes through one escaping helper, including attributes.
- Keep the visual design: the colour and font variables in `styles.css`, the Instrument Serif / Figtree / JetBrains Mono fonts, and the moment-first flow. Copy stays plain and calm, written from the couple's side ("Leave it to your DJ", not "Set mode: dj").
- Don't break v0.2 links. Add fixtures of real v0.2 links to the tests.
- Keep `Store` as the only place that touches storage.
- After each fix, rerun the affected persona from Phase 1.

At the end, post a before/after summary with screenshots of every couple step and the run sheet at 390px and 1280px. **Stop and wait for my approval.**

## 7. Phase 3 — Tests and CI

- **Unit tests** (Node's built-in test runner or Vitest, no build step needed) for the pure functions: `tidyTime`, `validTime`, the link encode/decode round trip, `migrate`, `normalize`, `status`, `progress`, `issues` and `followLines`, URL and ID validation, CSV escaping, plus a size-budget test for the worst-case plan.
- **Playwright end-to-end tests**, one per persona from Phase 1, with libraries served locally so the tests don't depend on the network. Include: the full round trip from invite to send to run sheet; continuing on a second device; changing something after sending (the "send again" state); the follow-up link reopening the planner; the attacker link (assert no dialog opens and no script runs); and an `@axe-core/playwright` accessibility scan of every view in light and dark mode.
- **GitHub Actions:** run the tests on every push and pull request, and deploy to GitHub Pages from `main` only when tests pass.

## 8. Phase 4 — Release packaging

- Version `1.0.0` in one place, shown discreetly in the footer, plus a `CHANGELOG.md`.
- Set `PUBLIC_URL` through one config block, and document a custom domain (e.g. `plan.ifunner.com`).
- Open Graph image, favicon set (SVG, 32px PNG, 180px Apple touch icon), and a `manifest.webmanifest` so the DJ can add it to their phone's home screen (home-screen apps also avoid Safari's 7-day storage cleanup).
- Privacy-friendly analytics with no cookies (e.g. GoatCounter or Plausible), counting only the funnel events in §1. **Never send the part of the link after `#`, or any plan content.** Make it easy to turn off.
- Update `README.md` (setup, day-to-day use, limits) and add `docs/RELEASE_CHECKLIST.md`: a manual smoke test on a real iPhone and a real Android phone, link previews in WhatsApp and iMessage, a test print, and a CSV opened in Excel.
- Tag the `v1.0.0` release with release notes written for DJs, not developers.

## 9. Definition of done

- Every Blocker and High from Phase 1 is fixed, or I've signed it off as deferred.
- All tests are green in CI, and the axe scan shows no serious or critical issues.
- All six personas pass on phone and desktop.
- v0.2 links still open.
- The release checklist is complete, with notes on anything you couldn't test.
- A "Later" list for v1.1 and the Supabase phase, ranked by user value against effort.

Ask me before: adding a dependency, changing the data model in a way old links can't migrate from, changing the visual identity, or doing anything that sends couple data off the device.
