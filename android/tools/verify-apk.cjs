/**
 * APK 产物校验。
 *
 * 这台机器没有安卓真机也没有模拟器，构建出来的 APK 没法「跑一遍看看」。
 * 能做的确定性质检是：把 APK 当成 zip 拆开，确认
 *   1. 框架该有的东西都在（AndroidManifest.xml / resources.arsc / classes.dex）
 *   2. assets/liuyige/ 下的游戏文件与项目根目录的源文件逐字节一致
 *   3. 签名块存在（v1 的 META-INF/*.RSA 或 v2 的 APK Signing Block）
 * 这样至少排掉「文件漏打 / 打错版本 / 没签上名」这三类必然致命的问题。
 *
 * 用法：node android/tools/verify-apk.cjs [apk路径]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APK = process.argv[2] || path.join(ROOT, 'dist', 'liuyige.apk');

const GAME_FILES = ['index.html', 'style.css', 'core.js', 'art.js', 'music.js', 'ads.js', 'game.js'];

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
  // EOCD 在文件末尾，注释最长 65535，往前找签名
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('没找到 zip 中央目录（不是合法 zip/apk）');
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
  throw new Error(`不支持的压缩方法 ${e.method}（${e.name}）`);
}

/* ------------------------------ 开始校验 ------------------------------ */

if (!fs.existsSync(APK)) {
  console.error(`找不到 APK: ${APK}\n先跑 node android/tools/build-apk.cjs`);
  process.exit(1);
}

const buf = fs.readFileSync(APK);
const entries = readCentralDirectory(buf);
const byName = new Map(entries.map((e) => [e.name, e]));

console.log(`APK        ${path.relative(ROOT, APK)}`);
console.log(`大小       ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`条目       ${entries.length} 个`);

let problems = [];

// 1. 框架必需项
console.log('\n-- 框架文件 --');
for (const need of ['AndroidManifest.xml', 'resources.arsc', 'classes.dex']) {
  const ok = byName.has(need);
  console.log(`${ok ? 'OK  ' : 'MISS'} ${need}${ok ? '  ' + byName.get(need).usize + 'B' : ''}`);
  if (!ok) problems.push('缺 ' + need);
}

// 2. 条目名分隔符检查
// zip 规范只认正斜杠。aapt2 在 Windows 上传反斜杠路径时会把条目名写成
// "assets/liuyige\art.js"，包本身合法、apksigner 也照签，但 Android 按
// assets/liuyige/index.html 找不到文件 —— 表现是装上后白屏，很难往打包上想。
console.log('\n-- 条目名分隔符 --');
const backslash = entries.filter((e) => e.name.includes('\\')).map((e) => e.name);
if (backslash.length) {
  console.log('BAD  以下条目用了反斜杠:');
  for (const n of backslash) console.log('     ' + n);
  problems.push('条目名含反斜杠（Android 找不到这些文件）: ' + backslash.join(', '));
} else {
  console.log('OK   全部使用正斜杠');
}

// 3. 游戏文件逐个比对
console.log('\n-- assets/liuyige/ 与源文件比对 --');
for (const f of GAME_FILES) {
  const entryName = `assets/liuyige/${f}`;
  const e = byName.get(entryName);
  if (!e) {
    console.log(`MISS ${entryName}`);
    problems.push('缺 ' + entryName);
    continue;
  }
  const data = extract(buf, e);
  const crcOk = crc32(data) === e.crc;
  const src = fs.readFileSync(path.join(ROOT, f));
  const same = data.equals(src);
  const srcSha = crypto.createHash('sha256').update(src).digest('hex').slice(0, 12);
  const apkSha = crypto.createHash('sha256').update(data).digest('hex').slice(0, 12);
  console.log(
    `${same && crcOk ? 'OK  ' : 'BAD '} ${entryName.padEnd(26)} ${String(data.length).padStart(6)}B  crc=${crcOk ? 'ok' : 'BAD'}  ${same ? '与源文件一致 ' + srcSha : '不一致! src=' + srcSha + ' apk=' + apkSha}`
  );
  if (!crcOk) problems.push(entryName + ' crc 校验失败');
  if (!same) problems.push(entryName + ' 内容与源文件不一致');
}

// 3. 签名
console.log('\n-- 签名 --');
const v1 = entries.filter((e) => /^META-INF\/.*\.(RSA|DSA|EC|SF)$/i.test(e.name)).map((e) => e.name);
console.log(`v1 (JAR 签名): ${v1.length ? v1.join(', ') : '无'}`);
// v2/v3 签名块紧跟在最后一个本地文件头之后、中央目录之前，签名固定以 "APK Sig Block 42" 结尾
const magic = Buffer.from('APK Sig Block 42');
const v2 = buf.includes(magic);
console.log(`v2/v3 (APK Signing Block): ${v2 ? '存在' : '无'}`);
if (!v1.length && !v2) problems.push('没有任何签名');

// 4. 不该进包的东西
console.log('\n-- 泄露检查（以下内容不应出现在包里）--');
const leaks = entries
  .map((e) => e.name)
  .filter((n) => /(^|\/)(tests|tools)\/|\.md$|serve\.cjs|keystore\.properties|\.jks$|\.git/i.test(n));
console.log(leaks.length ? '发现: ' + leaks.join(', ') : '干净：无测试/工具/文档/密钥');
if (leaks.length) problems.push('包含不该上传的内容: ' + leaks.join(', '));

console.log('\n================ 校验结果 ================');
if (problems.length) {
  console.log('发现问题 ' + problems.length + ' 项：');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('全部通过 ✓  APK 结构完整、游戏文件与源文件逐字节一致、签名有效');
