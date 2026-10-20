<p align="center"><img src="assets/logo.svg" alt="FirstCue" height="56"></p>

**FirstCue** is a wedding song planner. A DJ sends a couple one link. The couple picks music for each moment of their day on their phone in about 15 minutes. The DJ gets back a run sheet with every song, start time, fade and cue point.

- **Couples:** 3 steps (Moments, Songs, Dance floor), then Send. Saves as they go; share with a partner or planner; download a backup.
- **DJs:** create a planner in 30 seconds, receive a printable run sheet with a ready-made follow-up message, export to a spreadsheet.
- **No accounts, no server, no cost.** Static site on GitHub Pages. Plans travel inside links and files, never through a server.

## Day to day

**You (DJ)**
1. Open the site, type the couple's names and date, pick the wedding type, press **Create their planner**.
2. Press **Copy message with link** (or WhatsApp / Email) and send it.
3. When their plan arrives (a link, or a `.firstcue.json` file for very long plans), open it once. It appears under **Your couples**.
4. The run sheet's **To follow up** box has a ready-made message for anything missing, including their planner link.

**Couples**
- **Moments:** keep what they're doing, add from about 60 suggestions (tea ceremony, baraat, hora, money dance, lion dance…) or type their own; reorder with arrows or by dragging.
- **Songs:** paste a link or type a name. Timing and notes are optional. Anything can be left to the DJ.
- **Save & share:** a link to continue on another device or share with a partner, plus a backup file, text summary, spreadsheet or PDF.
- **Send:** one tap on phones. On a computer, copy / WhatsApp / Email, then confirm it went.
- **Two people editing?** When one opens the other's link, FirstCue offers to **combine both** so nothing is lost.

## Deploy to GitHub Pages

1. Create a new repo on GitHub (public, or private on a paid plan) and push this folder:
   ```bash
   git remote add origin https://github.com/<you>/firstcue.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs the tests and, only if they pass, deploys. The address appears in the Actions run (e.g. `https://<you>.github.io/firstcue/`).
4. Open `js/config.js` and set `PUBLIC_URL` to that address (and `DEFAULT_DJ` to your name). Commit.
5. In `index.html`, change the two `assets/og-image.png` image URLs to the full address (`https://<you>.github.io/firstcue/assets/og-image.png`) so link previews show the card in WhatsApp and iMessage.
6. Optional custom domain (e.g. `plan.ifunner.com`): **Settings → Pages → Custom domain**, then update `PUBLIC_URL` and the image URLs.

Before you send it to couples, run through [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) once on a real iPhone and Android phone.

## How data moves

```
DJ creates planner ──#i=…──▶ Couple fills it in ──#p=…──▶ DJ opens run sheet
                              (saved on their device)
                    ◀──#i=… follow-up link (picks up where they left off)
```

- The plan is compressed into the part of the link after `#`, which browsers never send to a server.
- Every device counts its own edits (a version vector). Opening a link that contains everything this device has replaces it silently; opening one that has someone else's changes *and* this device has unsent changes asks: **Combine both**, use the link's version, or keep this device's.
- Two tabs on the same device stay in sync.
- Links over about 4,000 characters get a warning and a **plan file** fallback, because some apps cut long links.

**Known limits** (the Supabase phase in [ARCHITECTURE.md](ARCHITECTURE.md) removes these):
- No inbox: plans arrive as links or files in your messages.
- Drafts live in each browser; Safari may clear them after 7 days without a visit. The app nudges couples to save their link and asks the browser to keep data.
- Your couples list is per browser.
- No audio uploads; custom edits still come by email.

## Files

| Path | What it is |
|---|---|
| `index.html`, `privacy.html` | Pages (with Content-Security-Policy and link-preview tags) |
| `styles.css` | All styling: light, dark, print |
| `js/config.js` | Your settings: address, DJ name, limits |
| `js/app.js` | Views and actions |
| `js/model.js` | Templates, moment suggestions, pure helpers |
| `js/wire.js` | Trust boundary: decode, migrate, validate, link format, merge |
| `js/html.js` | Templates that escape everything by default |
| `js/store.js` | The only code that touches browser storage (swap for Supabase later) |
| `js/exporters.js`, `js/platform.js` | Text/CSV exports; browser quirks and song-name lookup |
| `vendor/` | SortableJS 1.15.2 and lz-string 1.5.0 (MIT), served from this site |
| `assets/` | Logo, icons, link-preview image, fonts (OFL) |
| `tests/` | Unit tests, Playwright persona/security/accessibility tests, v0.2 link fixtures |
| `docs/` | Release review prompt, Phase 1 findings, release checklist |

## Develop

```bash
npm install
npm start                # http://localhost:4173
npm test                 # unit + browser tests (Chromium)
ALL_BROWSERS=1 npx playwright test   # also Safari/WebKit and Firefox (after `npx playwright install webkit firefox`)
```

No build step: edit and reload.
