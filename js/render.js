// Resolution-independent canvas renderer.
// Every measurement is a fraction of S = min(width, height), so a 110px store
// thumbnail and a 2796px export are the same composition.

import { FRAMES, DEVICE_CLASSES, DEFAULT_FRAMES } from './presets.js';

// roundRect polyfill for older browsers.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rad = Math.min(typeof r === 'number' ? r : (r && r[0]) || 0, w / 2, h / 2);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
    return this;
  };
}

const rr = (ctx, x, y, w, h, r) => {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rad);
};

/** The screenshot a panel uses for a device class, falling back to the phone one. */
export function panelImageId(panel, cls) {
  const imgs = panel.images || {};
  return imgs[cls] || imgs.phone || null;
}

export function frameForClass(style, cls) {
  const frames = (style.device && style.device.frames) || DEFAULT_FRAMES;
  return frames[cls] || DEFAULT_FRAMES[cls] || 'bare';
}

/**
 * Where every element lands on a given canvas. The renderer draws from this,
 * and the editor uses the same numbers to place its drag handles — so dragging
 * the device tracks the cursor exactly at any zoom or export size.
 */
export function computeLayout(ctx, W, H, panel, style, cls) {
  const deviceClass = cls || 'phone';
  const S = Math.min(W, H);
  const pad = style.padding * S;
  const gap = 0.045 * S;

  const landscape = W / H > 1.15;
  let layout = panel.layout || 'above';
  if (landscape && layout !== 'none') layout = 'side';

  let block = null;
  let text = null;
  let area;
  let anchor;

  if (layout === 'none') {
    area = { x: pad * 0.5, y: pad * 0.5, w: W - pad, h: H - pad };
    anchor = 'center';
  } else if (layout === 'side') {
    const textW = W * 0.46 - pad;
    block = layoutText(ctx, panel, style, S, textW);
    text = { x: pad, y: (H - block.height) / 2, w: textW };
    area = { x: W * 0.48, y: pad * 0.35, w: W * 0.52 - pad * 0.5, h: H - pad * 0.7 };
    anchor = 'center';
  } else {
    const textW = W - pad * 2;
    block = layoutText(ctx, panel, style, S, textW);
    if (layout === 'above') {
      const top = pad * 0.9;
      text = { x: pad, y: top, w: textW };
      const dy = top + block.height + gap;
      area = { x: pad * 0.45, y: dy, w: W - pad * 0.9, h: H - dy - pad * 0.3 };
      anchor = 'top';
    } else if (layout === 'below') {
      const bottom = H - pad * 0.9 - block.height;
      text = { x: pad, y: bottom, w: textW };
      area = { x: pad * 0.45, y: pad * 0.4, w: W - pad * 0.9, h: bottom - gap - pad * 0.4 };
      anchor = 'bottom';
    } else {
      text = { x: pad, y: pad * 0.9, w: textW };
      area = { x: pad * 0.4, y: pad * 0.4, w: W - pad * 0.8, h: H - pad * 0.8 };
      anchor = 'center';
    }
  }

  return { S, pad, layout, block, text, area, anchor, rect: deviceRect(area, anchor, style, deviceClass), cls: deviceClass };
}

export function renderPanel(ctx, W, H, panel, style, images, cls) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  drawBackground(ctx, W, H, Math.min(W, H), style, images);

  const L = computeLayout(ctx, W, H, panel, style, cls);
  drawDevice(ctx, L.rect, panel, style, images, L.cls);

  if (L.layout === 'overlay') {
    const scrim = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    scrim.addColorStop(0, 'rgba(0,0,0,0.55)');
    scrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H * 0.5);
  }

  // Text last, so an oversized device can never bury the headline.
  if (L.block) drawTextBlock(ctx, L.block, L.text.x, L.text.y, L.text.w, style);

  ctx.restore();
}

/* ------------------------------------------------------------------ background */

function drawBackground(ctx, W, H, S, style, images) {
  const bg = style.bg;
  ctx.save();
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.c1;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'linear') {
    const a = ((bg.angle ?? 135) * Math.PI) / 180;
    const cx = W / 2, cy = H / 2;
    const len = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a));
    const g = ctx.createLinearGradient(
      cx - (Math.cos(a) * len) / 2, cy - (Math.sin(a) * len) / 2,
      cx + (Math.cos(a) * len) / 2, cy + (Math.sin(a) * len) / 2
    );
    g.addColorStop(0, bg.c1);
    g.addColorStop(1, bg.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'radial') {
    ctx.fillStyle = bg.c2;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.32, 0, W / 2, H * 0.32, Math.max(W, H) * 0.75);
    g.addColorStop(0, bg.c1);
    g.addColorStop(1, bg.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'mesh') {
    ctx.fillStyle = bg.c2;
    ctx.fillRect(0, 0, W, H);
    blob(ctx, W, H, W * 0.15, H * 0.12, Math.max(W, H) * 0.62, bg.c1);
    blob(ctx, W, H, W * 0.92, H * 0.42, Math.max(W, H) * 0.55, bg.c3 || bg.c1);
    blob(ctx, W, H, W * 0.4, H * 0.95, Math.max(W, H) * 0.6, bg.c1);
  } else if (bg.type === 'image') {
    ctx.fillStyle = bg.c2 || '#111111';
    ctx.fillRect(0, 0, W, H);
    const img = images.get(bg.imageId);
    if (img) {
      if (bg.blur) ctx.filter = 'blur(' + (bg.blur / 100) * S * 0.08 + 'px)';
      drawCover(ctx, img, -S * 0.06, -S * 0.06, W + S * 0.12, H + S * 0.12);
      ctx.filter = 'none';
    }
    if (bg.dim) {
      ctx.fillStyle = 'rgba(0,0,0,' + bg.dim / 100 + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }
  ctx.restore();
}

function blob(ctx, W, H, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  if (!m) return 'rgba(0,0,0,' + a + ')';
  return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
}

/* ------------------------------------------------------------------ text + badge */

function fontString(weight, size, family) {
  const stack = family === 'system-ui'
    ? 'system-ui, -apple-system, Segoe UI, sans-serif'
    : '"' + family + '", system-ui, sans-serif';
  return weight + ' ' + size + 'px ' + stack;
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function badgeLabel(badge) {
  if (badge.type === 'rating') {
    const r = Number(badge.rating);
    const num = Number.isFinite(r) ? r.toFixed(1) : '5.0';
    return badge.text ? num + '  ·  ' + badge.text : num;
  }
  return badge.text || '';
}

function measureBadge(ctx, badge, style, S) {
  const size = (style.text.badgeSize || 0.026) * S;
  ctx.save();
  ctx.font = fontString(700, size, style.text.font);
  ctx.letterSpacing = '0px';
  const label = badgeLabel(badge);
  const textW = ctx.measureText(label).width;
  ctx.restore();
  const starW = badge.type === 'rating' ? size * 1.45 : 0;
  const padX = size * 0.85;
  return { w: textW + starW + padX * 2, h: size * 2.15, size, label, starW, padX };
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.46;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBadge(ctx, badge, m, x, y, style) {
  ctx.save();
  ctx.fillStyle = hexToRgba(badge.bg || '#ffffff', (badge.opacity ?? 18) / 100);
  rr(ctx, x, y, m.w, m.h, m.h / 2);
  ctx.fill();
  if ((badge.opacity ?? 18) < 40) {
    ctx.strokeStyle = hexToRgba(badge.fg || '#ffffff', 0.28);
    ctx.lineWidth = Math.max(1, m.size * 0.06);
    rr(ctx, x, y, m.w, m.h, m.h / 2);
    ctx.stroke();
  }
  let tx = x + m.padX;
  if (badge.type === 'rating') {
    drawStar(ctx, tx + m.size * 0.55, y + m.h / 2, m.size * 0.62, badge.fg || '#ffffff');
    tx += m.starW;
  }
  ctx.font = fontString(700, m.size, style.text.font);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.fillStyle = badge.fg || '#ffffff';
  ctx.fillText(m.label, tx, y + m.h / 2 + m.size * 0.36);
  ctx.restore();
}

function layoutText(ctx, panel, style, S, maxW) {
  const t = style.text;
  const capSize = t.captionSize * S;
  const subSize = t.subtitleSize * S;
  const items = [];
  let height = 0;
  const badge = panel.badge;
  const showBadge = badge && badge.on && badgeLabel(badge);

  const pushBadge = () => {
    const m = measureBadge(ctx, badge, style, S);
    const gapBefore = items.length ? capSize * 0.34 : 0;
    items.push({ kind: 'badge', badge, m, gapBefore, h: m.h });
    height += m.h + gapBefore;
  };

  ctx.save();
  if (showBadge && badge.position !== 'below') pushBadge();

  if (panel.caption && panel.caption.trim()) {
    ctx.font = fontString(t.captionWeight, capSize, t.font);
    ctx.letterSpacing = t.tracking * capSize + 'px';
    const lines = wrap(ctx, panel.caption, maxW);
    const lh = capSize * t.lineHeight;
    const gapBefore = items.length ? capSize * 0.34 : 0;
    items.push({ kind: 'text', lines, size: capSize, lh, weight: t.captionWeight, color: t.captionColor, gapBefore });
    height += lines.length * lh + gapBefore;
  }
  if (panel.subtitle && panel.subtitle.trim()) {
    ctx.font = fontString(t.subtitleWeight, subSize, t.font);
    ctx.letterSpacing = t.tracking * subSize + 'px';
    const lines = wrap(ctx, panel.subtitle, maxW);
    const lh = subSize * (t.lineHeight + 0.12);
    const gapBefore = items.length ? capSize * 0.36 : 0;
    items.push({ kind: 'text', lines, size: subSize, lh, weight: t.subtitleWeight, color: t.subtitleColor, gapBefore });
    height += lines.length * lh + gapBefore;
  }

  if (showBadge && badge.position === 'below') pushBadge();

  ctx.letterSpacing = '0px';
  ctx.restore();
  return { items, height };
}

function drawTextBlock(ctx, block, x, y, maxW, style) {
  const t = style.text;
  const align = t.align;
  ctx.save();
  const ax = align === 'left' ? x : align === 'right' ? x + maxW : x + maxW / 2;
  let cy = y;
  for (const item of block.items) {
    cy += item.gapBefore || 0;
    if (item.kind === 'badge') {
      const bx = align === 'left' ? x : align === 'right' ? x + maxW - item.m.w : ax - item.m.w / 2;
      drawBadge(ctx, item.badge, item.m, bx, cy, style);
      cy += item.h;
      continue;
    }
    ctx.textAlign = align;
    ctx.font = fontString(item.weight, item.size, t.font);
    ctx.letterSpacing = t.tracking * item.size + 'px';
    ctx.fillStyle = item.color;
    if (t.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = item.size * 0.35;
      ctx.shadowOffsetY = item.size * 0.06;
    }
    for (const line of item.lines) {
      cy += item.lh;
      ctx.fillText(line, ax, cy - item.lh * 0.24);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.restore();
}

/* ------------------------------------------------------------------ device */

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width, ih = img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Outer rectangle of the device inside a layout area. */
function deviceRect(area, anchor, style, cls) {
  const d = style.device;
  const frameKey = frameForClass(style, cls);
  const f = FRAMES[frameKey] || FRAMES.iphone;
  const ar = f.ar || (DEVICE_CLASSES[cls] || DEVICE_CLASSES.phone).ar;
  const b = f.bezel;
  const outerAR = 1 / ((1 - 2 * b) / ar + 2 * b); // outerW / outerH

  const outerW = Math.min(area.w, area.h * outerAR) * d.scale;
  const outerH = outerW / outerAR;

  const cx = area.x + area.w / 2 + d.offsetX * area.w;
  let top;
  if (anchor === 'top') top = area.y;
  else if (anchor === 'bottom') top = area.y + area.h - outerH;
  else top = area.y + (area.h - outerH) / 2;
  top += d.offsetY * area.h;

  return { left: cx - outerW / 2, top, w: outerW, h: outerH, frameKey, f };
}

function drawDevice(ctx, rect, panel, style, images, cls) {
  const d = style.device;
  const f = rect.f;
  const b = f.bezel;
  const left = rect.left;
  const top = rect.top;
  const outerW = rect.w;
  const outerH = rect.h;

  ctx.save();
  if (d.rotate) {
    ctx.translate(left + outerW / 2, top + outerH / 2);
    ctx.rotate((d.rotate * Math.PI) / 180);
    ctx.translate(-(left + outerW / 2), -(top + outerH / 2));
  }

  const radius = f.radius * outerW;
  const bez = b * outerW;

  if (d.shadow > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + 0.55 * d.shadow + ')';
    ctx.shadowBlur = outerW * 0.16 * d.shadow;
    ctx.shadowOffsetY = outerW * 0.05 * d.shadow;
    ctx.fillStyle = '#000000';
    rr(ctx, left, top, outerW, outerH, radius);
    ctx.fill();
    ctx.restore();
  }

  if (f.buttons && bez > 0) {
    ctx.fillStyle = shade(d.color, -18);
    const bw = bez * 0.55;
    rr(ctx, left - bw * 0.6, top + outerH * 0.19, bw, outerH * 0.045, bw / 2); ctx.fill();
    rr(ctx, left - bw * 0.6, top + outerH * 0.27, bw, outerH * 0.075, bw / 2); ctx.fill();
    rr(ctx, left - bw * 0.6, top + outerH * 0.365, bw, outerH * 0.075, bw / 2); ctx.fill();
    rr(ctx, left + outerW - bw * 0.4, top + outerH * 0.30, bw, outerH * 0.11, bw / 2); ctx.fill();
  }

  if (bez > 0) {
    const bodyG = ctx.createLinearGradient(left, top, left + outerW, top + outerH);
    bodyG.addColorStop(0, shade(d.color, 26));
    bodyG.addColorStop(0.12, d.color);
    bodyG.addColorStop(0.88, d.color);
    bodyG.addColorStop(1, shade(d.color, 22));
    ctx.fillStyle = bodyG;
    rr(ctx, left, top, outerW, outerH, radius);
    ctx.fill();
  }

  const sx = left + bez, sy = top + bez;
  const sw = outerW - bez * 2, sh = outerH - bez * 2;
  const sRad = Math.max(0, radius - bez);
  ctx.save();
  rr(ctx, sx, sy, sw, sh, sRad);
  ctx.clip();
  const img = images.get(panelImageId(panel, cls));
  if (img) {
    drawCover(ctx, img, sx, sy, sw, sh);
  } else {
    drawPlaceholder(ctx, sx, sy, sw, sh, style, cls);
  }
  const sb = style.statusBar;
  if (sb && sb.mode !== 'off' && f.statusBar) {
    drawStatusBar(ctx, sx, sy, sw, sh, sb, f, style, !!img);
  }
  ctx.restore();

  if (f.island) {
    const iw = sw * 0.30, ih = iw * 0.29;
    ctx.fillStyle = '#08080a';
    rr(ctx, sx + (sw - iw) / 2, sy + sh * 0.014, iw, ih, ih / 2);
    ctx.fill();
  } else if (f.punch) {
    const r = sw * 0.026;
    ctx.fillStyle = '#08080a';
    ctx.beginPath();
    ctx.arc(sx + sw / 2, sy + sh * 0.022 + r, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (f.base) {
    const baseH = outerH * 0.045;
    ctx.fillStyle = shade(d.color, 10);
    rr(ctx, left - outerW * 0.06, top + outerH, outerW * 1.12, baseH, baseH / 2);
    ctx.fill();
  }

  if (d.gloss) {
    ctx.save();
    rr(ctx, sx, sy, sw, sh, sRad);
    ctx.clip();
    const g = ctx.createLinearGradient(sx, sy, sx + sw * 0.9, sy + sh * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();
  }

  if (bez > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = Math.max(1, outerW * 0.0025);
    rr(ctx, sx, sy, sw, sh, sRad);
    ctx.stroke();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ status bar */

function samplePixel(ctx, x, y) {
  try {
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  } catch (e) {
    return null;
  }
}

function drawStatusBar(ctx, sx, sy, sw, sh, sb, f, style, hasImage) {
  const android = f.statusBar === 'android';
  const barH = sh * (android ? 0.042 : 0.058);

  // Cover whatever the raw screenshot had up there.
  let cover = sb.cover;
  if (cover === 'auto') {
    const s = hasImage ? samplePixel(ctx, sx + sw * 0.5, sy + barH + sh * 0.012) : null;
    cover = s ? 'rgb(' + s.r + ',' + s.g + ',' + s.b + ')' : null;
  }
  if (cover) {
    ctx.save();
    ctx.fillStyle = cover;
    ctx.fillRect(sx, sy, sw, barH + sh * 0.004);
    ctx.restore();
  }

  let mode = sb.mode;
  if (mode === 'auto') {
    const s = samplePixel(ctx, sx + sw * 0.5, sy + barH * 0.5);
    mode = s && (s.r * 299 + s.g * 587 + s.b * 114) / 1000 > 140 ? 'dark' : 'light';
  }
  const ink = mode === 'dark' ? '#111114' : '#ffffff';

  const cy = sy + barH * (android ? 0.52 : 0.58);
  const fs = sh * (android ? 0.0155 : 0.019);

  ctx.save();
  ctx.fillStyle = ink;
  ctx.font = fontString(700, fs, style.text.font);
  ctx.letterSpacing = '0px';
  ctx.textAlign = android ? 'left' : 'center';
  const timeX = android ? sx + sw * 0.05 : sx + sw * (f.island ? 0.145 : 0.16);
  ctx.fillText(sb.time || '9:41', timeX, cy + fs * 0.36);

  // right-hand icons
  const rightX = sx + sw * (android ? 0.95 : 0.925);
  const iconH = fs * 0.95;

  // battery
  const batW = iconH * 1.95, batH = iconH * 0.95;
  const batX = rightX - batW, batY = cy - batH / 2;
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(0.6, batH * 0.12);
  rr(ctx, batX, batY, batW, batH, batH * 0.32);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  const inset = batH * 0.19;
  rr(ctx, batX + inset, batY + inset, (batW - inset * 2) * 0.92, batH - inset * 2, batH * 0.16);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(batX + batW + batH * 0.16, cy, batH * 0.09, batH * 0.2, 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;

  // wifi
  const wifiX = batX - iconH * 2.1;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  for (let i = 2; i >= 0; i--) {
    const r = iconH * (0.36 + i * 0.26);
    ctx.lineWidth = iconH * 0.17;
    ctx.beginPath();
    ctx.arc(wifiX, cy + iconH * 0.42, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wifiX, cy + iconH * 0.38, iconH * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();

  // signal bars
  const sigX = wifiX - iconH * 2.3;
  for (let i = 0; i < 4; i++) {
    const bw = iconH * 0.22, gapX = iconH * 0.34;
    const bh = iconH * (0.32 + i * 0.22);
    rr(ctx, sigX + i * gapX, cy + iconH * 0.5 - bh, bw, bh, bw * 0.35);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ placeholder */

function drawPlaceholder(ctx, x, y, w, h, style, cls) {
  const dark = isDark(style.bg.c1);
  ctx.fillStyle = dark ? '#15161a' : '#f5f6f8';
  ctx.fillRect(x, y, w, h);
  const ink = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,20,35,0.09)';
  const ink2 = dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,20,35,0.05)';
  const p = w * 0.08;
  ctx.fillStyle = ink;
  rr(ctx, x + p, y + h * 0.10, w * 0.5, h * 0.022, h * 0.011); ctx.fill();
  rr(ctx, x + p, y + h * 0.145, w * 0.72, h * 0.045, h * 0.012); ctx.fill();
  ctx.fillStyle = ink2;
  for (let i = 0; i < 4; i++) {
    rr(ctx, x + p, y + h * (0.24 + i * 0.135), w - p * 2, h * 0.105, w * 0.05);
    ctx.fill();
  }
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(15,20,35,0.28)';
  ctx.font = '600 ' + w * 0.05 + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const label = cls === 'phone' ? 'Drop screenshot' : 'No ' + (DEVICE_CLASSES[cls] || {}).label + ' shot';
  ctx.fillText(label, x + w / 2, y + h * 0.83);
  ctx.textAlign = 'left';
}

/* ------------------------------------------------------------------ color utils */

export function isDark(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  if (!m) return true;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

export function shade(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  if (!m) return hex;
  const parts = [1, 2, 3].map((i) => {
    const v = Math.round(parseInt(m[i], 16) * (1 + amt / 100));
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  });
  return '#' + parts.join('');
}

/** WCAG relative luminance, 0..1 */
export function luminance(r, g, b) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function hexLuminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  if (!m) return 0;
  return luminance(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

export function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
