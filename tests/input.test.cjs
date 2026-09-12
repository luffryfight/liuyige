const test = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./harness.cjs');

test('right-click returns the hit object without selecting it first; undo and save preserve its original position', () => {
  const h = game();
  h.debug.place('tin', 0, 0, 0);
  h.debug.place('photo', 2, 0, 0);
  const before = h.state().placed;
  assert.equal(h.state().selected, null);
  assert.equal(h.right(h.grid(0, 0)).defaultPrevented, true);
  assert.deepEqual(h.state().placed, { photo: before.photo });
  assert.equal(h.element('return').disabled, true);
  assert.equal(h.debug.events().at(-1).name, 'item_returned');
  const saved = JSON.parse(h.storage.get('liuyige-mvp-v1'));
  assert.equal(saved.sessions['drawer-1'].placed.tin, undefined);
  h.element('undo').onclick();
  assert.deepEqual(h.state().placed, before);
  h.idle();
});

test('right-clicking empty board or tray never removes another selected object; touch context menu does not return it', () => {
  const h = game();
  h.debug.place('tin', 0, 0, 0);
  const before = h.state().placed;
  for (const point of [h.grid(3, 3), h.tray('photo')]) {
    h.debug.select('tin');
    h.right(point);
    assert.deepEqual(h.state().placed, before);
    assert.equal(h.state().moves, 1);
  }
  h.pointer('contextmenu', h.grid(0, 0), { pointerType: 'touch', button: 2 });
  assert.deepEqual(h.state().placed, before);
  h.idle();
});

test('clicking a placed item selects it but subsequent hover does not make it follow the mouse', () => {
  const h = game();
  h.debug.place('tin', 0, 0, 0);
  h.click(h.grid(0, 0));
  assert.equal(h.state().selected, 'tin');
  h.pointer('pointermove', h.grid(3, 3), { buttons: 0 });
  assert.deepEqual(h.state().placed.tin, { x: 0, y: 0, rot: 0 });
  h.idle();
});

test('invalid overlapping drop clears the preview and does not follow the next mouse move', () => {
  const h = game();
  h.debug.place('tin', 0, 0, 0);
  h.pointer('pointerdown', h.tray('photo'));
  h.pointer('pointermove', h.grid(1, 1));
  assert.notEqual(h.state().ghost, null);
  h.pointer('pointerup', h.grid(1, 1));
  h.pointer('pointermove', h.grid(3, 3), { buttons: 0 });
  assert.deepEqual(h.state().placed, { tin: { x: 0, y: 0, rot: 0 } });
  assert.equal(h.state().moves, 1);
  assert.equal(h.debug.events().at(-1).name, 'invalid_placement');
  h.idle();
});

test('successful drag and a later reposition both end on mouse release', () => {
  const h = game();
  h.pointer('pointerdown', h.tray('tin'));
  h.pointer('pointermove', h.grid(1, 1));
  h.pointer('pointerup', h.grid(1, 1));
  assert.deepEqual(h.state().placed.tin, { x: 0, y: 0, rot: 0 });
  h.idle();
  h.pointer('pointerdown', h.grid(0, 0));
  h.pointer('pointermove', h.grid(2, 2));
  h.pointer('pointerup', h.grid(2, 2));
  h.pointer('pointermove', h.grid(0, 0), { buttons: 0 });
  assert.deepEqual(h.state().placed.tin, { x: 2, y: 2, rot: 0 });
  assert.equal(h.state().selected, null);
  h.idle();
});

test('click-to-place still works without introducing hover previews', () => {
  const h = game();
  h.click(h.tray('tin'));
  h.pointer('pointermove', h.grid(0, 0), { buttons: 0 });
  assert.equal(h.state().ghost, null);
  h.click(h.grid(0, 0));
  assert.deepEqual(h.state().placed.tin, { x: 0, y: 0, rot: 0 });
  h.idle();
});

test('a mouse move reporting no held button cancels a drag whose pointerup was lost', () => {
  const h = game();
  h.debug.place('tin', 0, 0, 0);
  h.pointer('pointerdown', h.grid(0, 0));
  h.pointer('pointermove', h.grid(2, 2));
  assert.notEqual(h.state().ghost, null);
  h.pointer('pointermove', h.grid(2, 2), { buttons: 0 });
  assert.deepEqual(h.state().placed.tin, { x: 0, y: 0, rot: 0 });
  h.idle();
});

test('pointer cancellation, lost capture, blur and hidden document safely cancel active drags', () => {
  for (const interruption of ['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange']) {
    const h = game();
    h.debug.place('tin', 0, 0, 0);
    h.pointer('pointerdown', h.grid(0, 0));
    h.pointer('pointermove', h.grid(2, 2));
    if (interruption === 'blur') h.window.emit('blur');
    else if (interruption === 'visibilitychange') { h.document.hidden = true; h.document.emit('visibilitychange'); }
    else h.pointer(interruption, h.grid(2, 2));
    assert.deepEqual(h.state().placed.tin, { x: 0, y: 0, rot: 0 }, interruption);
    h.idle();
  }
});

test('events from a second pointer do not hijack or cancel the active drag', () => {
  const h = game();
  h.pointer('pointerdown', h.tray('tin'));
  h.pointer('pointermove', h.grid(1, 1));
  const before = h.state();
  for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
    h.pointer(type, h.grid(3, 3), { pointerId: 2 });
    assert.deepEqual(h.state().drag, before.drag);
    assert.deepEqual(h.state().ghost, before.ghost);
  }
  h.pointer('pointerup', h.grid(1, 1));
  assert.deepEqual(h.state().placed.tin, { x: 0, y: 0, rot: 0 });
  h.idle();
});

test('rotation button, R key, keyboard placement, return button and undo remain usable', () => {
  const h = game();
  h.click(h.tray('tape'));
  h.element('rotate').onclick();
  assert.equal(h.state().rotations.tape, 1);
  h.key('r');
  assert.equal(h.state().rotations.tape, 2);
  h.key('ArrowRight');
  h.key('ArrowDown');
  h.key('Enter');
  assert.deepEqual(h.state().placed.tape, { x: 1, y: 1, rot: 2 });
  h.click(h.grid(1, 1));
  assert.equal(h.element('return').disabled, false);
  h.element('return').onclick({ type: 'click' });
  assert.deepEqual(h.state().placed, {});
  h.element('undo').onclick();
  assert.deepEqual(h.state().placed.tape, { x: 1, y: 1, rot: 2 });
  h.idle();
});

test('Escape ends an active drag and releases pointer capture', () => {
  const h = game();
  h.pointer('pointerdown', h.tray('tin'));
  h.pointer('pointermove', h.grid(1, 1));
  h.key('Escape');
  assert.equal(h.state().selected, null);
  assert.deepEqual(h.state().placed, {});
  h.idle();
});

test('reloading a saved session restores its selected level and placements', () => {
  const h = game();
  const idx = h.debug.loadId('drawer-4');
  h.debug.place('player', 0, 0, 0);
  const restored = game(h.storage.get('liuyige-mvp-v1'));
  assert.equal(restored.state().levelIndex, idx);
  assert.deepEqual(restored.state().placed, { player: { x: 0, y: 0, rot: 0 } });
  restored.idle();
  const invalid = JSON.parse(h.storage.get('liuyige-mvp-v1'));
  invalid.current = 999;
  assert.equal(game(JSON.stringify(invalid)).state().levelIndex, 0);
});

test('choice flow refuses count-only completion, permits swapping, and restores completion on undo', () => {
  const K = require('../core.js');
  const h = game();h.debug.loadId('drawer-15');
  h.debug.place('book',0,0,0);h.debug.place('pencil',0,3,1);
  h.debug.place('letter',0,2,0);h.debug.place('keys',2,1,0);
  assert.equal(h.state().finished,false);
  assert.notEqual(h.element('complete-dialog').open,true);
  assert.match(h.element('status').textContent,/必留物/);
  h.right(h.grid(0,0));h.debug.place('photo',0,0,0);
  assert.equal(h.state().finished,true);
  assert.equal(h.element('complete-dialog').open,true);
  assert.match(h.element('result-stats').textContent,new RegExp(`${K.byId('drawer-15').items.length-4} 件留在桌面`));
  h.element('complete-dialog').close();h.right(h.grid(0,0));
  assert.equal(h.state().finished,false);
  h.element('undo').onclick();assert.equal(h.state().finished,true);
});

test('every commission completes through the actual game flow with rule-aware hints', () => {
  const K = require('../core.js');
  for(let i=0;i<K.levels.length;i++){
    const h=game();h.debug.load(i);const solution=K.solve(K.levels[i]).solution;
    h.element('hint').onclick();
    assert.match(h.element('status').textContent,/绿色虚线/);
    for(const[id,p]of Object.entries(solution))assert.equal(h.debug.place(id,p.x,p.y,p.rot),true);
    assert.equal(h.state().finished,true,K.levels[i].id);
    assert.equal(h.element('complete-dialog').open,true,K.levels[i].id);
    assert.equal(h.state().ghost,null);
  }
});

test('every chapter tab opens its own commission and the board shrinks instead of overlapping the tray', () => {
  const K = require('../core.js');
  const h = game();
  assert.equal(K.levels.length, 100, 'the shop ships one hundred commissions');
  assert.equal(h.element('levels').children.length, 100, 'one list entry per commission');
  const tabs = h.element('mode-tabs').children;
  assert.equal(tabs.length, K.chapters.length, 'one tab per chapter, tutorial included');
  for (const tab of tabs) {
    tab.onclick();
    const opened = K.levels[h.state().levelIndex];
    assert.equal(opened.group, tab['data-group'], `${tab['data-group']} tab opens a ${tab['data-group']} commission`);
    assert.equal(h.element('rule-title').textContent, K.modeNames[opened.mode]);
    assert.ok(h.element('rule-copy').textContent.length > 0, 'every commission explains its rule');
  }
  const sixRows = K.levels.findIndex(l => l.rows === 6);
  const sevenCols = K.levels.findIndex(l => l.cols === 7);
  assert.ok(sixRows >= 0 && sevenCols >= 0, 'the shop includes tall and wide commissions');
  for (let i = 0; i < K.levels.length; i++) {
    h.debug.load(i);
    const b = h.state().board;
    assert.ok(b.x >= 0 && b.x + b.w <= 640, `${K.levels[i].id} fits horizontally`);
    assert.ok(b.y + b.h <= 380, `${K.levels[i].id} stays above the tray divider`);
    assert.ok(b.cell >= 28, `${K.levels[i].id} stays legible`);
  }
  h.debug.load(sixRows);
  assert.ok(h.state().board.cell < 52, 'six rows shrink the cell');
});

test('the commission list numbers each chapter from 01, so no chapter reads as if levels were missing', () => {
  const K = require('../core.js');
  const h = game();
  const buttons = h.element('levels').children;
  // 序号的唯一依据是「本关在本章里排第几」。早先写的是全书下标，切到隔板抽屉
  // （共 13 关）会看到 13,14,15,22,23,24,52,59,66…，中间全是被别章占掉的号。
  assert.equal(buttons.length, K.levels.length);
  for (const c of K.chapters) {
    const mine = buttons.filter(b => b['data-group'] === c.key);
    const expected = K.levels.filter(l => l.group === c.key).length;
    assert.equal(mine.length, expected, `${c.name} 的条目数要等于它的关卡数`);
    assert.deepEqual(
      mine.map(b => Number(b['data-no'])),
      Array.from({ length: expected }, (_, i) => i + 1),
      `${c.name} 的序号必须是 01–${String(expected).padStart(2, '0')}，不跳号`
    );
    // 序号只在本章内部有意义，读屏要能听出它属于哪一章。
    for (const b of mine) assert.ok(String(b['aria-label']).startsWith(c.name), `条目要报出章节名：${b['aria-label']}`);
  }
});

test('the sound switch drives the background track, its label and the saved preference', () => {
  const h = game();
  const music = h.window.KeepsakeMusic;
  // 测试环境没有 AudioContext。背景音乐必须安静降级：开关照样能用，只是不出声、不报错。
  assert.ok(music, 'music.js 要挂在 window 上');
  for (const fn of ['supported', 'ctx', 'set', 'toggle', 'enabled', 'playing']) {
    assert.equal(typeof music[fn], 'function', `背景音乐要提供 ${fn}()`);
  }
  assert.equal(music.playing(), false, '玩家没点过就不该有东西在响');

  const button = h.element('sound');
  assert.equal(button['aria-pressed'], 'true', '默认是开的');
  assert.equal(button.textContent, '声音：开');

  button.onclick();                                     // 关
  assert.equal(button.textContent, '声音：关');
  assert.equal(button['aria-pressed'], 'false');
  assert.equal(music.enabled(), false, '关掉之后 BGM 应当是关的');
  assert.equal(JSON.parse(h.storage.get('liuyige-mvp-v1')).sound, false, '关掉的选择要写进存档');
  assert.doesNotThrow(() => music.set(true), '没有 AudioContext 时开关不能抛出去');
  assert.doesNotThrow(() => h.document.emit('pointerdown'), '第一次手势的接管也要能安全空转');

  button.onclick();                                     // 再开
  assert.equal(button.textContent, '声音：开');
  assert.equal(button['aria-pressed'], 'true');
  assert.equal(JSON.parse(h.storage.get('liuyige-mvp-v1')).sound, true);
});
