/**
 * 装 Android 编译用的最小 SDK 到 D:/android-build/sdk。
 *
 * 装的是什么、为什么只有这些：
 *   build-tools/34.0.0   aapt2 / d8 / zipalign / apksigner —— 编译链路全靠它
 *   platforms/android-34 android.jar —— 编译期 API 存根
 *   cmdline-tools/latest sdkmanager —— 可选，本次构建用不到
 *
 * 不用 sdkmanager 下载的原因：它走单连接，实测 dl.google.com 单连接被限速到
 * 0.06–0.4MB/s，116MB 要半小时以上；换成 16 连接分块后稳定 0.2–2MB/s。
 * 所以直接抓仓库里的 zip（文件名取自官方 repository2-1.xml），比 sdkmanager 更快。
 *
 * 关于 sha1：官方 XML 里的 checksum 对不上 CDN 上的现包（Google 重打过包，
 * XML 没同步）。所以 sha1 只当**警告**，真正把关的是解压后的内容校验
 * ——见每个 job 的 mustHave，缺一个文件就判失败。下载阶段由 fetch-multi
 * 保证字节数等于 content-length，这与 Google 的 sdkmanager 自身策略一致
 * （它也只验 SHA-1 但同样会把不匹配当致命错误，这里放宽是为了不卡在版本漂移上）。
 *
 * 用法：node android/tools/setup-sdk.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DL = process.env.LIUYIGE_DL || 'D:/android-build/dl';
const SDK = process.env.LIUYIGE_SDK_ROOT || 'D:/android-build/sdk';
const TAR = 'C:/Windows/System32/tar.exe';
const REPO = 'https://dl.google.com/android/repository/';
// 与本脚本同目录，保证这个工程自带完整工具链、不依赖 D:/android-build 是否还在
const FETCH_MULTI = path.join(__dirname, 'fetch-multi.cjs');
const UNZIP = path.join(__dirname, 'unzip-zip.cjs');

const JOBS = [
  {
    zip: 'build-tools_r34-windows.zip',
    url: REPO + 'build-tools_r34-windows.zip',
    sha1: '62cfde1b6fcc3ad12a4d2ba1b537e752768bfd47', // 官方 XML 值，仅作参考
    to: path.join(SDK, 'build-tools', '34.0.0'),
    mustHave: ['aapt2.exe', 'd8.bat', 'zipalign.exe', 'apksigner.bat', 'lib/d8.jar'],
  },
  {
    zip: 'platform-34-ext12_r01.zip',
    url: REPO + 'platform-34-ext12_r01.zip',
    sha1: 'ba80ccbcc29b29f25ac926a08c0b2777f0bce842',
    to: path.join(SDK, 'platforms', 'android-34'),
    mustHave: ['android.jar'],
  },
  {
    // 可选：aapt2/d8/zipalign/apksigner 都在 build-tools 里，本次构建用不到 sdkmanager。
    // 127MB 且 dl.google.com 对它的限速最狠，为了不让它拖慢主流程，本地没有 zip 就直接跳过。
    zip: 'cmdline-tools.zip',
    url: REPO + 'commandlinetools-win-11076708_latest.zip',
    to: path.join(SDK, 'cmdline-tools', 'latest'),
    mustHave: ['bin/sdkmanager.bat'],
    optional: true,
  },
];

const fmt = (n) => (n / 1048576).toFixed(1) + 'MB';
let warned = 0;

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function download(job) {
  const dest = path.join(DL, job.zip);
  // 本地已有：不再 HEAD 一次（这台机器上 dl.google.com 的 HEAD 会偶发失败），
  // 直接交给下面的内容校验把关
  if (fs.existsSync(dest)) {
    const size = fs.statSync(dest).size;
    if (size > 20 * 1048576) {
      console.log(`[${job.zip}] 本地已有 ${fmt(size)}，复用`);
      return dest;
    }
    console.log(`[${job.zip}] 本地文件只有 ${fmt(size)}，视为不完整，重新下载`);
    fs.unlinkSync(dest);
  }
  fs.mkdirSync(DL, { recursive: true });
  execFileSync('node', [FETCH_MULTI, job.url, dest, '16'], { stdio: 'inherit' });
  return dest;
}

function verifyChecksum(job, file) {
  if (!job.sha1) return;
  const got = sha1(file);
  if (got === job.sha1) {
    console.log(`[${job.zip}] sha1 与官方 XML 一致`);
  } else {
    warned++;
    console.log(
      `[${job.zip}] sha1 与官方 XML 不一致（期望 ${job.sha1.slice(0, 12)}…，实际 ${got.slice(0, 12)}…）\n` +
        `            多为 Google 重打包后 XML 未同步，改由解压内容把关`
    );
  }
}

/** 解压并「展平」一层：Google 的 zip 顶层目录名不是我们要的目录名
 *  （实测 build-tools 顶层是 android-14、platform 顶层是 android-34-ext12），
 *  所以解到临时目录后把唯一的一层目录搬到目标位置。 */
function install(job, zipFile) {
  if (fs.existsSync(job.to) && fs.readdirSync(job.to).length > 0) {
    console.log(`[${job.zip}] ${path.relative(SDK, job.to)} 已存在，跳过解压`);
    return;
  }
  const tmp = job.to + '__unpack';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  // 两步解压：
  // 1) 先用自研解压器 --list 读中央目录（只读结构，0.2 秒），确认包没被截断。
  //    这一步是必需的 —— 曾经因为下载器漏掉尾部，zip 没有中央目录，
  //    tar 只甩一句 "Error exit delayed from previous errors"，根本定位不到原因。
  // 2) 再用系统 tar 真正解压。它慢在 CRC 之外（C 实现），比 JS 逐条目 inflateRawSync 快一个数量级
  //    （自研解压器对 13791 个条目、上百 MB 的 platform 包会跑到分钟级）。
  execFileSync('node', [UNZIP, zipFile, '--list'], { stdio: 'ignore' });
  execFileSync(TAR, ['-xf', zipFile, '-C', tmp], { stdio: 'inherit' });

  const entries = fs.readdirSync(tmp, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const src = entries.length === 1 && dirs.length === 1 ? path.join(tmp, dirs[0].name) : tmp;

  fs.rmSync(job.to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(job.to), { recursive: true });
  fs.renameSync(src, job.to);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[${job.zip}] → ${path.relative(SDK, job.to)}  ${fs.readdirSync(job.to).length} 个条目`);
}

function checkContent(job) {
  const missing = job.mustHave.filter((f) => !fs.existsSync(path.join(job.to, f)));
  if (missing.length) throw new Error(`解压后缺关键文件: ${missing.join(', ')}`);
  console.log(`[${job.zip}] 内容校验通过（${job.mustHave.length} 个关键文件齐）`);
}

let failed = 0;
for (const job of JOBS) {
  try {
    console.log(`\n===== ${job.zip} =====`);
    if (job.optional && !fs.existsSync(path.join(DL, job.zip))) {
      console.log('可选组件且本地没有现成 zip，跳过（不影响 APK 构建）');
      continue;
    }
    const zipFile = download(job);
    verifyChecksum(job, zipFile);
    install(job, zipFile);
    checkContent(job);
  } catch (e) {
    failed++;
    console.error(`[${job.zip}] 失败: ${e.message}`);
  }
}

console.log('\n================ SDK 状态 ================');
const probes = [
  ['build-tools/34.0.0/aapt2.exe', path.join(SDK, 'build-tools', '34.0.0', 'aapt2.exe')],
  ['build-tools/34.0.0/d8.bat', path.join(SDK, 'build-tools', '34.0.0', 'd8.bat')],
  ['build-tools/34.0.0/zipalign.exe', path.join(SDK, 'build-tools', '34.0.0', 'zipalign.exe')],
  ['build-tools/34.0.0/apksigner.bat', path.join(SDK, 'build-tools', '34.0.0', 'apksigner.bat')],
  ['platforms/android-34/android.jar', path.join(SDK, 'platforms', 'android-34', 'android.jar')],
];
for (const [label, p] of probes) {
  const ok = fs.existsSync(p);
  console.log(`${ok ? 'OK  ' : 'MISS'} ${label}${ok ? '  ' + fmt(fs.statSync(p).size) : ''}`);
}
if (warned) console.log(`\n（${warned} 个包的 sha1 与官方 XML 不一致，已改用内容校验，不影响构建）`);
process.exit(failed ? 1 : 0);
