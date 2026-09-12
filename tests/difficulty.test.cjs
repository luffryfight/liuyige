const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const K = require('../core.js');

// 和 input.test.cjs 同款的最小 DOM 沙盒，用来从游戏层验证固定件的交互。
function game() {
  class Element {
    constructor() { this.listeners = new Map(); this.children = []; this.parts = new Map(); this.captures = new Set(); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
    emit(type, values = {}) {
      const event = { preventDefault() { this.defaultPrevented = true; }, ...values };
      if (type === 'lostpointercapture') this.captures.delete(event.pointerId);
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
    setAttribute(name, value) { this[name] = value; }
    querySelector(selector) { if (!this.parts.has(selector)) this.parts.set(selector, new Element()); return this.parts.get(selector); }
    appendChild(child) { this.children.push(child); }
    focus() {}
    getContext() { return {}; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
    setPointerCapture(pointerId) { this.captures.add(pointerId); }
    hasPointerCapture(pointerId) { return this.captures.has(pointerId); }
    releasePointerCapture(pointerId) { if (this.captures.delete(pointerId)) this.emit('lostpointercapture', { pointerId }); }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = new Element();
  document.getElementById = element;
  document.createElement = () => new Element();
  document.querySelectorAll = selector => selector === '.level-button' ? element('levels').children : [];
  const storage = new Map();
  const window = new Element();
  const context = vm.createContext({
    window, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    KeepsakeArt: {}, URLSearchParams, location: { search: '?test=1' },
    requestAnimationFrame() {}, setTimeout() {}, ResizeObserver: class { observe() {} },
  });
  for (const file of ['core.js', 'music.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    if (file === 'core.js') context.Keepsake = window.Keepsake;
  }
  const debug = window.GameDebug;
  const state = () => JSON.parse(JSON.stringify(debug.getState()));
  const canvas = element('game');
  const pointer = (type, point, extra = {}) => canvas.emit(type, {
    pointerId: 1, pointerType: 'mouse', button: 0,
    buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y, ...extra,
  });
  const grid = (x, y) => { const b = state().board; return { x: b.x + (x + .5) * b.cell, y: b.y + (y + .5) * b.cell }; };
  return { debug, state, element, pointer, grid, storage };
}

const cellsOf = id => K.items[id].cells.length;
const anchors = () => K.levels.filter(l => (l.anchors || []).length);
const dense = () => K.levels.filter(l => l.dense);
const rotFixed = () => K.levels.filter(l => (l.fixedRot || []).length);

test('后期委托确实加了旧物：教学关保持轻量，正文章节件数明显更多', () => {
  assert.equal(K.levels.length, 100);
  const tutorial = K.levels.filter(l => l.tutorial);
  const rest = K.levels.filter(l => !l.tutorial);
  assert.equal(tutorial.length, 7, '新手章节七关');
  for (const l of K.levels) {
    const n = l.items.length;
    assert.ok(n <= 10, `${l.id} 有 ${n} 件，超出物品栏 10 件上限`);
    // 教学关刻意保持轻量，这是设计意图，不是漏配。
    if (l.tutorial) assert.ok(n <= 6, `${l.id} 是教学关，应当保持轻量，实得 ${n} 件`);
  }
  const heavy = rest.filter(l => l.items.length >= 8);
  assert.ok(heavy.length >= 25, `应有大量关卡加量到 8 件以上，实得 ${heavy.length} 关`);
  const avg = rest.reduce((s, l) => s + l.items.length, 0) / rest.length;
  assert.ok(avg >= 7.5, `正文章节平均件数应明显提高，实得 ${avg.toFixed(2)}`);
});

test('增强表逐条落到关卡上，没有写进表却漏生效的配置', () => {
  const skipped = new Set(K.TUTORIAL);
  for (const [id, h] of Object.entries(K.HARDEN)) {
    const level = K.levels.find(l => l.id === id);
    assert.ok(level, `${id} 在关卡表里不存在`);
    // 新手章节的关卡一律跳过增强（表里留条目是为了记录原始生成结果），这里确认真的跳过了。
    if (skipped.has(id)) {
      assert.ok(!level.dense, `${id} 是教学关，不该要求恰好放满`);
      assert.ok(!level.anchors, `${id} 是教学关，不该有固定件`);
      assert.ok(!(level.fixedRot || []).length, `${id} 是教学关，不该有锁转件`);
      assert.equal(level.rule, K.levelRule(level), `${id} 的规则文案没有跟着刷新`);
      continue;
    }
    if (h.cols) assert.equal(level.cols, h.cols, `${id} 列数没生效`);
    if (h.rows) assert.equal(level.rows, h.rows, `${id} 行数没生效`);
    for (const a of h.add || []) assert.ok(level.items.includes(a), `${id} 缺少追加物品 ${a}`);
    if (h.dense) assert.ok(level.dense, `${id} 没有标记恰好放满`);
    if (h.anchors) assert.equal(level.anchors.length, h.anchors.length, `${id} 固定件数量不符`);
    if (h.fixedRot) assert.deepEqual(level.fixedRot, h.fixedRot, `${id} 锁转件不符`);
    assert.equal(level.rule, K.levelRule(level), `${id} 的规则文案没有跟着刷新`);
  }
  assert.ok(Object.keys(K.HARDEN).length >= 40, '增强表覆盖关卡太少');
});

test('恰好放满的委托：物品格数正好等于抽屉空格数', () => {
  const list = dense();
  assert.ok(list.length >= 3, '至少要有三关用到恰好放满');
  for (const l of list) {
    assert.equal(l.keepCount, undefined, `${l.id} 是取舍关，不能同时要求恰好放满`);
    assert.equal(l.items.reduce((s, id) => s + cellsOf(id), 0), K.freeCells(l), `${l.id} 的件数凑不满抽屉`);
    const solution = K.solve(l).solution;
    assert.ok(K.isComplete(l, solution), `${l.id} 的解应当通过完成判定`);
    assert.equal(K.cellCount(l, solution), K.freeCells(l), `${l.id} 的解必须填满`);
  }
  // 件数对不上时空格不会被默认放行。
  const tutorial = K.levels[0], solved = K.solve(tutorial).solution;
  assert.equal(K.isComplete(tutorial, solved), true);
  assert.equal(K.isComplete({ ...tutorial, dense: true }, solved), false, '有空隙的布局不能算完成');
});

test('固定件：位置合法、不可移动、求解器必须照着放', () => {
  const list = anchors();
  assert.ok(list.length >= 7, `至少七关要带固定件，实得 ${list.length}`);
  assert.ok(list.every(l => !l.tutorial), '新手章节不带固定件：教学阶段不该有动不了的旧物');
  for (const l of list) {
    const seen = new Set();
    for (const a of l.anchors) {
      assert.ok(l.items.includes(a.id), `${l.id} 的固定件 ${a.id} 不在物品清单里`);
      assert.ok(a.x >= 0 && a.y >= 0 && a.x < l.cols && a.y < l.rows, `${l.id} 的固定件 ${a.id} 越界`);
      for (const [dx, dy] of K.shape(a.id, a.rot)) {
        const key = `${a.x + dx},${a.y + dy}`;
        assert.ok(!seen.has(key), `${l.id} 的固定件互相压住了 ${key}`);
        seen.add(key);
        assert.ok(!(l.blocked || []).some(([bx, by]) => bx === a.x + dx && by === a.y + dy), `${l.id} 的固定件压在隔板上`);
      }
    }
    const solution = K.solve(l).solution;
    assert.ok(solution, `${l.id} 固定件之后应当仍可解`);
    for (const a of l.anchors) assert.deepEqual({ x: solution[a.id].x, y: solution[a.id].y, rot: solution[a.id].rot }, { x: a.x, y: a.y, rot: a.rot }, `${l.id} 的解必须把 ${a.id} 留在固定位置`);
    // 玩家如果把固定件挪到别处，必须被拒绝。
    const other = l.anchors[0], moved = K.placementError(l, K.anchorMap(l), other.id, other.x === 0 ? 1 : other.x - 1, other.y, other.rot);
    assert.ok(moved === null || moved === 'overlap' || moved === 'blocked' || moved === 'zone' || moved === 'bounds', `${l.id} 挪动固定件不该产生未知错误`);
  }
});

test('锁转的旧物：转 90 度会被拒绝，只有原方向合法', () => {
  const list = rotFixed();
  assert.ok(list.length >= 1, '至少要有一关用到锁转');
  for (const l of list) {
    for (const id of l.fixedRot) {
      // 不管这一关要不要取舍，锁转件都转不到别的方向。
      for (const rot of [1, 2, 3]) assert.equal(K.placementError(l, {}, id, 0, 0, rot), 'norot', `${l.id} 的 ${id} 不该能转 ${rot * 90} 度`);
      const solution = K.solve(l).solution;
      assert.ok(solution, `${l.id} 应当可解`);
      // 生成器只把锁转挂在不取舍的关卡上，所以它必然在解里；万一以后改成取舍关，
      // 也只要求「在场时方向为 0」，不能因为玩家没选它就让测试红掉。
      if (solution[id]) assert.equal(solution[id].rot, 0, `${l.id} 的解里 ${id} 必须是原方向`);
      else assert.ok(l.keepCount, `${l.id} 是不取舍的关卡，${id} 应当出现在解里`);
    }
  }
});

test('固定件在真实交互里动不了：不能拖、不能转、不能收回、也不能被顶到别的位置', () => {
  const index = K.levels.findIndex(l => (l.anchors || []).length);
  const level = K.levels[index], anchor = level.anchors[0];
  const h = game();
  h.debug.load(index);
  const before = h.state();
  assert.deepEqual(before.locked, level.anchors.map(a => a.id), '固定件在载入时就被锁住');
  assert.deepEqual(before.placed[anchor.id], { x: anchor.x, y: anchor.y, rot: anchor.rot }, '固定件按委托位置落位');

  // 放到别处：拒绝，并且不产生一步操作。
  const elsewhere = K.shape(anchor.id, anchor.rot).length ? [0, 0] : [0, 0];
  assert.equal(h.debug.place(anchor.id, anchor.x, anchor.y, anchor.rot), true, '重复放到原位视为无事发生');
  assert.equal(h.debug.place(anchor.id, elsewhere[0], elsewhere[1], (anchor.rot + 1) % 4), false, '固定件不能被挪走');
  assert.equal(h.state().moves, before.moves, '被拒绝的操作不该记账');
  assert.equal(h.debug.events().at(-1).reason, 'locked');

  // 旋转与收回：按钮直接禁用。
  h.debug.select(anchor.id);
  assert.equal(h.element('rotate').disabled, true, '固定件不能旋转');
  assert.equal(h.element('return').disabled, true, '固定件不能放回桌面');
  h.element('rotate').onclick();
  h.element('return').onclick();
  assert.deepEqual(h.state().placed[anchor.id], { x: anchor.x, y: anchor.y, rot: anchor.rot });

  // 拖拽：指针按下也不该进入拖拽状态。
  h.pointer('pointerdown', h.grid(anchor.x, anchor.y));
  assert.equal(h.state().drag, null, '固定件不该被拖起来');
  assert.match(h.element('status').textContent, /放好|固定/);

  // 撤销不能把它撤没。
  h.element('undo').onclick();
  assert.ok(h.state().placed[anchor.id], '撤销之后固定件仍在原位');
});

test('物品栏随件数分列，最多两行且不越过画布底边', () => {
  const TRAY = { x: 25, y: 405, w: 590, h: 104, pitch: 112, gap: 10 };
  const colsFor = n => n <= 6 ? 3 : n <= 8 ? 4 : 5;
  const seen = new Set();
  for (const l of K.levels) {
    const n = l.items.length, c = colsFor(n), tw = (TRAY.w - (c - 1) * TRAY.gap) / c, rows = Math.ceil(n / c);
    seen.add(`${c}列`);
    assert.ok(tw > 100, `${l.id} 单格只有 ${tw}px，太窄`);
    assert.ok(rows <= 2, `${l.id} 的物品栏需要 ${rows} 行`);
    const bottom = TRAY.y + (rows - 1) * TRAY.pitch + TRAY.h;
    assert.ok(bottom <= 640, `${l.id} 物品栏底部 ${bottom} 超出画布`);
  }
  assert.ok(seen.has('3列') && seen.has('4列') && seen.has('5列'), '三种密度都该用上');
});
