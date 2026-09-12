// 整齐度的「争取空间」诊断：把「朴素摆法」（求解器的左上贪心解）和「认真摆过的最好分数」对比。
// 为什么不用 spread.cjs：那是「在最优解附近微扰」，采出来的都是好摆法，量不出玩家的真实梯度。
// 玩家的实际起点是把东西随手塞进去，所以要拿贪心解当基准。
//   gradient 大 = 玩家随手一摆分不高，认真摆能明显变好 —— 整齐度在这一关是活的
//   gradient 小 = 随手摆就接近满分 —— 这一关的整齐度基本是摆设
const K = require('../core.js');

function bestOf(l, seeds, passes) {
  let best = 0;
  for (const seed of seeds) {
    const cur = JSON.parse(JSON.stringify(seed));
    let score = K.scoreLayout(l, cur).total;
    for (let p = 0; p < passes; p++) {
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

function seedsFor(l, n) {
  const out = [];
  const g = K.solve(l, {}, 200000).solution;
  if (!g) return out;
  out.push(g);
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
  const step = Math.max(1, Math.floor(spots.length / n));
  for (let i = 0; i < spots.length && out.length < n; i += step) {
    const s = spots[i];
    const r = K.solve(l, { [biggest]: { x: s.x, y: s.y, rot: s.rot } }, 200000);
    if (r.solution) out.push(r.solution);
  }
  return out;
}

const rows = [];
for (const l of K.RAW) {
  const level = K.byId(l.id);
  const greedy = K.solve(level, {}, 200000).solution;
  if (!greedy) { rows.push({ id: l.id, seq: l.seq, bad: true }); continue; }
  const naive = K.scoreLayout(level, greedy).total;
  const best = bestOf(level, seedsFor(level, 10), 20);
  rows.push({ id: l.id, seq: l.seq, mode: level.mode, tutorial: !!level.tutorial, naive, best, grad: best - naive });
}

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const report = (name, list) => {
  const g = list.map(r => r.grad).sort((x, y) => x - y);
  console.log(`\n== ${name}（${list.length} 关）`);
  console.log(`  梯度：最小 ${g[0]}  P25 ${q(g, .25)}  中位 ${q(g, .5)}  P75 ${q(g, .75)}  最大 ${g[g.length - 1]}`);
  console.log(`  梯度 < 5 的关卡：${g.filter(x => x < 5).length}   梯度 >= 15 的：${g.filter(x => x >= 15).length}`);
  console.log(`  朴素分中位 ${q(list.map(r => r.naive).sort((a, b) => a - b), .5)}   最佳分中位 ${q(list.map(r => r.best).sort((a, b) => a - b), .5)}`);
};
const ok = rows.filter(r => !r.bad && !r.tutorial);
report('第一辑（第 1–50 关）', ok.filter(r => r.seq < 50));
report('第二辑（第 51–100 关）', ok.filter(r => r.seq >= 50));
report('全部非教学关', ok);

const flat = ok.filter(r => r.grad < 5).sort((a, b) => a.grad - b.grad);
console.log(`\n梯度 < 5 的关卡（${flat.length} 关，整齐度在这些关基本是摆设）：`);
for (const r of flat) console.log(`  ${r.id.padEnd(11)} ${r.mode.padEnd(8)} 朴素 ${String(r.naive).padStart(3)} → 最好 ${String(r.best).padStart(3)}  梯度 ${String(r.grad).padStart(2)}`);
const worstBest = ok.slice().sort((a, b) => a.best - b.best)[0];
console.log(`\n最低的最佳分：${worstBest.id} = ${worstBest.best}（评语线 ${K.GRADE_LINES[0]}）`);
