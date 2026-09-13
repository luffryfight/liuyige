// 画布几何校验：棋盘、物品栏、固定件、分区都必须落在 640x640 的画布里。
// 物品栏口径与 game.js 的 traySpec() 保持一致：件数决定列数，超过两行才压矮格子。
const K = require('../core.js');
const W = 640, H = 640;
const TRAY = { x: 25, y: 400, w: 590, gap: 10 };
const trayCols = n => n <= 6 ? 3 : n <= 8 ? 4 : n <= 10 ? 5 : 6;
const traySpec = n => {
  const cols = trayCols(n), rows = Math.ceil(n / cols), tall = rows <= 2;
  return { cols, rows, tileH: tall ? 104 : 68, pitch: tall ? 112 : 76, artH: tall ? 67 : 38, tw: (TRAY.w - (cols - 1) * TRAY.gap) / cols };
};
const board = (l) => {
  const cell = Math.max(28, Math.min(52, Math.floor(275 / l.rows), Math.floor(530 / l.cols)));
  const w = l.cols * cell, h = l.rows * cell;
  return { x: (W - w) / 2, y: 64, cell, w, h };
};
const nameOf = id => K.items[id].name;
let maxItems = 0, issues = [];
const seen = {}, trayShape = {};
for (const l of K.levels) {
  const b = board(l);
  const frameTop = b.y - 23, frameBottom = b.y - 23 + (b.h + 55);
  const knob = b.y + b.h + 16 + 8;
  const s = traySpec(l.items.length);
  const last = { x: TRAY.x + ((l.items.length - 1) % s.cols) * (s.tw + TRAY.gap), y: TRAY.y + (s.rows - 1) * s.pitch };
  const trayBottom = last.y + s.tileH;
  seen[l.cols + 'x' + l.rows] = (seen[l.cols + 'x' + l.rows] || 0) + 1;
  trayShape[s.cols + '列' + s.rows + '行'] = (trayShape[s.cols + '列' + s.rows + '行'] || 0) + 1;
  maxItems = Math.max(maxItems, l.items.length);

  if (frameBottom >= 380) issues.push(`${l.id} 棋盘外框底 ${frameBottom} 压到物品栏分隔线 380`);
  if (knob >= 380) issues.push(`${l.id} 抽屉拉手 ${knob} 压到分隔线`);
  if (b.x < 10 || b.x + b.w > W - 10) issues.push(`${l.id} 棋盘左右溢出 x=${b.x} w=${b.w}`);
  if (b.y + b.h > 380) issues.push(`${l.id} 棋盘底部 ${b.y + b.h} 越过分隔线 380`);
  if (b.cell < 28) issues.push(`${l.id} 格子只有 ${b.cell}px，看不清`);
  if (s.rows > 3) issues.push(`${l.id} 物品栏需要 ${s.rows} 行，超出 3 行`);
  if (trayBottom > H) issues.push(`${l.id} 物品栏溢出 bottom=${trayBottom}（${l.items.length} 件）`);
  if (l.items.length > 18) issues.push(`${l.id} 物品 ${l.items.length} 件，超出 18 件上限`);
  if (last.x + s.tw > W - 10) issues.push(`${l.id} 物品栏右侧溢出 ${last.x + s.tw}`);
  for (const id of l.items) {
    const bd = K.bounds(K.items[id].cells);
    const u = Math.min(30, s.artH / bd.h, (s.tw - 26) / bd.w);
    if (bd.h * u > s.artH + 0.5) issues.push(`${l.id} ${nameOf(id)} 图标高度 ${(bd.h * u).toFixed(1)} 超出 ${s.artH}px 框`);
    if (bd.w * u > s.tw - 24) issues.push(`${l.id} ${nameOf(id)} 图标宽度 ${(bd.w * u).toFixed(1)} 超出 ${s.tw - 24}px`);
    const fs = s.rows <= 2 ? (s.cols >= 5 ? 13 : 15) : 11;
    if (nameOf(id).length * fs > s.tw) issues.push(`${l.id} ${nameOf(id)} 名字放不进 ${s.tw}px 的格子`);
  }
  for (const z of l.zones || []) for (const [zx, zy] of z.cells) {
    if (zx >= l.cols || zy >= l.rows) issues.push(`${l.id} 分区 ${z.label} 越界 (${zx},${zy})`);
  }
  for (const [bx, by] of l.blocked || []) {
    if (bx >= l.cols || by >= l.rows) issues.push(`${l.id} 隔板越界 (${bx},${by})`);
  }
  for (const a of l.anchors || []) {
    if (!l.items.includes(a.id)) issues.push(`${l.id} 固定件 ${a.id} 不在物品清单里`);
    if (a.x < 0 || a.y < 0 || a.x >= l.cols || a.y >= l.rows) issues.push(`${l.id} 固定件 ${a.id} 越界`);
    if ((l.blocked || []).some(([bx, by]) => K.shape(a.id, a.rot).some(([dx, dy]) => a.x + dx === bx && a.y + dy === by))) issues.push(`${l.id} 固定件 ${a.id} 压在隔板上`);
  }
  for (const id of l.fixedRot || []) if (!l.items.includes(id)) issues.push(`${l.id} 锁转件 ${id} 不在物品清单里`);
}
console.log('网格规格分布:', JSON.stringify(seen));
console.log('物品栏形态:', JSON.stringify(trayShape));
console.log('单关最多物品数:', maxItems);
console.log('几何问题:', issues.length);
for (const s of issues) console.log('  -', s);
if (!issues.length) console.log('全部关卡几何正常 ✓');
process.exit(issues.length ? 1 : 0);
