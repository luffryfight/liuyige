// 收纳工作台皮肤：调色板、解锁门槛、以及「看广告解锁」这条路。
//
// 这一组守的是三件事，都是容易悄悄坏掉、坏了也看不出来的：
//   1. **默认那款必须还是原稿的配色**。默认皮肤一漂，全店的门面就变了，
//      而且没有人会收到报错——所以这里既比具体色值，也比「派生的每一个键都写死了没有」；
//   2. **皮肤只改样子**。换皮肤不许动摆法、不许动整齐度、不许动通关状态，
//      否则「外观奖励」这个定位就烂了，也就没资格挂在广告上；
//   3. **解锁是两条并列的路**。打卡拿得到，看广告也拿得到，但默认款和星砂台
//      刻意不接广告——收集品不能什么都能买。
//
// 分工：卡上「该写什么字」是纯逻辑，这里验（debug.skinCards()）；
// 那行字有没有真的落进页面、配色有没有真的画上画布，由 tools/_verify-skins.cjs
// 在真浏览器里逐个比对——假 DOM 的 querySelector 是空壳，读不到卡里的文字。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game, fakeTap } = require('./harness.cjs');
const K = require('../core.js');
// art.js 用的是裸 `window`，直接在 node 里 require 会 ReferenceError。
// 在独立上下文里把它跑一遍再取出来——不污染本进程的 global。
const A = (() => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'art.js'), 'utf8'), ctx, { filename: 'art.js' });
  return ctx.KeepsakeArt;
})();

const tick = () => new Promise(resolve => setImmediate(resolve));
const skins = h => h.debug.skins();
const byId = (h, id) => skins(h).list.find(s => s.id === id);
const cardOf = (h, id) => h.debug.skinCards().find(c => c.id === id);
const click = (h, id) => h.element(id).onclick({ preventDefault() {} });
const status = h => h.element('status').textContent;
// 造一份「已经通关 n 关、解锁 m 段回忆」的存档。关卡与关系 id 都从 core 里取，不写死。
// 注意要交回 **JSON 字符串**：harness 把它当 localStorage 里的原样内容读，
// 传对象会被 JSON.parse 抛掉、静默退回默认存档，测试就变成假通过了。
const saveWith = (n, codex = 0) => JSON.stringify({
  version: 1,
  completed: Object.fromEntries(K.levels.slice(0, n).map(l => [l.id, true])),
  sessions: {},
  codex: Object.fromEntries(K.relations.slice(0, codex).map(r => [r.id, { level: 'x', at: 0 }])),
  sound: true,
});
const withAds = (tap, save) => game(save || null, 'yes', { ads: { adUnitId: 'SPACE-1', tap: tap.api } });

test('调色板：六款皮肤，键集合一致，值都是合法色值', () => {
  assert.equal(A.SKINS.length, 6, '六款台子');
  assert.deepEqual(Array.from(A.SKINS, s => s.name),
    ['栖湾原木台', '玄铁九鼎案', '赤霄朱漆台', '青玉藏龙案', '鎏金万象案', '长夜星砂台']);
  assert.equal(new Set(Array.from(A.SKINS, s => s.id)).size, 6, 'id 不许重复');
  const keys = Object.keys(A.PALETTES.oak).sort();
  assert.ok(keys.length >= 45, `调色板键数是完整的（现在 ${keys.length} 条）`);
  for (const s of A.SKINS) {
    const p = A.PALETTES[s.id];
    assert.deepEqual(Object.keys(p).sort(), keys, `${s.id} 的键要和默认款一致`);
    for (const k of keys) {
      assert.match(p[k], /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, `${s.id}.${k} 要是色值，实际 ${JSON.stringify(p[k])}`);
    }
  }
  // 六款的底和台面两两不同——重了说明有一款其实没生效。
  const pairs = new Set(Array.from(A.SKINS, s => A.PALETTES[s.id].bg + A.PALETTES[s.id].surface));
  assert.equal(pairs.size, 6);
});

test('默认那款就是原稿配色，而且每个派生出来的色值都被写死了', () => {
  const oak = A.PALETTES.oak;
  const 原稿 = {
    speckle: '#8e7d5420', shadow: '#6d4f3020', frameOut: '#c7a982', frameIn: '#d5bb96',
    frameEdge: '#b39875', rings: '#bea17b66', boardEdge: '#a9916e', surface: '#f0e5c8',
    surfaceGreen: '#d2dcc5', surfaceEdge: '#e7d8b9', grid: '#d9caab', blockFill: '#b89a75',
    handle: '#9b825f', sel: '#536f5a', lockLine: '#9a8358', hintOk: '#457b64',
    hintWarn: '#b9745b', sep: '#d1c8b6', tile: '#f4eedf', tileSel: '#e0e6d1',
    mustInk: '#ad684f', flash: '#92a77d', picBg: '#f4efe3', picTitle: '#425a49',
  };
  for (const [k, v] of Object.entries(原稿)) {
    assert.equal(oak[k], v, `默认皮肤 ${k} 必须还是原稿的 ${v}，漂了店门面就变了`);
  }
  // 结构性那条：默认款把每个键逐个写死，靠的是 fix 表，不是「派生函数碰巧算对」。
  // 色值要么写进 fix，要么原样取自 seed——两条之外就是没管住。
  // 以后往 derive() 里加一个键、两处都没补，默认皮肤会**悄悄**跟着变，这里拦住。
  const fix = A.SKINS[0].fix, seedKeys = new Set(Object.keys(A.SKINS[0].seed));
  const loose = Object.keys(A.PALETTES.iron).filter(k => !(k in fix) && !seedKeys.has(k));
  assert.deepEqual(loose, [], 'derive() 里新增的色值必须在默认款里写死');
});

test('认不出来的皮肤 id 一律退回默认款，不抛也不改存档', () => {
  assert.equal(A.skin('nope').bg, A.PALETTES.oak.bg);
  assert.equal(A.skin('').bg, A.PALETTES.oak.bg);
  assert.equal(A.skin(null).bg, A.PALETTES.oak.bg);
  const h = game(JSON.stringify({ version: 1, completed: {}, sessions: {}, skin: '被改过的存档' }), 'yes');
  assert.equal(skins(h).current, 'oak', '存档里的皮肤认不出来就用默认款');
  h.debug.useSkin('nope');
  assert.equal(skins(h).current, 'oak', '不存在的 id 换不过去');
});

test('解锁门槛：按通关数 / 图鉴数分别算，够不到就是够不到', () => {
  const fresh = game(saveWith(0), 'yes');
  assert.equal(skins(fresh).current, 'oak', '开局就是原木台');
  assert.ok(byId(fresh, 'oak').owned, '默认款永远可用');
  for (const id of ['iron', 'lacquer', 'jade', 'gold', 'star']) {
    assert.equal(byId(fresh, id).owned, false, `${id} 一开始必须是锁的`);
  }
  assert.match(byId(fresh, 'iron').need, /10 份委托（现在 0 \/ 10）/);
  assert.match(byId(fresh, 'star').need, /18 段回忆（现在 0 \/ 18）/);

  // 通关数是一条线：9 关拿不到玄铁，10 关就拿到了。
  assert.equal(byId(game(saveWith(9), 'yes'), 'iron').owned, false, '差一关就是差一关');
  const ten = game(saveWith(10), 'yes');
  assert.ok(byId(ten, 'iron').owned, '通关 10 份就解锁玄铁九鼎案');
  assert.equal(byId(ten, 'lacquer').owned, false, '25 关那款还锁着');

  // 图鉴是另一条线，和通关数互不相干。
  assert.equal(byId(game(saveWith(0, 17), 'yes'), 'star').owned, false, '差一段回忆也不行');
  assert.ok(byId(game(saveWith(0, 18), 'yes'), 'star').owned, '攒够 18 段回忆，星砂台才亮');

  // 已经拿到手的款，不需要任何条件也仍然是自己的。
  const rich = game(saveWith(70, 24), 'yes');
  for (const s of skins(rich).list) assert.ok(s.owned, `${s.name} 该解锁了`);
});

test('换皮肤只改样子：摆法、整齐度、通关状态都不许动', () => {
  const h = game(null, 'yes', { search: '?test=1&level=45&unlock=all&solve=1' });
  const before = h.state();
  const score = h.debug.score();
  assert.ok(Object.keys(before.placed).length > 0, '这一盘要先真的摆上东西');
  h.debug.useSkin('star');
  h.debug.useSkin('iron');
  h.debug.useSkin('oak');
  const after = h.state();
  assert.deepEqual(after.placed, before.placed, '摆法逐件不变');
  assert.deepEqual(h.debug.score(), score, '整齐度三项不变');
  assert.equal(after.finished, before.finished, '通关状态不变');
  assert.equal(skins(h).current, 'oak');
});

test('看广告解锁：只看完才作数，中途关掉一切照旧', async () => {
  const tap = fakeTap();
  const h = withAds(tap, saveWith(0));
  h.debug.unlockSkin('iron');
  assert.equal(tap.log.shown, 1, '要真的播一次');
  assert.equal(tap.log.params.adUnitId, 'SPACE-1', '广告位走配置那一个');
  assert.match(status(h), /正在加载广告/, '按下去要立刻有反应，不许静默');
  assert.equal(skins(h).current, 'oak', '还没看完，先别换');
  tap.close({ isEnded: false });
  await tick();
  assert.equal(skins(h).current, 'oak', '中途关掉不算数');
  assert.equal(byId(h, 'iron').owned, false, '没看完就不给');
  assert.match(status(h), /要看完广告/, '没拿到要照实说');
  assert.equal(tap.log.created, 1, '同一个实例接着用，不重复创建');

  h.debug.unlockSkin('iron');
  tap.close({ isEnded: true });
  await tick();
  assert.equal(skins(h).current, 'iron', '看完就把台子换上');
  assert.ok(byId(h, 'iron').owned);
  const save = JSON.parse(h.storage.get('liuyige-mvp-v1'));
  assert.equal(save.skins.iron, true, '解锁要落盘，下次打开还在');
  assert.equal(save.skin, 'iron', '当前选择也要落盘');

  // 重新开一局：读档之后仍拿着这块台子。
  const again = game(h.storage.get('liuyige-mvp-v1'), 'yes');
  assert.equal(skins(again).current, 'iron', '换台子的选择会记住');
  assert.ok(byId(again, 'iron').owned, '看广告解锁的款认存档');
});

test('星砂台刻意不接广告：这条广告路线一次都不许碰它', async () => {
  const tap = fakeTap();
  const h = withAds(tap, saveWith(0));
  h.debug.unlockSkin('star');
  assert.equal(tap.log.created, 0, '不接广告的款式，连实例都不该创建');
  assert.equal(tap.log.shown, 0);
  assert.equal(byId(h, 'star').owned, false, '看完广告也拿不到');
  assert.equal(byId(h, 'star').adUnlock, false);
  assert.match(status(h), /回忆图鉴攒到 18 段/, '要说清楚它只能靠自己拿');
  // 网页版（没有广告可看、其它「救援」功能会免费放行）也一样不许放行——
  // 否则「只能靠收集」这句话在网页版就成了假的。
  const web = game(saveWith(0), 'yes');
  web.debug.unlockSkin('star');
  assert.equal(byId(web, 'star').owned, false, '没有广告位也不许白给');
  assert.equal(skins(web).current, 'oak');
  assert.equal(JSON.parse(web.storage.get('liuyige-mvp-v1')).skins.star, undefined, '存档里不许留下解锁记录');
  // 能看广告那几款则相反。
  assert.equal(byId(h, 'jade').adUnlock, true);
  await tick();
});

test('卡上写什么：六张卡、一张一个动作，没广告位时不喊「看广告」', async () => {
  // 网页版：没有 window.tap，广告不可用。
  const web = game(saveWith(0), 'yes');
  click(web, 'skins');
  const cards = web.debug.skinCards();
  assert.equal(cards.length, 6, '六张卡');
  assert.equal(web.element('skins-grid').children.length, 6, '面板里也真的是六张');
  assert.equal(cards[0].button, '正在使用');
  assert.equal(cards[0].disabled, true);
  // 隐私政策写着「没有接入任何广告 SDK」，按钮就绝不能喊「看广告」——两处必须一致。
  for (const c of cards.slice(1)) {
    assert.equal(c.button, '还不能拿', '没广告位时锁着的写「还不能拿」');
    assert.equal(c.disabled, true, '并且真的点不动');
  }
  assert.match(web.element('skins-summary').textContent, /现在铺的是「栖湾原木台」/);

  // TapTap 客户端里：广告位配好了，锁着的卡改成「看广告解锁」。
  const tap = fakeTap();
  const inApp = withAds(tap, saveWith(0));
  const shown = inApp.debug.skinCards();
  for (const c of shown.slice(1, 5)) {
    assert.equal(c.button, '看广告解锁');
    assert.equal(c.disabled, false);
  }
  assert.equal(shown[5].button, '还不能拿', '星砂台不接广告，文案也不该变');
  assert.equal(shown[5].disabled, true);
  // 点第二张卡（玄铁）＝ 走一次广告；看完就换上。
  click(inApp, 'skins');
  const cardEl = inApp.element('skins-grid').children[1];
  cardEl.children[cardEl.children.length - 1].onclick();
  assert.equal(tap.log.shown, 1, '从面板点一下也要真播广告');
  tap.close({ isEnded: true });
  await tick();
  assert.equal(skins(inApp).current, 'iron', '看完就把台子换上');
});

test('?skin= 是会话级验收入口：生效、但不写存档、也不等于拥有', () => {
  const h = game(saveWith(0), 'yes', { search: '?test=1&level=1&skin=jade' });
  assert.equal(skins(h).current, 'jade', '深链直接生效');
  assert.equal(byId(h, 'jade').owned, false, '深链不该把「已拥有」也算上');
  assert.equal(cardOf(h, 'jade').disabled, true, '面板里它仍然是锁的');
  assert.equal(JSON.parse(h.storage.get('liuyige-mvp-v1')).skin, undefined, '深链不许写进存档');
});

test('画布底：默认画原木色，换了皮肤画新底色（直接盯 fillStyle）', () => {
  // 这一条要的是「皮肤真的被画上去了」，所以给画布一个能记账的 2D 上下文，
  // 并让 rAF 同步执行——debug.resize() 一调，一帧就真的画完了。
  const painted = [];
  const ctx = new Proxy({}, {
    get: (t, p) => (p in t ? t[p] : () => {}),
    set: (t, p, v) => { painted.push([p, v]); t[p] = v; return true; },
  });
  class El {
    constructor() { this.children = []; this.parts = new Map(); }
    addEventListener() {}
    setAttribute() {}
    querySelector(s) { if (!this.parts.has(s)) this.parts.set(s, new El()); return this.parts.get(s); }
    appendChild(c) { this.children.push(c); return c; }
    getContext() { return this.__ctx || {}; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
    showModal() {} close() {} focus() {}
  }
  const els = new Map();
  const el = id => { if (!els.has(id)) els.set(id, new El()); return els.get(id); };
  const document = new El();
  document.getElementById = el;
  document.createElement = () => new El();
  document.querySelectorAll = () => [];
  const storage = new Map();
  const window = new El();
  window.innerWidth = 1024;
  const context = vm.createContext({
    window, document, URLSearchParams, location: { search: '?test=1&unlock=all' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    requestAnimationFrame(cb) { cb(); }, setTimeout() {},
    ResizeObserver: class { observe() {} },
  });
  el('game').__ctx = ctx;
  for (const f of ['core.js', 'art.js', 'music.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), context, { filename: f });
    if (f === 'core.js') context.Keepsake = window.Keepsake;
    if (f === 'art.js') context.KeepsakeArt = window.KeepsakeArt;
  }
  const debug = window.GameDebug;
  const firstFill = () => {
    painted.length = 0;
    debug.resize();
    const hit = painted.find(([p]) => p === 'fillStyle');
    return hit ? hit[1] : null;
  };
  assert.equal(firstFill(), A.PALETTES.oak.bg, '默认款第一笔就是原木底色');
  debug.useSkin('star');
  assert.equal(firstFill(), A.PALETTES.star.bg, '换成星砂台，第一笔跟着变');
  // 台面的底色也要真的被画上去——只改背景不改台面等于只换了个相框。
  const fills = painted.map(([p, v]) => (p === 'fillStyle' ? v : null)).filter(Boolean);
  assert.ok(fills.includes(A.PALETTES.star.surface), '星砂台的台面色要出现在这一帧里');
  assert.ok(!fills.includes(A.PALETTES.oak.surface), '原木的台面色不该再出现');
});
