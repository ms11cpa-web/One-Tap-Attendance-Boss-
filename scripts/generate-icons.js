import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPNG(width, height, drawFn) {
  // RGBA buffer with filter byte per line
  const rowBytes = width * 4 + 1;
  const rawData = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const chunkType = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([chunkType, data]));
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, chunkType, data, crcBuf]);
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk('IHDR', ihdrData);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function drawBrandIcon(x, y, w, h, isMaskable = false) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background deep navy #0f172a -> #1e293b
  const bgR = 15 + Math.floor((15 * y) / h);
  const bgG = 23 + Math.floor((18 * y) / h);
  const bgB = 42 + Math.floor((17 * y) / h);

  if (!isMaskable) {
    // Rounded corner for regular icon
    const cornerRadius = w * 0.22;
    const innerX = Math.max(Math.abs(dx) - (w / 2 - cornerRadius), 0);
    const innerY = Math.max(Math.abs(dy) - (h / 2 - cornerRadius), 0);
    if (Math.sqrt(innerX * innerX + innerY * innerY) > cornerRadius) {
      return [0, 0, 0, 0]; // Transparent outside rounded rect
    }
  }

  // Ring around center
  const ringRadius = w * 0.32;
  const ringThickness = w * 0.025;
  if (Math.abs(dist - ringRadius) < ringThickness) {
    return [16, 185, 129, 255]; // Emerald
  }

  // Inner shield/badge
  const shieldWidth = w * 0.42;
  const shieldHeight = h * 0.46;
  if (Math.abs(dx) < shieldWidth / 2 && dy > -shieldHeight / 2 && dy < shieldHeight / 2) {
    // Simple B shape / checkmark
    const relX = dx / (w * 0.2);
    const relY = dy / (h * 0.2);

    // Vertical spine of B
    if (relX >= -0.7 && relX <= -0.4 && relY >= -0.7 && relY <= 0.7) {
      return [255, 255, 255, 255];
    }
    // Top loop of B
    const dTop = Math.sqrt(Math.pow(relX - -0.2, 2) + Math.pow(relY - -0.35, 2));
    if (dTop >= 0.25 && dTop <= 0.5 && relX >= -0.4) {
      return [255, 255, 255, 255];
    }
    // Bottom loop of B
    const dBot = Math.sqrt(Math.pow(relX - -0.2, 2) + Math.pow(relY - 0.35, 2));
    if (dBot >= 0.28 && dBot <= 0.53 && relX >= -0.4) {
      return [255, 255, 255, 255];
    }
    // Active pulse dot
    if (Math.sqrt(Math.pow(relX - 0.7, 2) + Math.pow(relY - -0.6, 2)) < 0.2) {
      return [16, 185, 129, 255]; // emerald
    }
  }

  return [bgR, bgG, bgB, 255];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 512x512
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPNG(512, 512, (x, y, w, h) => drawBrandIcon(x, y, w, h, false)));
// 512x512 maskable (safe-zone full bleed background)
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPNG(512, 512, (x, y, w, h) => drawBrandIcon(x, y, w, h, true)));
// 192x192
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPNG(192, 192, (x, y, w, h) => drawBrandIcon(x, y, w, h, false)));
// 180x180 apple-touch-icon
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPNG(180, 180, (x, y, w, h) => drawBrandIcon(x, y, w, h, false)));
// favicon.ico (using 32x32 PNG inside or 64x64)
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPNG(64, 64, (x, y, w, h) => drawBrandIcon(x, y, w, h, false)));

console.log('PWA PNG and icon assets successfully generated!');
