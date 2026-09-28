#!/usr/bin/env node
/**
 * Renders the Chrome Web Store promotional images with node-canvas:
 *   store/promo/small-tile-440x280.png   (small promo tile — required to be featured)
 *   store/promo/marquee-1400x560.png     (marquee promo tile — optional)
 *   store/promo/icon-128.png             (copy of icons/icon128.png for upload convenience)
 *
 * Usage: npm run store:promo
 */
import { createCanvas, loadImage } from 'canvas';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'store', 'promo');
mkdirSync(outDir, { recursive: true });

const NOTE_COLORS = ['#fde047', '#4ade80', '#60a5fa', '#c084fc', '#fb923c', '#f87171'];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function render(w, h, file, { iconSize, title, tagline, sub }) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(1, '#1e293b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // faint sticky-note cards in the background
  NOTE_COLORS.forEach((c, i) => {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.translate(w * 0.62 + i * (w * 0.055), h * 0.18 + i * (h * 0.09));
    ctx.rotate((-6 + i * 2.5) * Math.PI / 180);
    ctx.fillStyle = c;
    roundRect(ctx, 0, 0, w * 0.3, h * 0.42, 10);
    ctx.fill();
    ctx.restore();
  });

  const icon = await loadImage(path.join(repoRoot, 'icons', 'icon128.png'));
  const pad = Math.round(w * 0.06);
  ctx.drawImage(icon, pad, Math.round((h - iconSize) / 2) - Math.round(h * 0.06), iconSize, iconSize);

  const tx = pad + iconSize + Math.round(w * 0.035);
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${Math.round(h * 0.17)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, tx, Math.round(h * 0.47));
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `400 ${Math.round(h * 0.075)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText(tagline, tx, Math.round(h * 0.60));
  if (sub) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `400 ${Math.round(h * 0.055)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillText(sub, tx, Math.round(h * 0.70));
  }

  // color dots = the six note types
  NOTE_COLORS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(tx + Math.round(h * 0.04) + i * Math.round(h * 0.09), Math.round(h * 0.82), Math.round(h * 0.03), 0, Math.PI * 2);
    ctx.fill();
  });

  writeFileSync(path.join(outDir, file), canvas.toBuffer('image/png'));
  console.log(`store/promo/${file} (${w}×${h})`);
}

await render(440, 280, 'small-tile-440x280.png', {
  iconSize: 96, title: 'StickySites', tagline: 'Sticky notes for every website',
  sub: 'Site · page · daily · to-do · outline',
});
await render(1400, 560, 'marquee-1400x560.png', {
  iconSize: 200, title: 'StickySites', tagline: 'Sticky notes for every website',
  sub: 'Global · site · page · daily · to-do · outliner — private, local, encrypted',
});
copyFileSync(path.join(repoRoot, 'icons', 'icon128.png'), path.join(outDir, 'icon-128.png'));
console.log('store/promo/icon-128.png');
