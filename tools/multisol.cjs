// 关键验证：每关是否存在第二种解法？以及不同解法的整齐度分数是否有区分度？
// 若某关只有唯一解，则「摆得好看」对该关无意义 —— 必须先知道有多少关是这样。
const K = require('../core.js');

function alternativePlacements(l, id) {
  const out = [];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(id, rot));
    for (let y = 0; y <= l.rows - b.h; y++) for (let x = 0; x <= l.cols - b.w; x++) {
      if (!K.canPlace(l, {}, id, x, y, rot)) continue;
      out.push({ x, y, rot });
    }
  }
  return out;
}

const summary = [];
for (const l of K.levels) {
  const first = K.solve(l, {}, 100000);
  if (first.status !== 'solved') { summary.push({ id: l.id, title: l.title, status: 'unsolved' }); continue; }
  const s1 = K.scoreLayout(l, first.solution);
  let second = null;
  const ids = Object.keys(first.solution);
  outer:
  for (const id of ids) {
    const p = first.solution[id];
    for (const alt of alternativePlacements(l, id)) {
      if (alt.x === p.x && alt.y === p.y && alt.rot === p.rot) continue;
      const r = K.solve(l, { [id]: alt }, 100000);
      if (r.solution) { second = { id, alt, score: K.scoreLayout(l, r.solution) }; break outer; }
    }
  }
  summary.push({
    id: l.id, title: l.title, no: K.levels.indexOf(l) + 1, group: l.group,
    multi: !!second, via: second ? second.id : null,
    s1: s1.total, s2: second ? second.score.total : null,
    rot0: ids.filter(i => first.solution[i].rot === 0).length, n: ids.length,
  });
}

const unsolved = summary.filter(s => s.status === 'unsolved');
const unique = summary.filter(s => s.multi === false);
const multi = summary.filter(s => s.multi === true);

console.log(`总 ${summary.length} 关   多解 ${multi.length}   唯一解 ${unique.length}   不可解 ${unsolved.length}`);
if (unsolved.length) console.log('不可解:', unsolved.map(s => s.id).join(' '));

console.log('\n=== 唯一解的关卡（这些关「整齐度」是固定的，没有可争取空间）===');
if (!unique.length) console.log('（无）');
for (const s of unique) {
  console.log(`  ${String(s.no).padStart(2)} ${s.id.padEnd(10)} ${s.group.padEnd(9)} 分数 ${String(s.s1).padStart(3)}  朝向0的件数 ${s.rot0}/${s.n}`);
}

console.log('\n=== 多解关卡：首解 vs 第二解 的分数差 ===');
let spread = [];
for (const s of multi) {
  const d = s.s2 - s.s1;
  spread.push(d);
  console.log(`  ${String(s.no).padStart(2)} ${s.id.padEnd(10)} ${s.group.padEnd(9)} 首解 ${String(s.s1).padStart(3)} → 别解 ${String(s.s2).padStart(3)}  (差 ${d > 0 ? '+' : ''}${d})  改的是 ${s.via}`);
}
if (spread.length) {
  const abs = spread.map(Math.abs).sort((a, b) => a - b);
  console.log(`\n分差绝对中位 ${abs[Math.floor(abs.length / 2)]}，最大 ${abs[abs.length - 1]}，无差的关卡 ${spread.filter(d => d === 0).length} 个`);
}

console.log('\n=== 朝向混用情况（求解器首解里非正向摆放的件数）===');
const rotFree = summary.filter(s => s.multi !== undefined)
  .map(s => ({ no: s.no, id: s.id, off: s.n - s.rot0, n: s.n }))
  .filter(s => s.off > 0);
console.log(`有 ${rotFree.length} / ${summary.length} 关的首解里存在被转过的物品`);
console.log(rotFree.slice(0, 15).map(s => `${s.no}:${s.off}/${s.n}`).join('  '));
