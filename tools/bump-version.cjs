#!/usr/bin/env node
/**
 * 版本号升档器 —— 「留一格」
 *
 *   node tools/bump-version.cjs 1.0.1 1001            # 升到 1.0.1 / versionCode 1001
 *   node tools/bump-version.cjs 1.0.1 1001 --check    # 只体检当前引用点，不写文件
 *
 * 为什么要有这个脚本：当前版本号散在 8 个文件里（README / TAPTAP_UPLOAD / TEST_REPORT /
 * DEVELOPMENT_PLAN / NEXT_VERSION_PROPOSAL / android/README / pack-taptap / build-apk），
 * 每轮发版手工改必漏。这里把「当前版本」的引用点写成一张显式表：
 *
 *  - 每条替换都要求原文**精确出现恰好 1 次**；找不到或出现多次，整批中止并退出码 1，
 *    绝不静默漏改（宁可失败也不改一半）。
 *  - 全部替换先在内存里做完、全部命中才落盘。
 *  - 只改「当前版本」的引用。**历史小节标题一律不动**（如「## 0.3.1 与 0.4.0：交付当天补的两处」
 *    「**0.4.0 背景音乐。**」），它们记的是当年的事实，跟着新版本号走会变成假历史。
 *
 * versionCode 硬约束：必须**严格大于**上一版，否则新包无法覆盖安装。
 * 已用过的编号：0.1.0=100、0.2.0=200、0.3.0=300、0.3.1=301、0.4.0=400、0.4.1=401、0.5.0=500、1.0.1=1001、1.0.2=1002、1.0.3=1003、1.0.4=1004。
 * （TapTap 侧还有一条：提审／发布过的版本号不能重复用，所以升档时至少把末段往前推。）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const [, , NEW_VERSION, NEW_CODE, ...flags] = process.argv;
const CHECK_ONLY = flags.includes('--check');

if (!NEW_VERSION || !NEW_CODE) {
  console.error('用法：node tools/bump-version.cjs <新版本号> <新versionCode> [--check]');
  console.error('例：  node tools/bump-version.cjs 1.0.1 1001');
  process.exit(2);
}
if (!/^\d+\.\d+\.\d+$/.test(NEW_VERSION)) {
  console.error(`版本号必须是 x.y.z 三段整数，收到：${NEW_VERSION}`);
  process.exit(2);
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* --------------------------- 读出当前版本 --------------------------- */

const packSrc = read('tools/pack-taptap.cjs');
const apkSrc = read('android/tools/build-apk.cjs');

const OLD_VERSION = (packSrc.match(/const VERSION = '([^']+)'/) || [])[1];
const apkVersion = (apkSrc.match(/const VERSION_NAME = '([^']+)'/) || [])[1];
const OLD_CODE = Number((apkSrc.match(/const VERSION_CODE = (\d+)/) || [])[1]);

if (!OLD_VERSION || !apkVersion || !Number.isFinite(OLD_CODE)) {
  console.error('读不出当前版本：pack-taptap.cjs 的 VERSION / build-apk.cjs 的 VERSION_NAME 或 VERSION_CODE');
  process.exit(1);
}
if (OLD_VERSION !== apkVersion) {
  console.error(`两处版本号已经不一致：pack-taptap=V${OLD_VERSION}，build-apk=${apkVersion}。先对齐再升档。`);
  process.exit(1);
}

const NEW_CODE_NUM = Number(NEW_CODE);
if (!Number.isInteger(NEW_CODE_NUM)) {
  console.error(`versionCode 必须是整数，收到：${NEW_CODE}`);
  process.exit(2);
}
if (NEW_CODE_NUM <= OLD_CODE) {
  console.error(`versionCode 必须严格大于旧值：新 ${NEW_CODE_NUM} ≤ 旧 ${OLD_CODE}，这样的包装不上去。`);
  process.exit(1);
}
if (NEW_VERSION === OLD_VERSION) {
  console.error(`新版本号与旧版本号相同（${NEW_VERSION}），没有要升的东西。`);
  process.exit(1);
}

/* --------------------------- 替换表 --------------------------- */

const pad = ' '.repeat(15); // TAPTAP_UPLOAD 里那段对上齐的产物信息

const RULES = [
  // ---- README ----
  {
    file: 'README.md',
    from: `可玩版本，${OLD_VERSION}，`,
    to: `可玩版本，${NEW_VERSION}，`,
  },

  // ---- TAPTAP_UPLOAD ----
  { file: 'TAPTAP_UPLOAD.md', from: `**V${OLD_VERSION}**`, to: `**V${NEW_VERSION}**` },
  {
    file: 'TAPTAP_UPLOAD.md',
    from: `版本${pad}${OLD_VERSION} (versionCode ${OLD_CODE})`,
    to: `版本${pad}${NEW_VERSION} (versionCode ${NEW_CODE_NUM})`,
  },
  {
    file: 'TAPTAP_UPLOAD.md',
    from: `\`V${OLD_VERSION}\`（格式`,
    to: `\`V${NEW_VERSION}\`（格式`,
  },
  {
    // 这处原文曾把「用掉的编号」一个个列进句子里（0.4.1 和 0.5.0 都用掉了…），
    // 每发一版就得改一次句子，改到第二次就和代码对不上了（--check 直接报 0 次命中）。
    // 现在句子只在「本次 / 下次」两处跟版本号走，已用编号的清单收进本文件顶部注释，
    // 由下面那条规则自动追加——一处真相，不再分叉。
    file: 'TAPTAP_UPLOAD.md',
    from: `**本次传的是 V${OLD_VERSION}，下次再传就得从 V${nextPatch(OLD_VERSION)} 起**。`,
    to: `**本次传的是 V${NEW_VERSION}，下次再传就得从 V${nextPatch(NEW_VERSION)} 起**。`,
  },
  {
    file: 'TAPTAP_UPLOAD.md',
    from: `\`V${OLD_VERSION}\`（下次传从 V${nextPatch(OLD_VERSION)} 起`,
    to: `\`V${NEW_VERSION}\`（下次传从 V${nextPatch(NEW_VERSION)} 起`,
  },

  // ---- TEST_REPORT ----
  { file: 'TEST_REPORT.md', from: `版本：${OLD_VERSION}；`, to: `版本：${NEW_VERSION}；` },
  {
    file: 'TEST_REPORT.md',
    from: `## 本轮（${OLD_VERSION}）：`,
    to: `## 本轮（${NEW_VERSION}）：`,
  },

  // ---- DEVELOPMENT_PLAN ----
  {
    file: 'DEVELOPMENT_PLAN.md',
    from: `版本：${OLD_VERSION} 配套规划；`,
    to: `版本：${NEW_VERSION} 配套规划；`,
  },

  // ---- NEXT_VERSION_PROPOSAL ----
  {
    // 这句写着「本文更新为下一轮的取舍…对应 <当前版本>」，跟版本号一起走。
    // （早先这里硬编码 0.4.0，文档改过之后就对不上了。）
    file: 'NEXT_VERSION_PROPOSAL.md',
    from: `对应 ${OLD_VERSION}。`,
    to: `对应 ${NEW_VERSION}。`,
  },
  {
    file: 'NEXT_VERSION_PROPOSAL.md',
    from: `## ${OLD_VERSION}：`,
    to: `## ${NEW_VERSION}：`,
  },
  {
    file: 'NEXT_VERSION_PROPOSAL.md',
    from: `| | 0.4.1 | ${OLD_VERSION} |`,
    to: `| | 0.4.1 | ${NEW_VERSION} |`,
  },

  // ---- android/README ----
  {
    file: 'android/README.md',
    from: `产物信息（${OLD_VERSION}）：包名 \`com.liuyige.game\`，versionCode \`${OLD_CODE}\`，`,
    to: `产物信息（${NEW_VERSION}）：包名 \`com.liuyige.game\`，versionCode \`${NEW_CODE_NUM}\`，`,
  },

  // ---- 构建脚本本体（放最后，避免中途改动影响上面的读取） ----
  {
    // 本文件顶部注释里的「已用过的编号」清单是这份表之外唯一的版本号真相，
    // 之前靠人记得手改（1.0.1 那次就漏了）。这条规则把它追加进来自动维护。
    file: 'tools/bump-version.cjs',
    from: `、${OLD_VERSION}=${OLD_CODE}。`,
    to: `、${OLD_VERSION}=${OLD_CODE}、${NEW_VERSION}=${NEW_CODE_NUM}。`,
  },
  {
    file: 'tools/pack-taptap.cjs',
    from: `const VERSION = '${OLD_VERSION}';`,
    to: `const VERSION = '${NEW_VERSION}';`,
  },
  {
    file: 'android/tools/build-apk.cjs',
    from: `const VERSION_CODE = ${OLD_CODE};`,
    to: `const VERSION_CODE = ${NEW_CODE_NUM};`,
  },
  {
    file: 'android/tools/build-apk.cjs',
    from: `const VERSION_NAME = '${OLD_VERSION}';`,
    to: `const VERSION_NAME = '${NEW_VERSION}';`,
  },
];

function nextPatch(v) {
  const [a, b, c] = v.split('.').map(Number);
  return `${a}.${b}.${c + 1}`;
}

/* --------------------------- 校验 + 应用 --------------------------- */

const cache = new Map();
const problems = [];
const applied = [];

for (const rule of RULES) {
  if (!cache.has(rule.file)) cache.set(rule.file, read(rule.file));
  const text = cache.get(rule.file);

  const hits = text.split(rule.from).length - 1;
  if (hits !== 1) {
    problems.push(`${rule.file}：期望命中 1 次，实际 ${hits} 次 → ${JSON.stringify(rule.from.slice(0, 70))}`);
    continue;
  }
  if (rule.from === rule.to) {
    problems.push(`${rule.file}：替换前后相同，规则写错了 → ${JSON.stringify(rule.from.slice(0, 70))}`);
    continue;
  }
  cache.set(rule.file, text.split(rule.from).join(rule.to));
  applied.push(rule);
}

console.log(`当前版本 V${OLD_VERSION} (versionCode ${OLD_CODE}) → 目标 V${NEW_VERSION} (versionCode ${NEW_CODE_NUM})`);
console.log(`替换规则 ${RULES.length} 条，命中 ${applied.length} 条，涉及 ${new Set(applied.map((r) => r.file)).size} 个文件\n`);

for (const rule of applied) {
  console.log(`  ✓ ${rule.file.padEnd(28)} ${rule.from.slice(0, 46).replace(/\n/g, ' ')} …`);
}

if (problems.length) {
  console.error('\n以下规则没对上，整批未写入：');
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('\n提示：文档被改过就会这样。先确认这处是否真的该改，再更新 RULES 表。');
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log('\n--check：以上替换全部可精确命中，未写文件。');
  process.exit(0);
}

for (const [file, text] of cache) {
  fs.writeFileSync(path.join(ROOT, file), text);
  console.log(`  写入 ${file}`);
}

/* 回读验证：这台机器的沙箱会静默吞掉工作区外的写入，退出码仍是 0，所以必须读回来确认 */
let bad = 0;
for (const [file, text] of cache) {
  if (fs.readFileSync(path.join(ROOT, file), 'utf8') !== text) {
    console.error(`  !! 回读不一致：${file}`);
    bad++;
  }
}
if (bad) {
  console.error(`\n${bad} 个文件没落盘，写入被吞了。`);
  process.exit(1);
}

console.log(`\n完成：V${OLD_VERSION} → V${NEW_VERSION}，versionCode ${OLD_CODE} → ${NEW_CODE_NUM}，全部回读一致。`);
console.log('下一步：node tools/pack-taptap.cjs && node android/tools/build-apk.cjs');
