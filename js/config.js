// All settings in one place. Change these after you deploy.
export const VERSION = '1.0.0';

// Your live address, e.g. 'https://ifunner.github.io/firstcue/' or 'https://plan.ifunner.com/'.
// Empty = use whatever address the page is opened from.
export const PUBLIC_URL = 'https://ifunner.github.io/firstcue/';

// Pre-filled the first time a DJ opens the setup page.
export const DEFAULT_DJ = { name: 'iFunner', email: '' };

export const MUST_MAX = 10;

// Links longer than this get a warning and a "download plan file" fallback.
// Some SMS apps, email scanners and QR readers cut links somewhere above this.
export const LINK_BUDGET = 4000;

// Maximum lengths and counts accepted from links, files and inputs.
export const LIMITS = {
  names: 120, djName: 80, email: 120, label: 80, title: 200, url: 600, time: 8,
  note: 1000, announce: 300, vibeNotes: 2000, tag: 40,
  moments: 60, songs: 40, tags: 20, gone: 300, devices: 12,
};
