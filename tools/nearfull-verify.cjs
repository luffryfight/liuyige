// 近满盘成品的深度复验：把「一点提示」真正依赖的性质逐关验一遍。
//
// 为什么单独写一个：tools/nearfull.cjs 生成时验过，但它读的是 K.RAW 快照。
// 快照和运行时之间还夹着 HARDEN 与关系补丁，两边只要差一件物品，结论就不成立
// （drawer-21/22/31 就是这么先「验过」、后来在运行时变成无解的）。
// 所以成品必须按 K.levels 再验一次——也就是玩家真正会打开的那份数据。
//
// 验的是：
//   1. 可解、可完成、空位在上限内；
//   2. 节点数在「一点提示」的预算（70000）内；
//   3. 沿着一个解逐件固定，每一步都仍然可解、且不超预算 —— 提示要在摆了一半的盘面上还能给出下一步。
//
// 用法：node tools/nearfull-verify.cjs
const K = require('../core.js');

const HINT_BUDGET = 70000;
const scope = K.RAW.filter(l => l.seq >= 14 && !K.TUTORIAL.includes(l.id));
let problems = [], worst = { nodes: 0, id: '' }, zero = 0, one = 0;

for (const raw of scope) {
  const l = K.levels.find(x => x.id === raw.id);
  const r = K.solve(l, {}, 400000);
  if (!r.solution) { problems.push(`${l.id} ${r.status}`); continue; }
  if (!K.isComplete(l, r.solution)) { problems.push(`${l.id} 完成判定不过`); continue; }
  if (r.nodes > HINT_BUDGET) problems.push(`${l.id} 整体节点 ${r.nodes}`);
  if (r.nodes > worst.nodes) worst = { nodes: r.nodes, id: l.id };
  const empty = K.freeCells(l) - K.cellCount(l, r.solution);
  if (empty > 1) problems.push(`${l.id} 空位 ${empty}`);
  if (empty === 0) zero++; else one++;

  // 逐件固定：模拟玩家已经摆好前 k 件，提示还能不能给出下一步。
  let partial = {}, i = 0;
  for (const [id, p] of Object.entries(r.solution)) {
    partial[id] = p; i++;
    const s = K.solve(l, partial, 400000);
    if (!s.solution) { problems.push(`${l.id} 固定 ${i} 件后 ${s.status}`); break; }
    if (s.nodes > HINT_BUDGET) { problems.push(`${l.id} 固定 ${i} 件后节点 ${s.nodes}`); break; }
    if (s.nodes > worst.nodes) worst = { nodes: s.nodes, id: `${l.id}@${i}` };
  }
}

console.log(`覆盖 ${scope.length} 关`);
console.log(`空位：0 格 ${zero} 关 / 1 格 ${one} 关`);
console.log(`最慢一步的节点数：${worst.nodes}（${worst.id}），提示预算 ${HINT_BUDGET}`);
if (problems.length) {
  console.error(`\n${problems.length} 处不达标：`);
  for (const p of problems) console.error('  ! ' + p);
  process.exitCode = 1;
} else {
  console.log('\n全部通过：可解、可完成、空位 ≤ 1、逐件固定后仍可解且不超提示预算。');
}
