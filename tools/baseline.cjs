// 基线诊断：打印重排后的索引 → 关卡映射，以及各章节构成。
// 扩关前先跑一次，确认「追加到数组尾部」不会动到已有索引（harden.cjs 是按索引取 tier 的）。
const K = require('../core.js');

console.log('关卡总数', K.levels.length);
console.log('');
console.log('索引 id          玩法      组         件数 网格   固定 恰满 锁转');
K.levels.forEach((l, i) => {
  console.log(
    String(i).padStart(3),
    l.id.padEnd(11),
    String(l.mode).padEnd(8),
    String(l.group).padEnd(9),
    String(l.items.length).padStart(3),
    String(l.cols + 'x' + l.rows).padEnd(5),
    (l.anchors ? l.anchors.length : '-').toString().padStart(3),
    (l.dense ? 'Y' : '-').padStart(4),
    (l.fixedRot ? 'Y' : '-').padStart(4)
  );
});
console.log('');
for (const c of K.chapters) {
  const ls = K.levels.filter(l => l.group === c.key);
  console.log(c.key.padEnd(10), c.name.padEnd(10), ls.length + ' 关');
}
const byMode = {};
for (const l of K.levels) byMode[l.mode] = (byMode[l.mode] || 0) + 1;
console.log('');
console.log('按玩法：', Object.entries(byMode).map(([k, v]) => K.modeNames[k] + '=' + v).join('  '));
console.log('TUTORIAL:', K.TUTORIAL.join(', '));
const idxOf = id => K.levels.findIndex(l => l.id === id);
console.log('大师委托的索引:', K.levels.map((l, i) => l.mode === 'master' ? i : -1).filter(i => i >= 0).join(','));
