// 画布上的手势：拖拽玩法和页面滚动抢同一根手指，这一组守的就是「按约定分开」这件事。
//
// 约定（只在触摸/触控笔下生效，鼠标完全走老路）：
//   · 按住 ≥130ms 再移动  → 搬东西
//   · 不停顿直接划过去    → 滚页面
//   · 按下就抬起          → 轻点：选中／放进这一格
// 手机版式一张画布比一屏还高，没有这条约定，玩家在旧物箱上往上滑是滑不动的。
//
// 挑关卡的讲究：得挑一件「手机上一张画布确实比一屏还高」的关（这里用 drawer-29，
// 390×700 的可用高度下画布 769px），否则这条测试守的是一个真机上不存在的情形。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./harness.cjs');
const { freeItem, grabOf, spotFor } = require('./lib-placements.cjs');
const K = require('../core.js');

const PHONE = 'drawer-29';
// 一部手机：视口 390 宽、可用高度 700（浏览器地址栏占掉一截后的常见值）。
const PHONE_H = 700;
const phone = (id = PHONE) => { const h = game(); h.setViewport(390, 366, PHONE_H); h.debug.loadId(id); return h; };

test('手机：这一关的画布确实比一屏还高（否则下面几条守的是不存在的情形）', () => {
  const h = phone();
  const height = h.canvas.getBoundingClientRect().height;
  assert.ok(height > h.window.innerHeight,
    `画布 ${Math.round(height)}px 应该比视口 ${h.window.innerHeight}px 高，这样才需要滚动`);
  h.idle();
});

test('手机：在旧物箱上直接划过去是滚页面，不会误把物品搬走', () => {
  const h = phone();
  const start = h.tray(freeItem(h));
  h.swipe(start, { x: start.x, y: start.y - 90 });
  assert.ok(h.scrollY() > 0, `页面应该真的滚了（实测 ${h.scrollY()}px）`);
  assert.equal(h.state().selected, null, '滚动不该顺手选中物品');
  assert.deepEqual(h.state().placed, {}, '更不能把物品放到别处去');
  h.idle();
});

test('手机：在收纳台（棋盘空白处）划过去也是滚页面', () => {
  const h = phone();
  const b = h.state().board;
  const corner = h.client({ x: b.x + 4, y: b.y + 4 });
  h.swipe(corner, { x: corner.x, y: corner.y - 80 });
  assert.ok(h.scrollY() > 0, '棋盘上的空白处是能滚的');
  assert.deepEqual(h.state().placed, {});
  h.idle();
});

test('手机：按住再拖是搬东西，页面一动不动', () => {
  const h = phone();
  const id = freeItem(h);
  const spot = spotFor(h, id), g = grabOf(h, id);
  // 指尖落在 spot+抓取偏移 那一格，物品的左上角才落在 spot。
  h.swipe(h.tray(id), h.grid(spot.x + g.x, spot.y + g.y), true);
  assert.equal(h.scrollY(), 0, '搬东西的时候页面不该跟着滚');
  assert.deepEqual(h.state().placed[id], spot, `${K.items[id].name} 应该落在 (${spot.x},${spot.y})`);
  h.idle();
});

test('手机：轻点选中、再点空格放下（全程不滚动）', () => {
  const h = phone();
  const id = freeItem(h);
  const spot = spotFor(h, id);
  h.clickTouch(h.tray(id));
  assert.equal(h.state().selected, id, '轻点一下是选中');
  assert.equal(h.scrollY(), 0, '轻点不是滚动');
  // 轻点放下走的是鼠标那条路（setGhost 不带抓取偏移），点哪一格就落在哪一格。
  h.clickTouch(h.grid(spot.x, spot.y));
  assert.deepEqual(h.state().placed[id], spot, '再点空格就放下');
  assert.equal(h.scrollY(), 0);
  h.idle();
});

test('手机：按住不放再抬手，仍然只是选中（不会莫名其妙放下）', () => {
  const h = phone();
  const id = freeItem(h);
  h.touch('pointerdown', h.tray(id));
  h.flushTimers();                 // 走完「按住 130ms」
  h.touch('pointerup', h.tray(id));
  assert.equal(h.state().selected, id);
  assert.deepEqual(h.state().placed, {}, '没移动就不该放下任何东西');
  assert.equal(h.scrollY(), 0);
  h.idle();
});

test('鼠标不受影响：按下即拖，不需要先按住', () => {
  const h = game();                // 宽屏：原设计稿，行为必须一个字不改
  h.debug.loadId(PHONE);
  const id = freeItem(h);
  const spot = spotFor(h, id), g = grabOf(h, id);
  const from = h.tray(id), to = h.grid(spot.x + g.x, spot.y + g.y);
  h.pointer('pointerdown', from);
  for (let i = 1; i <= 4; i++) h.pointer('pointermove', { x: from.x + (to.x - from.x) * i / 4, y: from.y + (to.y - from.y) * i / 4 });
  h.pointer('pointerup', to);
  assert.deepEqual(h.state().placed[id], spot, '鼠标拖拽行为不变');
  assert.equal(h.scrollY(), 0, '鼠标不碰滚动');
  h.idle();
});
