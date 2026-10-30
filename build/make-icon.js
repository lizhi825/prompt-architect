const fs = require('fs');
const path = require('path');

const S = 256;
const R = 54;

function inRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  if (x < r && y < r) return (x - r) * (x - r) + (y - r) * (y - r) <= r * r;
  if (x > w - r - 1 && y < r) return (x - (w - r - 1)) * (x - (w - r - 1)) + (y - r) * (y - r) <= r * r;
  if (x < r && y > h - r - 1) return (x - r) * (x - r) + (y - (h - r - 1)) * (y - (h - r - 1)) <= r * r;
  if (x > w - r - 1 && y > h - r - 1) return (x - (w - r - 1)) * (x - (w - r - 1)) + (y - (h - r - 1)) * (y - (h - r - 1)) <= r * r;
  return true;
}

const bars = [
  [54, 66, 152, 20],
  [54, 118, 112, 20],
  [54, 170, 72, 20]
];

const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    if (inRoundRect(x, y, S, S, R)) { r = 0x25; g = 0x63; b = 0xEB; a = 255; }
    for (const [bx, by, bw, bh] of bars) {
      if (inRoundRect(x - bx, y - by, bw, bh, 10)) { r = 255; g = 255; b = 255; a = 255; }
    }
    const off = ((S - 1 - y) * S + x) * 4;
    px[off] = b; px[off + 1] = g; px[off + 2] = r; px[off + 3] = a;
  }
}

const andMask = Buffer.alloc((S / 8) * S);

const hdr = Buffer.alloc(40);
hdr.writeUInt32LE(40, 0);
hdr.writeInt32LE(S, 4);
hdr.writeInt32LE(S * 2, 8);
hdr.writeUInt16LE(1, 12);
hdr.writeUInt16LE(32, 14);
hdr.writeUInt32LE(0, 16);
hdr.writeInt32LE(0, 20);
hdr.writeInt32LE(0, 24);
hdr.writeInt32LE(0, 28);
hdr.writeUInt32LE(0, 32);
hdr.writeUInt32LE(0, 36);

const bmp = Buffer.concat([hdr, px, andMask]);

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0;
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(bmp.length, 8);
entry.writeUInt32LE(22, 12);

const out = path.join(__dirname, 'icon.ico');
fs.mkdirSync(__dirname, { recursive: true });
fs.writeFileSync(out, Buffer.concat([dir, entry, bmp]));
console.log('icon written:', out, fs.statSync(out).size, 'bytes');
