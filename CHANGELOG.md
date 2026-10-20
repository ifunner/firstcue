# Changelog

## 1.0.0 — first full release

For DJs and couples:
- **Nothing gets lost when two people plan.** If partners edit on different phones, opening each other's link offers to combine both. Two tabs on one device stay in sync.
- **Safer links.** A crafted link can no longer run code on the site. Only normal web links are accepted for songs. Very large or garbled links are refused with a friendly page instead of the DJ sign-up screen.
- **Saved, and you can see it.** A "Saved" status on every step (phones included), a nudge to save your planner link, a warning when opened inside Instagram, Facebook, WeChat and other in-app browsers, and a backup file you can open on any device.
- **Long plans still get through.** A warning when a link gets long, plus a plan file the DJ can open from the home page.
- **Honest sending.** Copying the plan no longer marks it "Sent"; FirstCue asks whether it went. Handing everything to the DJ now asks before including key moments, and the DJ's follow-up mentions key moments left to them.
- **Accessible.** Reorder moments and must-plays with arrow buttons (keyboard and screen readers), a proper dialog that keeps focus, stronger contrast on "Key" labels, and landmarks for every banner. Every screen passes an automated WCAG 2.2 AA scan in light and dark mode.
- **Run sheet prints on 2 pages** instead of 3, with long notes and links wrapping instead of overflowing on phones.
- **Must play** can't overflow into Do not play any more; ⇄ moves a song between lists.
- **Spreadsheet export** neutralises formulas (a song title starting with `=` can't run in Excel).
- **Link previews** in WhatsApp and iMessage, home-screen icon, and a privacy page.

Under the hood:
- Split into ES modules with no build step; all HTML built from escape-by-default templates.
- Link format v3 with version vectors; v0.2 links still open.
- One storage key per plan; save failures are shown, not swallowed.
- Libraries and fonts served from the site (no CDN, no Google Fonts).
- Content-Security-Policy on every page.
- 29 unit tests and 90 browser tests (personas, crafted-link attacks, accessibility), run by GitHub Actions on Chromium, WebKit and Firefox before every deploy.

## 0.2.0
- Moment suggestions, clearer DJ handoff, Save & share, DJ follow-up messages.

## 0.1.0
- First prototype.
