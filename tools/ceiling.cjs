// 逼近每关「整齐度」的实际上限。
// 采样求解器给出的解法只能证明「存在高分解」，不能证明「拿不到更高」。
// 这里做多起点爬山：从若干初始解出发，反复把某一件物品挪到能让总分最高的
// 合法位置，直到再也升不上去。得到的是很强的上限估计（未必全局最优，
// 但足以判断一个关卡是「玩家努力也上不去」还是「只是求解器没采到」）。
const K = require('../core.js');

const keyOf = s => Object.keys(s).sort().map(k => `${k}@${s[k].x},${s[k].y},${s[k].rot}`).join('|');

function spotsFor(l, id, others) {
  const out = [];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(id, rot));
    for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
      if (K.canPlace({ ...l, anchor: [] }, others, id, x, y, rot)) out.push({ x, y, rot });
    }
  }
  return out;
}

function climb(l, start) {
  let cur = JSON.parse(JSON.stringify(start));
  let best = K.scoreLayout(l, cur).total;
  for (let pass = 0; pass < 60; pass++) {
    let improved = false;
    for (const id of Object.keys(cur)) {
      const others = { ...cur }; delete others[id];
      const keep = cur[id];
      let top = best, topSpot = null;
      for (const s of spotsFor(l, id, others)) {
        const trial = { ...cur, [id]: s };
        const v = K.scoreLayout(l, trial).total;
        if (v > top) { top = v; topSpot = s; }
      }
      if (topSpot) { cur[id] = topSpot; best = top; improved = true; }
      else { cur[id] = keep; }
    }
    if (!improved) break;
  }
  return { score: K.scoreLayout(l, cur), layout: cur };
}

// 起点：贪心解 + 把最大的物品分别钉在棋盘各区域后求解
function seeds(l) {
  const out = [];
  const g = K.solve(l, {}, 200000);
  if (!g.solution) return out;
  out.push(g.solution);
  const biggest = l.items.slice().sort((a, b) => {
    const A = K.bounds(K.shape(a, 0)), B = K.bounds(K.shape(b, 0));
    return B.w * B.h - A.w * A.h;
  })[0];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(biggest, rot));
    for (let y = 0; y <= l.rows - b.h; y += 1) for (let x = 0; x <= l.cols - b.w; x += 1) {
      if (!K.canPlace({ ...l, anchor: [] }, {}, biggest, x, y, rot)) continue;
      const r = K.solve(l, { [biggest]: { x, y, rot } }, 200000);
      if (r.solution) out.push(r.solution);
    }
  }
  // 去重 + 限制规模
  const seen = new Set(), uniq = [];
  for (const s of out) { const k = keyOf(s); if (!seen.has(k)) { seen.add(k); uniq.push(s); } }
  return uniq.slice(0, 120);
}

const rows = [];
for (const l of K.levels) {
  const ss = seeds(l);
  if (!ss.length) { rows.push({ id: l.id, no: K.levels.indexOf(l) + 1, bad: 'unsolved' }); continue; }
  let top = null;
  for (const s of ss) {
    const r = climb(l, s);
    if (!top || r.score.total > top.score.total) top = r;
  }
  rows.push({ id: l.id, no: K.levels.indexOf(l) + 1, g: l.group, seedN: ss.length, s: top.score, layout: top.layout });
}

const ok = rows.filter(r => !r.bad);
console.log('每关「爬山逼近的最优解」');
console.log('  #  id          章节        件   总分  对齐  留白  居中   空位/可用');
for (const r of ok) {
  console.log(`  ${String(r.no).padStart(2)} ${r.id.padEnd(11)} ${String(r.g).padEnd(11)} ${String(l_items(r)).padStart(2)}   ${String(r.s.total).padStart(3)}   ${String(r.s.align).padStart(3)}   ${String(r.s.gap).padStart(3)}   ${String(r.s.center).padStart(3)}   ${String(r.s.empty).padStart(3)}/${r.s.usable}`);
}
function l_items(r) { return K.byId(r.id).items.length; }

const tots = ok.map(r => r.s.total).sort((a, b) => a - b);
const q = p => tots[Math.min(tots.length - 1, Math.floor(tots.length * p))];
console.log(`\n总分上限：最低 ${tots[0]}  P25 ${q(.25)}  中位 ${q(.5)}  P75 ${q(.75)}  最高 ${tots[tots.length - 1]}`);
console.log(`上限 < 78（拿不到「摆得很舒服」）的关卡（${ok.filter(r => r.s.total < 78).length} 关）：`);
for (const r of ok.filter(r => r.s.total < 78).sort((a, b) => a.s.total - b.s.total)) {
  console.log(`    ${String(r.no).padStart(2)} ${r.id.padEnd(11)} 上限 ${r.s.total}  (对齐 ${r.s.align} 留白 ${r.s.gap} 居中 ${r.s.center})  空位 ${r.s.empty}/${r.s.usable} 件数 ${l_items(r)}`);
}
console.log(`上限 < 90（拿不到「几乎是样板级」）的关卡（${ok.filter(r => r.s.total < 90).length} 关）`);
