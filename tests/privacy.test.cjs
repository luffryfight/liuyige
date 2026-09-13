// 首次启动的隐私政策弹窗。
//
// 这几条都是 TapTap 审核的硬要求，任何一条退回去都会被打回，所以逐条钉住：
//   1. 首次启动必须弹窗，且弹窗是模态的（同意之前点不到棋盘）；
//   2. 必须有明确的「同意」和「拒绝」两个按钮，文案不能含糊；
//   3. 不得默认勾选同意——也就是不能没有弹窗就直接开始存数据；
//   4. 拒绝之后基础功能照常可用，只是不再写盘；
//   5. 点过之后要记住，不能每次打开都反复打扰。
//
// 另外单独守一条产品约束：**游戏内的摘要必须和政策正文对得上**。
// TapTap 要求「填写的隐私政策内容必须与 APP 内的隐私政策协议内容一致」，
// 两边各写一套说法是这条最常见的翻车点，所以这里直接读 docs/privacy.html 比对。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { game } = require('./harness.cjs');

const ROOT = path.join(__dirname, '..');
const CONSENT_KEY = 'liuyige-privacy-v1';
const SAVE_KEY = 'liuyige-mvp-v1';

const readIndex = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const readPolicy = () => fs.readFileSync(path.join(ROOT, 'docs', 'privacy.html'), 'utf8');
const dialogHtml = () => {
  const m = readIndex().match(/<dialog id="privacy-dialog"[\s\S]*?<\/dialog>/);
  assert.ok(m, 'index.html 里要有隐私弹窗');
  return m[0];
};
/**
 * 触发某个元素上的点击（假 DOM 不解析 innerHTML，只能按 id 找）。
 * 这个项目里按钮一律用 `el.onclick = fn` 绑定，不是 addEventListener，
 * 所以两种都要认，否则测试会因为「找不到监听器」而假失败。
 */
const click = (h, id) => {
  const el = h.element(id);
  const handlers = el.listeners.get('click') || [];
  assert.ok(typeof el.onclick === 'function' || handlers.length, `${id} 上要有 click 事件`);
  if (typeof el.onclick === 'function') el.onclick({ preventDefault() {} });
  else handlers[0]({ preventDefault() {} });
};
const firstItem = (debug) => require('../core.js').levels[debug.getState().levelIndex].items[0];

test('首次启动会弹出隐私政策弹窗', () => {
  const h = game(null, null);
  assert.equal(h.element('privacy-dialog').open, true, '第一次打开必须弹窗，让玩家先读再决定');
});

test('弹窗有明确的「同意」和「拒绝」两个按钮，且不含含糊文案', () => {
  const body = dialogHtml();
  assert.match(body, /id="privacy-accept"/, '要有明确的同意按钮');
  assert.match(body, /id="privacy-decline"/, '要有明确的拒绝按钮');
  assert.match(body, />同意[^<]*</, '同意按钮要写明「同意」');
  assert.match(body, />不同意</, '拒绝按钮要写明「不同意」');

  // TapTap 点评过的典型问题：用「好的，我知道了」之类的文案代替「拒绝」
  for (const vague of ['好的', '我知道了', '知道了', '下次再说', '略过']) {
    assert.ok(!body.includes(vague), `拒绝按钮不能用「${vague}」这类含糊文案`);
  }
  // TapTap 点评过的另一个典型问题：默认勾选同意
  assert.ok(!/<input[^>]*checked/i.test(body), '隐私弹窗里不能有默认勾选的勾选框');
});

test('同意之前不写任何进度：不得未经同意就落盘', () => {
  const h = game(null, null);
  const id = firstItem(h.debug);
  h.debug.select(id);
  h.debug.place(id, 0, 0, 0);
  assert.equal(h.storage.get(SAVE_KEY), undefined, '还没同意就不该写进度存档');
});

test('点「不同意」：记住选择、关闭弹窗、游戏照常能玩，但不写盘', () => {
  const h = game(null, null);
  click(h, 'privacy-decline');

  assert.equal(h.storage.get(CONSENT_KEY), 'no', '拒绝的选择要记住，否则下次还弹');
  assert.equal(h.element('privacy-dialog').open, false, '点完要关掉弹窗');
  assert.equal(h.debug.consent(), 'no');

  // 基础功能必须照常（TapTap：无论用户拒绝任何权限，都需提供基础功能）
  const id = firstItem(h.debug);
  h.debug.select(id);
  assert.equal(h.debug.getState().selected, id, '拒绝之后仍然能选物品');
  assert.ok(h.debug.place(id, 0, 0, 0) !== false, '拒绝之后仍然能摆放');
  assert.equal(h.storage.get(SAVE_KEY), undefined, '拒绝后不得写进度');
});

test('点「同意并开始」之后才开始保存进度，且真的存下了摆放', () => {
  const h = game(null, null);
  click(h, 'privacy-accept');

  assert.equal(h.storage.get(CONSENT_KEY), 'yes');
  assert.equal(h.debug.consent(), 'yes');

  const id = firstItem(h.debug);
  h.debug.select(id);
  h.debug.place(id, 0, 0, 0);

  const raw = h.storage.get(SAVE_KEY);
  assert.ok(raw, '同意之后进度要能存下来');
  const session = Object.values(JSON.parse(raw).sessions)[0];
  assert.ok(session, '要记下这一关的进度');
  assert.ok(Object.keys(session.placed).length >= 1, '摆放位置要真的写进去');
});

test('已经做过选择的人，再次打开不再弹窗', () => {
  for (const decision of ['yes', 'no']) {
    // 第二次实例用 game(null, decision)：等价于「上次已经选过，这次重新打开」。
    const again = game(null, decision);
    assert.equal(again.storage.get(CONSENT_KEY), decision, '重新打开时记录仍在');
    assert.notEqual(again.element('privacy-dialog').open, true, `${decision}：做过选择就不该再弹窗`);
  }
});

test('玩法说明里有常驻入口，玩家随时能重新查看政策', () => {
  const html = readIndex();
  assert.match(html, /id="privacy-open"/, '玩法说明里要有重新打开隐私说明的入口');
  assert.match(html, /id="privacy-full"/, '玩法说明里要有政策全文的链接');
  // 入口本身不跳走（href="#"），靠脚本拦住默认行为再开弹窗；全文链接才是真跳转。
  const h = game(null, null);
  const entry = h.element('privacy-open');
  assert.ok(typeof entry.onclick === 'function', '入口要绑上点击事件');
  // 已经点过同意的人，再点入口也应该能把弹窗重新叫出来
  click(h, 'privacy-accept');
  assert.equal(h.element('privacy-dialog').open, false, '同意后弹窗先关掉');
  click(h, 'privacy-open');
  assert.equal(h.element('privacy-dialog').open, true, '随时能重新打开隐私说明');
});

// 这条是真实浏览器里验出来的：showModal() 会把焦点自动交给弹窗内第一个可聚焦元素，
// 也就是那行政策链接，于是每次打开弹窗链接上都挂着一圈焦点环，看着像页面坏了。
// 同一批 tool call 里不要对同一文件发多条 Edit —— 这里只改这一处。
// 修法是把初始焦点移到「同意并开始」，而不是去掉焦点环（那会牺牲键盘可用性）。
test('弹窗打开后初始焦点在「同意并开始」上，不落在政策链接上', () => {
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  // showModal 之后必须显式 focus 到同意按钮，否则浏览器会自己挑第一个可聚焦元素
  assert.match(src, /showModal\(\)[\s\S]{0,200}focus\(\)/, 'showModal 之后要把焦点交给「同意并开始」');
  // 不能靠 outline:none 把焦点环抹掉来掩盖问题
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const dialogCss = (css.match(/\/\* ---- 首次启动的隐私政策弹窗[\s\S]*?(?=@media|$)/) || [''])[0];
  assert.ok(!/outline\s*:\s*none/.test(dialogCss), '不要用 outline:none 藏掉焦点环，应当移动初始焦点');
  // 弹窗里的链接要统一成品牌色，不能留浏览器默认的蓝/紫
  assert.match(css, /#privacy-dialog a[^{]*\{[^}]*color/, '弹窗里的链接要指定颜色');
});

test('弹窗里的摘要与 docs/privacy.html 正文口径一致', () => {
  const dialog = dialogHtml();
  const policy = readPolicy();

  // 游戏内主张的四件事，政策正文里必须都能找到对应表述
  const claims = [
    [/不收集/, /不收集你的任何个人信息/],
    [/不联网/, /不联网|不进行任何网络请求/],
    [/不申请[^。]*权限/, /不申请任何设备权限/],
    [/没有接入任何广告 SDK/, /没有接入任何广告 SDK/],
  ];
  for (const [inDialog, inPolicy] of claims) {
    assert.match(dialog, inDialog, `弹窗里少了主张：${inDialog}`);
    assert.match(policy, inPolicy, `政策正文里少了对应说明：${inPolicy}`);
  }

  assert.match(policy, /1161074235@qq\.com/, '政策里要有联系邮箱，审核会实际核对');
  assert.match(dialog, /privacy\.html/, '弹窗要能跳到政策全文');
});

test('政策正文满足审核的排版口径：有标题、有分段、有主体与生效日期', () => {
  const policy = readPolicy();
  assert.match(policy, /<h1>《留一格》隐私政策<\/h1>/, '要有明确的标题');
  assert.match(policy, /生效日期/, '要有生效日期');
  assert.match(policy, /更新日期/, '要有更新日期');
  // 段落清晰：至少十个小节标题，不能从头连到尾
  const sections = policy.match(/<h2>/g) || [];
  assert.ok(sections.length >= 10, `政策要分节，至少 10 节，现在只有 ${sections.length} 节`);
  // 只引用自己那份样式表，不引外链资源（避免审核时打不开）
  const links = policy.match(/<link[^>]*href="([^"]+)"/g) || [];
  for (const l of links) assert.ok(!/^<link[^>]*href="https?:/.test(l), '政策页不要引外部样式，避免打不开');
});

// TapTap 2.2.2：隐私政策里的链接必须能正常跳转。
// 政策页单独发布在 GitHub Pages 的 /docs 下，站内相对路径很容易指错
// （比如把首页写成 ./index.html —— 那是 docs/ 里没有的东西），这里逐个落盘核对。
test('政策页里的每个本地链接都真的存在，不会点出 404', () => {
  const docsDir = path.join(ROOT, 'docs');
  const policy = readPolicy();
  const refs = [...policy.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);

  assert.ok(refs.length, '政策页至少要有一个链接（样式表）');
  let checked = 0;
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:|#)/.test(ref)) continue;          // 外链/锚点另行判断
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = path.resolve(docsDir, clean);
    assert.ok(fs.existsSync(target), `政策页里的「${ref}」指向的文件不存在，审核点开就是 404`);
    checked++;
  }
  assert.ok(checked >= 1, '至少要校验到样式表这一个本地引用');

  // 外链只允许 mailto（联系方式）；引外部域名会在审核时变成不稳定因素
  for (const ref of refs) {
    if (ref.startsWith('http')) {
      assert.fail(`政策页不要引外部资源或外链：${ref}（联系方式请用 mailto:）`);
    }
  }
});
