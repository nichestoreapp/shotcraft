import {
  PRESETS, PRESET_BY_ID, FONTS, DEVICE_CLASSES,
  groupPresets, classesForTargets, framesForClass,
} from './presets.js';
import { renderPanel, computeLayout, frameForClass, hexLuminance, luminance, contrastRatio } from './render.js';
import {
  ImageStore, Projects, TEMPLATES, STARTER_SETS, defaultProject,
  newPanel, newBadge, projectImageIds,
} from './store.js';
import { makeZip, download } from './zip.js';

const $ = (id) => document.getElementById(id);
const CLASSES = ['phone', 'tablet', 'desktop'];

let project = Projects.loadActive();
let history = [];
let saveTimer = null;
let renderTimer = null;
let slotTarget = null; // which device class a file picker is filling

/* ------------------------------------------------------------------ helpers */

const S = () => project.style;
const panel = () => project.panels[project.activePanel] || project.panels[0];

function previewSize() {
  return PRESET_BY_ID[project.previewPreset] || PRESET_BY_ID['ios-69'];
}
function previewClass() {
  return previewSize().cls;
}

function toast(msg, ms = 1900) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, ms);
}

function snapshot() {
  history.push(JSON.stringify(project));
  if (history.length > 60) history.shift();
}

function undo() {
  const prev = history.pop();
  if (!prev) return toast('Nothing to undo');
  project = JSON.parse(prev);
  renderStarterSets();
  renderTemplates();
  renderPanelList();
  renderSlots();
  syncControls();
  renderAll();
  Projects.write(project);
  toast('Undone');
}

function schedule() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAll, 16);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => Projects.write(project), 400);
}

function canvasToBlob(canvas, format, quality) {
  return new Promise((res) => canvas.toBlob(res, 'image/' + format, quality));
}

function slug(s) {
  return String(s).trim().replace(/[^\w\d\-. ]+/g, '').replace(/\s+/g, ' ').slice(0, 60) || 'Screenshots';
}

async function ensureFont(family) {
  if (family === 'system-ui' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 40px "' + family + '"'),
      document.fonts.load('700 40px "' + family + '"'),
      document.fonts.load('800 40px "' + family + '"'),
      document.fonts.load('900 40px "' + family + '"'),
    ]);
  } catch (e) { /* font just falls back */ }
}

/* ------------------------------------------------------------------ rendering */

const previewCanvas = $('preview');
const pctx = previewCanvas.getContext('2d', { willReadFrequently: true });

function fitPreview() {
  const area = $('stageArea');
  const p = previewSize();
  const zoom = Number($('zoom').value) / 100;
  const availW = Math.max(120, area.clientWidth - 34);
  const availH = Math.max(120, area.clientHeight - 34);
  const s = Math.min(availW / p.w, availH / p.h) * zoom;
  const cssW = Math.max(60, Math.round(p.w * s));
  const cssH = Math.max(60, Math.round(p.h * s));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  previewCanvas.style.width = cssW + 'px';
  previewCanvas.style.height = cssH + 'px';
  previewCanvas.width = Math.round(cssW * dpr);
  previewCanvas.height = Math.round(cssH * dpr);
  $('previewDims').textContent = p.w + ' × ' + p.h;
  $('previewClass').textContent = DEVICE_CLASSES[p.cls].label;
}

function renderPreview() {
  fitPreview();
  renderPanel(pctx, previewCanvas.width, previewCanvas.height, panel(), S(), ImageStore, previewClass());
  positionHandle();
}

function renderAll() {
  renderPreview();
  renderThumbs();
  renderStrip();
  $('panelCounter').textContent = (project.activePanel + 1) + ' / ' + project.panels.length;
  updateExportSummary();
  updateCaptionMeter();
  if (!$('bulkModal').hidden) refreshBulkStats();
}

/* ------------------------------------------------------------------ panel list */

function renderPanelList() {
  const list = $('panelList');
  list.innerHTML = '';
  project.panels.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'panel-item' + (i === project.activePanel ? ' active' : '') + (i < 2 ? ' hero' : '');
    item.draggable = true;
    item.dataset.index = String(i);

    const c = document.createElement('canvas');
    c.width = 68; c.height = 148;
    item.appendChild(c);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const idx = document.createElement('div');
    idx.className = 'idx';
    idx.textContent = i < 2 ? 'Screen ' + (i + 1) + ' · sells' : 'Screen ' + (i + 1);
    meta.appendChild(idx);
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = (p.caption || '').replace(/\n/g, ' ') || 'Untitled';
    meta.appendChild(cap);
    item.appendChild(meta);

    const acts = document.createElement('div');
    acts.className = 'acts';
    const dup = document.createElement('button');
    dup.textContent = 'Copy';
    dup.onclick = (e) => {
      e.stopPropagation();
      snapshot();
      const clone = JSON.parse(JSON.stringify(p));
      clone.id = 'p_' + Math.random().toString(36).slice(2, 9);
      project.panels.splice(i + 1, 0, clone);
      project.activePanel = i + 1;
      renderPanelList(); renderSlots(); syncControls(); schedule();
    };
    const del = document.createElement('button');
    del.textContent = 'Del';
    del.onclick = (e) => {
      e.stopPropagation();
      if (project.panels.length === 1) return toast('Keep at least one screen');
      snapshot();
      project.panels.splice(i, 1);
      project.activePanel = Math.min(project.activePanel, project.panels.length - 1);
      renderPanelList(); renderSlots(); syncControls(); schedule();
    };
    acts.append(dup, del);
    item.appendChild(acts);

    item.onclick = () => selectPanel(i);

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isNaN(from) || from === i) return;
      snapshot();
      const [moved] = project.panels.splice(from, 1);
      project.panels.splice(i, 0, moved);
      project.activePanel = i;
      renderPanelList(); renderSlots(); syncControls(); schedule();
    });

    list.appendChild(item);
  });
  renderThumbs();
}

function selectPanel(i) {
  project.activePanel = i;
  renderPanelList();
  renderSlots();
  syncControls();
  schedule();
}

function renderThumbs() {
  const cls = previewClass();
  $('panelList').querySelectorAll('.panel-item').forEach((item) => {
    const i = Number(item.dataset.index);
    const c = item.querySelector('canvas');
    if (!c || !project.panels[i]) return;
    renderPanel(c.getContext('2d'), c.width, c.height, project.panels[i], S(), ImageStore, cls);
  });
}

/* ------------------------------------------------------------------ store preview strip */

// Display width of a strip thumbnail, and the width a real store search
// result is shown at — the legibility check must model the store, not our UI.
const STRIP_W = 96;
const STORE_REF_W = 110;

function renderStrip() {
  const strip = $('storeStrip');
  if (strip.hidden) return;
  const p = previewSize();
  const w = STRIP_W;
  const h = Math.round((w * p.h) / p.w);
  const row = $('stripRow');
  row.innerHTML = '';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  project.panels.forEach((pn, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'strip-item' + (i === project.activePanel ? ' active' : '');
    const c = document.createElement('canvas');
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    renderPanel(c.getContext('2d'), c.width, c.height, pn, S(), ImageStore, p.cls);
    wrap.appendChild(c);
    const n = document.createElement('span');
    n.textContent = String(i + 1);
    wrap.appendChild(n);
    wrap.onclick = () => selectPanel(i);
    row.appendChild(wrap);
  });

  renderLegibility(p);
}

function sampleLuma(ctx, x, y) {
  try {
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return luminance(d[0], d[1], d[2]);
  } catch (e) {
    return null;
  }
}

function renderLegibility(preset) {
  const box = $('legibility');
  box.innerHTML = '';
  const t = S().text;
  const w = STORE_REF_W;
  const h = Math.round((w * preset.h) / preset.w);
  const base = Math.min(w, h);
  const capPx = t.captionSize * base;
  const words = (panel().caption || '').trim().split(/\s+/).filter(Boolean).length;

  const warns = [];
  if (words && capPx < 7.5) warns.push(['Headline is ' + capPx.toFixed(1) + 'px here — too small to read', 'bad']);
  if (words > 7) warns.push([words + ' words — aim for 5 or fewer', 'warn']);

  // Contrast against the background beside the headline.
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  const cx = c.getContext('2d', { willReadFrequently: true });
  renderPanel(cx, c.width, c.height, panel(), S(), ImageStore, previewClass());
  const layout = panel().layout || 'above';
  const bandY = layout === 'below' ? c.height * 0.88 : c.height * 0.12;
  const samples = [sampleLuma(cx, c.width * 0.04, bandY), sampleLuma(cx, c.width * 0.96, bandY)]
    .filter((v) => v !== null);
  if (words && samples.length) {
    const bgL = samples.reduce((a, b) => a + b, 0) / samples.length;
    const ratio = contrastRatio(hexLuminance(t.captionColor), bgL);
    if (ratio < 3) warns.push(['Low contrast (' + ratio.toFixed(1) + ':1) — needs 3:1', 'bad']);
  }

  if (!warns.length) {
    const ok = document.createElement('span');
    ok.className = 'leg ok';
    ok.textContent = 'Reads well at store size';
    box.appendChild(ok);
    return;
  }
  for (const pair of warns) {
    const el = document.createElement('span');
    el.className = 'leg ' + pair[1];
    el.textContent = pair[0];
    box.appendChild(el);
  }
}

function updateCaptionMeter() {
  const words = (panel().caption || '').trim().split(/\s+/).filter(Boolean).length;
  const el = $('captionMeter');
  el.textContent = words + (words === 1 ? ' word' : ' words') + ' · aim for 5 or fewer. Enter makes a line break.';
  el.classList.toggle('warn', words > 7);
}

/* ------------------------------------------------------------------ image slots */

function renderSlots() {
  const wrap = $('imageSlots');
  wrap.innerHTML = '';
  const needed = classesForTargets(project.targets);
  const counts = {};
  for (const id of project.targets) {
    const p = PRESET_BY_ID[id];
    if (p) counts[p.cls] = (counts[p.cls] || 0) + 1;
  }

  for (const cls of CLASSES) {
    const info = DEVICE_CLASSES[cls];
    const id = panel().images[cls];
    const row = document.createElement('div');
    row.className = 'slot' + (cls === previewClass() ? ' current' : '');

    const thumb = document.createElement('canvas');
    const tw = 36;
    const th = Math.round(tw / info.ar);
    thumb.width = tw * 2;
    thumb.height = th * 2;
    thumb.style.width = tw + 'px';
    thumb.style.height = th + 'px';
    const tctx = thumb.getContext('2d');
    tctx.fillStyle = '#0e1017';
    tctx.fillRect(0, 0, thumb.width, thumb.height);
    const img = ImageStore.get(id);
    if (img) {
      const s = Math.max(thumb.width / img.width, thumb.height / img.height);
      tctx.drawImage(img, (thumb.width - img.width * s) / 2, (thumb.height - img.height * s) / 2, img.width * s, img.height * s);
    }
    row.appendChild(thumb);

    const meta = document.createElement('div');
    meta.className = 'slot-meta';
    const title = document.createElement('div');
    title.className = 'slot-title';
    title.textContent = info.label;
    meta.appendChild(title);
    const sub = document.createElement('div');
    const n = counts[cls] || 0;
    let subClass = 'slot-sub';
    if (id) {
      sub.textContent = n ? 'used by ' + n + ' selected size' + (n === 1 ? '' : 's') : 'no size selected';
    } else if (needed.has(cls) && panel().images.phone) {
      sub.textContent = 'falls back to the phone shot';
      subClass += ' warn';
    } else if (needed.has(cls)) {
      sub.textContent = 'missing — ' + n + ' size' + (n === 1 ? '' : 's') + ' need it';
      subClass += ' bad';
    } else {
      sub.textContent = 'not needed right now';
    }
    sub.className = subClass;
    meta.appendChild(sub);
    row.appendChild(meta);

    const acts = document.createElement('div');
    acts.className = 'slot-acts';
    const pick = document.createElement('button');
    pick.className = 'mini';
    pick.textContent = id ? 'Replace' : 'Add';
    pick.onclick = () => { slotTarget = cls; $('fileImage').click(); };
    acts.appendChild(pick);
    if (id) {
      const clear = document.createElement('button');
      clear.className = 'mini';
      clear.textContent = 'Clear';
      clear.onclick = () => clearSlot(cls);
      acts.appendChild(clear);
    }
    row.appendChild(acts);

    wrap.appendChild(row);
  }
}

async function setSlotImage(cls, file) {
  if (!file || !file.type.startsWith('image/')) return;
  snapshot();
  const old = panel().images[cls];
  panel().images[cls] = await ImageStore.put(file);
  await gcImage(old);
  renderPanelList(); renderSlots(); schedule();
  toast(DEVICE_CLASSES[cls].label + ' screenshot added');
}

async function clearSlot(cls) {
  snapshot();
  const old = panel().images[cls];
  panel().images[cls] = null;
  await gcImage(old);
  renderPanelList(); renderSlots(); schedule();
}

async function gcImage(id) {
  if (!id) return;
  if (!projectImageIds(project).has(id)) await ImageStore.remove(id);
}

/* ------------------------------------------------------------------ control wiring */

function bindRange(id, get, set, format) {
  const el = $(id);
  const out = $(id + 'Val');
  const show = () => { if (out) out.textContent = format(Number(el.value)); };
  el.addEventListener('input', () => { set(Number(el.value)); show(); schedule(); });
  el.addEventListener('change', () => snapshot());
  el._sync = () => { el.value = String(get()); show(); };
  return el;
}

function bindColor(id, get, set) {
  const el = $(id);
  el.addEventListener('input', () => { set(el.value); schedule(); });
  el.addEventListener('change', () => snapshot());
  el._sync = () => { el.value = get(); };
  return el;
}

function bindSeg(id, get, set, after) {
  const wrap = $(id);
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    snapshot();
    set(b.dataset.v);
    wrap._sync();
    if (after) after();
    schedule();
  });
  wrap._sync = () => {
    wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === get()));
  };
  return wrap;
}

const controls = [];

controls.push(bindRange('capSize', () => Math.round(S().text.captionSize * 1000), (v) => (S().text.captionSize = v / 1000), (v) => (v / 10).toFixed(1) + '%'));
controls.push(bindRange('subSize', () => Math.round(S().text.subtitleSize * 1000), (v) => (S().text.subtitleSize = v / 1000), (v) => (v / 10).toFixed(1) + '%'));
controls.push(bindRange('capWeight', () => S().text.captionWeight, (v) => (S().text.captionWeight = v), (v) => String(v)));
controls.push(bindRange('lineHeight', () => Math.round(S().text.lineHeight * 100), (v) => (S().text.lineHeight = v / 100), (v) => (v / 100).toFixed(2)));
controls.push(bindRange('tracking', () => Math.round(S().text.tracking * 100), (v) => (S().text.tracking = v / 100), (v) => (v / 100).toFixed(2)));
controls.push(bindRange('padding', () => Math.round(S().padding * 1000), (v) => (S().padding = v / 1000), (v) => (v / 10).toFixed(1) + '%'));
controls.push(bindRange('bgAngle', () => S().bg.angle ?? 135, (v) => (S().bg.angle = v), (v) => v + '°'));
controls.push(bindRange('bgBlur', () => S().bg.blur || 0, (v) => (S().bg.blur = v), (v) => String(v)));
controls.push(bindRange('bgDim', () => S().bg.dim || 0, (v) => (S().bg.dim = v), (v) => String(v)));
controls.push(bindRange('devScale', () => Math.round(S().device.scale * 100), (v) => (S().device.scale = v / 100), (v) => v + '%'));
controls.push(bindRange('devX', () => Math.round(S().device.offsetX * 100), (v) => (S().device.offsetX = v / 100), (v) => String(v)));
controls.push(bindRange('devY', () => Math.round(S().device.offsetY * 100), (v) => (S().device.offsetY = v / 100), (v) => String(v)));
controls.push(bindRange('devRot', () => S().device.rotate, (v) => (S().device.rotate = v), (v) => v + '°'));
controls.push(bindRange('devShadow', () => Math.round(S().device.shadow * 100), (v) => (S().device.shadow = v / 100), (v) => v + '%'));
controls.push(bindRange('badgeOpacity', () => panel().badge.opacity ?? 18, (v) => (panel().badge.opacity = v), (v) => String(v)));

controls.push(bindColor('bgC1', () => S().bg.c1, (v) => (S().bg.c1 = v)));
controls.push(bindColor('bgC2', () => S().bg.c2, (v) => (S().bg.c2 = v)));
controls.push(bindColor('bgC3', () => S().bg.c3 || '#00d4ff', (v) => (S().bg.c3 = v)));
controls.push(bindColor('capColor', () => S().text.captionColor, (v) => (S().text.captionColor = v)));
controls.push(bindColor('subColor', () => S().text.subtitleColor, (v) => (S().text.subtitleColor = v)));
controls.push(bindColor('frameColor', () => S().device.color, (v) => (S().device.color = v)));
controls.push(bindColor('badgeFg', () => panel().badge.fg || '#ffffff', (v) => (panel().badge.fg = v)));
controls.push(bindColor('badgeBg', () => panel().badge.bg || '#ffffff', (v) => (panel().badge.bg = v)));
controls.push(bindColor('sbCover', () => S().statusBar.coverColor || '#0b0b18', (v) => {
  S().statusBar.coverColor = v;
  if ($('sbCoverMode').value === 'custom') S().statusBar.cover = v;
}));

controls.push(bindSeg('alignSeg', () => S().text.align, (v) => (S().text.align = v)));
controls.push(bindSeg('layoutSeg', () => panel().layout || 'above', (v) => (panel().layout = v)));
controls.push(bindSeg('badgeTypeSeg', () => panel().badge.type, (v) => (panel().badge.type = v), updateBadgeVisibility));
controls.push(bindSeg('badgePosSeg', () => panel().badge.position, (v) => (panel().badge.position = v)));

/* selects */

function fillSelect(el, items, value) {
  el.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.value;
    o.textContent = it.label;
    el.appendChild(o);
  }
  el.value = value;
}

fillSelect($('fontFamily'), FONTS.map((f) => ({ value: f.id, label: f.label })), S().text.font);
$('fontFamily').addEventListener('change', async () => {
  snapshot();
  S().text.font = $('fontFamily').value;
  await ensureFont(S().text.font);
  schedule();
});

const FRAME_SELECTS = { phone: 'framePhone', tablet: 'frameTablet', desktop: 'frameDesktop' };
for (const cls of CLASSES) {
  const el = $(FRAME_SELECTS[cls]);
  fillSelect(el, framesForClass(cls).map((e) => ({ value: e[0], label: e[1].label })), frameForClass(S(), cls));
  el.addEventListener('change', () => {
    snapshot();
    S().device.frames[cls] = el.value;
    schedule();
  });
}

$('bgType').addEventListener('change', () => {
  snapshot();
  S().bg.type = $('bgType').value;
  updateBgVisibility();
  schedule();
});

function updateBgVisibility() {
  const t = S().bg.type;
  $('bgC3Wrap').style.display = t === 'mesh' ? '' : 'none';
  $('bgAngleWrap').style.display = t === 'linear' ? '' : 'none';
  $('bgImageWrap').style.display = t === 'image' ? '' : 'none';
  $('bgC1').closest('.swatch').style.display = t === 'image' ? 'none' : '';
}

function updateBadgeVisibility() {
  const b = panel().badge;
  $('badgeFields').style.display = b.on ? '' : 'none';
  $('badgeRatingWrap').style.display = b.type === 'rating' ? '' : 'none';
}

function updateStatusBarVisibility() {
  $('sbCoverWrap').style.display = $('sbCoverMode').value === 'custom' ? '' : 'none';
}

/* status bar */

$('sbMode').addEventListener('change', () => { snapshot(); S().statusBar.mode = $('sbMode').value; schedule(); });
$('sbTime').addEventListener('input', () => { S().statusBar.time = $('sbTime').value; schedule(); });
$('sbCoverMode').addEventListener('change', () => {
  snapshot();
  const m = $('sbCoverMode').value;
  S().statusBar.cover = m === 'auto' ? 'auto' : m === 'custom' ? (S().statusBar.coverColor || '#0b0b18') : null;
  updateStatusBarVisibility();
  schedule();
});

/* badge fields */

$('badgeOn').addEventListener('change', () => {
  snapshot();
  panel().badge.on = $('badgeOn').checked;
  updateBadgeVisibility();
  schedule();
});
$('badgeRating').addEventListener('input', () => { panel().badge.rating = Number($('badgeRating').value); schedule(); });
$('badgeText').addEventListener('input', () => { panel().badge.text = $('badgeText').value; schedule(); });

/* preview preset */

function fillPresetSelect() {
  const el = $('previewPreset');
  el.innerHTML = '';
  for (const entry of groupPresets()) {
    const og = document.createElement('optgroup');
    og.label = entry[0];
    for (const group of entry[1]) {
      for (const p of group[1]) {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name + ' — ' + p.w + '×' + p.h;
        og.appendChild(o);
      }
    }
    el.appendChild(og);
  }
  el.value = project.previewPreset;
}
fillPresetSelect();
$('previewPreset').addEventListener('change', () => {
  project.previewPreset = $('previewPreset').value;
  renderSlots();
  schedule();
});
$('zoom').addEventListener('input', schedule);

$('btnStrip').addEventListener('click', () => {
  const strip = $('storeStrip');
  strip.hidden = !strip.hidden;
  $('btnStrip').classList.toggle('on', !strip.hidden);
  schedule();
});

/* text inputs */

$('caption').addEventListener('input', () => {
  panel().caption = $('caption').value;
  const cap = $('panelList').querySelector('.panel-item[data-index="' + project.activePanel + '"] .cap');
  if (cap) cap.textContent = (panel().caption || '').replace(/\n/g, ' ') || 'Untitled';
  schedule();
});
$('caption').addEventListener('focus', snapshot);
$('subtitle').addEventListener('input', () => { panel().subtitle = $('subtitle').value; schedule(); });
$('subtitle').addEventListener('focus', snapshot);

$('textShadow').addEventListener('change', () => { snapshot(); S().text.shadow = $('textShadow').checked; schedule(); });
$('devGloss').addEventListener('change', () => { snapshot(); S().device.gloss = $('devGloss').checked; schedule(); });

/* ------------------------------------------------------------------ projects */

function renderProjectBar() {
  const el = $('projectSelect');
  el.innerHTML = '';
  for (const row of Projects.list()) {
    const o = document.createElement('option');
    o.value = row.id;
    o.textContent = row.name;
    el.appendChild(o);
  }
  el.value = project.id;
  $('btnProjectDel').disabled = Projects.list().length <= 1;
}

async function switchProject(id) {
  Projects.write(project);
  Projects.setActive(id);
  const next = Projects.read(id);
  if (!next) return toast('Could not open that project');
  project = next;
  history = [];
  await loadProjectImages();
  fillPresetSelect();
  renderProjectBar();
  renderStarterSets();
  renderTemplates();
  renderTargets();
  renderPanelList();
  renderSlots();
  syncControls();
  renderAll();
}

$('projectSelect').addEventListener('change', (e) => switchProject(e.target.value));

$('btnProjectNew').onclick = async () => {
  const name = prompt('Name of the new project', 'New App');
  if (!name) return;
  Projects.write(project);
  const p = Projects.create(name.trim());
  await switchProject(p.id);
  toast('Project created');
};

$('btnProjectDup').onclick = async () => {
  const name = prompt('Name of the copy', project.name + ' copy');
  if (!name) return;
  Projects.write(project);
  const p = Projects.create(name.trim(), project);
  await switchProject(p.id);
  toast('Project duplicated');
};

$('btnProjectRename').onclick = () => {
  const name = prompt('Rename project', project.name);
  if (!name) return;
  project.name = name.trim();
  Projects.write(project);
  renderProjectBar();
};

$('btnProjectDel').onclick = async () => {
  if (Projects.list().length <= 1) return toast('Keep at least one project');
  if (!confirm('Delete "' + project.name + '" and its screenshots? This cannot be undone.')) return;
  await Projects.remove(project.id);
  await switchProject(Projects.activeId());
  toast('Project deleted');
};

$('btnReset').onclick = () => {
  if (!confirm('Reset this project back to the starter design? Screens and screenshots are replaced.')) return;
  snapshot();
  const fresh = defaultProject(project.name);
  fresh.id = project.id;
  project = fresh;
  Projects.write(project);
  renderStarterSets(); renderTemplates(); renderTargets(); renderPanelList(); renderSlots(); syncControls(); renderAll();
};

/* ------------------------------------------------------------------ templates */

function templateCss(t) {
  const b = t.bg;
  if (b.type === 'solid') return b.c1;
  if (b.type === 'linear') return 'linear-gradient(' + (b.angle || 135) + 'deg, ' + b.c1 + ', ' + b.c2 + ')';
  if (b.type === 'radial') return 'radial-gradient(circle at 50% 30%, ' + b.c1 + ', ' + b.c2 + ')';
  return 'radial-gradient(circle at 15% 12%, ' + b.c1 + ', transparent 60%),' +
         'radial-gradient(circle at 90% 45%, ' + (b.c3 || b.c1) + ', transparent 55%),' + b.c2;
}

function renderTemplates() {
  const grid = $('templateGrid');
  grid.innerHTML = '';
  for (const key of Object.keys(TEMPLATES)) {
    const t = TEMPLATES[key];
    const b = document.createElement('button');
    b.className = 'template-chip' + (project.activeTemplate === key ? ' on' : '');
    b.style.background = templateCss(t);
    b.innerHTML = '<span>' + t.label + '</span>';
    b.onclick = () => {
      snapshot();
      project.activeTemplate = key;
      Object.assign(S().bg, t.bg);
      Object.assign(S().text, t.text);
      Object.assign(S().device, t.device);
      renderTemplates();
      syncControls();
      schedule();
    };
    grid.appendChild(b);
  }
}

/* ------------------------------------------------------------------ images */

$('fileImage').onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  setSlotImage(slotTarget || previewClass(), f);
  slotTarget = null;
};

$('btnBgImage').onclick = () => $('fileBgImage').click();
$('fileBgImage').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  snapshot();
  const old = S().bg.imageId;
  S().bg.imageId = await ImageStore.put(f);
  S().bg.type = 'image';
  $('bgType').value = 'image';
  await gcImage(old);
  updateBgVisibility();
  schedule();
};

$('btnBulkImages').onclick = () => $('bulkFiles').click();
$('bulkFiles').onchange = async (e) => {
  const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  e.target.value = '';
  if (!files.length) return;
  snapshot();
  const cls = previewClass();
  for (let i = 0; i < files.length; i++) {
    if (!project.panels[i]) project.panels.push(newPanel('Headline ' + (i + 1), ''));
    project.panels[i].images[cls] = await ImageStore.put(files[i]);
  }
  renderPanelList(); renderSlots(); schedule();
  toast(files.length + ' ' + DEVICE_CLASSES[cls].label.toLowerCase() + ' screenshots imported');
};

const dz = $('dropZone');
['dragenter', 'dragover'].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); })
);
['dragleave', 'drop'].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); })
);
dz.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) setSlotImage(previewClass(), f);
});

document.addEventListener('paste', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) {
      setSlotImage(previewClass(), item.getAsFile());
      e.preventDefault();
      return;
    }
  }
});

/* ------------------------------------------------------------------ navigation */

$('btnAddPanel').onclick = () => {
  snapshot();
  project.panels.push(newPanel('New headline', ''));
  project.activePanel = project.panels.length - 1;
  renderPanelList(); renderSlots(); syncControls(); schedule();
};
$('btnPrev').onclick = () => selectPanel((project.activePanel - 1 + project.panels.length) % project.panels.length);
$('btnNext').onclick = () => selectPanel((project.activePanel + 1) % project.panels.length);

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === b.dataset.tab));
});

$('btnExportQuick').onclick = () => {
  document.querySelector('.tab[data-tab="export"]').click();
  runExport();
};

document.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (typing) return;
    e.preventDefault();
    undo();
    return;
  }

  if (e.key === 'Escape' && !$('bulkModal').hidden) {
    e.preventDefault();
    closeBulk();
    return;
  }

  // Left / right walk through the screens, unless something is being typed in
  // or the write-all sheet is open.
  if (typing || e.ctrlKey || e.metaKey || e.altKey || !$('bulkModal').hidden) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    selectPanel((project.activePanel - 1 + project.panels.length) % project.panels.length);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    selectPanel((project.activePanel + 1) % project.panels.length);
  }
});

/* ------------------------------------------------------------------ targets */

function renderTargets() {
  const wrap = $('targetList');
  wrap.innerHTML = '';
  for (const entry of groupPresets()) {
    const h = document.createElement('div');
    h.className = 'target-store';
    h.textContent = entry[0];
    wrap.appendChild(h);
    for (const group of entry[1]) {
      const g = document.createElement('div');
      g.className = 'target-group';
      g.textContent = group[0];
      wrap.appendChild(g);
      for (const p of group[1]) {
        const row = document.createElement('label');
        row.className = 'target-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = project.targets.includes(p.id);
        cb.onchange = () => {
          project.targets = cb.checked
            ? [...new Set([...project.targets, p.id])]
            : project.targets.filter((t) => t !== p.id);
          Projects.write(project);
          renderSlots();
          updateExportSummary();
        };
        const name = document.createElement('span');
        name.className = 't-name';
        name.textContent = p.name;
        const dims = document.createElement('span');
        dims.className = 't-dims';
        dims.textContent = p.w + '×' + p.h;
        row.append(cb, name);
        if (p.required) {
          const req = document.createElement('span');
          req.className = 't-req';
          req.textContent = 'required';
          row.appendChild(req);
        }
        row.appendChild(dims);
        wrap.appendChild(row);
      }
    }
  }
  updateExportSummary();
}

$('btnRequiredOnly').onclick = () => {
  project.targets = PRESETS.filter((p) => p.required).map((p) => p.id);
  renderTargets(); renderSlots(); Projects.write(project);
};
$('btnSelectNone').onclick = () => {
  project.targets = [];
  renderTargets(); renderSlots(); Projects.write(project);
};

$('format').addEventListener('change', () => {
  $('qualityWrap').hidden = $('format').value !== 'jpeg';
});
$('quality').addEventListener('input', () => { $('qualityVal').textContent = $('quality').value; });

function updateExportSummary() {
  const n = project.targets.length * project.panels.length;
  $('exportStatus').textContent = n
    ? n + ' images across ' + project.targets.length + ' size' + (project.targets.length === 1 ? '' : 's')
    : 'Pick at least one size.';

  const needed = classesForTargets(project.targets);
  const missing = [];
  for (const cls of CLASSES) {
    if (!needed.has(cls)) continue;
    if (!project.panels.some((p) => p.images[cls])) missing.push(DEVICE_CLASSES[cls].label.toLowerCase());
  }
  const warn = $('exportWarn');
  if (missing.length) {
    warn.hidden = false;
    warn.textContent = 'No ' + missing.join(' or ') + ' screenshots yet — those sizes reuse the phone image.';
  } else {
    warn.hidden = true;
  }
}

/* ------------------------------------------------------------------ export */

let exporting = false;

async function runExport() {
  if (exporting) return;
  if (!project.targets.length) return toast('Pick at least one size first');
  exporting = true;
  $('btnExport').disabled = true;
  $('progressWrap').hidden = false;

  const format = $('format').value;
  const quality = Number($('quality').value) / 100;
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const root = slug(project.name);

  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const files = [];
  const total = project.targets.length * project.panels.length;
  let done = 0;

  await ensureFont(S().text.font);

  try {
    for (const id of project.targets) {
      const p = PRESET_BY_ID[id];
      if (!p) continue;
      const folder = root + '/' + p.store + '/' + slug(p.name) + ' ' + p.w + 'x' + p.h;
      work.width = p.w;
      work.height = p.h;
      for (let i = 0; i < project.panels.length; i++) {
        renderPanel(wctx, p.w, p.h, project.panels[i], S(), ImageStore, p.cls);
        const blob = await canvasToBlob(work, format, quality);
        const buf = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: folder + '/' + String(i + 1).padStart(2, '0') + '.' + ext, data: buf });
        done++;
        $('progressBar').style.width = (done / total) * 100 + '%';
        $('exportStatus').textContent = 'Rendering ' + done + ' / ' + total + '…';
        await new Promise((r) => setTimeout(r));
      }
    }

    $('exportStatus').textContent = 'Packing ZIP…';
    const zip = makeZip(files);
    download(zip, root + ' screenshots.zip');
    $('exportStatus').textContent = 'Done — ' + files.length + ' images downloaded.';
    toast('ZIP downloaded');
  } catch (err) {
    console.error(err);
    $('exportStatus').textContent = 'Export failed: ' + err.message;
  } finally {
    exporting = false;
    $('btnExport').disabled = false;
    setTimeout(() => { $('progressWrap').hidden = true; $('progressBar').style.width = '0%'; }, 1200);
  }
}

$('btnExport').onclick = runExport;

$('btnDownloadOne').onclick = async () => {
  const p = previewSize();
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  await ensureFont(S().text.font);
  renderPanel(c.getContext('2d', { willReadFrequently: true }), p.w, p.h, panel(), S(), ImageStore, p.cls);
  const blob = await canvasToBlob(c, 'png', 1);
  download(blob, slug(project.name) + ' ' + (project.activePanel + 1) + ' ' + p.w + 'x' + p.h + '.png');
};

/* ------------------------------------------------------------------ sync */

function syncControls() {
  for (const c of controls) if (c._sync) c._sync();
  $('caption').value = panel().caption || '';
  $('subtitle').value = panel().subtitle || '';
  $('bgType').value = S().bg.type;
  $('fontFamily').value = S().text.font;
  $('textShadow').checked = !!S().text.shadow;
  $('devGloss').checked = !!S().device.gloss;
  $('previewPreset').value = project.previewPreset;
  for (const cls of CLASSES) $(FRAME_SELECTS[cls]).value = frameForClass(S(), cls);

  const sb = S().statusBar;
  $('sbMode').value = sb.mode;
  $('sbTime').value = sb.time || '9:41';
  $('sbCoverMode').value = sb.cover === 'auto' ? 'auto' : sb.cover ? 'custom' : 'none';

  const b = panel().badge;
  $('badgeOn').checked = !!b.on;
  $('badgeRating').value = b.rating ?? 4.8;
  $('badgeText').value = b.text || '';

  updateBgVisibility();
  updateBadgeVisibility();
  updateStatusBarVisibility();
  updateCaptionMeter();
}

/* ------------------------------------------------------------------ starter sets */

function renderStarterSets() {
  const wrap = $('starterList');
  wrap.innerHTML = '';
  for (const key of Object.keys(STARTER_SETS)) {
    const set = STARTER_SETS[key];
    const theme = TEMPLATES[set.template];
    const b = document.createElement('button');
    b.className = 'starter' + (project.activeSet === key ? ' on' : '');

    const strip = document.createElement('span');
    strip.className = 'swatch-strip';
    if (theme) strip.style.background = templateCss(theme);
    b.appendChild(strip);

    const meta = document.createElement('span');
    meta.className = 's-meta';
    const name = document.createElement('span');
    name.className = 's-name';
    name.textContent = set.label;
    const note = document.createElement('span');
    note.className = 's-note';
    note.textContent = set.note;
    meta.append(name, note);
    b.appendChild(meta);

    b.onclick = () => applyStarterSet(key);
    wrap.appendChild(b);
  }
}

function applyStarterSet(key) {
  const set = STARTER_SETS[key];
  if (!set) return;
  const msg = 'Apply "' + set.label + '"?\n\nIt rewrites the headlines on the first ' + set.panels.length +
    ' screens and changes the look. Your screenshots stay where they are, and Ctrl+Z undoes it.';
  if (!confirm(msg)) return;

  snapshot();
  const theme = TEMPLATES[set.template];
  if (theme) {
    project.activeTemplate = set.template;
    Object.assign(S().bg, theme.bg);
    Object.assign(S().text, theme.text);
    Object.assign(S().device, theme.device);
  }
  if (set.style) {
    if (set.style.text) Object.assign(S().text, set.style.text);
    if (set.style.device) Object.assign(S().device, set.style.device);
    if (set.style.padding !== undefined) S().padding = set.style.padding;
  }

  set.panels.forEach((src, i) => {
    if (!project.panels[i]) project.panels.push(newPanel('', ''));
    const p = project.panels[i];
    p.caption = src.caption;
    p.subtitle = src.subtitle;
    p.layout = src.layout;
    p.badge = { ...newBadge(), ...(src.badge || {}) };
  });

  project.activeSet = key;
  project.activePanel = 0;
  renderStarterSets();
  renderTemplates();
  renderPanelList();
  renderSlots();
  syncControls();
  schedule();
  if (!$('bulkModal').hidden) renderBulkRows();
  toast(set.label + ' applied — now replace the skeleton copy');
}

/* ------------------------------------------------------------------ write all screens */

function storeRefBase() {
  const p = previewSize();
  return Math.min(STORE_REF_W, (STORE_REF_W * p.h) / p.w);
}

function markActiveRow() {
  $('bulkRows').querySelectorAll('.bulk-row').forEach((row) => {
    row.classList.toggle('active', Number(row.dataset.index) === project.activePanel);
  });
}

function renderBulkRows() {
  const wrap = $('bulkRows');
  wrap.innerHTML = '';

  project.panels.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'bulk-row' + (i < 2 ? ' hero' : '');
    row.dataset.index = String(i);

    const num = document.createElement('div');
    num.className = 'b-num';
    num.textContent = String(i + 1);
    row.appendChild(num);

    const c = document.createElement('canvas');
    c.width = 92;
    c.height = 200;
    c.title = 'Preview this screen';
    c.onclick = () => { project.activePanel = i; markActiveRow(); schedule(); };
    row.appendChild(c);

    const cap = document.createElement('textarea');
    cap.value = p.caption || '';
    cap.rows = 3;
    cap.placeholder = 'Headline — five words or fewer';
    cap.addEventListener('focus', () => { project.activePanel = i; markActiveRow(); schedule(); });
    cap.addEventListener('input', () => { p.caption = cap.value; schedule(); });
    row.appendChild(cap);

    const sub = document.createElement('textarea');
    sub.value = p.subtitle || '';
    sub.rows = 3;
    sub.placeholder = 'Subtitle (optional)';
    sub.addEventListener('focus', () => { project.activePanel = i; markActiveRow(); schedule(); });
    sub.addEventListener('input', () => { p.subtitle = sub.value; schedule(); });
    row.appendChild(sub);

    const stat = document.createElement('div');
    stat.className = 'b-stat';
    const words = document.createElement('span');
    words.className = 'b-words';
    const flag = document.createElement('span');
    flag.className = 'b-flag';
    stat.append(words, flag);
    const del = document.createElement('button');
    del.className = 'b-del';
    del.textContent = 'Remove';
    del.onclick = () => {
      if (project.panels.length === 1) return toast('Keep at least one screen');
      snapshot();
      project.panels.splice(i, 1);
      project.activePanel = Math.min(project.activePanel, project.panels.length - 1);
      renderBulkRows();
      renderPanelList();
      renderSlots();
      syncControls();
      schedule();
    };
    stat.appendChild(del);
    row.appendChild(stat);

    wrap.appendChild(row);
  });

  refreshBulkStats();
}

function refreshBulkStats() {
  const cls = previewClass();
  const capPx = S().text.captionSize * storeRefBase();
  $('bulkRows').querySelectorAll('.bulk-row').forEach((row) => {
    const i = Number(row.dataset.index);
    const p = project.panels[i];
    if (!p) return;

    const c = row.querySelector('canvas');
    renderPanel(c.getContext('2d'), c.width, c.height, p, S(), ImageStore, cls);

    const n = (p.caption || '').trim().split(/\s+/).filter(Boolean).length;
    const words = row.querySelector('.b-words');
    words.textContent = n + (n === 1 ? ' word' : ' words');
    words.classList.toggle('warn', n > 7);

    const flag = row.querySelector('.b-flag');
    if (!n) { flag.textContent = 'empty'; flag.className = 'b-flag'; }
    else if (capPx < 7.5) { flag.textContent = 'too small in search'; flag.className = 'b-flag bad'; }
    else if (n > 7) { flag.textContent = 'too long'; flag.className = 'b-flag bad'; }
    else { flag.textContent = 'reads well'; flag.className = 'b-flag ok'; }
  });
  markActiveRow();
}

function openBulk() {
  snapshot();
  $('bulkModal').hidden = false;
  renderBulkRows();
  const first = $('bulkRows').querySelector('textarea');
  if (first) first.focus();
}

function closeBulk() {
  $('bulkModal').hidden = true;
  renderPanelList();
  renderSlots();
  syncControls();
  schedule();
}

$('btnBulkText').onclick = openBulk;
$('bulkClose').onclick = closeBulk;
$('bulkAdd').onclick = () => {
  project.panels.push(newPanel('', ''));
  project.activePanel = project.panels.length - 1;
  renderBulkRows();
  schedule();
  const areas = $('bulkRows').querySelectorAll('.bulk-row textarea');
  if (areas.length >= 2) areas[areas.length - 2].focus();
};
$('bulkModal').addEventListener('mousedown', (e) => {
  if (e.target === $('bulkModal')) closeBulk();
});

/* ------------------------------------------------------------------ drag the device */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let drag = null;

function previewLayout() {
  return computeLayout(pctx, previewCanvas.width, previewCanvas.height, panel(), S(), previewClass());
}

function canvasScale() {
  return previewCanvas.width / Math.max(1, previewCanvas.clientWidth);
}

function toCanvas(e) {
  const r = previewCanvas.getBoundingClientRect();
  const k = canvasScale();
  return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
}

function positionHandle() {
  const h = $('deviceHandle');
  if (!h) return;
  const L = previewLayout();
  const k = canvasScale();
  h.style.left = clamp((L.rect.left + L.rect.w) / k, 8, previewCanvas.clientWidth - 8) + 'px';
  h.style.top = clamp((L.rect.top + L.rect.h) / k, 8, previewCanvas.clientHeight - 8) + 'px';
}

$('deviceHandle').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const L = previewLayout();
  const cx = L.rect.left + L.rect.w / 2;
  const cy = L.rect.top + L.rect.h / 2;
  const p = toCanvas(e);
  snapshot();
  drag = { mode: 'scale', cx, cy, dist: Math.hypot(p.x - cx, p.y - cy) || 1, scale: S().device.scale };
  $('deviceHandle').classList.add('dragging');
  e.target.setPointerCapture(e.pointerId);
});

previewCanvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const L = previewLayout();
  snapshot();
  drag = { mode: 'move', x: e.clientX, y: e.clientY, ox: S().device.offsetX, oy: S().device.offsetY, area: L.area };
  previewCanvas.classList.add('grabbing');
  previewCanvas.setPointerCapture(e.pointerId);
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.moved = true;
  if (drag.mode === 'move') {
    const k = canvasScale();
    const dx = (e.clientX - drag.x) * k;
    const dy = (e.clientY - drag.y) * k;
    S().device.offsetX = clamp(drag.ox + dx / drag.area.w, -0.5, 0.5);
    S().device.offsetY = clamp(drag.oy + dy / drag.area.h, -0.5, 0.5);
  } else {
    const p = toCanvas(e);
    const d = Math.hypot(p.x - drag.cx, p.y - drag.cy) || 1;
    S().device.scale = clamp(drag.scale * (d / drag.dist), 0.4, 1.8);
  }
  schedule();
});

function endDrag() {
  if (!drag) return;
  // A plain click should not eat an undo step.
  if (!drag.moved) history.pop();
  drag = null;
  previewCanvas.classList.remove('grabbing');
  $('deviceHandle').classList.remove('dragging');
  syncControls();
  Projects.write(project);
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

previewCanvas.addEventListener('dblclick', () => {
  snapshot();
  S().device.scale = 1;
  S().device.offsetX = 0;
  S().device.offsetY = 0;
  syncControls();
  schedule();
  toast('Device position reset');
});

/* ------------------------------------------------------------------ boot */

async function loadProjectImages() {
  await Promise.all([...projectImageIds(project)].map((id) => ImageStore.load(id)));
}

async function boot() {
  await loadProjectImages();

  renderProjectBar();
  renderStarterSets();
  renderTemplates();
  renderTargets();
  renderPanelList();
  renderSlots();
  syncControls();

  await ensureFont(S().text.font);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  renderAll();

  let lastStage = '';
  new ResizeObserver(() => {
    const a = $('stageArea');
    const key = a.clientWidth + 'x' + a.clientHeight;
    if (key === lastStage) return;
    lastStage = key;
    schedule();
  }).observe($('stageArea'));

  requestAnimationFrame(() => renderAll());
  setTimeout(renderAll, 350);
  window.addEventListener('beforeunload', () => Projects.write(project));
}

boot();
