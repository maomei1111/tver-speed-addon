// アイコンPNG生成用の使い捨てスクリプト。
// シンプルな角丸赤背景 + 白い ">>" 風の速度アイコンを各サイズで生成する。
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
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

function buildPng(size) {
  const bg = [255, 82, 82]; // #ff5252
  const fg = [255, 255, 255];
  const pad = Math.round(size * 0.28);

  function isArrowPixel(x, y) {
    // 中央に ">" 風の三角を2つ並べた簡易アイコン
    const cx = size / 2;
    const cy = size / 2;
    const s = size - pad * 2;
    const nx = (x - (cx - s / 2)) / s; // 0..1
    const ny = (y - (cy - s / 2)) / s; // 0..1
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return false;

    function inTriangle(offset) {
      const lx = (nx - offset) * 2.2;
      if (lx < 0 || lx > 1) return false;
      const half = Math.abs(ny - 0.5) * 2;
      return half <= 1 - lx;
    }
    return inTriangle(0) || inTriangle(0.35);
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // フィルタなし
    for (let x = 0; x < size; x++) {
      const drawFg = isArrowPixel(x, y);
      const color = drawFg ? fg : bg;
      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
      raw[offset++] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

const outDir = path.join(__dirname, "..", "icons");
[16, 48, 128].forEach((size) => {
  const png = buildPng(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
});
