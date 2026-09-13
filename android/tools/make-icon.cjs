/**
 * 从 android/assets-src/icon.html 生成各密度启动图标。
 *
 * 为什么要自己写 PNG 编解码：这台机器没有任何图像库（没 ImageMagick、没 sharp、
 * 也没装 PIL），但图标需要 5 个密度桶。Chrome 无头截图的窗口宽度有 500px 下限，
 * 没法直接截 48px 的小图，所以走「截 512 → 自己降采样 → 自己编码」。
 *
 * 用法：node android/tools/make-icon.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC_HTML = path.join(ROOT, 'android', 'assets-src', 'icon.html');
const RES = path.join(ROOT, 'android', 'res');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Android 启动图标各密度的标准像素尺寸
const BUCKETS = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

/* ---------------- PNG 解码（8bit / colorType 0,2,6） ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('only 8-bit png supported, got ' + bitDepth);
  if (interlace !== 0) throw new Error('interlaced png not supported');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error('unsupported colorType ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * ch);
  const zero = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : zero;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      const v = line[x];
      let val;
      if (filter === 0) val = v;
      else if (filter === 1) val = v + a;
      else if (filter === 2) val = v + b;
      else if (filter === 3) val = v + ((a + b) >> 1);
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('bad filter ' + filter + ' at row ' + y);
      cur[x] = val & 0xff;
    }
  }
  return { width: w, height: h, channels: ch, data: out };
}

/* ---------------- PNG 编码（固定 RGBA 8bit） ---------------- */

function encodePNG(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- 面积平均降采样 ---------------- */

function resize(src, dw, dh) {
  const { width: sw, height: sh, channels: sc, data } = src;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh);
    const y1 = Math.max(y0 + 1, Math.ceil(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw);
      const x1 = Math.max(x0 + 1, Math.ceil(((x + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * sw + xx) * sc;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          a += sc === 4 ? data[i + 3] : 255;
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: dw, height: dh, channels: 4, data: out };
}

/* ---------------- 主流程 ---------------- */

const tmp = path.join(require('os').tmpdir(), 'liuyige-icon-512.png');

execFileSync(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=512,512',
  '--screenshot=' + tmp,
  'file:///' + SRC_HTML.replace(/\\/g, '/'),
], { stdio: 'inherit' });

const src = decodePNG(fs.readFileSync(tmp));
console.log(`源图 ${src.width}x${src.height} ch=${src.channels}`);

// 512 那份同时留作商店图标素材（官方要求 ≥512×512）
const big = path.join(ROOT, 'android', 'assets-src', 'icon-512.png');
fs.writeFileSync(big, encodePNG(src.width, src.height, toRGBA(src)));
console.log('store icon ->', path.relative(ROOT, big));

for (const [bucket, size] of BUCKETS) {
  const dir = path.join(RES, 'mipmap-' + bucket);
  fs.mkdirSync(dir, { recursive: true });
  const small = resize(src, size, size);
  const file = path.join(dir, 'ic_launcher.png');
  fs.writeFileSync(file, encodePNG(size, size, small.data));
  // 回读校验，确认真的落了盘（这台机器沙箱会静默吞掉工作区外的写入）
  const back = fs.readFileSync(file);
  const chk = decodePNG(back);
  console.log(`${bucket.padEnd(8)} ${size}x${size}  ${back.length}B  校验=${chk.width}x${chk.height}`);
}

function toRGBA(img) {
  if (img.channels === 4) return img.data;
  const out = Buffer.alloc(img.width * img.height * 4);
  for (let i = 0, j = 0; i < img.width * img.height; i++, j += img.channels) {
    out[i * 4] = img.data[j];
    out[i * 4 + 1] = img.data[j + 1];
    out[i * 4 + 2] = img.data[j + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
