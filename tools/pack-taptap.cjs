#!/usr/bin/env node
'use strict';

// TapTap 上传包打包器。
//
// 依据 developer.taptap.cn《创建小游戏》第 5 节「包体上传」，以及 TapTap 社区的
// 《PC 游戏包体上传注意事项》，zip 的硬性要求是：
//   1. 包体是 .zip，解压后**第一级有且仅有一个文件夹**；
//   2. 该文件夹名只可含英文/数字；
//   3. 文件夹下必须有 index.html（启动文件），且**不能再套一层文件夹**
//      —— 也就是 zip → liuyige → index.html，不能 zip → a → b → index.html；
//   4. 首包（压缩后）不超过 60M。
//
// 只装运行时文件。tests/ tools/ 文档 / 历代截图一律不进包：它们不影响游戏，
// 却会把包撑大，也会把内部思路一起交出去。
//
// 为什么不用 PowerShell 的 Compress-Archive：它写 zip 条目名时历史上会用反斜杠
// 当分隔符（ZipFile 的旧实现），而 zip 规范只认正斜杠；平台侧的解析器不一定容错。
// 这里自己写 zip，分隔符、压缩方法、CRC 全在掌控里，并且没引任何第三方依赖。
//
// 用法：
//   node tools/pack-taptap.cjs            铺目录 + 出 zip + 自检
//   node tools/pack-taptap.cjs --no-zip   只铺目录，不出 zip

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// zip 里那个唯一的第一级文件夹。只能用英文/数字，所以取仓库名。
const PKG_NAME = 'liuyige';
// 上传时在控制台「版本设置」里填的版本号，格式 V x.y.z。这里只做记录与自检。
const VERSION = '1.0.4';
const SIZE_LIMIT = 60 * 1024 * 1024;

// 运行时文件。index.html 是入口，其余是它 defer 引入的依赖，一个都不能少。
const RUNTIME = ['index.html', 'style.css', 'core.js', 'art.js', 'music.js', 'ads.js', 'game.js'];

// 附带的两个 TapTap 配置文件。
// game.json 是「小游戏」路线的配置，deviceOrientation 顺便把「这是竖屏游戏」写明白；
// project.config.json 同样是「小游戏」的工程配置。H5/WebGL 路线用不到，留着无害。
const EXTRA = {
  'game.json': JSON.stringify({ deviceOrientation: 'portrait' }, null, 2) + '\n',
  'project.config.json': JSON.stringify(
    { description: '留一格 · 旧物开箱：回忆收纳师', setting: { es6: true } },
    null, 2
  ) + '\n',
};

// ---------------------------------------------------------------------------
// 极简 ZIP 写入器
// ---------------------------------------------------------------------------

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

function dosStamp(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// entries: [{ name, data }]，name 一律用正斜杠。
function makeZip(entries, when = new Date()) {
  const { time, date } = dosStamp(when);
  const body = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = Buffer.from(e.data);
    const crc = crc32(raw);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // 压缩后反而更大就退回 store，别为了「压缩过」硬套 deflate。
    const packed = deflated.length < raw.length;
    const payload = packed ? deflated : raw;
    const method = packed ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);      // version needed
    lh.writeUInt16LE(0x0800, 6);  // 文件名按 UTF-8 解释
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    body.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);      // version made by
    ch.writeUInt16LE(20, 6);      // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);      // extra len
    ch.writeUInt16LE(0, 32);      // comment len
    ch.writeUInt16LE(0, 34);      // disk start
    ch.writeUInt16LE(0, 36);      // internal attrs
    ch.writeUInt32LE(0, 38);      // external attrs
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }

  const cd = Buffer.concat(central);
  if (offset + cd.length > 0xffffffff) throw new Error('包体超过 4G，需要 ZIP64，本脚本未实现');

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...body, cd, eocd]);
}

// 读回中央目录，只信磁盘上的字节，不信自己刚写的内存变量。
function readZip(buf) {
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  if (p < 0) throw new Error('不是有效的 zip：找不到 EOCD');
  const declared = buf.readUInt16LE(p + 10);
  const cdOffset = buf.readUInt32LE(p + 16);

  const out = [];
  let q = cdOffset;
  for (let i = 0; i < declared; i++) {
    if (buf.readUInt32LE(q) !== 0x02014b50) throw new Error(`第 ${i + 1} 条中央目录记录签名不对`);
    const nameLen = buf.readUInt16LE(q + 28);
    const extraLen = buf.readUInt16LE(q + 30);
    const cmtLen = buf.readUInt16LE(q + 32);
    out.push({
      name: buf.slice(q + 46, q + 46 + nameLen).toString('utf8'),
      method: buf.readUInt16LE(q + 10),
      comp: buf.readUInt32LE(q + 20),
      size: buf.readUInt32LE(q + 24),
      offset: buf.readUInt32LE(q + 42),
    });
    q += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

function extract(buf, entry) {
  const o = entry.offset;
  if (buf.readUInt32LE(o) !== 0x04034b50) throw new Error('本地文件头签名不对：' + entry.name);
  const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
  const raw = buf.slice(start, start + entry.comp);
  return entry.method === 8 ? zlib.inflateRawSync(raw) : raw;
}

// ---------------------------------------------------------------------------
// 打包
// ---------------------------------------------------------------------------

const problems = [];
const warn = m => problems.push(m);

function main() {
  const wantZip = !process.argv.includes('--no-zip');

  // 1) 铺目录
  // 只清理本脚本自己的产物。dist/ 里还放着宣传片（tools/make-promo.cjs 手录的 mp4）
  // 与 APK，整个目录递归删会把它一起带走——2026-09-14 打完 H5 包才发现 promo 没了。
  fs.mkdirSync(DIST, { recursive: true });
  for (const stale of [PKG_NAME, `${PKG_NAME}.zip`]) {
    fs.rmSync(path.join(DIST, stale), { recursive: true, force: true });
  }
  const pkgDir = path.join(DIST, PKG_NAME);
  fs.mkdirSync(pkgDir, { recursive: true });

  const planned = [];
  for (const name of RUNTIME) {
    const src = path.join(ROOT, name);
    if (!fs.existsSync(src)) { warn(`缺少运行时文件：${name}`); continue; }
    planned.push({ name: `${PKG_NAME}/${name}`, data: fs.readFileSync(src) });
  }
  for (const [name, text] of Object.entries(EXTRA)) {
    planned.push({ name: `${PKG_NAME}/${name}`, data: Buffer.from(text, 'utf8') });
  }

  if (problems.length) {
    console.log('打包中止：');
    for (const p of problems) console.log('  ✗ ' + p);
    process.exit(1);
  }

  for (const e of planned) fs.writeFileSync(path.join(DIST, e.name), e.data);

  // 2) 出 zip
  let zipBuf = null;
  if (wantZip) {
    zipBuf = makeZip(planned);
    fs.writeFileSync(path.join(DIST, `${PKG_NAME}.zip`), zipBuf);
  }

  // 3) 自检 —— 全部读磁盘上的 zip，不读内存
  console.log('TapTap 上传包');
  console.log(`  包名        ${PKG_NAME}`);
  console.log(`  版本        V${VERSION}（在控制台「版本设置」里填这个）`);
  console.log('');

  const runtimeTotal = planned.reduce((a, b) => a + b.data.length, 0);
  console.log('  目录 ' + path.relative(ROOT, pkgDir).replace(/\\/g, '/') + '/');
  for (const e of planned) {
    console.log('    ' + e.name.slice(PKG_NAME.length + 1).padEnd(22) + (e.data.length / 1024).toFixed(1) + 'KB');
  }
  console.log('    ' + '合计'.padEnd(20) + (runtimeTotal / 1024).toFixed(1) + 'KB');
  console.log('');

  if (!zipBuf) { console.log('  （--no-zip：未生成 zip）'); return; }

  const entries = readZip(zipBuf);

  // 3a) 第一级有且仅有一个文件夹
  const tops = [...new Set(entries.map(e => e.name.split('/')[0]))];
  if (tops.length !== 1) warn(`第一级应当只有 1 个文件夹，实际 ${tops.length} 个：${tops.join('、')}`);
  if (tops[0] !== PKG_NAME) warn(`第一级文件夹应叫 ${PKG_NAME}，实际 ${tops[0]}`);

  // 3b) 文件名只含英文/数字
  if (!/^[A-Za-z0-9]+$/.test(PKG_NAME)) warn(`包名 ${PKG_NAME} 含非英文数字字符`);

  // 3c) 入口在文件夹第一层，不能再套一层
  const entryPath = `${PKG_NAME}/index.html`;
  if (!entries.some(e => e.name === entryPath)) warn(`缺少入口 ${entryPath}`);

  // 3d) 所有条目都在这个文件夹里，且没有空目录、没有反斜杠
  for (const e of entries) {
    if (!e.name.startsWith(PKG_NAME + '/')) warn(`条目跑到包外了：${e.name}`);
    if (e.name.includes('\\')) warn(`条目名出现反斜杠（zip 规范只认正斜杠）：${e.name}`);
    if (e.name.endsWith('/')) warn(`出现了空目录条目：${e.name}`);
    if (/^__MACOSX|\.DS_Store|Thumbs\.db/i.test(e.name)) warn(`混进了系统垃圾文件：${e.name}`);
  }

  // 3e) 解回来逐字节比对源文件 —— 证明压缩没把内容改坏
  let mismatched = 0;
  for (const e of entries) {
    const rel = e.name.slice(PKG_NAME.length + 1);
    const src = RUNTIME.includes(rel) ? fs.readFileSync(path.join(ROOT, rel)) : Buffer.from(EXTRA[rel], 'utf8');
    if (!extract(zipBuf, e).equals(src)) { warn(`解压回来和源文件不一致：${e.name}`); mismatched++; }
  }

  // 3f) 体积
  const zipSize = zipBuf.length;
  if (zipSize > SIZE_LIMIT) warn(`包体 ${(zipSize / 1024 / 1024).toFixed(1)}M 超过 60M 上限`);

  console.log(`  ${PKG_NAME}.zip`);
  console.log(`    条目          ${entries.length} 个`);
  console.log(`    压缩后        ${(zipSize / 1024).toFixed(1)}KB（上限 60M，用了 ${(zipSize / SIZE_LIMIT * 100).toFixed(3)}%）`);
  console.log(`    压缩前        ${(runtimeTotal / 1024).toFixed(1)}KB`);
  console.log(`    第一级文件夹   ${tops.join('、')}`);
  console.log(`    入口          ${entries.some(e => e.name === entryPath) ? entryPath + ' ✓' : '缺失 ✗'}`);
  console.log(`    内容比对      ${mismatched ? mismatched + ' 个不一致 ✗' : '逐个文件与源文件一致 ✓'}`);
  console.log('');

  if (problems.length) {
    console.log(`发现 ${problems.length} 个问题：`);
    for (const p of problems) console.log('  ✗ ' + p);
    process.exit(1);
  }
  console.log('结构合规 ✓  可以直接上传');
}

main();
