// 诊断：三个评分维度在各关的可达上限。
// 目的：找出「无论怎么摆都拿不到高分」的维度——那是结构性偏差，不是玩家的问题。
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

// 求解器是「从左上角开始贪心填」的，第一版采样全被带成左上角布局，
// 于是「居中」上限被系统性低估。这里补一趟反向采样：先把最大的一件
// 按「离棋盘中心由近到远」塞进去，再去求解 —— 逼出偏向中央的解法。
function sample(l, CAP, SOLVE_CAP) {
  const first = K.solve(l, {}, 100000);
  if (first.status !== 'solved') return null;
  const seen = new Map([[keyOf(first.solution), first.solution]]);
  let calls = 0;
  const biggest = l.items.slice().sort((a, b) => {
    const A = K.bounds(K.shape(a, 0)), B = K.bounds(K.shape(b, 0));
    return B.w * B.h - A.w * A.h;
  })[0];
  const cx = (l.cols - 1) / 2, cy = (l.rows - 1) / 2;
  const spots = [];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(biggest, rot));
    for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
      if (K.canPlace(l, {}, biggest, x, y, rot)) spots.push({ x, y, rot, d: Math.hypot(x - cx, y - cy) });
    }
  }
  spots.sort((a, b) => a.d - b.d);
  for (const s of spots) {
    if (seen.size >= CAP || calls >= SOLVE_CAP) break;
    calls++;
    const r = K.solve(l, { [biggest]: { x: s.x, y: s.y, rot: s.rot } }, 100000);
    if (r.solution && !seen.has(keyOf(r.solution))) seen.set(keyOf(r.solution), r.solution);
  }
  outer:
  for (const id of Object.keys(first.solution)) {
    for (const alt of alternatives(l, id)) {
      if (seen.size >= CAP || calls >= SOLVE_CAP) break outer;
      calls++;
      const r = K.solve(l, { [id]: alt }, 100000);
      if (r.solution && !seen.has(keyOf(r.solution))) seen.set(keyOf(r.solution), r.solution);
    }
    if (calls >= SOLVE_CAP) break;
  }
  return seen;
}

const CAP = 36, SOLVE_CAP = 320;
const rows = [];
for (const l of K.levels) {
  const seen = sample(l, CAP, SOLVE_CAP);
  if (!seen) { rows.push({ id: l.id, bad: 'unsolved' }); continue; }
  const sc = [...seen.values()].map(s => K.scoreLayout(l, s));
  const col = k => sc.map(s => s[k]);
  const mx = k => Math.max(...col(k)), mn = k => Math.min(...col(k));
  const md = k => { const a = col(k).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  rows.push({
    id: l.id, no: K.levels.indexOf(l) + 1, g: l.group, n: seen.size,
    items: l.items.length, usable: sc[0].usable,
    align: [mn('align'), md('align'), mx('align')],
    gap: [mn('gap'), md('gap'), mx('gap')],
    center: [mn('center'), md('center'), mx('center')],
    total: [mn('total'), md('total'), mx('total')],
  });
}

const ok = rows.filter(r => !r.bad);
const fmt = a => `${String(a[0]).padStart(3)}/${String(a[1]).padStart(3)}/${String(a[2]).padStart(3)}`;
console.log('每关「最低/中位/最高」维度分（采样 ≤24 种解法）');
console.log('  #  id          章节        件  可用   对齐        留白        居中        总分');
for (const r of ok) {
  console.log(`  ${String(r.no).padStart(2)} ${r.id.padEnd(11)} ${String(r.g).padEnd(11)} ${String(r.items).padStart(2)} ${String(r.usable).padStart(4)}   ${fmt(r.align)}  ${fmt(r.gap)}  ${fmt(r.center)}  ${fmt(r.total)}`);
}

const ceiling = k => ok.map(r => r[k][2]);
for (const [k, name] of [['align', '对齐'], ['gap', '留白'], ['center', '居中']]) {
  const c = ceiling(k).sort((a, b) => a - b);
  console.log(`\n${name} 可达上限：中位 ${c[Math.floor(c.length / 2)]}  最低 ${c[0]}  最高 ${c[c.length - 1]}`);
  const poor = ok.filter(r => r[k][2] < 60).sort((a, b) => a[k][2] - b[k][2]);
  if (poor.length) {
    console.log(`  上限 < 60 的关卡（${poor.length} 关，该维度结构性拿不到分）：`);
    for (const r of poor) console.log(`    ${String(r.no).padStart(2)} ${r.id.padEnd(11)} 上限 ${r[k][2]}  可用格 ${r.usable} 件数 ${r.items}`);
  }
}
