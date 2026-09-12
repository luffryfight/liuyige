// 关系可达性硬校验：不是只看求解器首解，而是主动把两件物品摆到满足关系的位置，
// 再问求解器「剩下的能不能放下」。跑不通的关系就是玩家永远解不开的死内容。
const K = require('../core.js');

function altPlacements(level, id) {
  const out = [];
  for (let rot = 0; rot < 4; rot++) {
    const b = K.bounds(K.shape(id, rot));
    for (let y = 0; y <= level.rows - b.h; y++) for (let x = 0; x <= level.cols - b.w; x++) {
      if (!K.canPlace(level, {}, id, x, y, rot)) out.push(null);
      else out.push({ x, y, rot });
    }
  }
  return out.filter(Boolean);
}

const LIMIT_PER_LEVEL = 160;
const results = [];
let totalSolves = 0;

for (const rel of K.relations) {
  const levels = K.levels.filter(l => l.items.includes(rel.a) && l.items.includes(rel.b));
  let found = null, solves = 0;
  for (const lvl of levels) {
    const A = altPlacements(lvl, rel.a), B = altPlacements(lvl, rel.b);
    let n = 0;
    outer:
    for (let i = 0; i < A.length; i++) {
      const pa = A[(i * 7 + 3) % A.length];
      for (let j = 0; j < B.length; j++) {
        const pb = B[(j * 11 + 5) % B.length];
        if (n >= LIMIT_PER_LEVEL) break outer;
        const one = { [rel.a]: { x: pa.x, y: pa.y, rot: pa.rot } };
        if (!K.canPlace(lvl, one, rel.b, pb.x, pb.y, pb.rot)) continue;
        const both = { ...one, [rel.b]: { x: pb.x, y: pb.y, rot: pb.rot } };
        if (!K.relationMet(rel, lvl, both)) continue;
        n++; solves++;
        const r = K.solve(lvl, both, 200000);
        if (r.solution) { found = { level: lvl.id, no: K.levels.indexOf(lvl) + 1, best: both }; break outer; }
      }
    }
    if (found) break;
  }
  totalSolves += solves;
  results.push({ rel, levelCount: levels.length, found, solves });
}

const ok = results.filter(r => r.found);
const dead = results.filter(r => !r.found);
console.log(`关系可达 ${ok.length} / ${results.length}   累计求解 ${totalSolves} 次`);
if (dead.length) {
  console.log('\n!! 不可达的关系（必须处理）:');
  for (const d of dead) console.log(`  ${d.rel.id.padEnd(22)} ${K.items[d.rel.a].name} + ${K.items[d.rel.b].name}  [${K.kindNames[d.rel.kind]}]  同关数 ${d.levelCount}  试了 ${d.solves} 次`);
} else {
  console.log('全部关系都能在某个关卡里真正摆出来。');
}
console.log('\n逐条落点：');
for (const r of results) {
  const where = r.found ? `第 ${String(r.found.no).padStart(2)} 关 ${r.found.level}` : '——';
  console.log(`  ${(K.items[r.rel.a].name + ' + ' + K.items[r.rel.b].name).padEnd(14)} ${K.kindNames[r.rel.kind].padEnd(5)} 同关 ${String(r.levelCount).padStart(2)} 次   达成于 ${where}`);
}

console.log('\n=== 物品出场检查（有没有从没被用过的死物品）===');
const used = new Set();
for (const l of K.levels) for (const id of l.items) used.add(id);
const unused = Object.keys(K.items).filter(id => !used.has(id));
console.log(unused.length ? `!! 从未出场: ${unused.map(id => K.items[id].name).join('、')}` : `全部 ${used.size} 件物品都在关卡里出现过。`);
