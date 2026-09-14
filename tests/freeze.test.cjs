// 「放上一件旧物，整个页面卡死，连音效都停」——这条 bug 的根因不在渲染，在同步求解器：
// updateUI() 为了决定「消除」按钮灰不灰，会给每个候选跑一次完整求解；没放下的候选删掉之后
// 盘面一模一样，等于同一道题解十几遍。大师关一盘错局实测 15~16 秒，主线程全被占住。
//
// 修法有三层（去重、按钮路径换成纯规则筛选、求解器加时间预算），这一组守的是最外面那层：
// **玩家每摆一下，都不该再触发任何求解**。
//
// 用法是数「求解器被调了几次」，而不是掐秒表——机器快慢不影响结论，回归了必然红。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./harness.cjs');
const { freeItem, spotFor } = require('./lib-placements.cjs');

const MASTER = 'drawer-44';   // 大师委托第一关：玩家报「放上搪瓷杯就卡死」的就是这一关

// 装上计数器。改的是 window.Keepsake 上那两个方法，而不是测试自己 require 进来的那份：
// game.js 开头就 `const K=window.Keepsake`，只有改这个对象的属性才是改游戏真正在调的东西。
function countSolves(h) {
  const K = h.window.Keepsake, log = { solve: 0, solveAll: 0 };
  for (const name of ['solve', 'solveAll']) {
    const real = K[name];
    K[name] = function (...args) { log[name]++; return real.apply(K, args); };
  }
  return log;
}
const total = log => log.solve + log.solveAll;
const ms = t0 => Number(process.hrtime.bigint() - t0) / 1e6;

test('大师第一关：摆一件旧物不再冻住界面（这一下不该碰求解器）', () => {
  const h = game();
  h.debug.loadId(MASTER);
  const id = freeItem(h), spot = spotFor(h, id);
  const log = countSolves(h);
  const t0 = process.hrtime.bigint();
  h.clickTouch(h.tray(id));
  assert.equal(h.state().selected, id, '先选中');
  h.clickTouch(h.grid(spot.x, spot.y));
  const elapsed = ms(t0);
  assert.deepEqual(h.state().placed[id], spot, '再放下');
  assert.equal(total(log), 0, `摆这一件不该求解任何东西（实测 ${total(log)} 次）`);
  assert.ok(elapsed < 250, `这一下要在 250ms 内落地（实测 ${elapsed.toFixed(0)}ms）`);
  h.idle();
});

test('大师第一关：连摆三件、再取回一件，全程不碰求解器', () => {
  const h = game();
  h.debug.loadId(MASTER);
  const log = countSolves(h);
  const t0 = process.hrtime.bigint();
  let last = null;
  for (let i = 0; i < 3; i++) {
    const id = freeItem(h), spot = spotFor(h, id);
    h.clickTouch(h.tray(id));
    h.clickTouch(h.grid(spot.x, spot.y));
    assert.deepEqual(h.state().placed[id], spot, `第 ${i + 1} 件要真的放下`);
    last = { id, spot };
  }
  // 取回一件：选中盘面上的它，再按「放回桌面」。
  h.click(h.grid(last.spot.x, last.spot.y));
  assert.equal(h.state().selected, last.id, '点盘面上的旧物要能选中它');
  h.element('return').onclick();
  assert.equal(h.state().placed[last.id], undefined, '要真的收回来');
  const elapsed = ms(t0);
  assert.equal(total(log), 0, `摆放和取回都不该求解任何东西（实测 ${total(log)} 次）`);
  assert.ok(elapsed < 500, `四下操作加起来要在 500ms 内完成（实测 ${elapsed.toFixed(0)}ms）`);
  h.idle();
});

test('（对照）提示按钮仍然在算——上面那个 0 是真的 0', () => {
  const h = game();
  h.debug.loadId(MASTER);
  const log = countSolves(h);
  h.element('hint').onclick();          // 每关自带一次免费提示，这里不涉及广告
  assert.ok(total(log) > 0, '提示要靠求解才知道该放哪一件，必须真的算过');
  assert.ok(h.state().hint, '并且要给出结论');
  h.idle();
});
