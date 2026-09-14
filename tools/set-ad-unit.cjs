// 把 TapTap 服务端下发的广告位 ID 写进 ads.js —— 并在写之前守住合规文案。
//
// 用法：
//   node tools/set-ad-unit.cjs --check          # 只看现状，不改文件
//   node tools/set-ad-unit.cjs <space_id>       # 写入（先过合规检查）
//   node tools/set-ad-unit.cjs --off            # 退回「未接入」状态（清空 ID）
//
// 为什么单独一个脚本，而不是手改 ads.js 那一行：
//   1. **广告位 ID 只有一个合法来源**：MCP 的 check_ads_status 从服务端下发并缓存。
//      官方明令不许手抄、不许跨应用借用、不许向开发者索要；
//   2. **ID 一非空，性质就变了**：游戏会真的去创建广告实例、真的产生网络请求和第三方
//      数据处理。此时 index.html 的隐私弹窗、docs/privacy.html、docs/privacy.md 里
//      「没有接入任何广告 SDK」就成了假话，而 TapTap 审核口径是「政策须真实有效，
//      且与 App 内协议一致」。这一步最容易漏，所以把闸门做在这里：**文案没跟上就拒绝写入**。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ADS = 'ads.js';
// 这一行必须精确命中一次。改 ads.js 时如果把它挪了位置或换了写法，这里会先报错，
// 而不是悄悄写不进去。
const LINE = /^([ \t]*const AD_UNIT_ID = )(?:''|""|'[^']*'|"[^"]*");[ \t]*$/m;

// 写着「还没接广告」的三处文案。ID 非空时它们必须已经被改写。
const POLICY_FILES = ['index.html', 'docs/privacy.html', 'docs/privacy.md'];
const POLICY_STALE = /没有接入任何广告\s*SDK|广告：当前未接入|当前未接入/;

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const file = f => path.join(ROOT, f);

function currentId() {
  const m = read(ADS).match(LINE);
  if (!m) throw new Error(`${ADS} 里找不到 \`const AD_UNIT_ID = '';\` 这一行，先看看这个文件是不是被改过`);
  const value = m[0].replace(/^[ \t]*const AD_UNIT_ID = /, '').replace(/;[ \t]*$/, '');
  return value.replace(/^['"]|['"]$/g, '');
}

// 逐文件列出「还写着未接入」的行，好让人一眼知道该改哪儿。
function staleLines() {
  const hits = [];
  for (const f of POLICY_FILES) {
    const src = read(f).split('\n');
    src.forEach((line, i) => { if (POLICY_STALE.test(line)) hits.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`); });
  }
  return hits;
}

function validate(id) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return '广告位 ID 只应该是 4~64 位的字母/数字/下划线/连字符';
  if (/^(todo|todo-|xxx+|test|demo|sample|placeholder|111+|000+)$/i.test(id)) return `「${id}」看着像占位符。ID 只能来自服务端下发的值`;
  return null;
}

function status() {
  let id;
  try { id = currentId(); } catch (err) { return { error: err.message }; }
  return { id, live: !!id, stale: staleLines() };
}

function check() {
  const s = status();
  if (s.error) { console.log('✗ ' + s.error); return 1; }
  console.log(`广告位 ID：${s.live ? s.id : '(空 —— 按「未接入」处理，这几下帮忙直接免费给)'}`);
  if (!s.stale.length) { console.log('政策文案：三处都已经改成「已接入」的写法（或本就没有「未接入」的字样）。'); return 0; }
  console.log(`政策文案：还有 ${s.stale.length} 行写着「未接入」——`);
  s.stale.forEach(l => console.log('   ' + l));
  if (s.live) {
    console.log('\n✗ 不一致：ID 已经非空，游戏会真的去拉广告，但政策还写着「没有接入任何广告 SDK」。');
    console.log('  这违反 TapTap「政策须真实有效、与 App 内协议一致」的审核口径，必须先把这三处改掉。');
    return 1;
  }
  console.log('\n✓ 当前一致：ID 为空 = 游戏不会发起任何广告请求，所以「未接入」的写法此刻是真的。');
  return 0;
}

function write(id) {
  const off = id === '';
  if (!off) {
    const bad = validate(id);
    if (bad) { console.log('✗ ' + bad); return 1; }
    const stale = staleLines();
    if (stale.length) {
      console.log('✗ 拒绝写入：广告位 ID 一旦非空，游戏就会真的发起广告请求，但政策文案还写着「未接入」。');
      stale.forEach(l => console.log('   ' + l));
      console.log('\n要改的三处（同一轮里一起改，别分两次发版）：');
      console.log('   · index.html        —— 首次启动的隐私弹窗第 4 条');
      console.log('   · docs/privacy.html —— 1.4 节标题与正文、第三节「没有接入」清单、结语');
      console.log('   · docs/privacy.md   —— 与上面同一份内容的 Markdown 版');
      console.log('\n改完再跑一次本脚本。真要跳过检查，明确说一声再加 --force（不建议）。');
      if (!process.argv.includes('--force')) return 1;
      console.log('\n⚠️  已按 --force 跳过检查，继续写入。');
    }
  }
  const src = read(ADS);
  const matches = src.match(new RegExp(LINE.source, 'gm')) || [];
  if (matches.length !== 1) { console.log(`✗ ${ADS} 里那一行命中了 ${matches.length} 次，预期恰好 1 次，先人工看一眼`); return 1; }
  // 空值必须写成 ''（单引号）——tests/harness.cjs 和 README 都按这个字面量认这一行，
  // 写成 "" 会让「广告位常量没被改写」那条自检误报。
  const literal = off ? "''" : JSON.stringify(id);
  fs.writeFileSync(file(ADS), src.replace(LINE, `$1${literal};`));
  // 沙箱里写过就算成功过——必须回读验证，不能只看退出码。
  const after = currentId();
  if (after !== id) { console.log(`✗ 写入后回读是「${after}」，不是「${id}」，写入没生效`); return 1; }
  if (off) { console.log("✓ 已清空 ads.js 里的 AD_UNIT_ID —— 退回「未接入」状态。"); return 0; }
  console.log(`✓ 已写入 ads.js：AD_UNIT_ID = ${id}`);
  console.log('\n接下来：');
  console.log('   1. 改上面的三处政策文案（还没改的话，现在必须改）；');
  console.log('   2. node tools/bump-version.cjs <新版本号> <versionCode>；');
  console.log('   3. node tools/_runtests2.cjs 跑全量单测，再跑真浏览器那几支验收；');
  console.log('   4. node tools/pack-taptap.cjs 与 android/tools/build-apk.cjs 打包；');
  console.log('   5. 真机上确认 window.tap 存在、广告真能播出来、看完真发奖励。');
  return 0;
}

const args = process.argv.slice(2);
const values = args.filter(a => !a.startsWith('--'));
const checkOnly = args.includes('--check') || (!values.length && !args.includes('--off'));
let code;
if (checkOnly) {
  code = check();
} else if (args.includes('--off')) {
  code = write('');
  if (code === 0) console.log('（三处「未接入」的文案此刻重新变成真话。）');
} else {
  code = write(values[0] ?? '');
}
process.exit(code);
