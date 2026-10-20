# Release checklist

Automated tests cover logic, security, accessibility and the main journeys in Chromium (and WebKit + Firefox in CI). These are the things only a real device and real apps can confirm. Do them once per release, on the deployed site.

## Setup
- [ ] `js/config.js`: `PUBLIC_URL` set to the live address, `DEFAULT_DJ` set.
- [ ] `index.html`: both `og-image.png` URLs are absolute.
- [ ] GitHub Actions run is green (Chromium, WebKit, Firefox).

## iPhone (Safari)
- [ ] Create a planner on your laptop; send it to yourself by **iMessage**. The preview card shows the FirstCue image.
- [ ] Open it in Safari. Work through all 3 steps. The on-screen keyboard doesn't hide the field you're typing in (sticky bar at the bottom).
- [ ] Paste a Spotify link into a song. Note whether the song name fills in (live lookup) or asks you to type it.
- [ ] Save & share → **Copy link** → paste it into Notes. Close Safari, reopen the link: everything is there.
- [ ] Add to Home Screen; the icon looks right; opening it shows the app.
- [ ] Send → native share sheet → Messages. The DJ link opens the run sheet on your laptop.

## iPhone, in-app browser
- [ ] Open a planner link from **Instagram** or **Gmail**. The "You're inside the … app" banner appears and **Copy my planner link** works.

## Android (Chrome)
- [ ] Repeat the iPhone steps with **WhatsApp**: the preview card shows; the planner opens; the share sheet sends.
- [ ] Drag to reorder a moment (touch), and use the ▲▼ buttons.

## Two people
- [ ] Partner A and B open the same invite on two phones, each picks a different song, B sends A their link. A sees **Two versions** and **Combine both** keeps both songs.

## Long plans
- [ ] Fill 25+ moments with notes. On Send, the "Your plan is long" warning shows **Download plan file**. Open that file on the DJ home page with **Open a plan file**.
- [ ] Send a long plan link through Gmail and Outlook to yourself; check it opens. If it's cut off, the couple-friendly "didn't come through in full" page shows.

## DJ
- [ ] Print the run sheet (A4 or Letter): 2 pages for a typical plan, readable at arm's length.
- [ ] Download the spreadsheet and open it in **Excel** and **Google Sheets**: Chinese titles display correctly.
- [ ] Email button opens your mail app addressed to you.

## Sign-off
- [ ] Note anything that didn't work and which device/app, then tag the release: `git tag v1.0.0 && git push --tags`.
