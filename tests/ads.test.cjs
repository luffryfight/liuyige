// 激励视频广告：提示／代放／消除这三个「救援」按钮，现在要先看完广告才生效。
//
// 官方口径里有两条是硬规则，这一组主要就是守它们：
//   1. **只有 onClose 里的 isEnded 为 true 才发奖励**——show() 返回不代表看完；
//   2. show() 失败只允许 load() 一次再试，**不许循环重试**。
// 另外还守两件容易漏的事：
//   · 拿不到广告（网页版 / 广告位没配）时必须放行并说明，不能让玩家点了没反应；
//   · 算不出方案时**不要播广告**——不能让玩家看完才被告知「这一步没法替你做」。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, fakeTap } = require('./harness.cjs');

// 这个项目的按钮一律 `el.onclick = fn` 绑定，不是 addEventListener，所以直接调。
function click(h, id) {
  const el = h.element(id);
  assert.ok(typeof el.onclick === 'function', `${id} 上要绑 click 事件`);
  el.onclick({ preventDefault() {} });
}
// Ads.show() 的回调之后还有一层 Promise（withAd 里的 .then），让它跑完再断言。
const tick = () => new Promise(resolve => setImmediate(resolve));
const status = h => h.element('status').textContent;
// 三个救援按钮上的字（游戏把它们写在 <span> 里）。
const spanOf = (h, id) => h.element(id).querySelector('span').textContent;
// 装一个「在 TapTap 客户端里、广告位也配好了」的环境。
const withAds = (tap, adUnitId = 'SPACE-1') => game(null, 'yes', { ads: { adUnitId, tap: tap.api } });
// 用掉每关自带的那次免费提示，把按钮推进「要看广告」的状态。
const useFreeHint = h => { click(h, 'hint'); assert.ok(h.state().hint, '免费提示要先正常给出来'); };

test('每关第一次提示是免费的，不该弹广告', () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  assert.equal(tap.log.created, 0, '免费那一次不该碰广告');
  assert.equal(tap.log.shown, 0);
  h.idle();
});

test('第二次提示：看完广告才给结论', async () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  const before = h.state().hints;
  click(h, 'hint');
  assert.equal(tap.log.created, 1, '要创建一次激励视频');
  assert.equal(tap.log.shown, 1, '要真的播一次');
  assert.equal(tap.log.params.adUnitId, 'SPACE-1', '广告位要用配置里那一个（官方示例的键名）');
  assert.equal(tap.log.params.spaceId, 'SPACE-1', '服务端那边叫 space_id，两个键名都带上');
  assert.match(status(h), /正在加载广告/, '按下去要立刻有反应，不许静默');
  assert.equal(h.state().hints, before, '还没看完，先别发奖励');
  tap.close({ isEnded: true });
  await tick();
  assert.equal(h.state().hints, before + 1, '看完才发奖励');
  assert.ok(h.state().hint, '并且真的给出结论');
  h.idle();
});

test('中途关掉广告：不发奖励，原因照实说（文案和 ads.js 里那份逐字一致）', async () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  const before = h.state().hints;
  click(h, 'hint');
  tap.close({ isEnded: false });
  await tick();
  const reason = h.window.KeepsakeAds.REASON.skipped;
  assert.ok(reason.length > 0, '「没看完」这条得有话说，不能是空字符串');
  assert.equal(h.state().hints, before, '没看完就不给');
  assert.equal(status(h), reason, '文案只有一份，不许按钮说一套、状态栏说另一套');
  h.idle();
});

test('宿主只回调 onReward、onClose 没带 isEnded：也算看完', async () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  const before = h.state().hints;
  click(h, 'hint');
  tap.reward();                       // 有的宿主只发 onReward
  tap.close({ isEnded: false });
  await tick();
  assert.equal(h.state().hints, before + 1, 'onReward 到了就算看完，不能把奖励吞掉');
  h.idle();
});

test('第一次 show 失败：load 一次再试，成功照样发奖励', async () => {
  const tap = fakeTap({ failShows: 1 });
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  const before = h.state().hints;
  click(h, 'hint');
  await tick();
  assert.equal(tap.log.loaded, 1, '要重新 load 一次');
  assert.equal(tap.log.shown, 2, '然后只重试一次 show');
  tap.close({ isEnded: true });
  await tick();
  assert.equal(h.state().hints, before + 1, '重试成功后看完，照样发奖励');
  h.idle();
});

test('重试也失败：不发奖励，说明「广告没加载出来」', async () => {
  const tap = fakeTap({ failShows: 2 });
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  const before = h.state().hints;
  click(h, 'hint');
  await tick();
  assert.equal(tap.log.shown, 2, '只允许重试一次，不能进死循环');
  assert.equal(tap.log.loaded, 1);
  assert.equal(h.state().hints, before, '没看成就不给');
  assert.equal(status(h), h.window.KeepsakeAds.REASON['load-failed'], '原因照实说');
  h.idle();
});

test('网页版没有 TapTap 广告接口：直接放行，并说明为什么', () => {
  // 装了 ads.js，但 window.tap 不存在（纯静态网页版就是这样）。
  const h = game(null, 'yes', { ads: { adUnitId: 'SPACE-1' } });
  h.debug.loadId('drawer-1');
  assert.equal(h.window.KeepsakeAds.supported(), false, '没有 tap 就该是「不支持」');
  useFreeHint(h);
  click(h, 'hint');
  assert.equal(h.state().hints, 2, '第二次提示也要真的给出来，不能让试玩的人卡住');
  assert.doesNotMatch(spanOf(h, 'hint'), /看广告/, '既然不用看广告，按钮上就不该写「看广告」');
  // 原因那句话是给玩法说明／隐私政策用的（不能让状态栏抢先写，它马上会被动作自己的话盖掉）。
  assert.match(h.window.KeepsakeAds.status(), /没有 TapTap 广告接口/, '得有一句能对外说明的理由');
  h.idle();
});

test('广告位还没配好：不挡玩家，直接放行', () => {
  const tap = fakeTap();
  const h = game(null, 'yes', { ads: { adUnitId: '', tap: tap.api } });
  h.debug.loadId('drawer-1');
  assert.equal(h.window.KeepsakeAds.supported(), false, '广告位空着就该是「不支持」');
  useFreeHint(h);
  click(h, 'hint');
  assert.equal(tap.log.created, 0, '广告位没配就不该去创建广告实例');
  assert.equal(h.state().hints, 2, '提示照给');
  assert.match(h.window.KeepsakeAds.status(), /广告位还没配置/);
  h.idle();
});

test('STRICT 打开（真开始变现）时，拿不到广告就不给', () => {
  // STRICT 是 ads.js 里「拿不到广告不发奖励」的开关。它是 false 的时候上面那两条才成立；
  // 真开始变现要打开它，这一条守的就是「这个开关不能是摆设」。
  const h = game(null, 'yes', { ads: { adUnitId: 'SPACE-1' } });   // 没有 window.tap
  h.debug.loadId('drawer-1');
  useFreeHint(h);
  h.window.KeepsakeAds.STRICT = true;
  click(h, 'hint');
  assert.equal(h.state().hints, 1, '拿不到广告就不该发奖励');
  assert.match(status(h), /广告没准备好/, '并且要说明白为什么这次不算');
  h.idle();
});

test('「消除一件」同样要先看完广告才生效', async () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  click(h, 'clear');
  assert.equal(tap.log.shown, 1, '消除也要看广告');
  assert.equal(h.state().clears, 0, '没看完先别消');
  tap.close({ isEnded: true });
  await tick();
  assert.equal(h.state().clears, 1, '看完才消');
  h.idle();
});

test('「帮我放一件」看完广告才真的放上去，而且真放好了才记账', async () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  click(h, 'auto');
  assert.equal(tap.log.shown, 1);
  assert.deepEqual(h.state().placed, {}, '没看完先别放');
  tap.close({ isEnded: true });
  await tick();
  assert.equal(h.state().autoPlaced, 1, '放好了才记账');
  assert.equal(Object.keys(h.state().placed).length, 1, '并且真的摆上去了一件');
  h.idle();
});

test('额度用完时不再播广告——不能让玩家白看一次', async () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  click(h, 'auto');
  tap.close({ isEnded: true });
  await tick();
  const shown = tap.log.shown;
  click(h, 'auto');                    // 每关只代放一次，这一次没得放
  await tick();
  assert.equal(tap.log.shown, shown, '没方案就别播广告，让人看完才说「不行」是最糟的体验');
  assert.match(status(h), /已经帮你放过一次/);
  h.idle();
});

test('要广告的时候，按钮上写清楚「看广告」', () => {
  const tap = fakeTap();
  const h = withAds(tap);
  h.debug.loadId('drawer-1');
  assert.equal(spanOf(h, 'hint'), '一点提示', '免费那次还是叫「一点提示」');
  useFreeHint(h);
  assert.equal(spanOf(h, 'hint'), '看广告 · 提示');
  assert.equal(spanOf(h, 'auto'), '看广告 · 帮我放一件');
  assert.equal(spanOf(h, 'clear'), '看广告 · 消除一件');
  h.idle();
});

test('没接广告的环境里，按钮上不该出现「看广告」', () => {
  const h = game();                    // 连 ads.js 都没装
  h.debug.loadId('drawer-1');
  assert.equal(spanOf(h, 'hint'), '一点提示');
  assert.equal(spanOf(h, 'auto'), '帮我放一件');
  assert.equal(spanOf(h, 'clear'), '消除一件');
  h.idle();
});
