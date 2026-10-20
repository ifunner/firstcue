# FirstCue architecture

## The recommendation

Build in three stages. Each one keeps the same data model, so nothing gets thrown away except the storage layer.

| Stage | When | Stack | Cost |
|---|---|---|---|
| **v1.0: Prove couples like it** | Now, first 5–10 weddings | Static site on GitHub Pages. Data travels in links and files and lives in each browser. | $0 |
| **v1.1: Your own tool** | After v1.0 cuts your follow-ups | Same frontend + **Supabase** (Postgres, auth, file storage) + one edge function for emails. Move the code to Vite + TypeScript. | $0 on free tiers |
| **v2: Sell to other DJs** | After 3+ outside DJs ask for it | Multi-tenant Supabase, Stripe billing, custom subdomains | ~$25–50/mo until revenue |

### Why not Google Sheets + Apps Script?

It's a fine place to *see* data, and a poor place to build a product on: slow cold starts, daily quotas, awkward auth, one Google account owns everything, and no path to many DJs. Offer **"Export to Google Sheets"** as a feature later instead of using Sheets as the database.

### Why Supabase for v1?

- Real Postgres with row-level security, so each DJ only ever sees their own couples. That's the multi-tenant foundation for v2, already in place.
- Magic-link login for DJs, no passwords to build.
- File storage for custom edits ("Sexy and I Know It, Hakka version").
- Edge functions to hold secrets: Spotify search (client credentials) and reminder emails (via Resend).
- Free tier covers hundreds of weddings. The frontend can stay on GitHub Pages.

## v1.0 (this repo)

```
GitHub Pages (static, deployed by GitHub Actions after tests pass)
 ├─ index.html, privacy.html, styles.css       Content-Security-Policy: scripts and fonts from this site only
 ├─ vendor/  lz-string, SortableJS             no CDN at runtime
 └─ js/
     config.js     settings
     html.js       escape-by-default templates (every interpolation escaped, attributes included)
     model.js      templates, suggestions, pure helpers (status, progress, follow-up lines, reordering)
     wire.js       TRUST BOUNDARY: decode → migrate → validate → plan; link format; version vectors; merge
     store.js      the only storage code (one key per plan); swap for Supabase in v1.1
     exporters.js  text and CSV (formula-safe)
     platform.js   in-app browser detection, song-name lookup
     app.js        views and actions
```

- **Untrusted input** (links, plan files, even stored copies) always goes through `wire.validate`: IDs must match `[a-z0-9]{1,24}`, URLs must be http(s), every field is type-checked, enum-checked and length-clamped, and oversized links are refused before decompressing.
- **Link format v3:** only known fields travel (`toWire`); device-only state (nudges, preview flags) never leaves the device. v0.2 links are migrated and marked `legacy`.
- **Sync without a server:** each device keeps a version vector (`vv`: edits per device) and a Lamport clock (`clock`). Every moment, song list and vibe edit is stamped. Opening a link compares vectors: contained → replace silently; older → keep; concurrent → ask, and **Combine both** merges per moment (newest stamp wins) and keeps songs added on either side (deletions are tombstoned in `gone`).
- **Sent state** is tracked by edit counter (`sentClock`), not wall-clock time, so device clock differences don't matter.
- **Store** writes `firstcue:plan:<id>` plus an index, reports failures to the UI, asks for persistent storage, and broadcasts changes to other tabs via the `storage` event.

## v1.1 changes (Supabase)

1. Replace `js/store.js` with a Supabase adapter (same method names, now async). Keep `wire.validate` on everything read back.
2. Invite link becomes `/p/<token>` (a 128-bit random token) instead of a whole plan in the hash.
3. Couples never log in. They read and write through two Postgres functions that check the token:
   `get_plan(token)` and `save_plan(token, patch)`, both `security definer`.
4. DJs log in with a magic link and get a dashboard: all couples, % complete, days to deadline, open key moments.
5. Edge function `remind` runs daily: emails couples at deadline −14 / −7 / −2 days if key moments are open.
6. Edge function `spotify-search` gives couples a real search box with artwork, duration and explicit flag.

### v1 schema (Supabase / Postgres)

```sql
create table djs (
  id uuid primary key references auth.users,
  name text not null,
  email text not null,
  brand jsonb default '{}'::jsonb          -- logo, colour (v2 white label)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references djs on delete cascade,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  couple_names text not null,
  wedding_date date,
  due_date date,
  template text not null,
  status text not null default 'draft',     -- draft | sent | locked
  vibe jsonb not null default '{}'::jsonb,  -- langs, genres, explicit, notes
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create table moments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans on delete cascade,
  seg text not null,                        -- ceremony | cocktail | reception | party
  position int not null,
  label text not null,
  kind text not null default 'song',        -- song | playlist
  is_key boolean not null default false,
  is_off boolean not null default false,
  dj_choice boolean not null default false,
  title text, url text, spotify_id text, duration_s int, explicit boolean,
  start_at text, end_mode text default 'moment', end_at text,
  note text, announce text, upload_path text
);

create table plan_songs (                   -- must play / do not play
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans on delete cascade,
  list text not null check (list in ('must','dnp')),
  position int not null,
  title text, url text
);

create table changes (                      -- audit trail after the plan is sent
  id bigserial primary key,
  plan_id uuid references plans on delete cascade,
  actor text, field text, old jsonb, new jsonb,
  at timestamptz default now()
);

alter table djs enable row level security;
alter table plans enable row level security;
alter table moments enable row level security;
alter table plan_songs enable row level security;
alter table changes enable row level security;

create policy "dj owns plans" on plans for all using (dj_id = auth.uid());
create policy "dj owns moments" on moments for all
  using (plan_id in (select id from plans where dj_id = auth.uid()));
create policy "dj owns songs" on plan_songs for all
  using (plan_id in (select id from plans where dj_id = auth.uid()));
-- Couples have no direct table access; they go through get_plan(token) / save_plan(token, …).
```

## v2 additions

- `companies` table and `company_id` on `djs` for multi-DJ businesses; roles owner / DJ / assistant.
- White label: DJ logo and colour from `djs.brand`, subdomain per DJ.
- Template library DJs can share (Indian sangeet, Jewish hora, Filipino money dance, Persian sofreh…).
- Exports: Rekordbox/Serato playlist, Spotify playlist, Google Sheets, PDF.
- Stripe: free for 3 active weddings, then per-DJ monthly.
