// 同一关内收集多个不同解法，看整齐度分数的实际跨度。
// 跨度大 = 玩家有得争；跨度小 = 该关分数是固定的，三星无意义。
const K = require('../core.js');

function alternatives(l, id) {
  const out = [];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(id, rot));
    for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
      if (K.canPlace(l, {}, id, x, y, rot)) out.push({ x, y, rot });
    }
  }
  return out;
}
const keyOf = s => Object.keys(s).sort().map(k => `${k}@${s[k].x},${s[k].y},${s[k].rot}`).join('|');

const CAP = 24, SOLVE_CAP = 220;
const out = [];
for (const l of K.levels) {
  const first = K.solve(l, {}, 100000);
  if (first.status !== 'solved') { out.push({ id: l.id, no: K.levels.indexOf(l) + 1, status: 'unsolved' }); continue; }
  const seen = new Map([[keyOf(first.solution), first.solution]]);
  let solves = 0;
  const base = new Set(Object.keys(first.solution));
  outer:
  for (const id of base) {
    for (const alt of alternatives(l, id)) {
      if (seen.size >= CAP || solves >= SOLVE_CAP) break outer;
      solves++;
      const r = K.solve(l, { [id]: alt }, 100000);
      if (r.solution) {
        const k = keyOf(r.solution);
        if (!seen.has(k)) seen.set(k, r.solution);
      }
    }
    if (solves >= SOLVE_CAP) break;
  }
  const scores = [...seen.values()].map(s => K.scoreLayout(l, s).total);
  out.push({
    id: l.id, no: K.levels.indexOf(l) + 1, group: l.group, title: l.title,
    n: seen.size, min: Math.min(...scores), max: Math.max(...scores),
    range: Math.max(...scores) - Math.min(...scores),
  });
}
const ok = out.filter(o => o.status !== 'unsolved');
const ranges = ok.map(o => o.range).sort((a, b) => a - b);
const q = p => ranges[Math.min(ranges.length - 1, Math.floor(ranges.length * p))];
console.log(`样本 ${ok.length} 关，每关最多采 ${CAP} 种解法`);
console.log(`分数跨度：最小 ${ranges[0]}  P25 ${q(.25)}  中位 ${q(.5)}  P75 ${q(.75)}  最大 ${ranges[ranges.length - 1]}`);
console.log(`跨度 < 10 的关卡数：${ranges.filter(r => r < 10).length}   跨度 >= 20 的：${ranges.filter(r => r >= 20).length}`);
console.log('\n跨度最小的 12 关（这些关分数几乎固定）：');
for (const o of ok.slice().sort((a, b) => a.range - b.range).slice(0, 12)) {
  console.log(`  ${String(o.no).padStart(2)} ${o.id.padEnd(10)} ${o.group.padEnd(9)} 采样${String(o.n).padStart(3)}种  ${o.min}-${o.max}  跨度${String(o.range).padStart(3)}  ${o.title}`);
}
console.log('\n跨度最大的 6 关：');
for (const o of ok.slice().sort((a, b) => b.range - a.range).slice(0, 6)) {
  console.log(`  ${String(o.no).padStart(2)} ${o.id.padEnd(10)} ${o.group.padEnd(9)} 采样${String(o.n).padStart(3)}种  ${o.min}-${o.max}  跨度${String(o.range).padStart(3)}  ${o.title}`);
}
const allMin = Math.min(...ok.map(o => o.min)), allMax = Math.max(...ok.map(o => o.max));
console.log(`\n全局分数区间 ${allMin} - ${allMax}`);
