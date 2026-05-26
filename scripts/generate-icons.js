const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outDir = path.join(__dirname, '..', 'icons');

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Dark rounded square background
  const r = size * 0.2;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fillStyle = '#1e293b';
  ctx.fill();

  // Yellow notepad icon
  const pad = size * 0.15;
  const noteW = size - pad * 2;
  const noteH = size - pad * 2;
  ctx.beginPath();
  ctx.roundRect(pad, pad, noteW, noteH, size * 0.08);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();

  // Lines on notepad
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = Math.max(1, size * 0.04);
  const lineStart = pad + noteW * 0.2;
  const lineEnd = pad + noteW * 0.8;
  for (let i = 0; i < 3; i++) {
    const y = pad + noteH * (0.35 + i * 0.2);
    ctx.beginPath();
    ctx.moveTo(lineStart, y);
    ctx.lineTo(lineEnd, y);
    ctx.stroke();
  }

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`Generated icon${size}.png (${size}x${size})`);
}
