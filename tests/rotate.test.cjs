// 手机端「翻转一件已经放好的旧物」这条体验。
//
// 原先只有一条路：先在棋盘上点中那件旧物，再滚到画布下方的工具栏按「旋转」——而手机版式
// 一张画布就比一屏还高，选中的旧物多半在视口外的那一半，来回滚一趟很别扭。更难受的是
// 原地转不开时老版本只会回一句「原地转不开」：玩家点了一下、画面没变，看起来就是「按了没反应」。
//
// 这一组守住四件事：
//   ① 原地转得开就原地转（老行为，一个字不改，连状态栏里的回忆文案都不许盖掉）
//   ② 原地转不开就就近挪位——重叠最多的位置优先、一样就挪得最少的优先
//   ③ 真的无处可去，才照实说清楚，并且一个字节都不动盘面
//   ④ 连着点两下已放好的旧物＝转一下（单点仍然是选中）；右下角的翻转键该出现时才出现
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./harness.cjs');
const { spotFor } = require('./lib-placements.cjs');
const K = require('../core.js');

// 4×4 的空盘面、没有隔板也没有标记区，正好用来做「只跟形状有关」的判断。
// tape 是 2×1：放在 (0,0) 原地转得开，放在 (0,3) 转过去就出界。
const LEVEL = 'drawer-1';
const place = (h, id, x, y, rot = 0) => {
  assert.equal(h.debug.place(id, x, y, rot), true, `${K.items[id].name} 应该放得下 (${x},${y})`);
  h.debug.select(id);
};

test('原地转得开：位置一动不动，也不把回忆文案盖掉', () => {
  const h = game();
  h.debug.loadId(LEVEL);
  place(h, 'tape', 0, 0);
  const moves = h.state().moves, said = h.element('status').textContent;
  h.debug.rotate();
  assert.deepEqual(h.state().placed.tape, { x: 0, y: 0, rot: 1 }, '原地转，坐标不该动');
  assert.equal(h.state().moves, moves + 1, '转一次记一步');
  assert.equal(h.element('status').textContent, said, '原地转成功，状态栏该留着这件旧物的回忆');
  assert.equal(h.debug.events().at(-1).name, 'rotate');
  assert.ok(!h.debug.events().at(-1).blocked, '这不是「转不开」，不该挂 blocked 标记');
  h.idle();
});

test('原地转不开：自动挪到「重叠最多、挪得最少」的位置，而不是回一句「转不开」', () => {
  const h = game();
  h.debug.loadId(LEVEL);
  place(h, 'tape', 0, 3);                        // 横着躺在最后一行，转过来就出界
  const l = K.byId(LEVEL), before = { ...h.state().placed.tape };
  assert.equal(K.canPlace(l, { tape: before }, 'tape', before.x, before.y, 1), false, '前提：原地确实转不开');
  const moves = h.state().moves;
  h.debug.rotate();
  const now = h.state().placed.tape;
  assert.equal(now.rot, 1, '方向要真的转过来');
  assert.notDeepEqual({ x: now.x, y: now.y }, { x: before.x, y: before.y }, '原地放不下，就该挪');
  assert.equal(h.state().moves, moves + 1, '挪着转也是一步操作（撤销退得回来）');
  // 「重叠最多」的直观含义：转完之后还压着原来占过的格子。全空的 4×4 里能转的地方有 12 处，
  // 其中只有 x=0/y=2 和 x=1/y=2 这两处压得住原来的格子，两处一样近，取靠左的那处。
  const was = new Set(K.shape('tape', before.rot).map(([dx, dy]) => `${before.x + dx},${before.y + dy}`));
  const keep = K.shape('tape', now.rot).filter(([dx, dy]) => was.has(`${now.x + dx},${now.y + dy}`)).length;
  assert.equal(keep, 1, '转完要压着原来的格子，看起来才像是「就地转向」而不是换了个地方');
  assert.deepEqual({ x: now.x, y: now.y }, { x: 0, y: 2 }, '重叠一样多时取挪得近的、再取靠左的');
  assert.match(h.element('status').textContent, /挪了 1 格/, '挪过位要解释一句，别让玩家以为是自己点错了');
  h.idle();
});

test('真的无处可去：照实说清楚，盘面一个字节都不动', () => {
  // 近满盘关卡铺满之后，长条无论转到哪都会压到别人——这才是老版本那句提示该出现的时候。
  const l = K.byId('drawer-9');
  const solved = K.solve(l, {}, 400000);
  assert.equal(solved.status, 'solved', 'drawer-9 应该求得出满盘解');
  const h = game();
  h.debug.loadId(l.id);
  for (const [id, p] of Object.entries(solved.solution)) assert.equal(h.debug.place(id, p.x, p.y, p.rot), true, id);
  const placed = h.state().placed;
  const stuck = l.items.find(id => {
    const p = placed[id], t = K.bounds(K.shape(id, 0));
    if (t.w === t.h) return false;                                   // 方形物品转了等于没转
    if (K.canPlace(l, placed, id, p.x, p.y, (p.rot + 1) % 4)) return false;
    return h.debug.rotateSpots(id, (p.rot + 1) % 4).length === 0;    // 哪一格都放不下
  });
  assert.ok(stuck, `drawer-9 铺满之后应该有一件「转过来哪都放不下」的长条`);

  h.debug.select(stuck);
  const before = h.state();
  h.debug.rotate();
  const after = h.state();
  assert.deepEqual(after.placed[stuck], before.placed[stuck], '放不下就不该动它');
  assert.equal(after.moves, before.moves, '没发生的事不该记账');
  assert.match(h.element('status').textContent, /哪一格都放不下/, '要说清楚是「放不下」，而不是沉默');
  assert.equal(h.debug.events().at(-1).blocked, true, '事件里也要记下这次没转成');
  h.idle();
});

test('连着点两下已放好的旧物＝就地翻个方向', () => {
  const h = game();
  h.debug.loadId(LEVEL);
  h.debug.place('tape', 0, 0, 0);                // 放好，此时没有选中任何东西
  assert.equal(h.state().selected, null, '前提：放下之后是没选中的');
  h.clickTouch(h.grid(0, 0));                    // 第一下：选中
  assert.equal(h.state().selected, 'tape', '第一下仍然是选中，不能变成别的');
  assert.equal(h.state().placed.tape.rot, 0, '这时候还不该转');
  h.clickTouch(h.grid(0, 0));                    // 第二下：转
  assert.equal(h.state().placed.tape.rot, 1, '第二下要就地转过来');
  assert.equal(h.state().placed.tape.x, 0, '原地转得开，就不用挪');
  assert.equal(h.state().moves, 2, '放一次 + 转一次');
  h.idle();
});

test('点两下的间隔里只要动过别处，就不再算双击（不会误转）', () => {
  const h = game();
  h.debug.loadId(LEVEL);
  const taken = spotFor(h, 'tin');
  h.debug.place('tin', taken.x, taken.y, taken.rot);
  const home = spotFor(h, 'tape');               // 给 tape 另找一处，免得和 tin 打架
  h.clickTouch(h.grid(taken.x, taken.y));        // 点中 tin
  assert.equal(h.state().selected, 'tin');
  h.clickTouch(h.grid(home.x, home.y));          // 紧接着把它放到别处——中间这一下不该被当成双击
  assert.equal(h.state().placed.tin.rot, taken.rot, '放手那一下不能顺手把方向也改了');
  h.clickTouch(h.grid(home.x, home.y));          // 再点它：此刻没选中它，所以只是重新选中
  assert.equal(h.state().placed.tin.rot, taken.rot, '落座后的第一下也不该转');
  assert.equal(h.state().selected, 'tin', '但要能选中');
  h.idle();
});

test('转完就收手：第三下只选中，不会连转两次', () => {
  const h = game();
  h.debug.loadId(LEVEL);
  h.debug.place('tape', 0, 0, 0);
  for (let i = 0; i < 3; i++) h.clickTouch(h.grid(0, 0));
  assert.equal(h.state().placed.tape.rot, 1, '双击转一次就够，第三下要重新开始');
  h.idle();
});

test('右下角的翻转键：选中能转的才露出来，选中不能转的就收起来', () => {
  const h = game();
  h.setViewport(390, 366, 700);                  // 手机版式
  h.debug.loadId(LEVEL);
  assert.equal(h.element('rotate-fab').hidden, true, '什么都没选，不该有东西挡在屏幕上');
  h.debug.select('tape');
  assert.equal(h.element('rotate-fab').hidden, false, '选中一件能转的，键要露出来');
  h.element('rotate-fab').onclick();             // 它做的必须和「旋转」按钮是同一件事
  assert.equal(h.state().placed.tape, undefined, '还没放下的那件，转的是方向');
  assert.equal(h.state().rotations.tape, 1, '按一下就该转过来');
  h.debug.place('tape', 0, 0, 1);
  h.debug.select('tape');                        // place() 会取消选中，这里补回来
  h.element('rotate-fab').onclick();
  assert.deepEqual(h.state().placed.tape, { x: 0, y: 0, rot: 2 }, '放好的那件同理');
  h.idle();

  // 委托人固定的、以及本关规定「只能按原方向放」的，都不该露出来。
  for (const [level, id] of [['drawer-46', 'notebook'], ['drawer-21', 'cane']]) {
    h.debug.loadId(level);
    h.debug.select(id);
    assert.equal(h.debug.canTurn(id), false, `${level} 的 ${id} 不该能转`);
    assert.equal(h.element('rotate-fab').hidden, true, `${level}：不能转的旧物不该露出翻转键`);
    assert.equal(h.element('rotate').disabled, true, `${level}：工具栏那个按钮同样禁用`);
  }
  h.idle();
});
