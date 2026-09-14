/**
 * 手工构建签名 APK —— 不依赖 Gradle。
 *
 * 为什么不用 Gradle：本机没有任何 Android 环境，装机成本最低的路径是把
 * Android SDK 的 build-tools 直接当命令行工具用（aapt2 → javac → d8 → zipalign → apksigner），
 * 每一步都能单独看见中间产物，出问题好定位。这个壳工程只有 1 个 Java 文件、10 个资源，
 * Gradle 带来的只有几百 MB 的依赖和一层看不见的缓存。
 *
 * 前置：先跑 node android/tools/setup-sdk.cjs 把 SDK 装到 D:/android-build/sdk
 * 用法：node android/tools/build-apk.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ANDROID = path.join(ROOT, 'android');
const BUILD = path.join(ANDROID, 'build');
const DIST = path.join(ROOT, 'dist');

const JAVA_HOME = process.env.LIUYIGE_JAVA_HOME || 'D:/android-build/jdk/jdk-17.0.2';
const SDK_ROOT = process.env.LIUYIGE_SDK_ROOT || 'D:/android-build/sdk';

const API_LEVEL = 34;
const MIN_SDK = 24;
const BUILD_TOOLS_PREFERRED = '34.0.0';

const VERSION_CODE = 1004;
const VERSION_NAME = '1.0.4';
const APP_ID = 'com.liuyige.game';

/** APK 里真正需要的七个运行时文件，顺序无所谓 */
const GAME_FILES = ['index.html', 'style.css', 'core.js', 'art.js', 'music.js', 'ads.js', 'game.js'];
/** 资源目录名，css/js 里用的都是相对路径，必须整目录平铺放进来 */
const ASSET_DIR_NAME = 'liuyige';

const ENV = { ...process.env, JAVA_HOME, PATH: path.join(JAVA_HOME, 'bin') + ';' + process.env.PATH };

/* ------------------------------ 小工具 ------------------------------ */

function run(exe, args, opts = {}) {
  const shown = [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  console.log('\n$ ' + shown);
  return execFileSync(exe, args, { stdio: 'inherit', env: ENV, ...opts });
}
/** .bat 必须经过 cmd.exe，直接 spawn 会 ENOENT */
function runBat(exe, args) {
  return run('cmd.exe', ['/c', exe, ...args]);
}
function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function die(msg) {
  console.error('\n[构建中止] ' + msg);
  process.exit(1);
}

/**
 * 修正 zip 条目名里的反斜杠。
 *
 * aapt2 在 Windows 上会把 assets 的条目名写成 "assets/liuyige\art.js" —— 前两级用正斜杠、
 * 文件名前用反斜杠。传正斜杠路径给它也没用，它内部按 Windows 原生分隔符拼。后果非常隐蔽：
 * zip 合法、apksigner 照签、apksigner verify 全绿，但 Android 的 AssetManager 是按
 * "assets/liuyige/index.html" 查找的，找不到 → 装上打开白屏，很难往打包上想。
 *
 * 好在 '\' 和 '/' 都是单字节，条目名长度不变，所以可以在中央目录和本地文件头里原地替换，
 * 不用重写整个压缩包；文件名也不参与 CRC 计算，CRC 与签名时间点都不受影响。
 */
function normalizeEntrySeparators(apkPath) {
  const buf = fs.readFileSync(apkPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) die('不是合法 zip，无法修正条目名: ' + apkPath);

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const items = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) die('中央目录第 ' + i + ' 条异常');
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    items.push({ nameOff: off + 46, nlen, lho: buf.readUInt32LE(off + 42) });
    off += 46 + nlen + elen + clen;
  }

  let changed = 0;
  const flip = (start, len) => {
    for (let i = 0; i < len; i++) {
      if (buf[start + i] === 0x5c) {
        buf[start + i] = 0x2f;
        changed++;
      }
    }
  };
  for (const e of items) {
    flip(e.nameOff, e.nlen);
    if (buf.readUInt32LE(e.lho) === 0x04034b50) flip(e.lho + 30, buf.readUInt16LE(e.lho + 26));
  }

  if (changed) {
    fs.writeFileSync(apkPath, buf);
    console.log(`[3.5] 修正 ${changed} 处条目名分隔符（\\ → /）`);
  } else {
    console.log('[3.5] 条目名分隔符无需修正');
  }
  return changed;
}

/* --------------------------- 环境检查 --------------------------- */

function resolveTools() {
  const javac = path.join(JAVA_HOME, 'bin', 'javac.exe');
  const keytool = path.join(JAVA_HOME, 'bin', 'keytool.exe');
  if (!fs.existsSync(javac)) die(`找不到 JDK: ${javac}\n先跑 node android/tools/setup-sdk.cjs`);

  const btRoot = path.join(SDK_ROOT, 'build-tools');
  if (!fs.existsSync(btRoot)) die(`找不到 build-tools: ${btRoot}\n先跑 node android/tools/setup-sdk.cjs`);
  const versions = fs
    .readdirSync(btRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  const btVer = versions.includes(BUILD_TOOLS_PREFERRED) ? BUILD_TOOLS_PREFERRED : versions[0];
  if (!btVer) die('build-tools 目录是空的，先跑 setup-sdk.cjs');
  const bt = path.join(btRoot, btVer);

  const androidJar = path.join(SDK_ROOT, 'platforms', `android-${API_LEVEL}`, 'android.jar');
  if (!fs.existsSync(androidJar)) die(`找不到 android.jar: ${androidJar}\n先跑 node android/tools/setup-sdk.cjs`);

  const need = ['aapt2.exe', 'zipalign.exe', 'apksigner.bat', 'd8.bat'];
  for (const n of need) {
    if (!fs.existsSync(path.join(bt, n))) die(`build-tools ${btVer} 缺少 ${n}`);
  }
  return { javac, keytool, bt, btVer, androidJar };
}

/* --------------------------- 签名密钥 --------------------------- */

function ensureKeystore(keytool) {
  const ks = path.join(ANDROID, 'liuyige-release.jks');
  const props = path.join(ANDROID, 'keystore.properties');
  if (fs.existsSync(ks) && fs.existsSync(props)) {
    const p = Object.fromEntries(
      fs
        .readFileSync(props, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith('#'))
        .map((l) => l.split('=').map((s) => s.trim()))
    );
    console.log(`\n复用已有签名密钥 ${path.basename(ks)} (alias=${p.alias})`);
    return { ks, ...p };
  }

  const storePass = 'liuyige' + Math.random().toString(36).slice(2, 10);
  const alias = 'liuyige';
  console.log('\n首次构建：生成自签名密钥（有效期 30 年）');
  run(keytool, [
    '-genkeypair',
    '-keystore', ks,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10950',
    '-storepass', storePass,
    '-keypass', storePass,
    '-dname', 'CN=liuyige, OU=keepsake, O=liuyige, L=Shenzhen, ST=Guangdong, C=CN',
  ]);
  // 密码落在本机、不进仓库（.gitignore 已排除），换机器更新版本时要一起带走
  fs.writeFileSync(
    props,
    [
      '# 这个文件由 build-apk.cjs 首次构建时生成，用来给 APK 签名。',
      '# 升级已上架的应用必须用同一份密钥，换机时请把 .jks 和本文件一起带走。',
      `storeFile=${path.basename(ks)}`,
      `storePassword=${storePass}`,
      `keyPassword=${storePass}`,
      `alias=${alias}`,
    ].join('\n') + '\n'
  );
  console.log(`密钥已保存到 android/${path.basename(ks)}，密码记在 android/keystore.properties`);
  return { ks, storePassword: storePass, keyPassword: storePass, alias };
}

/* --------------------------- 主流程 --------------------------- */

const { javac, keytool, bt, btVer, androidJar } = resolveTools();
console.log(`JDK        ${JAVA_HOME}`);
console.log(`SDK        ${SDK_ROOT}`);
console.log(`build-tools ${btVer}`);
console.log(`android.jar ${androidJar}`);

// [1/7] 同步游戏文件到 assets/
const assetsDir = path.join(ANDROID, 'assets');
const assetDir = path.join(assetsDir, ASSET_DIR_NAME);
rmrf(assetsDir);
fs.mkdirSync(assetDir, { recursive: true });

const missing = GAME_FILES.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) die('游戏源文件缺失: ' + missing.join(', '));

for (const f of GAME_FILES) {
  const dst = path.join(assetDir, f);
  fs.copyFileSync(path.join(ROOT, f), dst);
  // 逐字节核对：这台机器的沙箱会静默吞掉工作区外的写入，绝不能只看退出码
  const a = sha256(path.join(ROOT, f));
  const b = sha256(dst);
  if (a !== b) die(`复制失真: ${f} (${a} != ${b})`);
}
console.log(`\n[1/7] 已同步 ${GAME_FILES.length} 个游戏文件 → android/assets/${ASSET_DIR_NAME}/ （逐字节校验通过）`);

// 资源预检：XML 注释里出现连续两个连字符是 XML 规范明确禁止的。
// aapt2 只会回一句 "xml parser error: not well-formed (invalid token)"、行号还是 0，
// 完全看不出是哪一处 —— 第一次就因为注释里写了 CSS 变量名而卡在这里。
(function lintXmlComments() {
  const files = walk(path.join(ANDROID, 'res'))
    .filter((f) => f.endsWith('.xml'))
    .concat([path.join(ANDROID, 'AndroidManifest.xml')]);
  const bad = new Set();
  for (const f of files) {
    const re = /<!--([\s\S]*?)-->/g;
    let m;
    while ((m = re.exec(fs.readFileSync(f, 'utf8')))) {
      if (m[1].includes('--')) bad.add(path.relative(ANDROID, f));
    }
  }
  if (bad.size) die('XML 注释里有连续的 "--"（XML 不允许，注释里别写 CSS 变量名）: ' + [...bad].join(', '));
  console.log(`[1.5] XML 注释检查通过（${files.length} 个文件）`);
})();

// [2/7] 编译资源
rmrf(BUILD);
fs.mkdirSync(BUILD, { recursive: true });
const resZip = path.join(BUILD, 'res.zip');
run(path.join(bt, 'aapt2.exe'), ['compile', '--dir', path.join(ANDROID, 'res'), '-o', resZip]);
console.log('[2/7] 资源编译完成');

// [3/7] 链接成未签名 APK（含 assets）
// 扩展名故意用 .zip 而不是 .apk：d8 按后缀判断输出类型，喂 .apk 会直接报
// "Invalid output: ... Output must be a .zip or .jar archive or an existing directory"。
const unsigned = path.join(BUILD, 'app-unsigned.zip');
// ⚠️ -A 必须传正斜杠路径。Windows 上传反斜杠的话，aapt2 会把条目名写成
// "assets/liuyige\art.js" —— 分隔符混用，Android 侧按 assets/liuyige/index.html 找不到，
// 而 zip 本身完全合法，所以只会表现成「APK 装上了但白屏」，极难定位。
const assetsArg = assetsDir.replace(/\\/g, '/');
run(path.join(bt, 'aapt2.exe'), [
  'link',
  '-o', unsigned,
  '-I', androidJar,
  '--manifest', path.join(ANDROID, 'AndroidManifest.xml'),
  '-R', resZip,
  '-A', assetsArg,
  '--auto-add-overlay',
  '--min-sdk-version', String(MIN_SDK),
  '--target-sdk-version', String(API_LEVEL),
  '--version-code', String(VERSION_CODE),
  '--version-name', VERSION_NAME,
]);
console.log('[3/7] 资源与 assets 已链接进 APK');

// [3.5/7] aapt2 在 Windows 上会把 assets 条目名写成 "assets/liuyige\art.js"，这里纠正
normalizeEntrySeparators(unsigned);

// [4/7] 编译 Java
const classesDir = path.join(BUILD, 'classes');
fs.mkdirSync(classesDir, { recursive: true });
run(javac, [
  '-encoding', 'UTF-8',
  '-source', '8',
  '-target', '8',
  '-bootclasspath', androidJar,
  '-classpath', androidJar,
  '-Xlint:-options',
  '-d', classesDir,
  path.join(ANDROID, 'src', 'com', 'liuyige', 'game', 'MainActivity.java'),
]);
console.log('[4/7] Java 编译完成');

// [5/7] 转 dex 并塞进 APK 根目录
const classFiles = walk(classesDir).filter((f) => f.endsWith('.class'));
if (!classFiles.length) die('没有产出任何 .class');
const dexDir = path.join(BUILD, 'dex');
fs.mkdirSync(dexDir, { recursive: true });
// 坑：d8 的 --output 指向一个已存在的 zip 时是「覆盖」而不是「追加」。
// 实测把 app-unsigned.zip 喂给它，出来只剩一个 classes.dex，资源和 AndroidManifest 全没了
// （症状是 apksigner 报 "Missing AndroidManifest.xml"）。所以 d8 只管产出 dex，
// 拼装交给 aapt v1 的 add 子命令。
runBat(path.join(bt, 'd8.bat'), [
  '--release',
  '--min-api', String(MIN_SDK),
  '--lib', androidJar,
  '--output', dexDir,
  ...classFiles,
]);
if (!fs.existsSync(path.join(dexDir, 'classes.dex'))) die('d8 没有产出 classes.dex');
// aapt add 按「传入的相对路径」决定条目名，所以要在 dex 目录下执行
run(path.join(bt, 'aapt.exe'), ['add', unsigned, 'classes.dex'], { cwd: dexDir });
console.log(`[5/7] ${classFiles.length} 个 class 已转 dex 并写入 APK 根目录`);

// [6/7] 对齐
const aligned = path.join(BUILD, 'app-aligned.apk');
run(path.join(bt, 'zipalign.exe'), ['-p', '-f', '4', unsigned, aligned]);
console.log('[6/7] 4 字节对齐完成');

// [7/7] 签名
const ks = ensureKeystore(keytool);
fs.mkdirSync(DIST, { recursive: true });
const outApk = path.join(DIST, 'liuyige.apk');
if (fs.existsSync(outApk)) fs.unlinkSync(outApk);
runBat(path.join(bt, 'apksigner.bat'), [
  'sign',
  '--ks', ks.ks,
  '--ks-key-alias', ks.alias,
  '--ks-pass', 'pass:' + ks.storePassword,
  '--key-pass', 'pass:' + ks.keyPassword,
  '--v1-signing-enabled', 'true',
  '--v2-signing-enabled', 'true',
  // 关掉 v4：它服务于「增量安装」的 .idsig 配套文件，单独分发 APK 用不上，
  // 默认开着只会在 dist/ 里多留一个 liuyige.apk.idsig
  '--v4-signing-enabled', 'false',
  '--out', outApk,
  aligned,
]);
console.log('[7/7] 签名完成');

// 验签 + 核对包内清单
runBat(path.join(bt, 'apksigner.bat'), ['verify', '--print-certs', '--verbose', outApk]);

const size = fs.statSync(outApk).size;
console.log('\n================ 构建结果 ================');
console.log(`产物      dist/liuyige.apk`);
console.log(`大小      ${(size / 1024).toFixed(1)} KB`);
console.log(`包名      ${APP_ID}`);
console.log(`版本      ${VERSION_NAME} (versionCode ${VERSION_CODE})`);
console.log(`minSdk    ${MIN_SDK}   targetSdk ${API_LEVEL}`);
console.log(`SHA-256   ${sha256(outApk)}`);
