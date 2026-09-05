// Store screenshot size presets.
// Sizes follow Apple App Store Connect and Google Play Console requirements.

// A panel carries one screenshot per device class, and each class gets its own
// frame — so an iPad export never shows an iPhone.
export const DEVICE_CLASSES = {
  phone:   { label: 'Phone',   ar: 1290 / 2796 },
  tablet:  { label: 'Tablet',  ar: 2048 / 2732 },
  desktop: { label: 'Desktop', ar: 1600 / 1000 },
};

export const PRESETS = [
  // ---- App Store / iPhone ----
  { id: 'ios-69',      store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '6.9" iPhone',            w: 1290, h: 2796, required: true,  on: true },
  { id: 'ios-69-alt',  store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '6.9" iPhone (alt)',      w: 1320, h: 2868 },
  { id: 'ios-67',      store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '6.7" iPhone',            w: 1284, h: 2778, on: true },
  { id: 'ios-65',      store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '6.5" iPhone',            w: 1242, h: 2688 },
  { id: 'ios-61',      store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '6.1" iPhone',            w: 1179, h: 2556 },
  { id: 'ios-55',      store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '5.5" iPhone (legacy)',   w: 1242, h: 2208 },
  { id: 'ios-69-l',    store: 'App Store',      group: 'iPhone', cls: 'phone',   name: '6.9" iPhone landscape',  w: 2796, h: 1290 },

  // ---- App Store / iPad ----
  { id: 'ipad-13',     store: 'App Store',      group: 'iPad',   cls: 'tablet',  name: '13" iPad',               w: 2064, h: 2752, required: true },
  { id: 'ipad-129',    store: 'App Store',      group: 'iPad',   cls: 'tablet',  name: '12.9" iPad Pro',         w: 2048, h: 2732 },
  { id: 'ipad-11',     store: 'App Store',      group: 'iPad',   cls: 'tablet',  name: '11" iPad Pro',           w: 1668, h: 2388 },
  { id: 'ipad-13-l',   store: 'App Store',      group: 'iPad',   cls: 'tablet',  name: '13" iPad landscape',     w: 2752, h: 2064 },

  // ---- Mac App Store ----
  { id: 'mac-1280',    store: 'Mac App Store',  group: 'Mac',    cls: 'desktop', name: 'Mac 1280 x 800',         w: 1280, h: 800 },
  { id: 'mac-1440',    store: 'Mac App Store',  group: 'Mac',    cls: 'desktop', name: 'Mac 1440 x 900',         w: 1440, h: 900 },
  { id: 'mac-2560',    store: 'Mac App Store',  group: 'Mac',    cls: 'desktop', name: 'Mac 2560 x 1600',        w: 2560, h: 1600 },
  { id: 'mac-2880',    store: 'Mac App Store',  group: 'Mac',    cls: 'desktop', name: 'Mac 2880 x 1800',        w: 2880, h: 1800 },

  // ---- Google Play ----
  { id: 'play-phone',    store: 'Google Play', group: 'Phone',    cls: 'phone',  name: 'Phone 1080 x 1920',   w: 1080, h: 1920, required: true, on: true },
  { id: 'play-phone-hi', store: 'Google Play', group: 'Phone',    cls: 'phone',  name: 'Phone 1440 x 2560',   w: 1440, h: 2560 },
  { id: 'play-phone-l',  store: 'Google Play', group: 'Phone',    cls: 'phone',  name: 'Phone landscape',     w: 1920, h: 1080 },
  { id: 'play-tab7',     store: 'Google Play', group: 'Tablet',   cls: 'tablet', name: '7" Tablet',           w: 1200, h: 1920 },
  { id: 'play-tab10',    store: 'Google Play', group: 'Tablet',   cls: 'tablet', name: '10" Tablet',          w: 1600, h: 2560 },
  { id: 'play-tab10-l',  store: 'Google Play', group: 'Tablet',   cls: 'tablet', name: '10" Tablet landscape',w: 2560, h: 1600 },
  { id: 'play-feature',  store: 'Google Play', group: 'Graphics', cls: 'phone',  name: 'Feature Graphic',     w: 1024, h: 500, required: true },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

export function defaultTargets() {
  return PRESETS.filter((p) => p.on).map((p) => p.id);
}

export function groupPresets() {
  const stores = new Map();
  for (const p of PRESETS) {
    if (!stores.has(p.store)) stores.set(p.store, new Map());
    const groups = stores.get(p.store);
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  return stores;
}

/** Which device classes the given target ids need a screenshot for. */
export function classesForTargets(targetIds) {
  const set = new Set();
  for (const id of targetIds) {
    const p = PRESET_BY_ID[id];
    if (p) set.add(p.cls);
  }
  return set;
}

// Device frames. bezel + radius are fractions of the device outer width.
// `cls` limits which device class a frame can be used for.
export const FRAMES = {
  iphone: { label: 'iPhone',   cls: 'phone',   ar: 1290 / 2796, bezel: 0.030, radius: 0.140, island: true, buttons: true, statusBar: 'ios' },
  android:{ label: 'Android',  cls: 'phone',   ar: 1080 / 2400, bezel: 0.024, radius: 0.105, punch: true,  buttons: true, statusBar: 'android' },
  ipad:   { label: 'iPad',     cls: 'tablet',  ar: 2048 / 2732, bezel: 0.038, radius: 0.055, buttons: false },
  laptop: { label: 'Laptop',   cls: 'desktop', ar: 1600 / 1000, bezel: 0.018, radius: 0.022, base: true },
  bare:   { label: 'No frame', cls: 'any',     ar: null,        bezel: 0,     radius: 0.055 },
};

export function framesForClass(cls) {
  return Object.entries(FRAMES).filter(([, f]) => f.cls === cls || f.cls === 'any');
}

export const DEFAULT_FRAMES = { phone: 'iphone', tablet: 'ipad', desktop: 'laptop' };

export const FONTS = [
  { id: 'Inter',           label: 'Inter' },
  { id: 'Poppins',         label: 'Poppins' },
  { id: 'Montserrat',      label: 'Montserrat' },
  { id: 'DM Sans',         label: 'DM Sans' },
  { id: 'Space Grotesk',   label: 'Space Grotesk' },
  { id: 'Nunito',          label: 'Nunito' },
  { id: 'Playfair Display',label: 'Playfair Display' },
  { id: 'system-ui',       label: 'System' },
];
