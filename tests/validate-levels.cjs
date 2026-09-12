const K = require('../core.js');
let ok = 0, bad = [];
const byMode = {};
console.log('总关卡数:', K.levels.length);
for (const level of K.levels) {
  const cnt = K.items ? null : null;
  const r = K.solve(level, {}, 400000);
  const filled = K.goalCount(level);
  const good = r.status === 'solved'
    && r.solution && Object.keys(r.solution).length === filled
    && K.isComplete(level, r.solution)
    && K.validState(level, r.solution);
  byMode[level.mode] = (byMode[level.mode] || 0) + 1;
  if (good) ok++;
  else bad.push({ id: level.id, title: level.title, mode: level.mode, status: r.status, got: r.solution ? Object.keys(r.solution).length : 0, need: filled });
}
console.log('通过:', ok, '/', K.levels.length);
console.log('按玩法分布:', JSON.stringify(byMode));
if (bad.length) { console.log('失败关卡:'); for (const b of bad) console.log('  ', JSON.stringify(b)); }
else console.log('全部可解 ✓');
process.exit(bad.length ? 1 : 0);
