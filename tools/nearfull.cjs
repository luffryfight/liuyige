// 近满盘难度生成器：把 drawer-15 起的每一关都改造成「通关时空位 ≤ 1」。
//
// 与 tools/harden.cjs 的区别：
//   harden   只往盘面上堆旧物，填充率压在 0.80~0.91，盘面天然留白；
//   nearfull 反过来——先定「这一关要放几件」，再挑棋盘尺寸与追加旧物，
//             让总格数与可用格数之差恰好是 0 或 1。放完全部物品就没地方剩了。
//
// 两条硬约束，都是被真实数据逼出来的：
//   1. 棋盘只能放大、不能缩到装不下原有的隔板与分区。HARDEN 表只能覆盖 cols/rows/add/
//      anchors/fixedRot，裁掉的隔板与分区在运行时并不会跟着消失——那样关卡数据和画面对不上。
//   2. 取舍关的 keepCount 允许调整。格子数是「挑出来的那几件」决定的，而原版很多关的
//      keepCount 相对盘面太小（比如 7×6 只放 4 件），不调就永远对不上格数。
//
// 两类关卡的构造顺序不一样：
//   · 不取舍关：格数 = 全部物品之和，是个定值。先挑棋盘 → 需要补几格就定了 → 找对得上的追加件。
//   · 取舍关：玩家只放 keepCount 件。先挑池子——让「格数相同」的挑法尽量多——再按这个格数
//     反推棋盘尺寸。这样大多数挑法都能填满，而不是只有唯一一种正解。
//
// 每一关都要过真实求解器：可解、可完成、节点留余量、逐件固定后仍可解。
// 搜索用浅校验（一次求解），定稿才做深度校验（逐件固定），否则光校验就要跑几十分钟。
//
// 用法：
//   node tools/nearfull.cjs                       # 全量生成，报告打到 stderr
//   node tools/nearfull.cjs --only=drawer-45      # 只跑一关
//   node tools/nearfull.cjs --json=tools/nearfull-table.json
const fs = require('node:fs');
const path = require('node:path');
const K = require('../core.js');

const POOL = Object.keys(K.items);
const cellsOf = id => K.items[id].cells.length;
const sumOf = ids => ids.reduce((s, id) => s + cellsOf(id), 0);
const isAwkward = id => { const b = K.bounds(K.items[id].cells); return cellsOf(id) !== b.w * b.h; };
const awkwardness = id => cellsOf(id) + (isAwkward(id) ? 3 : 0);

const TUT = new Set(K.TUTORIAL);
const MIN_SEQ = 14;                                  // drawer-15 起
const MIN_COLS = 4, MAX_COLS = 12, MIN_ROWS = 3, MAX_ROWS = 9;
const NODE_BUDGET = 60000;                           // 与 harden 一致：给「一点提示」留余量
const SEARCH_NODES = 22000;                          // 搜索期更严：留足余量给「逐件固定」的前缀求解
const MIN_SEL = 6;                                   // 取舍关至少要有这么多种能通关的挑法
const SAMPLE_SEL = 8;                                // 每种候选最多实测多少种挑法
const DEEP_TRIES = 18;                               // 定稿前最多深度校验几个候选
const MAX_CANDIDATES = 120;                          // 候选池上限：每个都要真求解，攒太多只是白烧时间
const MAX_KEEP = 12;                                 // 取舍关最多让玩家挑这么多件
const TRAY_MIN = 10, TRAY_MAX = 18;                  // 物品栏件数区间（旧物一共 18 件，18 是硬顶）
const LOCK_ROT_SEQ = [20, 54, 58, 65, 72, 79, 82, 86, 89, 93, 96];
const LOCK_ROT_POOL = ['cane', 'lamp', 'shoes', 'ruler'];

// ---- 画布几何：与 tests/validate-geometry.cjs 同一套口径 ----
const W = 640;
const cellOf = (cols, rows) => Math.max(28, Math.min(52, Math.floor(275 / rows), Math.floor(530 / cols)));
function geomOK(cols, rows) {
  if (cols < MIN_COLS || cols > MAX_COLS || rows < MIN_ROWS || rows > MAX_ROWS) return false;
  const cell = cellOf(cols, rows);
  const w = cols * cell, h = rows * cell, x = (W - w) / 2;
  if (cell < 28) return false;
  if (x < 10 || x + w > W - 10) return false;
  if (h + 96 >= 380) return false;                   // 抽屉外框底不能压到物品栏分隔线
  return true;
}
const AREA = [];
for (let cols = MIN_COLS; cols <= MAX_COLS; cols++)
  for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++)
    if (geomOK(cols, rows)) AREA.push({ cols, rows, area: cols * rows });

// 棋盘必须装得下原有的隔板与分区——否则运行时那两块数据会越界。
function fits(base, cols, rows) {
  for (const [x, y] of base.blocked || []) if (x >= cols || y >= rows) return false;
  for (const z of base.zones || []) for (const [x, y] of z.cells) if (x >= cols || y >= rows) return false;
  return true;
}

// ---- 目标件数：seq 14 → 10 件，seq 99 → 18 件（旧物一共 18 件，这是硬顶）----
function targetCount(seq) {
  const t = (seq - MIN_SEQ) / (99 - MIN_SEQ);
  return Math.max(10, Math.min(18, Math.round(10 + t * 8)));
}

// 从 items 里挑 count 件、格数落在 targets 里的组合。按格子从大到小搜，先拿到的最占地方。
function subsetsWithSum(items, count, targets, cap) {
  const out = [], tset = new Set(targets), maxT = Math.max(...targets);
  const arr = items.slice().sort((a, b) => cellsOf(b) - cellsOf(a) || awkwardness(b) - awkwardness(a));
  (function dfs(start, chosen, sum) {
    if (out.length >= cap) return;
    if (chosen.length === count) { if (tset.has(sum)) out.push([...chosen]); return; }
    if (arr.length - start < count - chosen.length) return;
    for (let i = start; i < arr.length; i++) {
      const c = cellsOf(arr[i]);
      if (sum + c > maxT) continue;
      chosen.push(arr[i]); dfs(i + 1, chosen, sum + c); chosen.pop();
      if (out.length >= cap) return;
    }
  })(0, [], 0);
  return out;
}
function mulberry32(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function spread(list, n) { if (list.length <= n) return list.slice(); const out = []; for (let i = 0; i < n; i++) out.push(list[Math.round(i * (list.length - 1) / Math.max(1, n - 1))]); return [...new Set(out)]; }

let solveCalls = 0;
function build(base, cols, rows, add, extra = {}) {
  const cand = {
    id: base.id, seq: base.seq, mode: base.mode, title: base.title, chapter: base.chapter,
    cols, rows,
    blocked: (base.blocked || []).map(p => [...p]),
    zones: (base.zones || []).map(z => ({ ...z, items: [...z.items], cells: z.cells.map(c => [...c]) })),
    items: [...base.items, ...add],
  };
  const keep = extra.keepCount !== undefined ? extra.keepCount : base.keepCount;
  if (keep) { cand.keepCount = keep; cand.required = [...(base.required || [])]; }
  if (extra.maxEmpty !== undefined) cand.maxEmpty = extra.maxEmpty;
  if (extra.dense) cand.dense = true;
  if (extra.anchors) cand.anchors = extra.anchors;
  if (extra.fixedRot) cand.fixedRot = extra.fixedRot;
  cand.rule = K.levelRule(cand);
  return cand;
}
// 搜索期只需要知道「这个候选够不够好」，不需要知道它到底要多少节点。
// 所以把求解器上限直接压到预算上：超了立刻返回 limit，别让每个坏候选都烧到 40 万节点——
// 那一层白烧是最早版本单关跑掉几十秒的主因。
function shallow(cand) {
  solveCalls++;
  const r = K.solve(cand, {}, SEARCH_NODES + 1);
  if (r.status !== 'solved' || !r.solution) return null;
  if (r.nodes > SEARCH_NODES) return null;
  if (Object.keys(r.solution).length !== K.goalCount(cand)) return null;
  if (!K.validState(cand, r.solution) || !K.isComplete(cand, r.solution)) return null;
  return r;
}
// 定稿校验：节点预算按游戏里「一点提示」的口径（70000）再压一点，逐件固定后仍须可解。
// NEARFULL_DEBUG=1 时把卡在哪一步打到 stderr —— 这一层「静默返回 null」调试起来太费劲。
const dbg = (cand, msg) => { if (process.env.NEARFULL_DEBUG) console.error(`   deep 失败 ${cand.id} ${cand.cols}x${cand.rows} ${cand.items.length}件 ${msg}`); };
function deep(cand) {
  solveCalls++;
  const r = K.solve(cand, {}, NODE_BUDGET + 1);
  if (r.status !== 'solved' || !r.solution) return (dbg(cand, '整体 ' + r.status), null);
  if (r.nodes > NODE_BUDGET) return (dbg(cand, `整体节点 ${r.nodes}`), null);
  if (Object.keys(r.solution).length !== K.goalCount(cand)) return (dbg(cand, '件数不符'), null);
  if (!K.validState(cand, r.solution) || !K.isComplete(cand, r.solution)) return (dbg(cand, '完成判定不过'), null);
  let partial = {}, i = 0;
  for (const [id, p] of Object.entries(r.solution)) {
    partial[id] = p; i++;
    const s = K.solve(cand, partial, NODE_BUDGET + 1);
    if (s.status !== 'solved') return (dbg(cand, `固定 ${i} 件后 ${s.status}`), null);
    if (s.nodes > NODE_BUDGET) return (dbg(cand, `固定 ${i} 件后节点 ${s.nodes}`), null);
  }
  return r;
}

// ============ 一、不取舍关 ============
function planFixed(base, want) {
  const rest = POOL.filter(id => !base.items.includes(id));
  const baseSum = sumOf(base.items);
  const blocked = base.blocked || [];
  const cands = [];
  const budget = solveCalls + 4200;

  for (const n of [want, want + 1, want - 1, want + 2, want - 2, want + 3, want - 3]) {
    if (n > POOL.length) continue;                   // 旧物一共 18 件，物品栏也就到 18
    const cnt = n - base.items.length;
    if (cnt < 1 || cnt > rest.length) continue;
    for (const { cols, rows } of AREA) {
      if (solveCalls >= budget || cands.length >= MAX_CANDIDATES) break;
      if (!fits(base, cols, rows)) continue;
      const need = cols * rows - blocked.length - baseSum;
      if (need < 1) continue;
      for (const diff of [0, 1]) {                     // 0 = 恰好放满，1 = 空一格
        if (need - diff < 1) continue;
        const adds = subsetsWithSum(rest, cnt, [need - diff], 16);
        let taken = 0;
        for (const add of adds) {
          if (taken >= 3) break;
          const cand = build(base, cols, rows, add, { maxEmpty: diff, dense: true });
          const r = shallow(cand);
          if (!r) continue;
          taken++;
          cands.push({
            cols, rows, add, maxEmpty: diff, solution: r.solution, nodes: r.nodes,
            score: add.reduce((s, id) => s + awkwardness(id), 0)
              - diff * 14                                       // 恰好放满优于空一格
              - (Math.abs(cols - base.cols) + Math.abs(rows - base.rows)) * 3
              - Math.abs(n - want) * 7
              - r.nodes / 1500,
          });
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands;
}

// ============ 二、取舍关 ============
// 取舍关的构造方向跟「不取舍关」反过来：先定棋盘，再解出件数。
// 这不是审美选择，是被真实数据逼出来的——像 drawer-47 那种「隔板横跨整行 + 两个分区」的盘面，
// 分区把最小可用棋盘顶到 7×6（可用 35 格），而原版 keepCount 只有 4；
// 四件旧物最多也就二十四五格，格子数怎么凑都差得远。
// 所以这里把「挑几件」当成未知量：对每块装得下的棋盘算出「需要占多少格」，
// 再从池子里找「挑任意几件恰好凑够这个格数」的组合，取组合最多的那几个件数。
// 这样 keepCount 会被按需上调，而不是死守关卡原始设定。
//
// 两段式：先 DP 数「挑 j 件凑出 sum 格」有多少种挑法，再只对数量够的那几组做枚举。
// 一开始只写了枚举，结果碰上「这块棋盘根本凑不出目标格数」时会去穷举整个子集空间，
// 单关能跑掉几十秒——计数是 O(件数 × 格数 × 件数) 的，先数再枚举就完全躲开了这一层。
function choiceWays(items, maxSum) {
  const ways = Array.from({ length: items.length + 1 }, () => new Int32Array(maxSum + 1));
  ways[0][0] = 1;
  for (const id of items) {
    const c = cellsOf(id);
    for (let j = items.length - 1; j >= 0; j--)
      for (let s = maxSum - c; s >= 0; s--)
        if (ways[j][s]) ways[j + 1][s + c] += ways[j][s];
  }
  return ways;
}
function subsetsOfSizeSum(items, j, target, cap) {
  const out = [];
  const arr = items.slice().sort((a, b) => cellsOf(b) - cellsOf(a));
  (function dfs(start, chosen, sum) {
    if (out.length >= cap) return;
    if (chosen.length === j) { if (sum === target) out.push([...chosen]); return; }
    if (arr.length - start < j - chosen.length) return;
    for (let i = start; i < arr.length; i++) {
      const c = cellsOf(arr[i]);
      if (sum + c > target) continue;
      chosen.push(arr[i]); dfs(i + 1, chosen, sum + c); chosen.pop();
      if (out.length >= cap) return;
    }
  })(0, [], 0);
  return out;
}
function planChoice(base) {
  const R = [...(base.required || [])];
  if (!R.length) return [];
  const r = R.length, K0 = base.keepCount || r;
  const rest = POOL.filter(id => !base.items.includes(id));
  const blocked = base.blocked || [];
  const sumR = sumOf(R);
  const rnd = mulberry32((base.seq * 2654435761) >>> 0);
  const cands = [], seen = new Set();
  const budget = solveCalls + 5200;

  for (let trial = 0; trial < 260 && cands.length < MAX_CANDIDATES && solveCalls < budget; trial++) {
    const keepFromBase = base.items.filter(id => R.includes(id) || (trial % 5 !== 0 && rnd() < 0.7));
    const pool = [...new Set([...R, ...keepFromBase])];
    const extraPool = shuffle(rest.filter(id => !pool.includes(id)), rnd);
    const wantPool = Math.max(pool.length, Math.min(POOL.length, TRAY_MIN + (trial % (TRAY_MAX - TRAY_MIN + 1))));
    for (const id of extraPool) { if (pool.length >= wantPool) break; pool.push(id); }
    const optional = pool.filter(id => !R.includes(id));
    if (optional.length < 3) continue;
    const key = optional.slice().sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    // 棋盘只能放大、不能缩小：玩家要的是「更多格子要填」，把抽屉换成小一号的不是加难度。
    // 这和 fits() 是两回事——fits 只保证装得下原有隔板与分区，这里管的是体感。
    // 万一原盘面大到没有合规的放大空间，才退回全部候选。
    const allBoards = AREA.filter(b => fits(base, b.cols, b.rows));
    const bigger = allBoards.filter(b => b.area >= base.cols * base.rows);
    // 排序键要把长宽比算进去，不能只看面积：每块棋盘凑够 18 个候选就会跳出去，
    // 面积相同但被拉成长条的棋盘（6x5 与 5x6）若排在前面，好的那块根本没机会被看到。
    const rank = b => Math.abs(b.area - (sumR + K0 * 4))
      + Math.abs(b.cols * base.rows - b.rows * base.cols) * 0.5;
    const boards = (bigger.length ? bigger : allBoards).sort((a, b) => rank(a) - rank(b));
    if (!boards.length) continue;
    // 目标格数最多就是「最大可用格数 − 必留占的格」，DP 表按这个上界开，够用且不大。
    const maxTarget = Math.max(...boards.map(b => b.cols * b.rows - blocked.length)) - sumR;
    const ways = choiceWays(optional, Math.max(1, maxTarget));

    for (const { cols, rows } of boards) {
      if (solveCalls >= budget || cands.length >= MAX_CANDIDATES) break;
      const need = cols * rows - blocked.length;          // 真正的可用格数
      for (const diff of [0, 1]) {
        const target = need - diff - sumR;                // 还需要从 optional 里凑出多少格
        if (target < 2 || target > maxTarget) continue;
        const ranks = [];
        for (let j = 1; j <= optional.length; j++) if (ways[j][target] >= 3) ranks.push(j);
        if (!ranks.length) continue;
        // 件数优先贴近原设——信件是按原设写的，差太远读起来会对不上。
        ranks.sort((a, b) => Math.abs(a - (K0 - r)) - Math.abs(b - (K0 - r)));
        for (const j of ranks.slice(0, 2)) {
          if (solveCalls >= budget || cands.length >= MAX_CANDIDATES) break;
          const K1 = r + j;
          if (K1 > MAX_KEEP) continue;
          const lists = subsetsOfSizeSum(optional, j, target, 320);
          if (lists.length < 3) continue;
          const sample = spread(lists, SAMPLE_SEL);
          let ok = 0;
          for (const sel of sample) {
            const cand = build(base, cols, rows, [], { keepCount: K1, maxEmpty: diff, dense: true });
            cand.items = [...R, ...sel];
            cand.required = [...R];
            cand.rule = K.levelRule(cand);
            if (shallow(cand)) ok++;
          }
          if (ok < 3) continue;
          const est = Math.round(ways[j][target] * (ok / sample.length));
          if (est < MIN_SEL) continue;
          // 运行时的池子 = 原有关卡物品 ∪ 追加件，所以件数要按这个并集算，不能只看池子大小。
          const landed = new Set([...base.items, ...pool]);
          if (landed.size > POOL.length) continue;
          cands.push({
            cols, rows, pool, R, K: K1, maxEmpty: diff, lists, est, sample: sample.slice(0, 3),
            score: Math.min(est, 40) + new Set(pool).size * 0.8
              - diff * 12                                        // 恰好放满优于空一格
              - Math.abs(K1 - K0) * 2                            // 件数尽量别偏离原设
              - (Math.abs(cols - base.cols) + Math.abs(rows - base.rows)) * 4
              - Math.abs(cols * base.rows - rows * base.cols) * 0.6,  // 别把 6x5 拉成 9x3 这种长条
          });
        }
      }
      if (cands.length >= 18) break;                 // 这一块棋盘够了，换下一个池子
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands;
}

// 定稿：把计划变成 HARDEN 里的一个条目，再做深度校验。
function finalize(base, plan) {
  const add = plan.pool ? plan.pool.filter(id => !base.items.includes(id)) : plan.add;
  const baseEntry = {};
  if (plan.cols !== base.cols || plan.rows !== base.rows) { baseEntry.cols = plan.cols; baseEntry.rows = plan.rows; }
  if (add.length) baseEntry.add = add;
  if (plan.K !== undefined && plan.K !== base.keepCount) baseEntry.keepCount = plan.K;
  baseEntry.maxEmpty = plan.maxEmpty;
  if (plan.maxEmpty === 0) baseEntry.dense = true;
  if (!base.keepCount && LOCK_ROT_SEQ.includes(base.seq)) {
    const got = add.find(a => LOCK_ROT_POOL.includes(a));
    if (got) baseEntry.fixedRot = [got];
  }

  // 大师委托钉一件必留物：位置取「多数解都用的那一格」，钉完仍要有一批挑法能通关。
  if (base.mode === 'master' && (base.required || []).length) {
    const patch = cand => {
      cand.items = [...plan.R, ...(plan.lists ? plan.lists[0] : [])];
      cand.required = [...plan.R];
      return cand;
    };
    for (const id of [...base.required].sort((a, b) => cellsOf(b) - cellsOf(a))) {
      const hits = new Map();
      for (const sel of spread(plan.lists, 8)) {
        const c = build(base, plan.cols, plan.rows, add, { keepCount: plan.K, maxEmpty: plan.maxEmpty, dense: true });
        c.items = [...plan.R, ...sel]; c.required = [...plan.R]; c.rule = K.levelRule(c);
        // 这里的上限也压到定稿预算：探测不到位置就只是不加锚点，不影响这一关能不能过。
        const rr = K.solve(c, {}, NODE_BUDGET + 1);
        if (!rr.solution || !rr.solution[id]) continue;
        const p = rr.solution[id], k = `${p.x},${p.y},${p.rot}`;
        hits.set(k, (hits.get(k) || 0) + 1);
      }
      const top = [...hits.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] < 2) continue;
      const [x, y, rot] = top[0].split(',').map(Number);
      const anchors = [{ id, x, y, rot }];
      let alive = 0;
      for (const sel of spread(plan.lists, SAMPLE_SEL)) {
        const c = build(base, plan.cols, plan.rows, add, { keepCount: plan.K, maxEmpty: plan.maxEmpty, dense: true, anchors });
        c.items = [...plan.R, ...sel]; c.required = [...plan.R]; c.rule = K.levelRule(c);
        if (shallow(c)) alive++;
      }
      if (alive >= 3) { baseEntry.anchors = anchors; break; }
    }
    void patch;
  }

  const variants = [];
  variants.push(baseEntry);
  // 挂了「锁转」或「固定件」会砍掉一部分摆放方向，可能把原本好解的盘面逼成超时。
  // 所以降级顺序写死：先带全部特征试，不行就摘掉锁转，再不行才摘固定件。
  if (baseEntry.fixedRot) { const v = { ...baseEntry }; delete v.fixedRot; variants.push(v); }
  if (baseEntry.anchors) {
    const v = { ...baseEntry }; delete v.anchors; variants.push(v);
    if (baseEntry.fixedRot) { const w = { ...v }; delete w.fixedRot; variants.push(w); }
  }
  for (const entry of variants) {
    if (base.keepCount) {
      // 取舍关：逐种挑法都验一遍深度，至少要有 3 种能走完整条提示链路。
      let alive = 0;
      for (const sel of spread(plan.lists, SAMPLE_SEL)) {
        const c = build(base, plan.cols, plan.rows, add, entry);
        c.items = [...plan.R, ...sel]; c.required = [...plan.R]; c.rule = K.levelRule(c);
        if (deep(c)) alive++;
        if (alive >= 3 && solveCalls > 0) break;
      }
      if (alive < 3) continue;
      const c = build(base, plan.cols, plan.rows, add, entry);
      c.items = [...plan.R, ...plan.lists[0]]; c.required = [...plan.R]; c.rule = K.levelRule(c);
      const r = deep(c);
      if (!r) continue;
      if (!entry.anchors) delete entry.anchors;
      return { entry, cand: c, solution: r.solution, nodes: r.nodes, sel: plan.est };
    }
    const cand = build(base, plan.cols, plan.rows, add, entry);
    const r = deep(cand);
    if (!r) continue;
    if (!entry.anchors) delete entry.anchors;
    return { entry, cand, solution: r.solution, nodes: r.nodes };
  }
  return null;
}

// ============ 主流程 ============
const argv = process.argv.slice(2);
const only = (argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const jsonOut = (argv.find(a => a.startsWith('--json=')) || '').split('=')[1];

const scoped = K.RAW.filter(l => l.seq >= MIN_SEQ && !TUT.has(l.id)).sort((a, b) => a.seq - b.seq);
const table = {}, report = [], failed = [];

for (const base of scoped) {
  if (only && base.id !== only) continue;
  const t0 = Date.now();
  const plans = base.keepCount ? planChoice(base) : planFixed(base, targetCount(base.seq));
  let done = null;
  for (const plan of plans.slice(0, DEEP_TRIES)) {
    if (process.env.NEARFULL_DEBUG) console.error(`   试 ${plan.cols}x${plan.rows} 搜索期节点=${plan.nodes || '-'} 追加=${(plan.add || []).join(',')}`);
    done = finalize(base, plan); if (done) break;
  }
  const ms = Date.now() - t0;
  if (!done) { failed.push(base.id); console.error(`!! ${base.id} 未找到可行方案（候选 ${plans.length} 个，${ms}ms）`); continue; }
  // 全量跑要几分钟，逐关打一行进度，卡住时能立刻看出是哪一关。
  console.error(`.. seq ${String(base.seq).padStart(3)} ${base.id.padEnd(12)} ${String(ms).padStart(6)}ms 候选 ${String(plans.length).padStart(3)}`);

  const { entry, cand, solution, nodes } = done;
  const cols = entry.cols || base.cols, rows = entry.rows || base.rows;
  const free = K.freeCells(cand);
  const cells = K.cellCount(cand, solution);
  const tray = new Set([...base.items, ...(entry.add || [])]).size;
  table[base.id] = entry;
  report.push({
    seq: base.seq, id: base.id, mode: base.mode, n: cand.items.length,
    grid: `${cols}x${rows}`, free, cells, empty: free - cells, nodes,
    tray, keep: entry.keepCount || base.keepCount || '-',
    sel: done.sel || '-', anchor: entry.anchors ? 1 : 0, rot: entry.fixedRot ? 1 : 0,
    add: entry.add ? entry.add.join(',') : '-',
  });
}

console.log(JSON.stringify(table));
if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(table, null, 2)); }
console.error('seq 关卡         玩法   栏/挑 网格   可用 占格 空位  节点 挑法 锚/锁 追加');
for (const r of report) {
  console.error([String(r.seq).padStart(3), r.id.padEnd(12), r.mode.padEnd(6),
    `${r.tray}/${r.keep}`.padStart(5), r.grid.padEnd(6), String(r.free).padStart(3),
    String(r.cells).padStart(3), String(r.empty).padStart(3),
    String(r.nodes).padStart(5), String(r.sel).padStart(4), `${r.anchor}/${r.rot}`.padEnd(4), r.add].join(' '));
}
const empties = report.map(r => r.empty);
console.error(`\n已生成 ${report.length} 关；失败 ${failed.length} 关${failed.length ? '：' + failed.join(', ') : ''}`);
if (report.length) {
  console.error(`空位：0 格 ${empties.filter(e => e === 0).length} 关 / 1 格 ${empties.filter(e => e === 1).length} 关 / 超过 1 格 ${empties.filter(e => e > 1).length} 关`);
  console.error(`物品栏 ${Math.min(...report.map(r => r.tray))} ~ ${Math.max(...report.map(r => r.tray))} 件；求解调用 ${solveCalls} 次`);
}
if (failed.length) process.exitCode = 1;
