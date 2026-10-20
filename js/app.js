// FirstCue UI: routing, views and actions.
// Data flow: a link or plan file -> wire.decode/validate -> reconcile with this device's copy -> P.
// Every edit goes through commit(), which bumps this device's version counter and saves via Store.

import { VERSION, PUBLIC_URL, DEFAULT_DJ, MUST_MAX, LINK_BUDGET, LIMITS } from './config.js';
import { html, raw, href } from './html.js';
import {
  SEGS, TEMPLATES, LIBRARY, LANGS, GENRES, ENDS, EXPLICIT, libItem, newPlan, newMoment, status, active, progress,
  changedSinceSent, delegatedKey, TIME_RE, validTime, tidyTime, issues, followLines, isEntrance, norm, moveMoment, moveSong, uid,
} from './model.js';
import { decode, editLink as mkEdit, planLink as mkPlan, toFile, fromFile, reconcile, merge, differingMoments, cleanUrl, safeEmail, vvMax } from './wire.js';
import { Store } from './store.js';
import { asText, asCSV } from './exporters.js';
import { inAppBrowser, isEmbedded, canShare, lookupTitle, hostName } from './platform.js';

// ---------- state ----------
let P = null;              // current plan
let view = 'setup';        // setup | badlink | welcome | moments | songs | floor | send | sheet
let role = 'dj';           // who is looking: 'dj' or 'couple'
let openId = null;         // expanded moment on the songs step
let addSeg = null;         // section whose "add a moment" picker is open
let created = null;        // invite just created on setup (or reopened from the list)
let armed = null;          // two-tap confirm for removals
let askSent = false;       // after copy/WhatsApp/Email: ask "did it send?"
let conflict = null;       // { local, incoming, kind } while the conflict dialog is open
let dlg = null, dlgOpener = null;
let savedAt = 0, saveFailed = false, persisted = false;
let nudgeHidden = false, inAppHidden = false;
let sortables = [];
const detOpen = new Set();

const ME = Store.deviceId();
const EMBED = isEmbedded();
const CAN_SHARE = canShare();
const INAPP = inAppBrowser();
const STEPS = [['moments', 'Moments'], ['songs', 'Songs'], ['floor', 'Dance floor'], ['send', 'Send']];
const COUPLE_VIEWS = ['welcome', 'moments', 'songs', 'floor', 'send'];

const $ = s => document.querySelector(s);
const base = () => PUBLIC_URL || (location.origin + location.pathname);
const editLink = p => mkEdit(base(), p);
const planLink = p => mkPlan(base(), p);
const djName = () => (P && P.dj.name) || 'your DJ';
const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); };
const fmtWhen = ms => ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const slug = () => ((P && P.couple.names) || 'wedding').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'wedding';
const firstOpen = () => (progress(P).open[0] || {}).id || null;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 3200); }

// ---------- saving ----------
Store.onError(kind => {
  saveFailed = true; updateSaved();
  if (!toast.storageWarned) { toast.storageWarned = true; toast(kind === 'full' ? 'This device is out of space for saving. Use Save & share to keep a copy.' : 'This browser isn’t letting FirstCue save (private browsing?). Use Save & share to keep a copy.'); }
});

// scope: { m } a moment, { s } a song, 'lists', 'vibe', 'order', or nothing (plan-level)
function commit(scope) {
  if (!P) return;
  P.clock += 1;
  P.vv = { ...P.vv, [ME]: (P.vv[ME] || 0) + 1 };
  P.updated = Date.now(); P.legacy = false;
  if (scope && scope.m) scope.m.r = P.clock;
  if (scope && scope.s) scope.s.r = P.clock;
  if (scope === 'lists') P.lr = P.clock;
  if (scope === 'vibe') P.vr = P.clock;
  if (scope === 'order') P.or = P.clock;
  if (P.demo || P.preview) { updateSaved(); return; }
  if (Store.save(P)) { savedAt = Date.now(); saveFailed = false; }
  if (!persisted) { persisted = true; Store.persist(); }
  updateSaved();
}
// Save device-only state (nudges, sent markers) without counting it as an edit.
const saveQuiet = () => { if (P && !P.demo && !P.preview) Store.save(P); };
const local = () => { P.local = P.local || {}; return P.local; };

function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  return fmtWhen(ms);
}
function updateSaved() {
  const el = $('#saved'); if (!el) return;
  if (!P || P.demo || P.preview) { el.textContent = 'Example, not saved'; el.className = 'saved muted'; return; }
  if (saveFailed) { el.textContent = 'Not saved'; el.className = 'saved warn'; el.title = 'This browser isn’t saving. Use Save & share.'; return; }
  el.textContent = savedAt ? `Saved ${relTime(savedAt)}` : 'Saved';
  el.className = 'saved ok'; el.title = savedAt ? `Saved on this device ${fmtWhen(savedAt)}` : 'Saved on this device';
}
setInterval(updateSaved, 30000);

// ---------- routing ----------
function route() {
  closeDialog(true); addSeg = null; armed = null; askSent = false;
  const h = location.hash;
  if (h.startsWith('#i=') || h.startsWith('#p=')) {
    const incoming = decode(h.slice(3));
    if (!incoming) { P = null; role = 'couple'; view = 'badlink'; render(); window.scrollTo(0, 0); return; }
    openIncoming(incoming, h.startsWith('#p=') ? 'plan' : 'progress');
    return;
  }
  if (h === '#demo') { P = demoPlan(); P.started = false; role = 'couple'; view = 'welcome'; }
  else if (h === '#demo-sheet') { P = demoPlan(); role = 'dj'; view = 'sheet'; }
  else { P = null; role = 'dj'; view = 'setup'; }
  if (view !== 'songs') openId = null;
  render(); window.scrollTo(0, 0);
}
function landingView(kind) { return kind === 'plan' ? 'sheet' : (P.started ? 'songs' : 'welcome'); }
function adopt(incoming, mine) {
  return { ...incoming, local: { ...((mine && mine.local) || {}) }, clock: Math.max(incoming.clock, mine ? mine.clock : 0) };
}
function openIncoming(incoming, kind) {
  role = kind === 'plan' ? 'dj' : 'couple';
  const mine = Store.get(incoming.id);
  const res = reconcile(mine, incoming);
  if (res.action === 'conflict') {
    P = mine; conflict = { local: mine, incoming, kind };
    view = landingView(kind); render(); openDialog('conflict'); return;
  }
  if (res.action === 'new' || res.action === 'take') { P = adopt(incoming, mine); Store.save(P); }
  else { P = mine; if (res.older && kind !== 'plan') toast('This link is older than what’s on this device, so your newer changes are kept.'); }
  savedAt = P.updated;
  view = landingView(kind);
  openId = view === 'songs' ? firstOpen() : null;
  render(); window.scrollTo(0, 0);
  if (P.started && view === 'songs' && res.action === 'same') toast('Welcome back. Picking up where you left off.');
}
function resolveConflict(choice) {
  const { local: mine, incoming, kind } = conflict;
  if (choice === 'both') { P = merge(mine, incoming); P.local = mine.local; }
  else if (choice === 'link') { P = adopt(incoming, mine); P.vv = vvMax(mine.vv, incoming.vv); }
  else { P = mine; P.vv = vvMax(mine.vv, incoming.vv); P.clock = Math.max(mine.clock, incoming.clock); }
  conflict = null; closeDialog();
  commit();   // our version now includes both histories
  view = landingView(kind); openId = view === 'songs' ? firstOpen() : null;
  render();
  toast(choice === 'both' ? 'Combined both versions' : choice === 'link' ? 'Using the version from the link' : 'Kept the version on this device');
}

function go(v) {
  if (P && !P.started && COUPLE_VIEWS.includes(v) && v !== 'welcome') { P.started = true; if (!P.demo && !P.preview) commit(); }
  view = v; addSeg = null; askSent = false;
  if (v === 'songs' && !openId) openId = firstOpen();
  render(); window.scrollTo(0, 0);
}

// ---------- render ----------
function render() {
  sortables.forEach(s => { try { s.destroy(); } catch (e) {} }); sortables = [];
  const couple = COUPLE_VIEWS.includes(view);
  document.body.dataset.view = view;
  $('#topright').innerHTML = String(topRight(couple));
  const stepper = $('#stepper');
  stepper.hidden = !couple || view === 'welcome';
  stepper.innerHTML = couple ? String(html`${STEPS.map(([k, l], i) => html`<button class="step" data-go="${k}" aria-current="${view === k ? 'step' : 'false'}"><span class="num">${i + 1}</span>${l}</button>`)}`) : '';
  const V = { setup: vSetup, badlink: vBadLink, welcome: vWelcome, moments: vMoments, songs: vSongs, floor: vFloor, send: vSend, sheet: vSheet }[view];
  $('#main').innerHTML = String(html`${banners(couple)}${V()}`);
  const bar = $('#stepbar');
  bar.hidden = !couple || view === 'welcome';
  bar.innerHTML = bar.hidden ? '' : String(vStepbar());
  const cur = document.querySelector('.step[aria-current="step"]');
  if (cur) stepper.scrollLeft = Math.max(0, cur.offsetLeft - stepper.offsetLeft - 24);
  updateSaved();
  wire();
}

function topRight(couple) {
  if (couple && view !== 'welcome') return html`<span id="saved" class="saved" role="status"></span><button class="btn small" data-open-dialog="share">Save & share</button>`;
  if (P && P.dj.name && view !== 'sheet') return html`<span class="djname">with ${P.dj.name}</span>`;
  return '';
}

function banners(couple) {
  const out = [];
  if (P && P.demo) out.push(html`<p class="banner note">Example plan. Changes here aren’t saved. <a href="./">Start a real one</a></p>`);
  if (P && P.preview) out.push(html`<p class="banner note">Preview of what ${P.couple.names || 'your couple'} will see. Nothing you do here is saved. <button class="linkbtn" data-act="end-preview">Back to setup</button></p>`);
  if (couple && INAPP && !inAppHidden && !(P && (P.demo || P.preview))) out.push(html`<div class="banner warn" role="note">
      <p><b>You’re inside the ${INAPP} app.</b> It keeps its own copy of this page, so your answers might not be here next time. Open the planner in Safari or Chrome instead: tap <b>•••</b> or the share icon, then <b>Open in browser</b>.</p>
      <div class="sharerow"><button class="btn small" data-act="copy-progress">Copy my planner link</button><button class="btn small ghost" data-act="hide-inapp">Got it</button></div></div>`);
  if (couple && saveFailed) out.push(html`<p class="banner warn" role="alert">This browser isn’t saving your answers. Use <b>Save & share</b> to keep a link or a file before you close it.</p>`);
  return out;
}

function vStepbar() {
  const i = STEPS.findIndex(s => s[0] === view);
  const prev = i > 0 ? STEPS[i - 1] : null, next = STEPS[i + 1];
  const pr = progress(P);
  return html`<div class="foot-inner">
    ${prev ? html`<button class="btn ghost" data-go="${prev[0]}">Back</button>` : html`<span></span>`}
    <span class="foot-meta" id="footmeta">${pr.done} of ${pr.total} ready</span>
    ${next ? html`<button class="btn primary" data-go="${next[0]}">Next: ${next[1]}</button>` : html`<span></span>`}
  </div>`;
}

// ---------- share helpers ----------
// Buttons stay small: data-share="<key>:<how>" looks up the message in SHARES.
const SHARES = {};
const fullText = s => s.url ? `${s.text}\n\n${s.url}` : s.text;
const waHref = s => 'https://wa.me/?text=' + encodeURIComponent(fullText(s));
const mailHref = s => `mailto:${safeEmail(s.to)}?subject=${encodeURIComponent(s.subject || '')}&body=${encodeURIComponent(fullText(s))}`;
function shareButtons(key, { text, url, subject }, opts = {}) {
  SHARES[key] = { text, url, subject, to: opts.to || '' };
  return html`<div class="sharerow">
    <button class="btn ${opts.primary ? 'primary big' : ''}" data-share="${key}:copy">${opts.copyLabel || 'Copy'}</button>
    ${CAN_SHARE ? html`<button class="btn" data-share="${key}:native">Share…</button>` : ''}
    <a class="btn" data-href="${key}:wa" href="${waHref(SHARES[key])}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn" data-href="${key}:mail" href="${mailHref(SHARES[key])}">Email</a>
  </div>`;
}
async function doShare(key, how) {
  const s = SHARES[key]; if (!s) return false;
  if (how === 'native') { try { await navigator.share({ title: s.subject || 'FirstCue', text: s.text, url: s.url || undefined }); return true; } catch (e) { return false; } }
  if (how === 'copylink') return copy(s.url, 'Link copied');
  return copy(fullText(s), s.url ? 'Copied. Paste it into a text, WhatsApp or email.' : 'Copied');
}
function onShared(key, how) {
  if (key === 'progress' || key === 'backup') { local().savedLink = Date.now(); saveQuiet(); }
  if (key === 'plan') {
    if (how === 'native-ok') { markSent(); return; }
    askSent = true; setTimeout(() => { if (view === 'send') render(); }, how === 'link' ? 400 : 0);
  }
}
function markSent() {
  if (!P) return;
  P.sentAt = Date.now(); P.sentClock = P.clock; askSent = false; saveQuiet();
  if (view === 'send') render();
  toast(`Marked as sent to ${djName()}`);
}
const linkTooLong = url => url.length > LINK_BUDGET;

// ---------- dialogs ----------
function openDialog(kind, opener) {
  const d = $('#dlg');
  dlg = kind; dlgOpener = opener || document.activeElement;
  d.innerHTML = String(dialogContent(kind));
  d.className = 'dlg ' + kind;
  if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
  const f = d.querySelector('[data-autofocus]') || d.querySelector('button, a, input, textarea');
  f && f.focus({ preventScroll: true });
}
function closeDialog(silent) {
  const d = $('#dlg'); if (!d) return;
  if (d.open) { try { d.close(); } catch (e) { d.removeAttribute('open'); } }
  dlg = null; d.innerHTML = '';
  if (!silent && dlgOpener && document.contains(dlgOpener)) dlgOpener.focus();
  dlgOpener = null;
}
function dialogContent(kind) {
  if (kind === 'share') return vShareDialog();
  if (kind === 'conflict') return vConflictDialog();
  if (kind === 'leave') return vLeaveDialog();
  return '';
}
function vShareDialog() {
  const link = editLink(P);
  const long = linkTooLong(link);
  return html`<div class="dlg-top"><h2 id="dlg-title" class="dlg-h">Save & share</h2><button class="icon" data-close-dialog aria-label="Close">×</button></div>
    <p class="hint">Everything saves on this device as you go. No need to finish in one sitting.</p>
    <section class="stack">
      <h3 class="h3">Continue later, or on another device</h3>
      <p class="hint">This link has everything so far. Send it to yourself, your partner or your planner.</p>
      ${shareButtons('progress', { text: `Our wedding song planner (${P.couple.names}). Open this to keep going:`, url: link, subject: `Our wedding songs – ${P.couple.names}` }, { copyLabel: 'Copy link' })}
      ${long ? html`<p class="hint warnline">Your planner is getting long. Some apps cut long links short, so also keep a backup file.</p>` : ''}
      <p class="hint small">If two of you edit on different devices, that’s fine: when you open each other’s link, FirstCue asks how to combine them.</p>
    </section>
    <section class="stack">
      <h3 class="h3">Download a copy</h3>
      <div class="sharerow">
        <button class="btn" data-act="dl-backup">Backup file</button>
        <button class="btn" data-act="dl-txt">Text summary</button>
        <button class="btn" data-act="dl-csv">Spreadsheet</button>
        ${EMBED ? '' : html`<button class="btn" data-act="print">Print or save PDF</button>`}
      </div>
      <p class="hint small">A backup file opens your planner on any device: go to the FirstCue home page and choose <b>Open a plan file</b>.</p>
    </section>
    <section class="stack">
      <h3 class="h3">Finished?</h3>
      <button class="btn primary" data-go="send">Go to Send</button>
    </section>`;
}
function vConflictDialog() {
  const { local: mine, incoming } = conflict;
  const diff = differingMoments(mine, incoming).slice(0, 6);
  return html`<div class="dlg-top"><h2 id="dlg-title" class="dlg-h">Two versions of your planner</h2></div>
    <p>This link has changes from another device, and this device has changes that aren’t in the link.</p>
    ${diff.length ? html`<p class="hint">Different in each: ${diff.join(', ')}${differingMoments(mine, incoming).length > 6 ? '…' : ''}</p>` : ''}
    <div class="stack">
      <button class="btn primary big" data-resolve="both" data-autofocus>Combine both <span class="opt-in">(recommended)</span></button>
      <p class="hint small">Keeps every song from both. Where you both changed the same moment, the most recent change wins.</p>
      <div class="sharerow"><button class="btn" data-resolve="link">Use the link’s version</button><button class="btn" data-resolve="mine">Keep this device’s version</button></div>
    </div>`;
}
function vLeaveDialog() {
  const pr = progress(P), key = pr.open.filter(m => m.key), rest = pr.open.filter(m => !m.key);
  return html`<div class="dlg-top"><h2 id="dlg-title" class="dlg-h">Leave these to ${djName()}?</h2><button class="icon" data-close-dialog aria-label="Close">×</button></div>
    <p>Some of these are key moments: <b>${key.map(m => m.label).join(', ')}</b>. Most couples like to pick those themselves.</p>
    <div class="stack">
      ${rest.length ? html`<button class="btn primary" data-leave-all="rest" data-autofocus>Only the other ${rest.length} moment${rest.length > 1 ? 's' : ''}</button>` : ''}
      <button class="btn" data-leave-all="all">Yes, all ${pr.open.length}, including key moments</button>
      <button class="btn ghost" data-close-dialog>Cancel</button>
    </div>`;
}

// ---------- views: DJ ----------
function inviteMessage(p) {
  return `Hi ${p.couple.names || 'there'}! Here’s your wedding song planner from ${p.dj.name || 'your DJ'}. It takes about 15 minutes, saves as you go, and you can leave anything you’re unsure about to me.${p.couple.due ? ` Could you send it back by ${fmtDate(p.couple.due)}?` : ''}`;
}
function vSetup() {
  const dj = Store.dj();
  const mine = Store.all().sort((a, b) => (b.sentAt || b.created || 0) - (a.sentAt || a.created || 0));
  if (created) return html`${vCreated(created)}${vCouples(mine)}${vOpenFile()}`;
  return html`<section class="hero">
    <p class="eyebrow">For DJs</p>
    <h1>Send your couple one link. Get back a run sheet.</h1>
    <p class="lede">Couples pick songs for each moment of their day, on their phone, in about 15 minutes. You get every start time, fade and cue in one place.</p>
  </section>
  <form class="card stack" id="setup" autocomplete="off">
    <h2 class="h2">New couple</h2>
    <div class="row2">
      <label class="fld">Couple’s names<input id="s-names" required maxlength="${LIMITS.names}" placeholder="Jamie & Kai"></label>
      <label class="fld">Wedding date<input id="s-date" type="date" required></label>
    </div>
    <fieldset class="fld"><legend>What kind of wedding?</legend>
      <div class="tpls">${Object.entries(TEMPLATES).map(([k, tp], i) => html`<label class="tpl"><input type="radio" name="tpl" value="${k}" ${i === 0 ? raw('checked') : ''}><span><b>${tp.name}</b><small>${tp.blurb}</small></span></label>`)}</div>
      <small class="hint">The couple can add or remove moments from a longer list.</small>
    </fieldset>
    <details class="more" ${dj ? '' : raw('open')}><summary>${dj ? html`Sending as <b>${dj.name}</b>${dj.email ? ' · ' + dj.email : ''} · change` : 'Your details (once only)'}</summary>
      <div class="row2">
        <label class="fld">Your DJ name<input id="s-dj" maxlength="${LIMITS.djName}" value="${(dj || DEFAULT_DJ).name}"></label>
        <label class="fld">Your email<input id="s-email" type="email" maxlength="${LIMITS.email}" value="${(dj || DEFAULT_DJ).email}" placeholder="so couples can email their plan"></label>
      </div>
      <label class="fld">Couple should finish by<input id="s-due" type="date"><small class="hint">Fills in two weeks before the wedding. Change it if you like.</small></label>
    </details>
    <button class="btn primary big" type="submit">Create their planner</button>
  </form>
  ${vCouples(mine)}
  ${vOpenFile()}
  <section class="stack">
    <h2 class="h2">See how it works</h2>
    <div class="btnrow start"><a class="btn" href="#demo">Example: couple’s view</a><a class="btn" href="#demo-sheet">Example: your run sheet</a></div>
  </section>`;
}
function vOpenFile() {
  return html`<section class="stack">
    <h2 class="h2">Open a plan file</h2>
    <p class="hint">If a couple sent a FirstCue file instead of a link (long plans), open it here. Couples can use this to restore a backup too.</p>
    <label class="btn file-btn">Choose a file<input type="file" id="fileopen" accept=".json,application/json" class="sr-only"></label>
  </section>`;
}
function vCreated(p) {
  return html`<section class="card stack ok-card" id="created">
    <p class="eyebrow ok">✓ Planner ready</p>
    <h1 class="h1s">Send this to ${p.couple.names}</h1>
    <p class="hint">Copy the message below and paste it into a text, WhatsApp or email. The link inside is their personal planner.</p>
    <label class="fld">Message <span class="opt">edit if you like</span><textarea id="invite-msg" rows="4" maxlength="1000">${inviteMessage(p)}</textarea><small class="hint">Their planner link is added to the end automatically.</small></label>
    ${shareButtons('invite', { text: inviteMessage(p), url: editLink(p), subject: `Your wedding song planner – ${p.couple.names}` }, { primary: true, copyLabel: 'Copy message with link' })}
    <details class="more"><summary>More options</summary>
      <div class="btnrow start"><button class="btn small" data-share="invite:copylink">Copy link only</button><button class="btn small" data-act="preview-couple">Preview what they’ll see</button></div>
    </details>
    <div class="btnrow start"><button class="linkbtn" data-act="new-couple">+ Create another couple</button></div>
  </section>`;
}
function vCouples(list) {
  if (!list.length) return '';
  return html`<section class="stack"><h2 class="h2">Your couples <span class="count">on this device</span></h2>
    <ul class="couples">${list.map(p => {
      const pr = progress(p);
      const state = p.sentAt ? ['ok', `Received ${fmtWhen(p.sentAt)}`] : ['wait', 'Waiting for couple'];
      return html`<li class="couple-row">
        <div><b>${p.couple.names || 'Untitled'}</b><span>${fmtDate(p.couple.date)}${p.sentAt ? ` · ${pr.done}/${pr.total} ready` : ''}</span></div>
        <span class="pill ${state[0]}">${state[1]}</span>
        <div class="row-acts">
          ${p.sentAt ? html`<button class="btn small" data-sheet-of="${p.id}">Run sheet</button>` : ''}
          <button class="btn small" data-resend="${p.id}">Their link</button>
          <button class="icon" data-remove="${p.id}" aria-label="Remove ${p.couple.names}">${armed === p.id ? html`<span class="confirm">Remove?</span>` : '×'}</button>
        </div></li>`;
    })}</ul>
    <p class="hint small">When a couple sends their plan, open their link once and it shows up here. This list lives in this browser only.</p></section>`;
}

// ---------- views: couple ----------
function vBadLink() {
  const mine = Store.all().filter(p => p.started).sort((a, b) => b.updated - a.updated).slice(0, 5);
  return html`<section class="welcome">
    <p class="eyebrow">Link problem</p>
    <h1>This link didn’t come through in full.</h1>
    <p class="lede">Some apps cut long links short. Nothing is lost: ask whoever sent it to send it again, or to send it as a file.</p>
    ${mine.length ? html`<section class="stack"><h2 class="h2">Planners on this device</h2>
      <ul class="couples">${mine.map(p => html`<li><button class="plan" data-open-local="${p.id}"><b>${p.couple.names || 'Untitled'}</b><span>${fmtDate(p.couple.date)} · saved ${fmtWhen(p.updated)}</span></button></li>`)}</ul></section>` : ''}
    ${vOpenFile()}
    <p class="hint">Are you a DJ? <a href="./">Go to the DJ page</a></p>
  </section>`;
}

function vWelcome() {
  const r = active(P);
  return html`<section class="welcome">
    <p class="eyebrow">${fmtDate(P.couple.date)}</p>
    <h1>Hi ${P.couple.names || 'there'}.<br>Let’s pick your songs.</h1>
    <p class="lede">${djName()} set up ${r.length} moments for your day. Three short steps, about 15 minutes${P.couple.due ? html`. Please send it by <b>${fmtDate(P.couple.due)}</b>` : ''}.</p>
    <ul class="calm">
      <li>Everything saves as you go. Come back any time.</li>
      <li>Not sure about a song? Leave it to ${djName()}.</li>
      <li>Share it with your partner or planner from <b>Save & share</b>.</li>
    </ul>
    <ol class="howto">
      <li><b>Moments</b><span>Keep what you’re doing, add anything missing, put them in order.</span></li>
      <li><b>Songs</b><span>Paste a Spotify, Apple Music or YouTube link for each moment, or type the name.</span></li>
      <li><b>Dance floor</b><span>Must-plays, do-not-plays and the vibe.</span></li>
    </ol>
    <button class="btn primary big" data-go="moments">Start</button>
  </section>`;
}

function vPicker(seg) {
  const have = new Set(P.moments.map(m => norm(m.label)));
  const items = LIBRARY[seg].map(libItem).filter(i => !have.has(norm(i.label)));
  return html`<div class="picker" id="picker-${seg}">
    <p class="hint">Tap to add${items.length ? '' : '. You’ve added all our suggestions here'}.</p>
    <div class="chips">${items.map(i => html`<button class="chip add" data-addlib="${seg}|${i.label}">+ ${i.label}</button>`)}</div>
    <div class="addsong"><label class="sr-only" for="other-${seg}">Add your own moment</label><input id="other-${seg}" data-other="${seg}" maxlength="${LIMITS.label}" placeholder="Something else? Type it here"><button class="btn" data-addother="${seg}">Add</button></div>
    <button class="linkbtn" data-picker="">Done adding</button>
  </div>`;
}
function vMoments() {
  return html`<header class="stephead"><h1>Which moments need music?</h1>
    <p class="lede">Untick anything you’re not doing, add what’s missing, and use the arrows (or drag <span class="kbd">⠿</span>) to reorder. <span class="fc-key">Key</span> moments are the ones your DJ most needs a song for.</p></header>
  ${Object.entries(SEGS).map(([seg, name]) => {
    const ms = P.moments.filter(m => m.seg === seg);
    return html`<section class="seg" aria-labelledby="seg-${seg}"><h2 class="seg-h" id="seg-${seg}">${name}</h2>
      <ul class="mlist" data-seg="${seg}">${ms.map(m => html`<li class="mrow${m.off ? ' is-off' : ''}" data-id="${m.id}">
        <span class="grip" aria-hidden="true">⠿</span>
        <input type="checkbox" class="tick" id="on-${m.id}" data-tick="${m.id}" ${m.off ? '' : raw('checked')} aria-label="Include ${m.label}">
        <input class="mlabel" id="lb-${m.id}" data-label="${m.id}" value="${m.label}" maxlength="${LIMITS.label}" aria-label="Moment name">
        ${m.key ? html`<span class="fc-key">Key</span>` : ''}
        <span class="reorder"><button class="icon mv" data-mv="-1" aria-label="Move ${m.label} up">▲</button><button class="icon mv" data-mv="1" aria-label="Move ${m.label} down">▼</button></span>
        ${m.custom ? html`<button class="icon" data-del-m="${m.id}" aria-label="Delete ${m.label}">×</button>` : ''}
      </li>`)}</ul>
      ${addSeg === seg ? vPicker(seg) : html`<button class="addline" data-picker="${seg}">+ Add a moment to ${name.toLowerCase()}</button>`}
    </section>`;
  })}`;
}

function cardSummary(m) {
  const st = status(m);
  if (st === 'dj') return html`<span class="tag">${djName()}’s choice</span>`;
  if (st === 'done') return html`<span class="picked">${m.kind === 'playlist' ? 'Playlist added' : (m.title || 'Linked song')}</span>`;
  return html`<span class="add">${m.kind === 'playlist' ? 'Add a playlist' : 'Add a song'}</span>`;
}
function songCard(m) {
  const st = status(m), open = openId === m.id;
  let body = '';
  if (open) {
    const leave = html`<button class="btn ghost small" data-leave>Leave it to ${djName()}</button>`;
    if (m.dj) {
      body = html`<div class="cbody"><p class="hint">${djName()} will choose. Anything to steer them?</p>
        <label class="fld">Notes<textarea id="n-${m.id}" data-f="note" maxlength="${LIMITS.note}" placeholder="e.g. something soft and instrumental">${m.note}</textarea></label>
        <div class="btnrow"><button class="btn ghost small" data-pickself>Actually, I’ll pick one</button><button class="btn primary" data-next>Next moment</button></div></div>`;
    } else if (m.kind === 'playlist') {
      body = html`<div class="cbody">
        <label class="fld">Playlist link<input id="u-${m.id}" data-f="url" value="${m.url}" maxlength="${LIMITS.url}" inputmode="url" placeholder="Paste a Spotify or Apple Music playlist link" aria-describedby="uh-${m.id}"><small class="hint urlhint" id="uh-${m.id}" aria-live="polite"></small></label>
        <label class="fld">When should it start and stop? <span class="opt">optional</span><input id="n-${m.id}" data-f="note" value="${m.note}" maxlength="${LIMITS.note}" placeholder="e.g. as guests arrive, until the ceremony starts"></label>
        <div class="btnrow">${leave}<button class="btn primary" data-next>Next moment</button></div></div>`;
    } else {
      body = html`<div class="cbody">
        <div class="songfield">
          <label class="fld">Song<input id="t-${m.id}" data-f="title" value="${m.title}" maxlength="${LIMITS.url}" placeholder="Paste a link, or type Song – Artist" autocomplete="off"></label>
          ${m.url ? html`<div class="linkchip"><a href="${href(m.url)}" target="_blank" rel="noopener noreferrer">Listen on ${hostName(m.url)} ↗</a><button class="icon" data-unlink aria-label="Remove link">×</button></div>` : ''}
        </div>
        <details class="more" data-det="${m.id}" ${detOpen.has(m.id) || m.start || m.end !== 'moment' || m.note || m.announce ? raw('open') : ''}><summary>Timing and notes <span class="opt">optional</span></summary>
        <div class="stack">
        <div class="row-time">
          <label class="fld">Start at<input class="mono" id="s-${m.id}" data-f="start" data-time value="${m.start}" maxlength="${LIMITS.time}" placeholder="0:00" inputmode="decimal"></label>
          <fieldset class="fld"><legend>How should it end?</legend><div class="seg-ctl">${ENDS.map(([v, l]) => html`<button type="button" data-end="${v}" aria-pressed="${m.end === v}">${l}</button>`)}</div></fieldset>
          ${m.end === 'time' ? html`<label class="fld">Fade at<input class="mono" id="e-${m.id}" data-f="endAt" data-time value="${m.endAt}" maxlength="${LIMITS.time}" placeholder="2:45" inputmode="decimal"></label>` : ''}
        </div>
        <label class="fld">Anything the DJ should know?<textarea id="n-${m.id}" data-f="note" maxlength="${LIMITS.note}" placeholder="e.g. 0:11 doors open, 0:23 bride starts walking, fade when she reaches the stage">${m.note}</textarea>
          <small class="hint">Times like 0:23 turn into cue points on your DJ’s sheet.</small></label>
        ${isEntrance(m.label) ? html`<label class="fld">Names to announce<input id="a-${m.id}" data-f="announce" value="${m.announce}" maxlength="${LIMITS.announce}" placeholder="e.g. Wing & Mei Chan (say WING and MAY)"></label>` : ''}
        </div></details>
        <div class="btnrow">${leave}<button class="btn primary" data-next>Next moment</button></div></div>`;
    }
  }
  return html`<li class="scard ${st}${open ? ' expanded' : ''}" data-id="${m.id}">
    <button class="shead" data-toggle="${m.id}" aria-expanded="${open}">
      <span class="sl"><b>${m.label}</b>${m.key && st === 'open' ? html`<span class="fc-key">Key</span>` : ''}</span>
      <span class="ss">${cardSummary(m)}</span>
    </button>${body}</li>`;
}
function vNudge() {
  if (!P || P.demo || P.preview || nudgeHidden || (P.local && P.local.savedLink)) return '';
  const pr = progress(P);
  if (pr.done < 1) return '';
  return html`<div class="banner tip" role="note">
    <p><b>Keep your planner safe.</b> Save your link once (text it to yourself) so you can come back on any device, even if this browser clears its data.</p>
    <div class="sharerow"><button class="btn small primary" data-open-dialog="share">Save my link</button><button class="btn small ghost" data-act="hide-nudge">Not now</button></div>
  </div>`;
}
function vSongs() {
  return html`<header class="stephead"><h1>Pick your songs</h1><p class="lede">Tap a moment and paste a link or type the name. Skip anything you’re unsure about and come back later, or leave it to ${djName()}.</p></header>
  ${vNudge()}
  ${Object.entries(SEGS).map(([seg, name]) => {
    const ms = P.moments.filter(m => m.seg === seg && !m.off);
    return ms.length ? html`<section class="seg"><h2 class="seg-h">${name}</h2><ul class="slist">${ms.map(songCard)}</ul></section>` : '';
  })}`;
}

function songList(arr, key, empty) {
  const other = key === 'must' ? 'Do not play' : 'Must play';
  return html`<ul class="flist ${key}" data-list="${key}" data-empty="${empty}">${arr.map(s => html`<li class="fitem" data-sid="${s.id}">
    <span class="grip" aria-hidden="true">⠿</span><span class="ft">${s.title || 'Linked song'}</span>
    ${s.url ? html`<a href="${href(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Listen to ${s.title || 'song'}">↗</a>` : ''}
    <span class="reorder"><button class="icon mv" data-mvs="${key}:${s.id}:-1" aria-label="Move ${s.title} up">▲</button><button class="icon mv" data-mvs="${key}:${s.id}:1" aria-label="Move ${s.title} down">▼</button><button class="icon mv" data-swap="${key}:${s.id}" aria-label="Move ${s.title} to ${other}">⇄</button></span>
    <button class="icon" data-rm="${key}:${s.id}" aria-label="Remove ${s.title}">×</button></li>`)}</ul>`;
}
function vFloor() {
  const V = P.vibe;
  return html`<header class="stephead"><h1>Your dance floor</h1><p class="lede">All optional. The songs you need, the ones to skip, and the feel of the night.</p></header>
  <div class="floor">
    <section class="card stack"><h2 class="h2">Must play <span class="count">${P.must.length}/${MUST_MAX}</span></h2>
      <p class="hint">Top of the list matters most. Keep it short so your DJ can read the room.</p>
      <div class="addsong"><label class="sr-only" for="add-must">Add a must-play song</label><input id="add-must" data-addto="must" maxlength="${LIMITS.url}" placeholder="Song – Artist, or paste a link"><button class="btn" data-addbtn="must">Add</button></div>
      ${songList(P.must, 'must', 'Nothing yet')}
    </section>
    <section class="card stack"><h2 class="h2">Do not play <span class="count">${P.dnp.length}</span></h2>
      <p class="hint">Changed your mind? Use ⇄ to move a song between the lists.</p>
      <div class="addsong"><label class="sr-only" for="add-dnp">Add a do-not-play song</label><input id="add-dnp" data-addto="dnp" maxlength="${LIMITS.url}" placeholder="Song – Artist"><button class="btn" data-addbtn="dnp">Add</button></div>
      ${songList(P.dnp, 'dnp', 'Nothing yet')}
    </section>
  </div>
  <section class="card stack">
    <h2 class="h2" id="h-langs">Languages your guests love</h2>
    <div class="chips" role="group" aria-labelledby="h-langs">${LANGS.map(l => html`<button class="chip" data-lang="${l}" aria-pressed="${V.langs.includes(l)}">${l}</button>`)}</div>
    <h2 class="h2" id="h-genres">Genres to lean into</h2>
    <div class="chips" role="group" aria-labelledby="h-genres">${GENRES.map(g => html`<button class="chip" data-genre="${g}" aria-pressed="${V.genres.includes(g)}">${g}</button>`)}</div>
    <h2 class="h2" id="h-explicit">Explicit lyrics</h2>
    <div class="seg-ctl" role="group" aria-labelledby="h-explicit">${EXPLICIT.map(([v, l]) => html`<button type="button" data-explicit="${v}" aria-pressed="${V.explicit === v}">${l}</button>`)}</div>
    <label class="fld">Anything else? Your crowd, special requests, songs with meaning<textarea id="vibe-notes" data-vibe="notes" maxlength="${LIMITS.vibeNotes}" placeholder="e.g. lots of family over 60, friends who’ll dance all night">${V.notes}</textarea></label>
  </section>`;
}

function vSend() {
  const pr = progress(P), dj = djName();
  const sent = P.sentAt && !changedSinceSent(P);
  const msg = `Hi ${dj}! Here’s our wedding song plan (${P.couple.names}, ${fmtDate(P.couple.date)}).${pr.open.length ? ` A few moments are still open: ${pr.open.map(m => m.label).join(', ')}.` : ''}`;
  const link = planLink(P);
  const keyOpen = pr.open.filter(m => m.key), restOpen = pr.open.filter(m => !m.key);
  const jump = m => html`<li><button class="linkbtn" data-jump="${m.id}">${m.label}</button></li>`;
  SHARES.plan = null;
  return html`<header class="stephead"><h1>${pr.open.length ? 'Almost there' : 'All set'}</h1>
    <p class="lede">${pr.done} of ${pr.total} moments are ready.${pr.open.length ? ' You can send now and finish later.' : ''}</p></header>
  ${P.sentAt ? (changedSinceSent(P)
      ? html`<p class="status warn">You’ve made changes since you sent it on ${fmtWhen(P.sentAt)}. Send again so ${dj} has the latest.</p>`
      : html`<p class="status ok">✓ Sent to ${dj} on ${fmtWhen(P.sentAt)}. Change anything later and send again.</p>`) : ''}
  <section class="card stack send-card">
    <h2 class="h2">${sent ? `Didn’t reach ${dj}? Send it again` : `Send to ${dj}`}</h2>
    ${askSent ? html`<div class="ask" role="group" aria-labelledby="ask-q"><p id="ask-q"><b>Did you send it to ${dj}?</b> Paste it into your message first if you copied it.</p>
      <div class="sharerow"><button class="btn primary" data-act="confirm-sent" data-autofocus>Yes, I sent it</button><button class="btn" data-act="not-yet">Not yet</button></div></div>` : ''}
    <p class="hint">This sends a link with everything you’ve picked.${P.dj.email ? ` Email goes straight to ${P.dj.email}.` : ''}</p>
    ${CAN_SHARE ? html`<button class="btn primary big" data-act="send">Send to ${dj}</button><p class="hint">Or:</p>` : ''}
    ${shareButtons('plan', { text: msg, url: link, subject: `Wedding song plan – ${P.couple.names}` }, { to: P.dj.email, primary: !CAN_SHARE && !sent && !askSent, copyLabel: 'Copy message with link' })}
    ${linkTooLong(link) ? html`<p class="hint warnline">Your plan is long, and some apps cut long links short. If ${dj} can’t open it, send this file instead: <button class="linkbtn" data-act="dl-planfile">Download plan file</button></p>` : ''}
  </section>
  ${pr.open.length ? html`<section class="card stack"><h2 class="h2">Still open <span class="count">${pr.open.length}</span></h2>
    ${keyOpen.length ? html`<p class="hint">Key moments, tap to pick a song:</p><ul class="openlist">${keyOpen.map(jump)}</ul>` : ''}
    ${restOpen.length ? html`<details class="more"><summary>${keyOpen.length ? `${restOpen.length} other moment${restOpen.length > 1 ? 's' : ''}` : `Show ${restOpen.length} moment${restOpen.length > 1 ? 's' : ''}`}</summary><ul class="openlist">${restOpen.map(jump)}</ul></details>` : ''}
    <button class="btn small" data-act="leave-rest">Leave these to ${dj}</button></section>` : ''}
  <section class="card stack">
    <h2 class="h2">Keep a copy</h2>
    <div class="sharerow"><button class="btn" data-act="dl-backup">Backup file</button><button class="btn" data-act="dl-txt">Text summary</button><button class="btn" data-act="dl-csv">Spreadsheet</button><button class="btn" data-go="sheet">See what ${dj} sees</button></div>
  </section>`;
}

// ---------- views: run sheet ----------
function noteHTML(s) {
  const parts = String(s).split(TIME_RE);   // split keeps captured times at odd indexes
  return parts.map((x, i) => i % 2 ? html`<span class="tc">${x}</span>` : html`${x}`);
}
function vFollowUp(p) {
  const lines = followLines(p, 'me');
  if (!lines.length) return '';
  const msg = `Hi ${p.couple.names}! Thanks for sending your songs. When you have a minute:\n${lines.map(l => '• ' + l).join('\n')}\n\nHere’s your planner. It has everything you’ve done so far:`;
  return html`<section class="card stack follow">
    <h2 class="h2">To follow up</h2>
    <ul class="issues">${lines.map(l => html`<li>${l}</li>`)}</ul>
    <p class="hint">Copy a ready-made message with their planner link. They’ll pick up exactly where they left off.</p>
    ${shareButtons('follow', { text: msg, url: editLink(p), subject: `A few song questions – ${p.couple.names}` }, { copyLabel: 'Copy follow-up message' })}
  </section>`;
}
function vSheet() {
  const r = active(P), pr = progress(P);
  let n = 0;
  const endTxt = m => ({ moment: '', out: 'Play through', time: 'Fade at ' + (m.endAt || '?') })[m.end];
  const rows = Object.entries(SEGS).map(([seg, name]) => {
    const ms = r.filter(m => m.seg === seg); if (!ms.length) return '';
    return html`<section class="rs-seg"><h2 class="seg-h">${name}</h2>${ms.map(m => {
      n++; const st = status(m);
      const music = st === 'dj' ? html`<i>DJ’s choice</i>${m.key ? html` <span class="tag key">key moment</span>` : ''}` : st === 'open' ? html`<span class="tag warn">No song yet</span>`
        : m.kind === 'playlist' ? html`Playlist <a href="${href(m.url)}" target="_blank" rel="noopener noreferrer">${hostName(m.url)} ↗</a>`
        : html`<b>${m.title || 'Linked song'}</b>${m.url ? html` <a href="${href(m.url)}" target="_blank" rel="noopener noreferrer">${hostName(m.url)} ↗</a>` : html` <span class="tag">no link</span>`}`;
      const timing = m.kind === 'song' && st === 'done' ? html`${m.start && m.start !== '0:00' ? html`<span class="tc big">${m.start}</span>` : html`<span class="endtxt">From the top</span>`}${endTxt(m) ? html`<span class="endtxt strong">${endTxt(m)}</span>` : ''}` : '';
      const bad = (!validTime(m.start) || (m.end === 'time' && !validTime(m.endAt))) ? html`<span class="tag warn">Check times</span>` : '';
      return html`<article class="rs-row ${st}">
        <div class="rs-n">${n}</div>
        <div class="rs-m"><b>${m.label}</b>${m.announce ? html`<small>Announce: ${m.announce}</small>` : ''}</div>
        <div class="rs-s">${music}${m.note ? html`<p class="rs-note">${noteHTML(m.note)}</p>` : ''}</div>
        <div class="rs-t">${timing}${bad}</div>
      </article>`;
    })}</section>`;
  });
  const li = arr => arr.length ? html`<ol>${arr.map(s => html`<li>${s.title || 'Linked song'}${s.url ? html` <a href="${href(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Listen">↗</a>` : ''}</li>`)}</ol>` : html`<p class="hint">None</p>`;
  const V = P.vibe;
  const state = P.sentAt ? `Sent ${fmtWhen(P.sentAt)}` : 'Draft, not sent yet';
  const dk = delegatedKey(P);
  return html`<header class="rs-head">
    <div><p class="eyebrow">Run sheet · ${state}</p>
      <h1>${P.couple.names || 'Untitled'}</h1><p class="lede">${fmtDate(P.couple.date)}${P.dj.name ? ' · DJ ' + P.dj.name : ''}</p></div>
    <div class="btnrow start noprint">
      ${EMBED ? '' : html`<button class="btn" data-act="print">Print</button>`}<button class="btn" data-act="dl-csv">Spreadsheet</button><button class="btn" data-act="dl-txt">Text</button><button class="btn" data-act="copytext">Copy</button>
      ${role === 'couple' ? html`<button class="btn ghost" data-go="send">Back to my planner</button>` : ''}
    </div>
  </header>
  <div class="rs-stats"><span><b>${pr.done}</b>/${pr.total} ready</span><span><b>${pr.open.filter(m => m.key).length}</b> key moments open</span>${dk.length ? html`<span><b>${dk.length}</b> key left to you</span>` : ''}<span><b>${P.must.length}</b> must-plays</span></div>
  ${role === 'dj' ? html`<div class="noprint">${vFollowUp(P)}</div>` : ''}
  <div class="rs">${rows}</div>
  <div class="rs-extra">
    <section class="card stack"><h2 class="h2">Must play</h2>${li(P.must)}</section>
    <section class="card stack"><h2 class="h2">Do not play</h2>${li(P.dnp)}</section>
    <section class="card stack"><h2 class="h2">Vibe</h2>
      <dl class="vibe-dl"><dt>Languages</dt><dd>${V.langs.join(', ') || '—'}</dd><dt>Genres</dt><dd>${V.genres.join(', ') || '—'}</dd><dt>Explicit</dt><dd>${(EXPLICIT.find(e => e[0] === V.explicit) || [])[1] || '—'}</dd></dl>
      ${V.notes ? html`<p>${V.notes}</p>` : ''}</section>
  </div>`;
}

// ---------- demo ----------
function demoPlan() {
  const p = newPlan({ names: 'Jamie & Kai', date: '2027-06-12', due: '2027-05-29', template: 'banquet', dj: Store.dj() || DEFAULT_DJ });
  p.id = 'demo'; p.demo = true; p.started = true;
  const sp = id => 'https://open.spotify.com/track/' + id;
  const set = (label, o) => Object.assign(p.moments.find(m => m.label === label), o);
  set('Guests arriving', { url: 'https://open.spotify.com/playlist/2QPGeXVik7U6mi71gBU1iS', note: 'From when guests arrive until the ceremony starts' });
  set('Wedding party walks in', { title: 'A Thousand Years – The Piano Guys', url: sp('0E0xI4AgMNU7UkwBt3FCVN'), note: '0:19 bridesmaids & groomsmen start walking. Keep playing for ring bearer and flower girl, fade when they reach the front.' });
  set('Bride’s entrance', { title: 'Your Song – Julie Anne San Jose', url: sp('3vA3D2J5ciFlIjdQ0piQBk'), note: 'Fade in softly when the officiant announces the bride. 0:11 doors open, 0:23 bride walks to centre with parents, 0:55 pause then walk to stage.' });
  set('Recessional', { title: 'Moment We Live For – In Paradise', url: sp('5PX5uDft7FN2o6h6ufQS0p'), start: '0:40' });
  set('Cocktail hour', { url: 'https://open.spotify.com/playlist/7wZDnQTbRYysudqskrXqJo', note: 'Right after we re-enter' });
  set('Parents & grandparents entrance', { title: 'September – Earth, Wind & Fire', url: sp('2grjqo0Frpf2okIBiifQKs'), start: '0:18', note: 'Blend into the groomsmen song once parents are in', announce: 'Mr. & Mrs. Wong (say WONG), Mr. & Mrs. Lam' });
  set('Groomsmen entrance', { title: '卡拉永遠OK – Alan Tam', url: sp('5gbPl7MNLjGQsm068Hzv2B'), start: '1:25', note: 'They have a short performance, fade after' });
  set('Bridesmaids entrance', { title: 'Sexy and I Know It (Hakka version)', note: 'Custom edit, we’ll email the audio file' });
  set('Couple’s entrance', { title: 'Fireball – Pitbull ft. John Ryan', url: sp('4Y7XAxTANhu3lmnLAzhWJW'), start: '0:31', note: '0:43 extend the beat until we reach our table' });
  set('Dinner', { url: 'https://open.spotify.com/playlist/4sMIeDjawGoRfhSRf5XlAu', note: 'Add songs in the same style' });
  set('Father–daughter dance', { title: 'First Man – Camila Cabello', url: sp('6TRt2bniIq0EIlrDlje7b8'), end: 'time', endAt: '2:45' });
  set('First dance', { title: '月亮代表誰的心 – David Tao', url: sp('5zpEPwbPcf0Kl2dEyw0T0A'), start: '0:12', note: 'Soft fade in the last few seconds' });
  set('Games', { title: 'Takedown – HUNTRIX', url: sp('0MHStU0muAIEMbwdnebYu2'), start: '0:33', note: 'Game 3: dinosaur and frog costumes come in. Stop when the game ends.' });
  set('Cake cutting', { dj: true });
  set('Opening the dance floor', { title: 'Can’t Help Falling in Love – Tiscore', url: sp('1vcG9rr0yMEGXTNY1wChv9'), note: 'Right after the lion dance' });
  p.must = [{ id: uid(), title: 'Mr. Brightside – The Killers', url: '', r: 0 }, { id: uid(), title: '海闊天空 – Beyond', url: '', r: 0 }];
  p.dnp = [{ id: uid(), title: 'Chicken Dance', url: '', r: 0 }];
  p.vibe = { langs: ['English', 'Cantonese', 'Mandarin'], genres: ['2000s throwbacks', 'Hip-hop & R&B', 'Cantopop'], explicit: 'radio', notes: 'Lots of aunties and uncles, plus friends in their 30s who will dance all night.' };
  p.sentAt = Date.now() - 3600e3; p.sentClock = p.clock;
  return p;
}

// ---------- exports ----------
async function download(name, text, type) {
  if (typeof window.FIRSTCUE_DOWNLOAD === 'function') { try { await window.FIRSTCUE_DOWNLOAD(name, text, type); toast('Saved'); } catch (e) {} return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Downloaded');
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) {}
    ta.remove(); toast(ok ? okMsg : 'Couldn’t copy automatically. Press and hold the link to copy it.');
    return ok;
  }
}

// ---------- editing ----------
async function addSong(listKey, rawText) {
  rawText = String(rawText || '').trim().slice(0, LIMITS.url); if (!rawText) return;
  if (listKey === 'must' && P.must.length >= MUST_MAX) { toast(`Must play holds ${MUST_MAX}. Remove one first.`); return; }
  const url = cleanUrl(rawText);
  const item = { id: uid(), title: url ? '' : rawText.slice(0, LIMITS.title), url, r: 0 };
  P[listKey].push(item); commit('lists'); render();
  const el = document.getElementById('add-' + listKey); if (el) el.focus();
  if (item.url) { const ti = await lookupTitle(item.url); if (ti && P && P[listKey].includes(item)) { item.title = ti; commit('lists'); if (view === 'floor') render(); } }
}
async function setMomentLink(m, url) {
  const u = cleanUrl(url); if (!u) { toast('That link doesn’t look right. Paste a full link starting with https://'); return; }
  m.url = u; m.dj = false; commit({ m }); render();
  const el = () => document.getElementById('t-' + m.id);
  if (m.kind === 'song' && !m.title) {
    if (el()) { el().placeholder = 'Looking up the song name…'; el().classList.add('loading'); }
    const ti = await lookupTitle(m.url);
    if (ti && !m.title) { m.title = ti; commit({ m }); render(); toast('Got it: ' + ti); }
    else if (el()) { el().classList.remove('loading'); el().placeholder = 'Link saved. Type the song name too (optional)'; el().focus(); }
  }
}
function nextOpen(afterId) {
  const list = active(P);
  const i = list.findIndex(m => m.id === afterId);
  return [...list.slice(i + 1), ...list.slice(0, i)].find(m => status(m) === 'open');
}
function addMoment(seg, label, o = {}) {
  label = String(label || '').trim().slice(0, LIMITS.label); if (!label) return null;
  if (P.moments.length >= LIMITS.moments) { toast('That’s the most moments a planner can hold.'); return null; }
  const m = newMoment(seg, label, { ...o, custom: true });
  const last = P.moments.map(x => x.seg).lastIndexOf(seg);
  P.moments.splice(last < 0 ? P.moments.length : last + 1, 0, m);
  commit({ m }); return m;
}
function refreshCard(m) {
  const card = document.querySelector(`.scard[data-id="${m.id}"]`);
  if (card) { card.className = `scard ${status(m)} expanded`; card.querySelector('.ss').innerHTML = String(cardSummary(m)); }
  const fm = $('#footmeta'); if (fm) { const pr = progress(P); fm.textContent = `${pr.done} of ${pr.total} ready`; }
}
// Put keyboard focus back right away (render is synchronous), so a second key press lands on the same control.
function refocus(selector) { const f = () => { const el = document.querySelector(selector); if (el) el.focus(); return !!el; }; if (!f()) requestAnimationFrame(f); }

// ---------- wiring after each render ----------
function wire() {
  if (window.Sortable && P && !P.preview) {
    document.querySelectorAll('.mlist').forEach(el => sortables.push(Sortable.create(el, { handle: '.grip', animation: 160, group: 'moments', onEnd: () => {
      const order = []; document.querySelectorAll('.mlist').forEach(l => l.querySelectorAll(':scope > .mrow').forEach(li => order.push([li.dataset.id, l.dataset.seg])));
      const byId = Object.fromEntries(P.moments.map(m => [m.id, m]));
      P.moments = order.map(([id, seg]) => Object.assign(byId[id], { seg })).filter(Boolean); commit('order'); render();
    } })));
    document.querySelectorAll('.flist').forEach(el => sortables.push(Sortable.create(el, { handle: '.grip', animation: 160, group: 'floor', onEnd: () => {
      const all = Object.fromEntries([...P.must, ...P.dnp].map(s => [s.id, s]));
      const read = k => [...document.querySelectorAll(`[data-list="${k}"] > .fitem`)].map(li => all[li.dataset.sid]).filter(Boolean);
      const must = read('must'), dnp = read('dnp');
      if (must.length > MUST_MAX) { render(); toast(`Must play holds ${MUST_MAX}. Remove one first.`); return; }
      P.must = must; P.dnp = dnp; commit('lists'); render();
    } })));
  }
  const form = $('#setup');
  if (form) {
    const date = $('#s-date'), due = $('#s-due');
    date.addEventListener('change', () => { if (!date.value) return; const d = new Date(date.value + 'T12:00:00'); d.setDate(d.getDate() - 14); due.value = d.toISOString().slice(0, 10); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const dj = { name: $('#s-dj').value.trim().slice(0, LIMITS.djName) || DEFAULT_DJ.name, email: safeEmail($('#s-email').value) };
      Store.setDj(dj);
      created = newPlan({ names: $('#s-names').value.trim().slice(0, LIMITS.names), date: date.value, due: due.value, template: form.querySelector('[name=tpl]:checked').value, dj });
      Store.save(created);
      render(); window.scrollTo(0, 0);
      const c = $('#created h1'); c && c.setAttribute('tabindex', '-1'); c && c.focus();
    });
  }
  const msg = $('#invite-msg');
  if (msg) msg.addEventListener('input', () => {
    SHARES.invite.text = msg.value.slice(0, 1000);
    document.querySelectorAll('[data-href^="invite:"]').forEach(a => { a.href = a.dataset.href.endsWith(':wa') ? waHref(SHARES.invite) : mailHref(SHARES.invite); });
  });
  const file = $('#fileopen');
  if (file) file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if (!f) return;
    if (f.size > 512 * 1024) { toast('That file is too big to be a FirstCue plan.'); return; }
    const res = fromFile(await f.text());
    if (!res) { toast('That file isn’t a FirstCue plan.'); return; }
    created = null; openIncoming(res.plan, res.kind);
  });
  const ask = document.querySelector('[data-act="confirm-sent"]'); if (ask && view === 'send') ask.focus({ preventScroll: true });
}

const momentOf = el => { const li = el.closest('[data-id]'); return li && P && P.moments.find(m => m.id === li.dataset.id); };

// ---------- events ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('button, a[href^="#"]'); if (!b) return;
  const d = b.dataset;
  if (b.tagName === 'A') return; // hash links handled by hashchange
  if ('closeDialog' in d) { closeDialog(); return; }
  if (d.openDialog) { openDialog(d.openDialog, b); return; }
  if (d.resolve) { resolveConflict(d.resolve); return; }
  if (d.share) {
    const [k, how] = d.share.split(':');
    const ok = await doShare(k, how);
    onShared(k, how === 'native' ? (ok ? 'native-ok' : 'cancel') : how);
    return;
  }
  if (d.go) { if (dlg) closeDialog(true); go(d.go); return; }
  if (d.act) return act(d.act, b);
  if (d.resend) { created = Store.get(d.resend); render(); window.scrollTo(0, 0); return; }
  if (d.sheetOf) { P = Store.get(d.sheetOf); role = 'dj'; view = 'sheet'; render(); window.scrollTo(0, 0); return; }
  if (d.openLocal) { P = Store.get(d.openLocal); role = 'couple'; savedAt = P.updated; view = P.started ? 'songs' : 'welcome'; openId = view === 'songs' ? firstOpen() : null; render(); window.scrollTo(0, 0); return; }
  if (d.remove) { if (armed !== d.remove) { armed = d.remove; render(); return; } Store.remove(d.remove); armed = null; render(); toast('Removed from this device'); return; }
  if (!P) return;
  if (d.leaveAll) {
    const pr = progress(P);
    pr.open.filter(m => d.leaveAll === 'all' || !m.key).forEach(m => { m.dj = true; m.r = P.clock + 1; });
    commit(); closeDialog(true); render(); toast(d.leaveAll === 'all' ? `${djName()} will choose the rest` : `${djName()} will choose the others. Key moments are still yours.`); return;
  }
  if (d.picker !== undefined) { addSeg = d.picker || null; render(); if (addSeg) { const el = document.getElementById('picker-' + addSeg); el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); refocus(`#picker-${addSeg} .chip, #other-${addSeg}`); } else refocus('.addline'); return; }
  if (d.addlib) { const [seg, label] = d.addlib.split('|'); const it = (LIBRARY[seg] || []).map(libItem).find(i => i.label === label); if (!it) return; addMoment(seg, it.label, it); render(); toast(`Added ${it.label}`); refocus(`#picker-${seg} .chip, #other-${seg}`); return; }
  if (d.addother) { const i = document.getElementById('other-' + d.addother); if (addMoment(d.addother, i.value)) { render(); toast('Added'); refocus('#other-' + d.addother); } return; }
  if (d.delM) { P.moments = P.moments.filter(m => m.id !== d.delM); P.gone = [...P.gone, d.delM]; commit('order'); render(); toast('Moment deleted'); return; }
  if (d.toggle) { openId = openId === d.toggle ? null : d.toggle; render(); const el = document.querySelector(`.scard[data-id="${d.toggle}"]`); el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); refocus(`.scard[data-id="${d.toggle}"] .shead`); return; }
  if (d.rm) { const [k, id] = d.rm.split(':'); if (!['must', 'dnp'].includes(k)) return; P[k] = P[k].filter(s => s.id !== id); P.gone = [...P.gone, id]; commit('lists'); render(); return; }
  if (d.mvs) { const [k, id, dir] = d.mvs.split(':'); if (!['must', 'dnp'].includes(k)) return; if (moveSong(P[k], id, +dir)) { commit('lists'); render(); refocus(`[data-mvs="${k}:${id}:${dir}"]`); } return; }
  if (d.swap) {
    const [k, id] = d.swap.split(':'); if (!['must', 'dnp'].includes(k)) return; const to = k === 'must' ? 'dnp' : 'must';
    if (to === 'must' && P.must.length >= MUST_MAX) { toast(`Must play holds ${MUST_MAX}. Remove one first.`); return; }
    const s = P[k].find(x => x.id === id); if (!s) return;
    P[k] = P[k].filter(x => x.id !== id); P[to].push(s); commit('lists'); render(); toast(`Moved to ${to === 'must' ? 'Must play' : 'Do not play'}`); refocus(`[data-swap="${to}:${id}"]`); return;
  }
  if (d.addbtn) { const i = document.getElementById('add-' + d.addbtn); addSong(d.addbtn, i.value); return; }
  if (d.lang) { const L = P.vibe.langs, i = L.indexOf(d.lang); i < 0 ? L.push(d.lang) : L.splice(i, 1); commit('vibe'); render(); refocus(`[data-lang="${d.lang}"]`); return; }
  if (d.genre) { const G = P.vibe.genres, i = G.indexOf(d.genre); i < 0 ? G.push(d.genre) : G.splice(i, 1); commit('vibe'); render(); refocus(`[data-genre="${CSS.escape(d.genre)}"]`); return; }
  if (d.explicit) { P.vibe.explicit = d.explicit; commit('vibe'); render(); refocus(`[data-explicit="${d.explicit}"]`); return; }
  if (d.jump) { openId = d.jump; view = 'songs'; render(); requestAnimationFrame(() => { const el = document.querySelector(`.scard[data-id="${d.jump}"]`); el && el.scrollIntoView({ block: 'center' }); }); return; }
  const m = momentOf(b); if (!m) return;
  if (d.mv) { if (moveMoment(P, m.id, +d.mv)) { commit('order'); render(); refocus(`.mrow[data-id="${m.id}"] [data-mv="${d.mv}"]`); } return; }
  if (d.end) { m.end = d.end; commit({ m }); render(); refocus(`.scard[data-id="${m.id}"] [data-end="${d.end}"]`); return; }
  if ('leave' in d) { m.dj = true; commit({ m }); const nx = nextOpen(m.id); openId = nx ? nx.id : null; render(); toast(`${djName()} will choose for ${m.label}`); return; }
  if ('pickself' in d) { m.dj = false; commit({ m }); render(); return; }
  if ('unlink' in d) { m.url = ''; commit({ m }); render(); refocus('#t-' + m.id); return; }
  if ('next' in d) {
    const nx = nextOpen(m.id); openId = nx ? nx.id : null; render();
    if (nx) { const el = document.querySelector(`.scard[data-id="${nx.id}"]`); el && el.scrollIntoView({ block: 'start', behavior: 'smooth' }); refocus(`.scard[data-id="${nx.id}"] .shead`); }
    else toast('Every moment is covered. On to the dance floor.');
  }
});
// WhatsApp and Email links don't tell us whether the message went out, so we ask afterwards.
document.addEventListener('click', e => { const a = e.target.closest('a[data-href]'); if (!a) return; const [k] = a.dataset.href.split(':'); onShared(k, 'link'); });

document.addEventListener('toggle', e => { const el = e.target; if (el.dataset && el.dataset.det) { el.open ? detOpen.add(el.dataset.det) : detOpen.delete(el.dataset.det); } }, true);

document.addEventListener('change', e => {
  const tg = e.target;
  if (tg.dataset.tick && P) { const m = P.moments.find(x => x.id === tg.dataset.tick); if (!m) return; m.off = !tg.checked; commit({ m }); render(); refocus('#on-' + m.id); }
});
document.addEventListener('focusout', e => {
  const tg = e.target;
  if (tg.dataset && 'time' in tg.dataset) {
    const m = momentOf(tg); if (!m) return;
    const v = tidyTime(tg.value).slice(0, LIMITS.time);
    if (v !== tg.value) { tg.value = v; m[tg.dataset.f] = v; commit({ m }); }
    const bad = !validTime(v);
    tg.classList.toggle('bad', bad); tg.setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (bad) toast('Times look like 1:25 (minutes:seconds)');
  }
});
document.addEventListener('input', e => {
  const tg = e.target; if (!P) return;
  if (tg.dataset.label) { const m = P.moments.find(x => x.id === tg.dataset.label); if (!m) return; m.label = tg.value.slice(0, LIMITS.label); commit({ m }); return; }
  if (tg.dataset.vibe === 'notes') { P.vibe.notes = tg.value.slice(0, LIMITS.vibeNotes); commit('vibe'); return; }
  const f = tg.dataset.f; if (!f) return;
  const m = momentOf(tg); if (!m) return;
  const v = tg.value;
  if (f === 'title' && /^\s*https?:\/\//i.test(v) && !/\s/.test(v.trim())) { tg.value = ''; m.title = ''; setMomentLink(m, v); return; }
  if (f === 'url') {
    const u = cleanUrl(v);
    m.url = u;
    const hint = document.getElementById('uh-' + m.id);
    if (hint) hint.textContent = v.trim() && !u ? 'Paste the full link, starting with https://' : '';
  } else {
    const max = { title: LIMITS.title, start: LIMITS.time, endAt: LIMITS.time, note: LIMITS.note, announce: LIMITS.announce }[f];
    if (!max) return;
    m[f] = v.slice(0, max);
  }
  commit({ m });
  if ('time' in tg.dataset && validTime(tidyTime(v))) { tg.classList.remove('bad'); tg.setAttribute('aria-invalid', 'false'); }
  refreshCard(m);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const tg = e.target;
  if (tg.dataset.addto) { e.preventDefault(); addSong(tg.dataset.addto, tg.value); }
  if (tg.dataset.other) { e.preventDefault(); document.querySelector(`[data-addother="${tg.dataset.other}"]`).click(); }
  if (tg.dataset.label) { e.preventDefault(); tg.blur(); }
});

// Drag a link (e.g. a track from the Spotify app) onto a moment card or a list.
document.addEventListener('dragover', e => { const z = e.target.closest('.scard, .flist, .addsong'); if (z && P && e.dataTransfer.types.includes('text/uri-list')) { e.preventDefault(); z.classList.add('drop'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest('.scard, .flist, .addsong'); if (z) z.classList.remove('drop'); });
document.addEventListener('drop', e => {
  const z = e.target.closest('.scard, .flist, .addsong'); if (!z || !P) return;
  const txt = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split(/\s+/).map(cleanUrl).find(Boolean);
  z.classList.remove('drop');
  if (!txt) return; e.preventDefault();
  if (z.classList.contains('scard')) { const m = momentOf(z); if (!m) return; openId = m.id; setMomentLink(m, txt); toast('Song added'); return; }
  const key = z.dataset.list || ((z.querySelector('[data-addto]') || {}).dataset || {}).addto; if (key === 'must' || key === 'dnp') addSong(key, txt);
});

// Another tab saved this plan: pick up its changes so the two tabs don't overwrite each other.
Store.onExternalChange(id => {
  if (!P || P.id !== id || P.demo || P.preview) return;
  const fresh = Store.get(id); if (!fresh || fresh.clock === P.clock) return;
  const ae = document.activeElement; const focusId = ae && ae.id;
  P = fresh; savedAt = Date.now(); render();
  if (focusId) refocus('#' + CSS.escape(focusId));
  toast('Updated with changes from another tab');
});

// The dialog closes itself on Escape. The conflict choice can't be skipped.
const dlgEl = $('#dlg');
dlgEl.addEventListener('cancel', e => { if (dlg === 'conflict') e.preventDefault(); });
dlgEl.addEventListener('close', () => { if (dlg && dlg !== 'conflict') { const o = dlgOpener; dlg = null; dlgEl.innerHTML = ''; if (o && document.contains(o)) o.focus(); } });
dlgEl.addEventListener('click', e => { if (e.target === dlgEl && dlg !== 'conflict') closeDialog(); });

async function act(a) {
  if (a === 'new-couple') { created = null; render(); window.scrollTo(0, 0); refocus('#s-names'); return; }
  if (a === 'preview-couple') { P = { ...JSON.parse(JSON.stringify(created)), preview: true }; role = 'couple'; view = 'welcome'; render(); window.scrollTo(0, 0); return; }
  if (a === 'end-preview') { P = null; view = 'setup'; role = 'dj'; render(); window.scrollTo(0, 0); return; }
  if (a === 'hide-inapp') { inAppHidden = true; render(); return; }
  if (a === 'hide-nudge') { nudgeHidden = true; render(); return; }
  if (a === 'copy-progress') { const ok = await copy(editLink(P), 'Link copied. Open it in Safari or Chrome.'); if (ok) onShared('progress', 'copy'); return; }
  if (a === 'print') { if (dlg) closeDialog(true); if (view !== 'sheet') { view = 'sheet'; render(); } setTimeout(() => window.print(), 60); return; }
  if (a === 'dl-csv') return download(`${slug()}-songs.csv`, asCSV(P), 'text/csv;charset=utf-8');
  if (a === 'dl-txt') return download(`${slug()}-songs.txt`, asText(P, editLink(P)), 'text/plain;charset=utf-8');
  if (a === 'dl-backup') { await download(`${slug()}-planner.firstcue.json`, toFile(P, 'progress'), 'application/json'); onShared('backup'); return; }
  if (a === 'dl-planfile') { await download(`${slug()}-plan.firstcue.json`, toFile(P, 'plan'), 'application/json'); onShared('plan', 'link'); return; }
  if (a === 'copytext') return copy(asText(P, editLink(P)), 'Run sheet copied');
  if (a === 'confirm-sent') { markSent(); return; }
  if (a === 'not-yet') { askSent = false; render(); return; }
  if (a === 'leave-rest') {
    const pr = progress(P);
    if (pr.open.some(m => m.key)) { openDialog('leave', document.querySelector('[data-act="leave-rest"]')); return; }
    pr.open.forEach(m => { m.dj = true; m.r = P.clock + 1; }); commit(); render(); toast(`${djName()} will choose the rest`); return;
  }
  if (a === 'send') {
    const s = SHARES.plan; if (!s) return;
    try { await navigator.share({ title: 'Our wedding song plan', text: s.text, url: s.url }); markSent(); } catch (e) { /* cancelled: the other options are right below */ }
  }
}

// ---------- start ----------
Store.migrateLegacy();
document.querySelector('#version').textContent = 'v' + VERSION;
window.addEventListener('hashchange', route);
route();
