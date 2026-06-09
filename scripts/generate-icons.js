// Generates VideoLoop PWA icons (PNG) without external image libraries.
// Draws a dark rounded background with a pink "play" triangle.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rest zero (compression, filter, interlace)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [17, 17, 17]; // #111
  const accent = [255, 59, 92]; // #ff3b5c
  // Maskable icons need a safe padded area; reduce content scale.
  const radius = maskable ? size : size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rounded-rect background mask.
      const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(y - cy) - (size / 2 - radius), 0);
      const inside = Math.sqrt(dx * dx + dy * dy) <= radius;
      let r = 0, g = 0, b = 0, a = 0;
      if (inside) {
        [r, g, b] = bg;
        a = 255;
        // Play triangle.
        const s = size * (maskable ? 0.22 : 0.26);
        const tx = x - cx + s * 0.25;
        const ty = y - cy;
        if (
          tx > -s &&
          tx < s &&
          Math.abs(ty) < s - (tx + s) * 0.5
        ) {
          [r, g, b] = accent;
        }
      }
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return encodePNG(size, size, rgba);
}

const out = path.join(__dirname, "..", "public");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-192.png"), makeIcon(192, false));
fs.writeFileSync(path.join(out, "icon-512.png"), makeIcon(512, false));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), makeIcon(512, true));
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), makeIcon(180, false));
console.log("Icons written to public/");
