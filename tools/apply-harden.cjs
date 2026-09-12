// 把 tools/harden-table.txt 里生成好的增强表写回 core.js 的 HARDEN 常量。
// 只替换 HARDEN 这一段，不碰关卡原始数据。
const fs = require('fs');
const path = require('path');
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'harden-table.txt'), 'utf8').trim());
const rows = Object.entries(table).map(([id, h]) => {
  const parts = [];
  if (h.cols !== undefined) parts.push(`cols:${h.cols}`);
  if (h.rows !== undefined) parts.push(`rows:${h.rows}`);
  if (h.add) parts.push(`add:[${h.add.map(a => `'${a}'`).join(',')}]`);
  if (h.anchors) parts.push(`anchors:[${h.anchors.map(a => `{id:'${a.id}',x:${a.x},y:${a.y},rot:${a.rot}}`).join(',')}]`);
  if (h.fixedRot) parts.push(`fixedRot:[${h.fixedRot.map(a => `'${a}'`).join(',')}]`);
  if (h.dense) parts.push('dense:true');
  return `    '${id}':{${parts.join(',')}},`;
}).join('\n');
const block = `  const HARDEN={\n${rows}\n  };`;
const file = path.join(__dirname, '..', 'core.js');
const src = fs.readFileSync(file, 'utf8');
const pattern = /^  const HARDEN=\{[\s\S]*?\};$/m;
if (!pattern.test(src)) throw new Error('core.js 里找不到 HARDEN 块');
fs.writeFileSync(file, src.replace(pattern, block));
console.log('已写入 ' + Object.keys(table).length + ' 关增强配置');
