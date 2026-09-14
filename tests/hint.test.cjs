const test = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./harness.cjs');

// 「一点提示」这条链路，玩家点下去必须真的看到东西。
// 老实现只有一个分支：解得出就标一件，解不出就说一句「这次布局有些复杂」——
// 玩家摆错之后点提示，等于什么都没得到。这组测试守住三个分支都要给出可执行的信息。
//
// 提示的三种局面：
//   ① solved      —— 当前摆法走得通，标出下一件该放哪、什么方向
//   ② blame       —— 玩家摆错了，点名是哪一件堵住了整局
//   ③ unsolvable  —— 不是摆法问题，是选件问题，提示换件而不是继续瞎摆

const ITEMS = id => id;
const byId = (h, id) => h.window.Keepsake.byId(id);

// 直接把棋盘摆成指定状态：先点桌面上的物件，再点目标格。
function put(h, id, x, y) {
  const g = h.window.GameDebug;
  const level = byId(h, g.levelId());
  const ret = g.place(id, x, y, 0);
  return ret;
}

// 走一次真实的提示按钮点击（不是直接调 giveHint），确保接线也是对的。
function pressHint(h) {
  const btn = h.element('hint');
  assert.ok(typeof btn.onclick === 'function', '提示按钮要有 click 处理');
  btn.onclick({ preventDefault() {} });
}

test('提示：当前摆法可解时，标出下一件的位置与方向', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  pressHint(h);
  const st = h.state();
  // 提示会落在一件「还没放下」的物件上。
  const level = byId(h, 'drawer-78');
  assert.ok(st.hint, '提示后应当有高亮目标');
  assert.ok(level.items.includes(st.hint.id), '高亮的必须是本关的物件');
  assert.equal(st.hint.warn, undefined, '可解时不该打警示标记');
  // 状态栏要给出方向信息，而不是含糊其辞。
  const text = h.element('status').textContent;
  assert.match(text, /绿色虚线/, '要说明位置在绿色虚线处');
  assert.match(text, /保持原方向|转成横放|转成倒放|转成竖放/, '要说清方向');
});

test('提示：摆错时会点名是哪一件堵住了', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  // 这两件的组合是本关的一个「死局」：耳机摆在左上、相机摆在左下，
  // 各自单独看都合法，但一起放下去整局就无解（挪开任意一件都能救活）。
  // 这正是提示该点名的场景——玩家自己看不出是哪件碍事。
  assert.equal(put(h, 'headphones', 0, 0), true, '耳机这个位置本身合法');
  assert.equal(put(h, 'camera', 0, 4), true, '相机这个位置本身也合法');
  pressHint(h);
  const st = h.state();
  assert.ok(st.hint, '摆错时也要给出高亮');
  assert.ok(['headphones', 'camera'].includes(st.hint.id), '应当点名这两件里的某一件');
  assert.equal(st.hint.warn, true, '放错的那件要打警示标记');
  const text = h.element('status').textContent;
  assert.match(text, /卡住的是/, '要点明是哪一件');
  assert.match(text, /放回桌面/, '要告诉玩家怎么解决');
});

test('提示：把被点名的那件收回去，提示会转向下一步', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  put(h, 'headphones', 0, 0);
  put(h, 'camera', 0, 4);
  pressHint(h);
  assert.equal(h.state().hint.warn, true, '先进入警示态');
  const blamed = h.state().hint.id;
  // 玩家照做：收回被点名的那一件。
  h.debug.select(blamed);
  h.element('return').onclick();
  const st = h.state();
  assert.ok(!st.placed[blamed], '被点名的那件已经回到桌面');
  assert.ok(!st.hint, '警示高亮要跟着清掉，不能留着过期信息');
  assert.match(h.element('status').textContent, /再点一次提示/, '要引导玩家再点提示');
  // 再点一次，这次应该给出可执行的落点。
  pressHint(h);
  const st2 = h.state();
  assert.ok(st2.hint, '再点提示应当给出新位置');
  assert.ok(!st2.hint.warn, '这次是正常提示，不是警示');
});

test('提示：怎么换件都无解时，指出问题在选件而不是摆法', () => {
  const h = game();
  // drawer-50「给书留的九格」留 7 件，换一套明显塞不满的组合。
  h.debug.loadId('drawer-50');
  const level = byId(h, 'drawer-50');
  const goal = h.window.Keepsake.goalCount(level);
  // 挑最瘦的几件放下去：形状上永远填不满盘面。
  const thin = level.items
    .filter(id => !(level.required || []).includes(id))
    .slice()
    .sort((a, b) => h.window.Keepsake.items[a].cells.length - h.window.Keepsake.items[b].cells.length)
    .slice(0, goal);
  let n = 0;
  for (const id of thin) {
    // 找不到合法位置就跳过，够件数即可。
    for (let x = 0; x < level.cols && !h.state().placed[id]; x++) {
      for (let y = 0; y < level.rows && !h.state().placed[id]; y++) {
        const rest = { ...h.state().placed };
        delete rest[id];
        if (h.window.Keepsake.canPlace(level, rest, id, x, y, 0)) {
          if (h.window.GameDebug.place(id, x, y, 0)) n++;
        }
      }
    }
  }
  assert.ok(n > 0, '至少要能放下几件');
  pressHint(h);
  const text = h.element('status').textContent;
  // 要么点名某件，要么明确说「换件」；绝不能只丢一句「有些复杂」。
  assert.ok(
    /卡住的是|换一件|换件|取回一件/.test(text),
    `提示必须给出可执行方向，实际是：${text}`
  );
  assert.ok(!/有些复杂/.test(text), '不许再出现含糊的「有些复杂」');
});

test('提示：摆放改动后，过期的警示不会被继续显示', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  put(h, 'headphones', 0, 0);
  put(h, 'camera', 0, 4);
  pressHint(h);
  assert.equal(h.state().hint.warn, true);
  // 玩家把被点名的那件挪到另一个合法位置（而不是收回桌面）。
  const blamed = h.state().hint.id;
  // (1,0) 在相机已占 (0,4) 的前提下对这两件都是合法位置。
  assert.equal(put(h, blamed, 1, 0), true, '挪到新的合法位置');
  assert.ok(!h.state().hint || !h.state().hint.warn, '挪动之后旧的警示要消失');
  assert.ok(!h.state().hmove, '点名记录也要跟着清掉');
});

// ── 代放（看广告帮玩家放一件）──
// 这段踩过两个坑，都用测试钉住：额度被扣两次、撤销只能退回一半。

test('代放：干净盘面上放一件，额度只扣一次，一次撤销整体退回', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  assert.equal(h.state().autoPlaced, 0);
  assert.equal(h.debug.doAutoPlace(), true, '空盘面应当能代放');
  assert.equal(Object.keys(h.state().placed).length, 1, '放好一件');
  assert.equal(h.state().autoPlaced, 1, '额度只该扣一次（曾经在回调里又加了一次）');
  // 一次撤销要回到代放之前，而不是只退回一半。
  h.element('undo').onclick();
  assert.equal(Object.keys(h.state().placed).length, 0, '一次撤销应整体退回');
});

test('代放：死局上先收走放错的那件再放，件数净不变', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  put(h, 'headphones', 0, 0);
  put(h, 'camera', 0, 4);
  assert.equal(h.debug.solve().status, 'unsolvable', '先造出一个死局');
  assert.equal(h.debug.doAutoPlace(), true);
  assert.equal(Object.keys(h.state().placed).length, 2, '收一件、放一件，件数不变');
  assert.equal(h.debug.solve().status, 'solved', '死局应当被代放解开');
  h.element('undo').onclick();
  assert.equal(Object.keys(h.state().placed).length, 2);
  assert.equal(h.debug.solve().status, 'unsolvable', '一次撤销整体退回，回到死局');
});

test('代放：额度用完后不再重复代放，盘面不变', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  assert.equal(h.debug.doAutoPlace(), true);
  assert.equal(h.debug.doAutoPlace(), false, '第二次应当拒绝');
  assert.equal(Object.keys(h.state().placed).length, 1, '盘面不该再变');
  assert.equal(h.state().autoPlaced, 1, '额度不该被扣第二次');
});

test('代放：摆放合法（代放的件必须真的能放在那里）', () => {
  const h = game();
  for (const id of ['drawer-78', 'drawer-44', 'drawer-99', 'drawer-7']) {
    h.debug.loadId(id);
    h.debug.doAutoPlace();
    const st = h.state();
    const level = h.window.Keepsake.byId(id);
    for (const [item, p] of Object.entries(st.placed)) {
      const err = h.window.Keepsake.placementError(level, {}, item, p.x, p.y, p.rot);
      assert.equal(err, null, `${id} 代放后的 ${item} 必须合法，实际 ${err}`);
    }
  }
});
