// Project state, style templates, multi-project storage, and image storage.

import { defaultTargets, DEFAULT_FRAMES } from './presets.js';

const DB_NAME = 'screenshot-studio';
const DB_STORE = 'images';
const LS_INDEX = 'shotcraft:index:v2';
const LS_PROJECT = 'shotcraft:project:';
const LS_LEGACY = 'screenshot-studio:project:v1';

/* ------------------------------------------------------------------ images */

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(DB_STORE, mode);
        const req = fn(t.objectStore(DB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const ImageStore = {
  cache: new Map(), // id -> ImageBitmap

  get(id) {
    return id ? this.cache.get(id) || null : null;
  },

  async put(blob) {
    const id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    await tx('readwrite', (s) => s.put(blob, id));
    this.cache.set(id, await createImageBitmap(blob));
    return id;
  },

  async load(id) {
    if (!id || this.cache.has(id)) return;
    try {
      const blob = await tx('readonly', (s) => s.get(id));
      if (blob) this.cache.set(id, await createImageBitmap(blob));
    } catch (e) {
      console.warn('image load failed', id, e);
    }
  },

  async remove(id) {
    if (!id) return;
    this.cache.delete(id);
    try { await tx('readwrite', (s) => s.delete(id)); } catch (e) { /* ignore */ }
  },

  async keys() {
    try { return await tx('readonly', (s) => s.getAllKeys()); } catch (e) { return []; }
  },
};

/* ------------------------------------------------------------------ defaults */

export function newBadge() {
  return {
    on: false,
    type: 'rating',
    rating: 4.8,
    text: '',
    position: 'above',
    bg: '#ffffff',
    fg: '#ffffff',
    opacity: 18,
  };
}

export function newPanel(caption, subtitle) {
  return {
    id: 'p_' + Math.random().toString(36).slice(2, 9),
    caption: caption ?? 'Your headline goes here',
    subtitle: subtitle ?? '',
    images: { phone: null, tablet: null, desktop: null },
    layout: 'above',
    badge: newBadge(),
  };
}

export const TEMPLATES = {
  aurora: {
    label: 'Aurora',
    bg: { type: 'mesh', c1: '#7c5cff', c2: '#0b0b18', c3: '#00d4ff' },
    text: { captionColor: '#ffffff', subtitleColor: '#c6c9e0' },
    device: { color: '#1c1c1e' },
  },
  sunset: {
    label: 'Sunset',
    bg: { type: 'linear', c1: '#ff8a3d', c2: '#ff2d78', angle: 150 },
    text: { captionColor: '#ffffff', subtitleColor: '#ffe6ef' },
    device: { color: '#1c1c1e' },
  },
  minimal: {
    label: 'Minimal',
    bg: { type: 'solid', c1: '#f3f4f7', c2: '#f3f4f7' },
    text: { captionColor: '#12141c', subtitleColor: '#5c6274' },
    device: { color: '#e9eaee' },
  },
  midnight: {
    label: 'Midnight',
    bg: { type: 'radial', c1: '#1d2b53', c2: '#05060c' },
    text: { captionColor: '#ffffff', subtitleColor: '#9aa3bd' },
    device: { color: '#0e0f13' },
  },
  mint: {
    label: 'Mint',
    bg: { type: 'linear', c1: '#3ee9a4', c2: '#0f766e', angle: 160 },
    text: { captionColor: '#04231c', subtitleColor: '#0a3f34' },
    device: { color: '#0b1f1a' },
  },
  candy: {
    label: 'Candy',
    bg: { type: 'mesh', c1: '#ff5fa2', c2: '#fff3f8', c3: '#7dd3fc' },
    text: { captionColor: '#26102a', subtitleColor: '#6b3f6f' },
    device: { color: '#2a1b2e' },
  },
  slate: {
    label: 'Slate',
    bg: { type: 'linear', c1: '#334155', c2: '#0f172a', angle: 135 },
    text: { captionColor: '#f8fafc', subtitleColor: '#94a3b8' },
    device: { color: '#1c1c1e' },
  },
  gold: {
    label: 'Gold',
    bg: { type: 'linear', c1: '#f6d365', c2: '#b45309', angle: 145 },
    text: { captionColor: '#2b1a02', subtitleColor: '#573401' },
    device: { color: '#221703' },
  },
};

/**
 * Complete five-screen starter sets: a colour theme, a layout rhythm, and a
 * headline skeleton that says what belongs on each screen. Applying one keeps
 * whatever screenshots are already in place.
 */
export const STARTER_SETS = {
  ladder: {
    label: 'Benefit ladder',
    note: 'Promise first, then the features that back it up. The safest structure.',
    template: 'aurora',
    style: { text: { align: 'center', captionSize: 0.075 } },
    panels: [
      { caption: 'The outcome\nthey want', subtitle: 'Say the result, not the feature', layout: 'above', badge: { on: true, type: 'rating', rating: 4.8, text: 'App Store' } },
      { caption: 'Your strongest\nfeature', subtitle: 'What it does for them, in one line', layout: 'above' },
      { caption: 'The second\nreason to stay', subtitle: 'Keep every screen to a single idea', layout: 'above' },
      { caption: 'Why they can\ntrust you', subtitle: 'Numbers, awards or a real review', layout: 'above' },
      { caption: 'Free to try\ntonight', subtitle: 'Tell them the next step', layout: 'above' },
    ],
  },
  problem: {
    label: 'Problem → solution',
    note: 'Name the pain on screen one, fix it on screen two. Strong for utilities.',
    template: 'sunset',
    style: { text: { align: 'left', captionSize: 0.08 } },
    panels: [
      { caption: 'Still doing it\nthe hard way?', subtitle: 'Name the pain they already feel', layout: 'above' },
      { caption: 'Here is\nthe fix', subtitle: 'Your solution in one sentence', layout: 'above' },
      { caption: 'Three taps,\ndone', subtitle: 'The simplest explanation of how', layout: 'above' },
      { caption: 'Loved by\nthousands', subtitle: 'Social proof belongs here', layout: 'above', badge: { on: true, type: 'rating', rating: 4.9, text: '12,000 users' } },
      { caption: 'Start\ntoday', subtitle: 'Your call to action', layout: 'above' },
    ],
  },
  tour: {
    label: 'Feature tour',
    note: 'One feature per screen, dark and technical. Good for pro tools.',
    template: 'midnight',
    style: { text: { align: 'center', captionSize: 0.073 }, device: { scale: 1.05 } },
    panels: [
      { caption: 'Everything in\none place', subtitle: 'What the app is, in one line', layout: 'above' },
      { caption: 'Feature one', subtitle: 'Name it the way a user would', layout: 'below' },
      { caption: 'Feature two', subtitle: 'Show the screen that proves it', layout: 'below' },
      { caption: 'Feature three', subtitle: 'Stop at five screens', layout: 'below' },
      { caption: 'Yours in\none tap', subtitle: 'Close with the download', layout: 'above' },
    ],
  },
  bold: {
    label: 'Bold statement',
    note: 'Huge type over the screenshot. Highest impact at thumbnail size.',
    template: 'candy',
    style: { text: { align: 'left', captionSize: 0.095, subtitleSize: 0.034, tracking: -0.035 }, padding: 0.065 },
    panels: [
      { caption: 'Sleep.\nFinally.', subtitle: 'Two or three words, no more', layout: 'overlay' },
      { caption: 'One tap.', subtitle: 'Let the screenshot do the talking', layout: 'overlay' },
      { caption: 'Every night.', subtitle: 'Keep the rhythm across screens', layout: 'overlay' },
      { caption: 'Trusted.', subtitle: 'Proof goes on this one', layout: 'overlay', badge: { on: true, type: 'pill', text: 'Editor’s Choice' } },
      { caption: 'Free.', subtitle: 'The last word is the offer', layout: 'overlay' },
    ],
  },
  clean: {
    label: 'Clean & light',
    note: 'Light background, calm type. Reads well next to colourful competitors.',
    template: 'minimal',
    style: { text: { align: 'center', captionSize: 0.072, subtitleSize: 0.034 }, device: { shadow: 0.5 }, padding: 0.085 },
    panels: [
      { caption: 'The one thing\nyou do best', subtitle: 'Plain words beat clever words', layout: 'above' },
      { caption: 'Simple\nby design', subtitle: 'Say what makes it easy', layout: 'above' },
      { caption: 'Made for\nevery day', subtitle: 'Show the routine it fits into', layout: 'above' },
      { caption: 'People\nstay', subtitle: 'Retention or rating proof', layout: 'above', badge: { on: true, type: 'rating', rating: 4.7, text: '' } },
      { caption: 'Download\nfree', subtitle: 'One clear next step', layout: 'none' },
    ],
  },
};

export function defaultStyle() {
  return {
    padding: 0.075,
    bg: { type: 'mesh', c1: '#7c5cff', c2: '#0b0b18', c3: '#00d4ff', angle: 135, imageId: null, blur: 0, dim: 30 },
    text: {
      font: 'Inter',
      captionSize: 0.075,
      subtitleSize: 0.036,
      badgeSize: 0.026,
      captionWeight: 800,
      subtitleWeight: 500,
      captionColor: '#ffffff',
      subtitleColor: '#c6c9e0',
      align: 'center',
      lineHeight: 1.18,
      tracking: -0.02,
      shadow: false,
    },
    device: {
      frames: { ...DEFAULT_FRAMES },
      color: '#1c1c1e',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotate: 0,
      shadow: 0.8,
      gloss: true,
    },
    statusBar: { mode: 'off', time: '9:41', cover: 'auto', coverColor: '#0b0b18' },
  };
}

export function defaultProject(name) {
  return {
    id: 'prj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    version: 2,
    name: name || 'My App',
    activeTemplate: 'aurora',
    style: defaultStyle(),
    panels: [
      newPanel('Sleep better,\nfrom night one', 'Gentle sounds that actually work'),
      newPanel('Pick a sound\nin one tap', 'Twelve studio-quality loops'),
      newPanel('Set it and\nforget it', 'Timers, fades and offline playback'),
    ],
    activePanel: 0,
    targets: defaultTargets(),
    previewPreset: 'ios-69',
  };
}

/* ------------------------------------------------------------------ normalize / migrate */

function normalizePanel(p) {
  const base = newPanel('', '');
  const images = p.images && typeof p.images === 'object'
    ? { phone: p.images.phone || null, tablet: p.images.tablet || null, desktop: p.images.desktop || null }
    : { phone: p.imageId || null, tablet: null, desktop: null }; // v1
  return {
    ...base,
    ...p,
    images,
    badge: { ...newBadge(), ...(p.badge || {}) },
  };
}

export function normalizeProject(p) {
  const base = defaultProject();
  const style = p.style || {};
  const frames = style.device && style.device.frames
    ? { ...DEFAULT_FRAMES, ...style.device.frames }
    : { ...DEFAULT_FRAMES, phone: (style.device && style.device.frame) || DEFAULT_FRAMES.phone }; // v1
  return {
    ...base,
    ...p,
    id: p.id || base.id,
    version: 2,
    style: {
      ...base.style,
      ...style,
      bg: { ...base.style.bg, ...(style.bg || {}) },
      text: { ...base.style.text, ...(style.text || {}) },
      device: { ...base.style.device, ...(style.device || {}), frames },
      statusBar: { ...base.style.statusBar, ...(style.statusBar || {}) },
    },
    panels: (Array.isArray(p.panels) && p.panels.length ? p.panels : base.panels).map(normalizePanel),
    activePanel: Math.max(0, Math.min(p.activePanel || 0, (p.panels || base.panels).length - 1)),
    targets: Array.isArray(p.targets) ? p.targets : base.targets,
  };
}

/** Every image id a project references. */
export function projectImageIds(project) {
  const ids = new Set();
  for (const p of project.panels) {
    for (const k of ['phone', 'tablet', 'desktop']) if (p.images[k]) ids.add(p.images[k]);
  }
  if (project.style.bg.imageId) ids.add(project.style.bg.imageId);
  return ids;
}

/* ------------------------------------------------------------------ project storage */

function readIndex() {
  try {
    const raw = localStorage.getItem(LS_INDEX);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return null;
}

function writeIndex(idx) {
  try { localStorage.setItem(LS_INDEX, JSON.stringify(idx)); } catch (e) { console.warn('index save failed', e); }
}

export const Projects = {
  index() {
    let idx = readIndex();
    if (idx && Array.isArray(idx.items) && idx.items.length) return idx;

    // First run, or migrating a v1 single-project install.
    let first = null;
    try {
      const legacy = localStorage.getItem(LS_LEGACY);
      if (legacy) {
        first = normalizeProject(JSON.parse(legacy));
        localStorage.removeItem(LS_LEGACY);
      }
    } catch (e) { /* ignore */ }
    if (!first) first = defaultProject();

    this.write(first);
    idx = { activeId: first.id, items: [{ id: first.id, name: first.name, updatedAt: Date.now() }] };
    writeIndex(idx);
    return idx;
  },

  list() {
    return this.index().items;
  },

  activeId() {
    const idx = this.index();
    return idx.items.some((i) => i.id === idx.activeId) ? idx.activeId : idx.items[0].id;
  },

  setActive(id) {
    const idx = this.index();
    idx.activeId = id;
    writeIndex(idx);
  },

  read(id) {
    try {
      const raw = localStorage.getItem(LS_PROJECT + id);
      if (raw) return normalizeProject(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return null;
  },

  write(project) {
    try {
      localStorage.setItem(LS_PROJECT + project.id, JSON.stringify(project));
    } catch (e) {
      console.warn('project save failed', e);
      return;
    }
    const idx = readIndex();
    if (!idx) return;
    const row = idx.items.find((i) => i.id === project.id);
    if (row) {
      row.name = project.name;
      row.updatedAt = Date.now();
    } else {
      idx.items.push({ id: project.id, name: project.name, updatedAt: Date.now() });
    }
    writeIndex(idx);
  },

  loadActive() {
    const idx = this.index();
    const id = this.activeId();
    const p = this.read(id);
    if (p) return p;
    const fresh = defaultProject();
    this.write(fresh);
    idx.activeId = fresh.id;
    idx.items = [{ id: fresh.id, name: fresh.name, updatedAt: Date.now() }];
    writeIndex(idx);
    return fresh;
  },

  create(name, cloneFrom) {
    const p = cloneFrom
      ? normalizeProject({
          ...JSON.parse(JSON.stringify(cloneFrom)),
          id: 'prj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          name,
        })
      : defaultProject(name);
    this.write(p);
    this.setActive(p.id);
    return p;
  },

  async remove(id) {
    const idx = this.index();
    if (idx.items.length <= 1) return false;
    const gone = this.read(id);
    localStorage.removeItem(LS_PROJECT + id);
    idx.items = idx.items.filter((i) => i.id !== id);
    if (idx.activeId === id) idx.activeId = idx.items[0].id;
    writeIndex(idx);

    // Drop images no surviving project references.
    if (gone) {
      const keep = new Set();
      for (const row of idx.items) {
        const p = this.read(row.id);
        if (p) for (const imgId of projectImageIds(p)) keep.add(imgId);
      }
      for (const imgId of projectImageIds(gone)) {
        if (!keep.has(imgId)) await ImageStore.remove(imgId);
      }
    }
    return true;
  },

  rename(id, name) {
    const p = this.read(id);
    if (!p) return;
    p.name = name;
    this.write(p);
  },
};
