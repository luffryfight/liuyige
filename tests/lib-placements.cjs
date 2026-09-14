// 测试用的「盘面小工具」：从旧物箱里挑一件能自己搬的东西、算出它真能落下的那一格。
//
// 为什么要有它：手势测试和卡顿测试都得先在盘上放一件真东西，而「哪一件能放、放在哪」
// 完全是数据驱动的——每关的形状、隔板、标记区都不一样，item 也没有固定的 1×1 小方块
// （全局一件都没有）。所以这里不写死任何坐标，一律问游戏自己的 K.canPlace。
const assert = require('node:assert/strict');
const K = require('../core.js');

// 挑一件能自己搬的旧物：委托人固定住的（locked）不算。
function freeItem(h) {
  const l = K.byId(h.debug.levelId()), st = h.state();
  const id = l.items.find(x => !st.locked.includes(x) && !st.placed[x]);
  assert.ok(id, `${l.id} 里应该有没被委托人固定住的旧物`);
  return id;
}

// 未落盘的旧物按「体积中心」抓（见 game.js 的 startDragAt：grab = {w/2, h/2}），
// 所以指尖落在哪一格，物品的左上角就落在「那一格 − 抓取偏移」。
function grabOf(h, id) {
  const b = K.bounds(K.shape(id, h.state().rotations[id] || 0));
  return { x: Math.floor(b.w / 2), y: Math.floor(b.h / 2) };
}

// 用游戏自己的合法性判断找一处真能落下的位置，别手写 (0,0)——每关的空位都不一样，
// 有的关还有隔板和标记区。优先挑「指尖也落在盘内」的落点，最贴近真机操作。
function spotFor(h, id) {
  const l = K.byId(h.debug.levelId()), st = h.state(), rot = st.rotations[id] || 0, g = grabOf(h, id);
  let loose = null;
  for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.cols; x++) {
    if (!K.canPlace(l, st.placed, id, x, y, rot)) continue;
    if (x + g.x < l.cols && y + g.y < l.rows) return { x, y, rot };
    if (!loose) loose = { x, y, rot };
  }
  assert.ok(loose, `${l.id} 里放不下 ${K.items[id].name}`);
  return loose;
}

module.exports = { freeItem, grabOf, spotFor };
