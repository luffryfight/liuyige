/**
 * 自研 zip 解压器（逐条目验 CRC）。
 *
 * 为什么不用系统 tar：bsdtar 解 Google 的 SDK 包时只会甩一句
 * "Error exit delayed from previous errors"，不说是哪个条目坏、也不说 CRC 对不对。
 * 而这些 zip 是 16 连接分块下下来的，必须能定位到具体条目才能判断是下载损坏还是工具问题。
 *
 * 用法:
 *   node android/tools/unzip-zip.cjs <zip> <目标目录>     解压并校验
 *   node android/tools/unzip-zip.cjs <zip> --list         只列条目
 *   node android/tools/unzip-zip.cjs <zip> --check        只校验 CRC，不解压
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

function readCentralDirectory(buf) {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('没找到 zip 中央目录');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error(`中央目录第 ${i} 条头部异常`);
    const e = {
      method: buf.readUInt16LE(off + 10),
      crc: buf.readUInt32LE(off + 16),
      csize: buf.readUInt32LE(off + 20),
      usize: buf.readUInt32LE(off + 24),
      nlen: buf.readUInt16LE(off + 28),
      elen: buf.readUInt16LE(off + 30),
      clen: buf.readUInt16LE(off + 32),
      lho: buf.readUInt32LE(off + 42),
    };
    e.name = buf.toString('utf8', off + 46, off + 46 + e.nlen);
    entries.push(e);
    off += 46 + e.nlen + e.elen + e.clen;
  }
  return entries;
}

function extract(buf, e) {
  const nlen = buf.readUInt16LE(e.lho + 26);
  const elen = buf.readUInt16LE(e.lho + 28);
  const start = e.lho + 30 + nlen + elen;
  const comp = buf.subarray(start, start + e.csize);
  if (e.method === 0) return Buffer.from(comp);
  if (e.method === 8) return zlib.inflateRawSync(comp);
  throw new Error(`不支持的压缩方法 ${e.method}`);
}

/* ---------------------------------- CLI ---------------------------------- */

const zipPath = process.argv[2];
const arg = process.argv[3];
if (!zipPath || !arg) {
  console.error('usage: node unzip-zip.cjs <zip> <destDir|--list|--check>');
  process.exit(2);
}

const buf = fs.readFileSync(zipPath);
const entries = readCentralDirectory(buf);

if (arg === '--list') {
  console.log(`共 ${entries.length} 个条目`);
  for (const e of entries) console.log(`  ${e.usize.toString().padStart(9)}  ${e.name}`);
  process.exit(0);
}

const destDir = arg === '--check' ? null : arg;
let bad = 0;
let done = 0;

for (const e of entries) {
  const isDir = e.name.endsWith('/');
  try {
    const data = extract(buf, e);
    const ok = crc32(data) === e.crc;
    if (!ok) {
      bad++;
      console.log(`BAD  CRC 不符  ${e.name}  (期望 ${e.crc.toString(16)} 实际 ${crc32(data).toString(16)})`);
      continue;
    }
    if (e.usize !== data.length) {
      bad++;
      console.log(`BAD  长度不符  ${e.name}  (期望 ${e.usize} 实际 ${data.length})`);
      continue;
    }
    if (destDir && !isDir) {
      const target = path.join(destDir, e.name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    } else if (destDir) {
      fs.mkdirSync(path.join(destDir, e.name), { recursive: true });
    }
    done++;
  } catch (err) {
    bad++;
    console.log(`BAD  解压异常  ${e.name}  ${err.message}`);
  }
}

console.log(`\n完好 ${done} / ${entries.length}，损坏 ${bad}`);
if (destDir) console.log(`已解到 ${destDir}`);
process.exit(bad ? 1 : 0);
