#!/usr/bin/env node
'use strict';

// 画布几何校验：100 关 × 几档屏幕，棋盘 / 物品栏 / 固定件 / 分区都得落在自己的画布里。
//
// 数字全部问 game.js 要（走 tests/harness.cjs → GameDebug.layout()），**不在这里另抄一份
// 常量**：手抄的那份在「版式分宽屏 / 手机两套」之后就会跟实现悄悄脱节——报告说没问题，
// 游戏里其实是另一回事。要改版式就改 game.js，这里只负责核对结果。
//
// 用法:
//   node tests/validate-geometry.cjs

const { game } = require('./harness.cjs');
const K = require('../core.js');

// 视口宽 + 该视口下画布的 CSS 宽度（按 style.css 反推：窄屏满宽，宽屏看窗口高度）。
const SCREENS = [
  { name: '桌面 1440×900', vw: 1440, canvas: 550 },
  { name: '桌面 1280×800', vw: 1280, canvas: 450 },
  { name: '手机 390×844', vw: 390, canvas: 366 },
  { name: '小屏手机 320×568', vw: 320, canvas: 296 },
];

const nameOf = id => K.items[id].name;
const h = game();
const issues = [];
const seen = {}, trayShape = {};
let maxItems = 0;

// 「屏幕上还有多少 CSS px」——两套稿的逻辑宽不同，只能这样横向比。
const px = (logical, L, canvas) => logical * canvas / L.VW;

for (const screen of SCREENS) {
  h.setViewport(screen.vw, screen.canvas);
  const phone = screen.vw <= 650;
  const cells = [];
  for (const l of K.levels) {
    h.debug.loadId(l.id);
    const L = h.debug.layout();
    const tag = `${screen.name} ${l.id}`;
    const b = L.rect, F = L.frame, s = L.tray;
    if (L.phone !== phone) issues.push(`${tag} 版式挑错了：应当${phone ? '走手机稿' : '走原稿'}`);

    // ── 棋盘与木框 ──
    if (b.x < 0 || b.x + b.w > L.VW) issues.push(`${tag} 棋盘左右溢出 x=${b.x.toFixed(1)} w=${b.w}`);
    if (b.y < 0) issues.push(`${tag} 棋盘顶出画布 y=${b.y}`);
    if (b.y + b.h > L.sep.y) issues.push(`${tag} 棋盘底部 ${b.y + b.h} 越过分隔线 ${L.sep.y}`);
    const frameTop = b.y - F.out, frameBottom = frameTop + b.h + F.bottom;
    if (frameTop < 0) issues.push(`${tag} 木框顶出画布 ${frameTop}`);
    if (frameBottom > L.sep.y) issues.push(`${tag} 木框底 ${frameBottom.toFixed(1)} 压到分隔线 ${L.sep.y}`);
    const knob = b.y + b.h + F.handleGap + F.handleH;
    if (knob > L.sep.y) issues.push(`${tag} 抽屉拉手 ${knob.toFixed(1)} 压到分隔线`);
    // 棋盘格小不小，主要是「盘面列数 × 屏幕宽度」的物理结果：12 列的盘面在 320 宽的手机上
    // 一格最多只有 (296-40)/12 ≈ 21 CSS px，不是版式能救的。所以这里只守一条绝对下限
    // （防的是「版式把宽度浪费掉」那类回归——改版前 320 屏上最密的一关只有 12.9 CSS px），
    // 各档屏幕上的实际数字看下面的汇总行和 tools/layout-sweep.cjs 的对照表。
    if (px(b.cell, L, screen.canvas) < 18) issues.push(`${tag} 棋盘格只有 ${px(b.cell, L, screen.canvas).toFixed(1)} CSS px，太碎了`);
    cells.push(px(b.cell, L, screen.canvas));

    // ── 物品栏（排布全部来自 L.tray，口径就是游戏里用的那套）──
    seen[l.cols + 'x' + l.rows] = (seen[l.cols + 'x' + l.rows] || 0) + 1;
    trayShape[s.cols + '列' + s.rows + '行'] = (trayShape[s.cols + '列' + s.rows + '行'] || 0) + 1;
    maxItems = Math.max(maxItems, l.items.length);
    if (s.x < 0 || s.x + s.w > L.VW) issues.push(`${tag} 物品栏横向出画布 x=${s.x} w=${s.w}`);
    if (s.y <= L.sep.y) issues.push(`${tag} 物品栏压到分隔线`);
    const trayBottom = s.y + (s.rows - 1) * s.pitch + s.tileH;
    if (trayBottom > L.VH) issues.push(`${tag} 物品栏底部 ${trayBottom} 超出画布高 ${L.VH}`);
    if (px(s.tw, L, screen.canvas) < 44) issues.push(`${tag} 物品格只有 ${px(s.tw, L, screen.canvas).toFixed(1)} CSS px，太窄`);
    if (l.items.length > 18) issues.push(`${tag} 物品 ${l.items.length} 件，超出 18 件上限`);
    if (!L.phone && s.rows > 3) issues.push(`${tag} 宽屏物品栏要 ${s.rows} 行，原稿只有三行的位置`);

    for (const id of l.items) {
      const bd = K.bounds(K.items[id].cells);
      // 与 game.js 的 itemRect() 同一套算法：高度受 artH 限制，宽度躲开左右留白。
      const inset = L.phone ? 14 : 26;
      const u = Math.min(L.uMax, s.artH / bd.h, (s.tw - inset) / bd.w);
      if (bd.h * u > s.artH + .5) issues.push(`${tag} ${nameOf(id)} 图标高 ${(bd.h * u).toFixed(1)} 超出 ${s.artH}px 框`);
      if (bd.w * u > s.tw - inset) issues.push(`${tag} ${nameOf(id)} 图标宽 ${(bd.w * u).toFixed(1)} 超出 ${s.tw - inset}px`);
      if (nameOf(id).length * s.nameSize > s.tw) issues.push(`${tag} ${nameOf(id)} 名字（${s.nameSize}px）放不进 ${s.tw.toFixed(0)}px 的格子`);
    }

    // ── 关卡数据本身（与版式无关）──
    for (const z of l.zones || []) for (const [zx, zy] of z.cells) {
      if (zx >= l.cols || zy >= l.rows) issues.push(`${tag} 分区 ${z.label} 越界 (${zx},${zy})`);
    }
    for (const [bx, by] of l.blocked || []) {
      if (bx >= l.cols || by >= l.rows) issues.push(`${tag} 隔板越界 (${bx},${by})`);
    }
    for (const a of l.anchors || []) {
      if (!l.items.includes(a.id)) issues.push(`${tag} 固定件 ${a.id} 不在物品清单里`);
      if (a.x < 0 || a.y < 0 || a.x >= l.cols || a.y >= l.rows) issues.push(`${tag} 固定件 ${a.id} 越界`);
      if ((l.blocked || []).some(([bx, by]) => K.shape(a.id, a.rot).some(([dx, dy]) => a.x + dx === bx && a.y + dy === by))) issues.push(`${tag} 固定件 ${a.id} 压在隔板上`);
    }
    for (const id of l.fixedRot || []) if (!l.items.includes(id)) issues.push(`${tag} 锁转件 ${id} 不在物品清单里`);
  }
  const min = Math.min(...cells);
  console.log(`${screen.name.padEnd(18)} 画布 ${String(screen.canvas).padStart(3)}  棋盘格最小 ${min.toFixed(1)} CSS px  物品栏 ${phone ? '手机稿' : '原稿'}`);
}

console.log('\n网格规格分布:', JSON.stringify(seen));
console.log('物品栏形态:', JSON.stringify(trayShape));
console.log('单关最多物品数:', maxItems);
console.log('几何问题:', issues.length);
for (const s of issues) console.log('  -', s);
if (!issues.length) console.log('全部关卡几何正常 ✓');
process.exit(issues.length ? 1 : 0);
