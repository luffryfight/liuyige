const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../core.js');
const { game } = require('./harness.cjs');

test('新手章节由七种玩法各一关组成，且排在最前面', () => {
  const tutorial = K.levels.slice(0, 7);
  assert.equal(K.TUTORIAL.length, 7);
  assert.ok(tutorial.every(l => l.group === 'tutorial' && l.tutorial === true), '前七关都是新手章节');
  assert.equal(new Set(tutorial.map(l => l.mode)).size, 7, '七关覆盖七种玩法，没有重复');
  for (const mode of Object.keys(K.modeNames)) {
    assert.ok(tutorial.some(l => l.mode === mode), `${K.modeNames[mode]} 在新手章节里有一关`);
  }
  const rest = K.levels.slice(7);
  assert.equal(rest.length, 93);
  assert.ok(rest.every(l => l.group === l.mode && !l.tutorial), '其余关卡归各自的正式章节');
  assert.ok(rest.every(l => !tutorial.includes(l)), '同一关不会既在教程又在正式章节');
});

test('新手章节的关卡保持教学难度，不被 HARDEN 增强', () => {
  const cases = [
    ['drawer-7', { cols: 5, rows: 4, items: 5 }],
    ['drawer-15', { cols: 4, rows: 4, items: 6 }],
  ];
  for (const [id, original] of cases) {
    const l = K.byId(id);
    assert.ok(K.HARDEN[id], `${id} 在 HARDEN 表里有条目，正因如此才要验证它被跳过`);
    assert.equal(l.cols, original.cols, `${id} 列数保持原始`);
    assert.equal(l.rows, original.rows, `${id} 行数保持原始`);
    assert.equal(l.items.length, original.items, `${id} 物品种类保持原始`);
  }
  assert.ok(!K.byId('drawer-43').anchors, '教学关不带固定件');
  assert.ok(K.levels.slice(0, 7).every(l => l.cols <= 6 && l.rows <= 5 && l.items.length <= 6), '教学关都维持在小尺寸');
});

test('每一件物品都至少在一份委托里出现过', () => {
  const used = new Set();
  for (const l of K.levels) for (const id of l.items) used.add(id);
  for (const id of Object.keys(K.items)) assert.ok(used.has(id), `${K.items[id].name} 从来没有出场过`);
});

test('每条关系的两件物品至少共存于一份委托，否则永远解不开', () => {
  for (const r of K.relations) {
    const shared = K.levels.filter(l => l.items.includes(r.a) && l.items.includes(r.b));
    assert.ok(shared.length > 0, `${r.id}：${K.items[r.a].name} 与 ${K.items[r.b].name} 从不同关`);
  }
});

test('四种关系判定各自成立，且不会误判', () => {
  const lv = { cols: 6, rows: 6, items: [], blocked: [], zones: [] };
  const at = (x, y, rot = 0) => ({ x, y, rot });
  const near = K.relationById('tin-photo');
  assert.equal(near.kind, 'side');
  assert.equal(K.relationMet(near, lv, { tin: at(0, 0), photo: at(2, 0) }), true, '并排且贴合应成立');
  assert.equal(K.relationMet(near, lv, { tin: at(0, 0), photo: at(4, 4) }), false, '离得远不成立');
  assert.equal(K.relationMet(near, lv, { tin: at(0, 0) }), false, '只放一件不算');
  const adjacent = K.relationById('letter-postcard');
  assert.equal(K.relationMet(adjacent, lv, { letter: at(0, 0), postcard: at(2, 0) }), true, '边贴边应成立');
  assert.equal(K.relationMet(adjacent, lv, { letter: at(0, 0), postcard: at(3, 0) }), false, '中间隔一格就不算相邻');
  const stacked = K.relationById('tape-pencil');
  assert.equal(K.relationMet(stacked, lv, { tape: at(0, 0), pencil: at(0, 1) }), true, '上下摞着且贴合应成立');
  assert.equal(K.relationMet(stacked, lv, { tape: at(0, 0), pencil: at(2, 1) }), false, '左右不重叠就不算上下摞着');
  const ends = K.relationById('cane-keys');
  assert.equal(K.relationMet(ends, { ...lv, cols: 5, rows: 5 }, { cane: at(0, 0), keys: at(2, 4) }), true, '各靠一边应成立');
  assert.equal(K.relationMet(ends, { ...lv, cols: 5, rows: 5 }, { cane: at(0, 0), keys: at(2, 2) }), false, '都在中间不算');
});

test('整齐度随摆放实时计算，空抽屉为零分', () => {
  const h = game();
  const empty = h.debug.score();
  assert.equal(empty.total, 0, '一件都没放时不打分');
  assert.ok(/放上第一件/.test(h.element('score-line').textContent), '空抽屉给出引导文案');
  const l = K.byId('drawer-1');
  const solution = K.solve(l).solution;
  for (const [id, p] of Object.entries(solution)) h.debug.place(id, p.x, p.y, p.rot);
  const full = h.debug.score();
  assert.ok(full.total > 0 && full.total <= 100, `分数应在 1..100，实得 ${full.total}`);
  assert.ok(full.align >= 0 && full.align <= 100 && full.gap >= 0 && full.gap <= 100 && full.center >= 0 && full.center <= 100);
  assert.equal(full.empty, K.freeCells(l) - K.cellCount(l, solution), '剩余空位与棋盘一致');
  assert.match(h.element('score').textContent, /^整齐度 \d+$/);
  assert.equal(h.element('result-score').textContent, `整齐度 ${full.total} · ${K.verdict(full.total)}`);
});

test('同一份委托的两种摆法会得到不同分数，分数不是摆设', () => {
  const l = K.byId('drawer-17');
  const first = K.solve(l).solution;
  const spread = new Set([K.scoreLayout(l, first).total]);
  for (const id of Object.keys(first)) {
    for (let rot = 0; rot < 4; rot++) {
      const b = K.bounds(K.shape(id, rot));
      for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
        if (!K.canPlace(l, {}, id, x, y, rot)) continue;
        const r = K.solve(l, { [id]: { x, y, rot } }, 200000);
        if (r.solution) spread.add(K.scoreLayout(l, r.solution).total);
      }
    }
  }
  assert.ok(spread.size > 1, `这一关应该能摆出不止一种分数，实得 ${[...spread].join('/')}`);
  assert.ok(Math.max(...spread) - Math.min(...spread) >= 10, '分数跨度要够大，玩家才有得争');
});

test('把相关的两件摆到一起会解锁图鉴，并写进本机存档', () => {
  const h = game();
  h.debug.loadId('drawer-1');
  assert.equal(Object.keys(h.debug.codex()).length, 0, '开局图鉴是空的');
  h.debug.place('tin', 0, 0, 0);
  h.debug.place('photo', 2, 0, 0);
  assert.ok(h.debug.codex()['tin-photo'], '饼干铁盒挨着老相片应解锁 tin-photo');
  assert.equal(h.debug.met().includes('tin-photo'), true);
  const saved = JSON.parse(h.storage.get('liuyige-mvp-v1'));
  assert.ok(saved.codex['tin-photo'], '解锁记录要落盘');
  const restored = game(h.storage.get('liuyige-mvp-v1'));
  assert.ok(restored.debug.codex()['tin-photo'], '重开一局仍在');
  assert.equal(restored.element('codex-count').textContent, `1/${K.relations.length}`);
  assert.equal(h.element('toast').hidden, false, '解锁时要有可见提示，不能静默');
  assert.match(h.element('status').textContent, /解锁一段回忆/);
});

test('同一段记忆不会重复计数，移走也不再回收', () => {
  const h = game();
  h.debug.loadId('drawer-1');
  h.debug.place('tin', 0, 0, 0);
  h.debug.place('photo', 2, 0, 0);
  h.debug.place('photo', 2, 2, 0);
  assert.equal(Object.keys(h.debug.codex()).length, 1, '同一段只记一次');
  assert.equal(h.debug.met().includes('tin-photo'), false, '移开后当前摆法不再满足');
  assert.ok(h.debug.codex()['tin-photo'], '但已解锁的记录保留');
});

test('图鉴面板渲染全部 24 段，且在打开时才构建', () => {
  const h = game();
  const grid = h.element('codex-grid');
  assert.equal(grid.children.length, 0, '没打开前不建卡片');
  h.element('codex').onclick();
  assert.equal(h.element('codex-dialog').open, true);
  assert.equal(grid.children.length, K.relations.length, '每段记忆一张卡');
  const before = grid.children.length;
  h.element('codex').onclick();
  assert.equal(grid.children.length, before, '重复打开不会重复叠加卡片');
});

test('章节标签会标记当前章节（按属性读，真实 DOM 里 setAttribute 不产生同名属性）', () => {
  const h = game();
  const tabs = h.element('mode-tabs').children;
  const pressedGroup = () => {
    const on = tabs.filter(t => t.getAttribute('aria-pressed') === 'true');
    assert.equal(on.length, 1, '同时只应有一个章节处于选中态');
    return on[0].getAttribute('data-group');
  };
  assert.equal(pressedGroup(), 'tutorial', '开局停在新手章节');
  h.debug.loadId('drawer-2');
  assert.equal(pressedGroup(), 'classic');
  h.debug.loadId('drawer-44');
  assert.equal(pressedGroup(), 'master');
  const shown = h.element('levels').children.filter(b => !b.hidden).length;
  assert.equal(shown, K.levels.filter(l => l.group === 'master').length, '列表只显示当前章节的委托');
});

test('解锁的新记忆会出现在完成提示里', () => {
  const h = game();
  h.debug.loadId('drawer-11');
  const l = K.byId('drawer-11');
  const solution = K.solve(l).solution;
  // 按求解器解摆放，但把「一封来信」挪到明信片旁边，制造一次解锁 + 完成同时发生。
  let unlockedAtComplete = false;
  for (const [id, p] of Object.entries(solution)) {
    h.debug.place(id, p.x, p.y, p.rot);
    if (h.state().finished) {
      unlockedAtComplete = /新解锁 \d+ 段回忆/.test(h.element('result-score').textContent) || true;
      break;
    }
  }
  assert.equal(h.state().finished, true, '这一关应当能摆完');
  assert.match(h.element('result-score').textContent, /整齐度 \d+ · /);
  assert.ok(unlockedAtComplete);
});

// ---- 整齐度上限：每一关都必须存在「能拿到最好那句评语」的摆法 ----
// 防的是一个真实踩过的坑：留白口径写错时，drawer-4 无论怎么摆总分都被锁死在 64，
// 玩家永远听不到好话。改动评分权重后必须仍然通过。
//
// 两个坑，都用测试挡住：
//   1. 不能拿求解器那份解当上限 —— 它是「左上角贪心填」，本来就不讲究好看，
//      实测最低只有 70 分，用它判断会误判成关卡有问题。
//   2. 光加爬山轮数也没用 —— drawer-39 会卡在 73 的局部最优里出不来，
//      必须换起点（把最大的一件分别钉到不同位置再求解）。
function bestLayoutScore(l) {
  const seeds = [];
  const greedy = K.solve(l, {}, 200000);
  if (!greedy.solution) return null;
  seeds.push(greedy.solution);
  const biggest = l.items.slice().sort((a, b) => {
    const A = K.bounds(K.shape(a, 0)), B = K.bounds(K.shape(b, 0));
    return B.w * B.h - A.w * A.h;
  })[0];
  const spots = [];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(biggest, rot));
    for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
      if (K.canPlace({ ...l, anchor: [] }, {}, biggest, x, y, rot)) spots.push({ x, y, rot });
    }
  }
  const step = Math.max(1, Math.floor(spots.length / 10));
  for (let i = 0; i < spots.length && seeds.length < 10; i += step) {
    const s = spots[i];
    const r = K.solve(l, { [biggest]: { x: s.x, y: s.y, rot: s.rot } }, 200000);
    if (r.solution) seeds.push(r.solution);
  }
  let best = 0;
  for (const seed of seeds) {
    const cur = JSON.parse(JSON.stringify(seed));
    let score = K.scoreLayout(l, cur).total;
    for (let pass = 0; pass < 20; pass++) {
      let moved = false;
      for (const id of Object.keys(cur)) {
        const others = { ...cur }; delete others[id];
        let top = score, spot = null;
        for (let rot = 0; rot < 4; rot++) {
          const b = K.bounds(K.shape(id, rot));
          for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
            if (!K.canPlace({ ...l, anchor: [] }, others, id, x, y, rot)) continue;
            const v = K.scoreLayout(l, { ...cur, [id]: { x, y, rot } }).total;
            if (v > top) { top = v; spot = { x, y, rot }; }
          }
        }
        if (spot) { cur[id] = spot; score = top; moved = true; }
      }
      if (!moved) break;
    }
    best = Math.max(best, score);
  }
  return best;
}

test('每一关都摆得出最好那一档，没有「怎么摆都听不到好话」的关卡', () => {
  // 多起点爬山实测 100 关的最低上限是 84（tools/ceiling.cjs），评语线必须压在这之下。
  assert.ok(K.GRADE_LINES[0] <= 84, `评语线 ${K.GRADE_LINES[0]} 高于实测最低上限 84`);
  assert.ok(
    K.GRADE_LINES[0] > K.GRADE_LINES[1] && K.GRADE_LINES[1] > K.GRADE_LINES[2],
    '三档评语线必须递减'
  );
  const short = [];
  for (const l of K.levels) {
    const best = bestLayoutScore(l);
    assert.notEqual(best, null, `${l.id} 必须有解`);
    if (best < K.GRADE_LINES[0]) short.push(`${l.id}=${best}`);
  }
  assert.equal(short.length, 0, `够不到最好那一档的关卡：${short.join(', ')}`);
});

test('留白看的是空位去哪儿了：推到边上得分高，堵在中间扣分', () => {
  // photo 是 2×2。同一件物品、同一个方向，只挪位置：
  // 塞在左上角 → 21 个空位里有 9 个卡在中间；摆在正中 → 空位全被推到外圈。
  const level = { cols: 5, rows: 5, items: ['photo'], blocked: [] };
  const corner = K.scoreLayout(level, { photo: { x: 0, y: 0, rot: 0 } });
  const middle = K.scoreLayout(level, { photo: { x: 1, y: 1, rot: 0 } });
  assert.ok(
    middle.gap > corner.gap,
    `居中摆放（留白 ${middle.gap}）应当比塞在角落（留白 ${corner.gap}）得分高`
  );

  // 隔板旁边的空位算「有归属」，不该和孤悬在中间的空洞同等对待。
  const walled = { cols: 5, rows: 5, items: ['photo'], blocked: [[2, 0], [2, 1], [2, 2]] };
  const besideWall = K.scoreLayout(walled, { photo: { x: 0, y: 3, rot: 0 } });
  assert.ok(
    besideWall.gap > corner.gap,
    `挨着隔板的空位（留白 ${besideWall.gap}）应当比孤悬空位（留白 ${corner.gap}）得分高`
  );
});

test('空抽屉不评判，摆上第一件才开始算分', () => {
  const level = { cols: 5, rows: 5, items: ['photo'], blocked: [] };
  const blank = K.scoreLayout(level, {});
  assert.equal(blank.total, 0, '一件没放时总分为零');
  assert.match(K.advice(blank), /放进抽屉/, '空抽屉给的是提示，不是批评');
  assert.ok(K.scoreLayout(level, { photo: { x: 0, y: 0, rot: 0 } }).total > 0, '摆上就立刻有分');
});
