// 关卡结构核对 + 整齐度评分校准 + 物品关系可达性检查（只读，不改数据）
const K = require('../core.js');

const rows = K.levels.map((l, i) => ({
  no: i + 1,
  id: l.id,
  title: l.title,
  group: l.group,
  mode: l.mode,
  grid: `${l.cols}x${l.rows}`,
  n: l.items.length,
  flags: [l.dense && '满', l.anchors && `定${l.anchors.length}`, l.fixedRot && '锁'].filter(Boolean).join('') || '-',
}));

console.log('=== 章节结构 ===');
const byGroup = {};
for (const r of rows) (byGroup[r.group] ||= []).push(r);
for (const [g, list] of Object.entries(byGroup)) {
  const name = (K.chapters.find(c => c.key === g) || {}).name || g;
  console.log(`${name.padEnd(6)} ${String(list.length).padStart(2)} 关  ${list.map(r => r.no).join(',')}`);
}
console.log('总关卡', K.levels.length, '物品', Object.keys(K.items).length);

console.log('\n=== 前 10 关（新手章节应在前 7）===');
for (const r of rows.slice(0, 10)) {
  console.log(`${String(r.no).padStart(2)} ${r.id.padEnd(10)} ${r.group.padEnd(9)} ${r.grid.padEnd(5)} ${String(r.n).padStart(2)}件 ${r.flags}  ${r.title}`);
}

console.log('\n=== 整齐度评分校准（每关求解器解）===');
const scores = [];
const unsolved = [];
for (const l of K.levels) {
  const r = K.solve(l);
  if (r.status !== 'solved') { unsolved.push(`${l.id}:${r.status}`); continue; }
  const s = K.scoreLayout(l, r.solution);
  scores.push({ id: l.id, title: l.title, total: s.total, align: s.align, gap: s.gap, center: s.center, dense: !!l.dense });
}
if (unsolved.length) console.log('!! 不可解:', unsolved.join(' '));
const nums = scores.map(s => s.total).sort((a, b) => a - b);
const q = p => nums[Math.min(nums.length - 1, Math.floor(nums.length * p))];
console.log(`样本 ${nums.length}  最小 ${nums[0]}   P10 ${q(.1)}   P25 ${q(.25)}   中位 ${q(.5)}   P75 ${q(.75)}   最大 ${nums[nums.length - 1]}`);
const max = nums[nums.length - 1], min = nums[0];
const lines = [Math.round(min + (max - min) * 0.62), Math.round(min + (max - min) * 0.28)];
console.log(`建议三星线 ${lines[0]} / 二星线 ${lines[1]}   （当前代码用 ${K.GRADE_LINES.join(' / ')}）`);
for (const s of scores.filter(s => s.total < 60 || s.total > 95).slice(0, 12)) {
  console.log(`  极值 ${s.id.padEnd(10)} ${String(s.total).padStart(3)} 对齐${String(s.align).padStart(3)} 留白${String(s.gap).padStart(3)} 居中${String(s.center).padStart(3)} ${s.title}`);
}

console.log('\n=== 物品关系可达性（求解器首解是否满足）===');
const met = new Set();
for (const l of K.levels) {
  const r = K.solve(l);
  if (r.status !== 'solved') continue;
  for (const id of K.metRelations(l, r.solution)) met.add(id);
}
const dead = K.relations.filter(r => !met.has(r.id));
console.log(`可达 ${met.size} / ${K.relations.length}`);
for (const r of dead) {
  const levels = K.levels.filter(l => l.items.includes(r.a) && l.items.includes(r.b)).map(l => l.id);
  console.log(`  未命中 ${r.id.padEnd(22)} ${r.a}+${r.b}  同关存在: ${levels.length ? levels.join(',') : '无'}`);
}

console.log('\n=== 关系类型分布 ===');
const byKind = {};
for (const r of K.relations) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log(Object.entries(byKind).map(([k, v]) => `${K.kindNames[k]} ${v}`).join('  '));
