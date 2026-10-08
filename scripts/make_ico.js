import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Generate a clean 32x32 icon for MAMRS
// Forest green: [56, 76, 36] (BGRA: 56, 76, 36, 255)
// Lime: [167, 233, 215] (BGRA: 167, 233, 215, 255)
const W = 32, H = 32;
const pixels = new Uint8Array(W * H * 4); // row 0 is bottom (y=H-1 to 0)

function setPixel(x, y, b, g, r, a) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const idx = ((H - 1 - y) * W + x) * 4; // Bottom-to-top for Windows DIB
  pixels[idx] = b;
  pixels[idx + 1] = g;
  pixels[idx + 2] = r;
  pixels[idx + 3] = a;
}

// Draw rounded background squircle
const radius = 8;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let inRect = true;
    if (x < radius && y < radius) {
      inRect = Math.hypot(x - radius, y - radius) <= radius;
    } else if (x >= W - radius && y < radius) {
      inRect = Math.hypot(x - (W - 1 - radius), y - radius) <= radius;
    } else if (x < radius && y >= H - radius) {
      inRect = Math.hypot(x - radius, y - (H - 1 - radius)) <= radius;
    } else if (x >= W - radius && y >= H - radius) {
      inRect = Math.hypot(x - (W - 1 - radius), y - (H - 1 - radius)) <= radius;
    }

    if (inRect) {
      // Subtle gradient from top (lighter forest green) to bottom (deeper)
      const t = y / H;
      const r = Math.round(40 - t * 10);
      const g = Math.round(85 - t * 15);
      const b = Math.round(60 - t * 12);
      setPixel(x, y, b, g, r, 255);
    } else {
      setPixel(x, y, 0, 0, 0, 0);
    }
  }
}

// Foreground color (Lime: #d7e9a7 -> R:215, G:233, B:167)
const LIME_B = 167, LIME_G = 233, LIME_R = 215;

function drawLime(x, y) {
  setPixel(x, y, LIME_B, LIME_G, LIME_R, 255);
}

// Draw diagonal arrow ↗ in top right
// Head at (26, 6)
for (let i = 0; i <= 5; i++) {
  drawLime(21 + i, 11 - i); // Diagonal shaft
  drawLime(21 + i, 12 - i);
}
// Arrow head lines
for (let x = 22; x <= 26; x++) { drawLime(x, 6); drawLime(x, 7); }
for (let y = 6; y <= 10; y++) { drawLime(26, y); drawLime(25, y); }

// Draw italic 'm' in lower-left / center
// Left stem (slanted): around x=7 to 9, y=14 to 24
for (let y = 14; y <= 24; y++) {
  const sx = Math.round(8 - (y - 19) * 0.25);
  drawLime(sx, y);
  drawLime(sx + 1, y);
}
// Serif bottom-left
drawLime(6, 24); drawLime(7, 24); drawLime(10, 24);
// Serif top-left
drawLime(6, 14); drawLime(7, 14);

// First arch from x=9 to 14, y=14 to 17
drawLime(10, 14); drawLime(11, 13); drawLime(12, 13); drawLime(13, 14);
drawLime(10, 15); drawLime(11, 14); drawLime(12, 14); drawLime(13, 15);

// Middle stem
for (let y = 15; y <= 24; y++) {
  const sx = Math.round(14 - (y - 19) * 0.25);
  drawLime(sx, y);
  drawLime(sx + 1, y);
}

// Second arch from x=15 to 20, y=14 to 17
drawLime(16, 14); drawLime(17, 13); drawLime(18, 13); drawLime(19, 14);
drawLime(16, 15); drawLime(17, 14); drawLime(18, 14); drawLime(19, 15);

// Right stem
for (let y = 15; y <= 24; y++) {
  const sx = Math.round(20 - (y - 19) * 0.25);
  drawLime(sx, y);
  drawLime(sx + 1, y);
}
// Terminal foot on right
drawLime(22, 23); drawLime(22, 24); drawLime(23, 23);

// Build ICO header + DIB
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = ICO
header.writeUInt16LE(1, 4); // count: 1 image

const dibHeaderSize = 40;
const pixelDataSize = W * H * 4;
const andMaskSize = (W * H) / 8; // 128 bytes
const imageSize = dibHeaderSize + pixelDataSize + andMaskSize;

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(W, 0);
dirEntry.writeUInt8(H, 1);
dirEntry.writeUInt8(0, 2); // color count
dirEntry.writeUInt8(0, 3); // reserved
dirEntry.writeUInt16LE(1, 4); // planes
dirEntry.writeUInt16LE(32, 6); // bit count
dirEntry.writeUInt32LE(imageSize, 8); // bytes in res
dirEntry.writeUInt32LE(22, 12); // image offset

const bih = Buffer.alloc(40);
bih.writeUInt32LE(40, 0); // biSize
bih.writeInt32LE(W, 4); // biWidth
bih.writeInt32LE(H * 2, 8); // biHeight (double height for XOR + AND masks)
bih.writeUInt16LE(1, 12); // biPlanes
bih.writeUInt16LE(32, 14); // biBitCount
bih.writeUInt32LE(0, 16); // biCompression (BI_RGB)
bih.writeUInt32LE(pixelDataSize, 20); // biSizeImage
bih.writeInt32LE(0, 24); // XPels
bih.writeInt32LE(0, 28); // YPels
bih.writeUInt32LE(0, 32); // ClrUsed
bih.writeUInt32LE(0, 36); // ClrImportant

// AND mask (1 bit per pixel, 0 for opaque/semitransparent, 1 for transparent)
const andMask = Buffer.alloc(andMaskSize, 0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const pIdx = ((H - 1 - y) * W + x) * 4;
    const a = pixels[pIdx + 3];
    if (a === 0) {
      const bitIndex = (H - 1 - y) * W + x;
      const byteIdx = Math.floor(bitIndex / 8);
      const bitOffset = 7 - (bitIndex % 8);
      andMask[byteIdx] |= (1 << bitOffset);
    }
  }
}

const icoBuffer = Buffer.concat([header, dirEntry, bih, Buffer.from(pixels.buffer), andMask]);
writeFileSync(resolve(root, 'public/favicon.ico'), icoBuffer);
console.log('Successfully wrote public/favicon.ico, size:', icoBuffer.length);
