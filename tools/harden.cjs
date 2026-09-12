// 难度增强表生成器：为后期委托追加旧物、放大抽屉、加固定件与「恰好放满」要求。
// 每关都跑真实求解器校验：必须可解、必须通过 isComplete、求解节点数必须留足余量，
// 否则游戏里的「一点提示」会退化成"这次布局有些复杂"。
// 用法：node tools/harden.cjs > tools/harden-table.txt
const K = require('../core.js');

const POOL = Object.keys(K.items);
const GROW = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2], [2, 2], [3, 0], [0, 3], [3, 1], [1, 3]];
const MAX_COLS = 9, MAX_ROWS = 8;
// 求解节点预算是硬约束：core.test 用默认上限 100000 跑全量，游戏内「一点提示」用 70000。
// 取舍关的 solve() 会把多个候选组合的节点累加，所以预算必须留出足够余量。
const NODE_BUDGET = 60000;
const SOLVE_LIMIT = 400000;
const TRIES_EACH_GROW = 26;   // 每个棋盘尺寸最多试多少个组合
// 大师委托一律预置一件固定物。第一辑的大师委托正好是 seq 42–49，所以按玩法取
// 和旧的索引表完全等价，同时自动覆盖第二辑新增的大师委托。
const ANCHOR_MODE = 'master';
const DENSE_WISH = [8, 12, 32, 33, 50, 58, 72, 86, 92, 99];  // 优先尝试「恰好放满」的非取舍关
// 示范「不能转着放」的关卡。必须挑**不取舍**的关卡（没有 keepCount）：
// 取舍关里玩家可以不选那件旧物，规则上那句「不能转着放」就成了看不到的空话。
const LOCK_ROT_LEVELS = [20, 54, 58, 65, 72, 79, 82, 86, 89, 93, 96, 99];
const LOCK_ROT_POOL = ['cane', 'lamp', 'shoes', 'ruler'];

// 目标件数与填充率区间。前三关是教学，第 4 关被测试用例钉住，都不动。
// 注意这里的参数是 l.seq（定义顺序），不是 K.levels 的索引 —— 章节重排会改变索引。
function tier(i) {
  if (i <= 3) return null;
  if (i <= 5) return { count: 7, floor: 0.78, target: 0.85, cap: 0.90 };
  if (i <= 13) return { count: 7, floor: 0.80, target: 0.87, cap: 0.91 };
  if (i <= 17) return { count: 8 };                        // 取舍类：只看池子大小，不论填充率
  if (i <= 26) return { count: 8, floor: 0.80, target: 0.87, cap: 0.91 };
  if (i <= 41) return { count: 9, floor: 0.80, target: 0.87, cap: 0.91 };
  if (i <= 49) return { count: 9, floor: 0.82, target: 0.88, cap: 0.92 }; // 大师委托
  // 第二辑（seq 50–99，即第 51–100 关）：体量已经到顶，不再靠加件数制造难度。
  // 物品栏最多 10 件、盘面最多 9×8，再往上堆只会让「一点提示」的求解退化成超时。
  // 所以件数带只收窄一半：前半段 8 件，后半段 9 件，难度靠形状与条件叠加来给。
  if (i <= 74) return { count: 8, floor: 0.80, target: 0.86, cap: 0.91 };
  return { count: 9, floor: 0.80, target: 0.87, cap: 0.91 };
}

const cellsOf = id => K.items[id].cells.length;
const sumOf = ids => ids.reduce((s, id) => s + cellsOf(id), 0);
const isAwkward = id => { const b = K.bounds(K.items[id].cells); return cellsOf(id) !== b.w * b.h; };
const awkwardness = id => cellsOf(id) + (isAwkward(id) ? 3 : 0);

function combinations(arr, k) {
  const out = [];
  (function walk(start, acc) {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); walk(i + 1, acc); acc.pop(); }
  })(0, []);
  return out;
}

// 取舍关的"占格"取决于玩家挑了哪几件，用最占格的一批估上界。
function footprint(level, add) {
  const sizes = [...level.items, ...add].map(cellsOf).sort((a, b) => b - a);
  const kept = level.keepCount ? sizes.slice(0, level.keepCount) : sizes;
  return kept.reduce((a, b) => a + b, 0);
}

function makeCand(level, cols, rows, add) {
  const cand = { ...level, cols, rows, items: [...level.items, ...add] };
  cand.rule = K.levelRule(cand);
  return cand;
}

function trial(cand, deep) {
  const r = K.solve(cand, {}, SOLVE_LIMIT);
  if (r.status !== 'solved' || r.nodes > NODE_BUDGET) return null;
  if (Object.keys(r.solution).length !== K.goalCount(cand)) return null;
  if (!K.validState(cand, r.solution) || !K.isComplete(cand, r.solution)) return null;
  if (!deep) return { solution: r.solution, nodes: r.nodes };
  // 提示要能陪玩家走完整条链路：逐件固定后仍须可解。
  let partial = {};
  for (const [id, p] of Object.entries(r.solution)) {
    partial[id] = p;
    if (K.solve(cand, partial, SOLVE_LIMIT).status !== 'solved') return null;
  }
  return { solution: r.solution, nodes: r.nodes };
}

// 恰好放满：追加件的格子数必须刚好等于抽屉剩余空格，一格不多一格不少。
function denseAdds(level, cols, rows, need) {
  const free = cols * rows - (level.blocked || []).length;
  const want = free - sumOf(level.items);
  if (want <= 0) return null;
  const rest = POOL.filter(id => !level.items.includes(id));
  return combinations(rest, need).find(add => sumOf(add) === want) || null;
}

const table = {}, report = [], failed = [];
const recent = [];   // 最近用过的追加件，用来让相邻关卡的选件不至于雷同

// 按「定义顺序」（l.seq）遍历，也不读 K.levels 的展示顺序 —— 章节重排会把新手章节提到最前面。
// 关键：必须读 K.RAW（未增强的原始关卡）。若读 K.levels，装载时 applyHarden() 已经把件数加上去了，
// tier(seq).count - items.length 恒为负，整片关卡会被跳过。
const ordered = K.RAW.slice().sort((a, b) => a.seq - b.seq);
for (const level of ordered) {
  const seq = level.seq, t = tier(seq);
  if (!t) continue;
  const need = t.count - level.items.length;
  if (need <= 0) continue;
  const blocked = (level.blocked || []).length;
  const rest = POOL.filter(id => !level.items.includes(id));
  let chosen = null;

  const tries = level.keepCount ? 120 : TRIES_EACH_GROW;
  const planFor = (dc, dr, dense, want) => {
    const cols = level.cols + dc, rows = level.rows + dr;
    if (cols > MAX_COLS || rows > MAX_ROWS) return null;
    const free = cols * rows - blocked;
    let adds;
    if (dense) {
      const one = denseAdds(level, cols, rows, want);
      adds = one ? [one] : [];
    } else if (level.keepCount) {
      // 取舍关不按填充率筛：玩家只放 keepCount 件，池子里还留着没被选中的，天然"超面积"。
      const score = add => add.reduce((s, id) => s + awkwardness(id), 0) - add.filter(x => recent.includes(x)).length * 9;
      adds = combinations(rest, want).sort((a, b) => score(b) - score(a)).slice(0, tries);
    } else {
      adds = combinations(rest, want)
        .map(add => ({ add, fill: footprint(level, add) / free }))
        .filter(x => x.fill >= t.floor && x.fill <= t.cap)
        .sort((a, b) => Math.abs(a.fill - t.target) - Math.abs(b.fill - t.target)
          || b.add.reduce((s, id) => s + awkwardness(id), 0) - a.add.reduce((s, id) => s + awkwardness(id), 0))
        .slice(0, tries).map(x => x.add);
    }
    return { cols, rows, free, adds };
  };

  const attempt = (dc, dr, dense, want) => {
    const plan = planFor(dc, dr, dense, want);
    if (!plan) return null;
    for (const add of plan.adds) {
      const cand = makeCand(level, plan.cols, plan.rows, add);
      const shallow = trial(cand, false);
      if (!shallow) continue;
      const deep = trial(cand, true);
      if (!deep) continue;
      return { cols: plan.cols, rows: plan.rows, add, free: plan.free, dense, fill: footprint(level, add) / plan.free, ...deep };
    }
    return null;
  };

  // 取舍关不该为了塞件而放大抽屉——那会让关卡变简单，所以只从原尺寸试起。
  const growths = level.keepCount ? GROW.slice(0, 4) : GROW;
  const wantsDense = DENSE_WISH.includes(seq) && !level.keepCount;
  // 先按目标件数试；试不出来就退一步少加一件，保证每关至少比原来多一件旧物。
  for (const want of [need, need - 1, need - 2].filter(n => n >= 1)) {
    if (chosen) break;
    if (wantsDense) for (const g of growths) { chosen = attempt(g[0], g[1], true, want); if (chosen) break; }
    for (const g of growths) { if (chosen) break; chosen = attempt(g[0], g[1], false, want); }
  }
  if (!chosen) {
    if (process.env.HARDEN_DEBUG) {
      for (const want of [need, need - 1, need - 2].filter(n => n >= 1)) {
        const plan = planFor(0, 0, false, want);
        if (!plan) { console.error('DEBUG', level.id, 'want', want, 'plan=null'); continue; }
        let sh = 0, dp = 0;
        const detail = [];
        for (const add of plan.adds.slice(0, 6)) {
          const cand = makeCand(level, plan.cols, plan.rows, add);
          const a = trial(cand, false); if (a) sh++;
          const b = a ? trial(cand, true) : null; if (b) dp++;
          const r = K.solve(cand, {}, SOLVE_LIMIT);
          detail.push(add.join('+') + ':' + r.status + '/' + r.nodes + '/len' + Object.keys(r.solution || {}).length + '/' + K.goalCount(cand) + ' shallow=' + !!a + ' deep=' + !!b);
        }
        console.error('DEBUG', level.id, 'want', want, 'adds', plan.adds.length, 'free', plan.free, 'base', sumOf(level.items), 'shallow', sh, 'deep', dp);
        console.error('   ', detail.join('\n    '));
      }
    }
    failed.push(level.id); continue;
  }

  const entry = {};
  if (chosen.cols !== level.cols || chosen.rows !== level.rows) { entry.cols = chosen.cols; entry.rows = chosen.rows; }
  if (chosen.add.length) entry.add = chosen.add;
  if (chosen.dense) entry.dense = true;

  // 大师委托：从一份合法解里挑最占格的那件钉住，保证固定后依然可解。
  if (level.mode === ANCHOR_MODE) {
    const ranked = Object.entries(chosen.solution).sort((a, b) => cellsOf(b[0]) - cellsOf(a[0]));
    for (const [id, p] of ranked) {
      const cand = { ...makeCand(level, chosen.cols, chosen.rows, chosen.add), anchors: [{ id, x: p.x, y: p.y, rot: p.rot }] };
      const r = K.solve(cand, {}, SOLVE_LIMIT);
      if (r.status === 'solved' && r.nodes <= NODE_BUDGET && K.isComplete(cand, r.solution)) { entry.anchors = cand.anchors; break; }
    }
  }
  if (LOCK_ROT_LEVELS.includes(seq)) {  // 一件形状别扭的固定物，用来示范"不能转着放"。
    const id = chosen.add.find(a => LOCK_ROT_POOL.includes(a));
    if (id) entry.fixedRot = [id];
  }

  table[level.id] = entry;
  recent.push(...chosen.add); while (recent.length > 6) recent.shift();
  report.push({
    i: seq, id: level.id, mode: level.mode,
    items: `${level.items.length}→${level.items.length + chosen.add.length}`,
    grid: `${level.cols}x${level.rows}→${chosen.cols}x${chosen.rows}`,
    fill: chosen.fill.toFixed(2), nodes: chosen.nodes,
    flags: [chosen.dense ? '恰好放满' : '', entry.anchors ? '固定' + entry.anchors.length : '', entry.fixedRot ? '锁转' : ''].filter(Boolean).join('/') || '-',
    add: chosen.add.join(','),
  });
}

console.log(JSON.stringify(table));
console.error('关卡 委托        玩法  件数   网格        填充  节点  ' + '标记'.padEnd(12) + ' 追加');
for (const r of report) console.error([String(r.i).padStart(3), r.id.padEnd(11), r.mode.padEnd(6), r.items.padEnd(6), r.grid.padEnd(11), r.fill.padEnd(5), String(r.nodes).padEnd(5), r.flags.padEnd(12), r.add].join(' '));
console.error('\n已增强 ' + report.length + ' 关；未成功 ' + failed.length + ' 关：' + failed.join(','));
if (failed.length) process.exitCode = 1;
