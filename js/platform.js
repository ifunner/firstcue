// Browser and device quirks.

// In-app browsers keep their own storage, separate from Safari or Chrome. Couples who start
// inside one of these and come back in a normal browser would find an empty planner.
const IN_APP = [
  [/Instagram/i, 'Instagram'], [/FBAN|FBAV|FB_IAB/i, 'Facebook'], [/Messenger|MessengerForiOS/i, 'Messenger'],
  [/LinkedInApp/i, 'LinkedIn'], [/MicroMessenger/i, 'WeChat'], [/Line\//i, 'LINE'], [/Snapchat/i, 'Snapchat'],
  [/TikTok|musical_ly|BytedanceWebview/i, 'TikTok'], [/Twitter|TwitterAndroid/i, 'X'], [/GSA\//i, 'Google app'], [/Pinterest/i, 'Pinterest'],
];
export function inAppBrowser(ua = (globalThis.navigator && navigator.userAgent) || '') {
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  return '';
}
export const isEmbedded = () => { try { return window.self !== window.top; } catch (e) { return true; } };
export const canShare = () => !isEmbedded() && !!(globalThis.navigator && navigator.share);
export const isTouch = () => globalThis.matchMedia && matchMedia('(hover: none)').matches;

// Best-effort song title from a pasted link. Only the song link is sent, never plan content.
export async function lookupTitle(url) {
  const tries = [];
  if (/open\.spotify\.com/.test(url)) tries.push('https://open.spotify.com/oembed?url=' + encodeURIComponent(url));
  tries.push('https://noembed.com/embed?url=' + encodeURIComponent(url));
  for (const u of tries) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(u, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      const title = j && typeof j.title === 'string' ? j.title.slice(0, 200) : '';
      if (title && !j.error) return /youtu/.test(url) || !j.author_name || /spotify/.test(url) ? title : `${title} – ${String(j.author_name).slice(0, 80)}`;
    } catch (e) { /* offline or blocked: the couple types the name instead */ }
  }
  return '';
}

export function hostName(u) {
  try { const h = new URL(u).hostname.replace(/^www\.|^open\.|^music\.|^m\./, '').split('.')[0]; return { youtu: 'YouTube', youtube: 'YouTube', spotify: 'Spotify', apple: 'Apple Music', soundcloud: 'SoundCloud', tidal: 'TIDAL', deezer: 'Deezer' }[h] || h; }
  catch (e) { return 'link'; }
}
