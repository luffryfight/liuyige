// 把 tools/nearfull-table.json 合并回 core.js 的 HARDEN 常量。
// 合并而不是整体替换：nearfull 只负责 drawer-15 起的那批关卡，前面的关卡继续沿用
// 旧 harden 表生成的配置。键的顺序沿用原表，读起来还是按关卡先后排。
const fs = require('node:fs');
const path = require('node:path');
const K = require('../core.js');

const file = path.join(__dirname, '..', 'core.js');
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'nearfull-table.json'), 'utf8'));

const merged = {};
for (const [id, h] of Object.entries(K.HARDEN)) merged[id] = h;
let replaced = 0;
for (const [id, h] of Object.entries(table)) {
  if (!merged[id]) throw new Error(`${id} 不在现有 HARDEN 表里，合并前请确认关卡 id`);
  merged[id] = h;
  replaced++;
}

const rows = Object.entries(merged).map(([id, h]) => {
  const parts = [];
  if (h.cols !== undefined) parts.push(`cols:${h.cols}`);
  if (h.rows !== undefined) parts.push(`rows:${h.rows}`);
  if (h.add && h.add.length) parts.push(`add:[${h.add.map(a => `'${a}'`).join(',')}]`);
  if (h.keepCount !== undefined) parts.push(`keepCount:${h.keepCount}`);
  if (h.anchors && h.anchors.length) parts.push(`anchors:[${h.anchors.map(a => `{id:'${a.id}',x:${a.x},y:${a.y},rot:${a.rot}}`).join(',')}]`);
  if (h.fixedRot && h.fixedRot.length) parts.push(`fixedRot:[${h.fixedRot.map(a => `'${a}'`).join(',')}]`);
  if (h.dense) parts.push('dense:true');
  if (h.maxEmpty !== undefined) parts.push(`maxEmpty:${h.maxEmpty}`);
  return `    '${id}':{${parts.join(',')}},`;
}).join('\n');

const src = fs.readFileSync(file, 'utf8');
const pattern = /^  const HARDEN=\{[\s\S]*?\};$/m;
if (!pattern.test(src)) throw new Error('core.js 里找不到 HARDEN 块');
fs.writeFileSync(file, src.replace(pattern, `  const HARDEN={\n${rows}\n  };`));
console.log(`已合并 ${replaced} 关近满盘配置；HARDEN 共 ${Object.keys(merged).length} 条`);
