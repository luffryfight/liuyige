#!/usr/bin/env node
'use strict';

// 版式对照表。回答一个问题：**同一个游戏，在不同尺寸的屏幕/窗口上，棋盘和物品栏各是多大。**
//
// 为什么需要它：改版式（改 breakpoint、改 pad/gap/minTile、改 W 的钳制）时，光跑单测只能
// 知道「没越界」，看不出「曲线是不是单调」。手机版式和原设计稿是两套稿，接缝处（视口 650）
// 必然有一次跳变，这个脚本把跳变幅度直接量出来，免得凭感觉判断「差不太多」。
//
// 数字全部问 game.js 要（走 tests/harness.cjs → GameDebug.layout()），不在这里另抄一份公式，
// 所以不会出现「工具说没问题、游戏里其实不是这样」。
//
// 用法:
//   node tools/layout-sweep.cjs              # 默认那组设备
//   node tools/layout-sweep.cjs 1280x800     # 只量指定视口（宽x高，可给多个）

const { game } = require('../tests/harness.cjs');

// 关卡挑最挤的一类：18 件、6 行盘面（后段委托都是这个密度）。
const LEVEL = 'drawer-78';

// 视口宽高按真实设备/窗口取；画布宽度按 style.css 的规则反推：
//   窄屏（≤650）：.layout 左右各留 12，画布就是满宽 → vw - 24；
//   宽屏（≥651）：canvas-wrap 有 max-width:min(100%,max(400px,100dvh - 350px))，
//                于是画布宽度在宽视口下只跟**窗口高度**有关——「桌面矮窗口画布被压窄」就是这么来的。
const CSS_PAD = 24, MIN_CANVAS = 400, CHROME = 350;
const canvasOf = (vw, vh) => vw <= 650
  ? vw - CSS_PAD
  : Math.round(Math.min(vw - CSS_PAD, Math.max(MIN_CANVAS, vh - CHROME)));

const DEVICES = [
  ['小屏手机 320×568', 320, 568],
  ['手机 360×640', 360, 640],
  ['手机 390×844', 390, 844],
  ['大屏手机 430×932', 430, 932],
  ['竖着的小平板 540×960', 540, 960],
  ['折叠屏展开 650×900', 650, 900],
  ['桌面 660×900（刚过断点）', 660, 900],
  ['桌面 1024×768', 1024, 768],
  ['桌面 1280×800', 1280, 800],
  ['桌面 1280×900', 1280, 900],
  ['桌面 1440×900', 1440, 900],
  ['桌面 1440×1200', 1440, 1200],
  ['桌面 1920×1080', 1920, 1080],
];

const parse = arg => {
  const m = /^(\d+)x(\d+)$/.exec(arg);
  if (!m) throw new Error(`看不懂的视口「${arg}」，应该是 1280x800 这种写法`);
  return [`指定 ${arg}`, Number(m[1]), Number(m[2])];
};

const args = process.argv.slice(2);
const devices = args.length ? args.map(parse) : DEVICES;

const h = game();
h.debug.loadId(LEVEL);

// 逻辑尺寸 → 屏幕上实际占多少 CSS px（两套稿的逻辑宽不一样，只能这样比）。
const px = (logical, L, cssW) => logical * cssW / L.VW;

const rows = [];
let prev = null;
for (const [label, vw, vh] of devices) {
  const canvas = canvasOf(vw, vh);
  h.setViewport(vw, canvas);
  const L = h.debug.layout();
  const scale = canvas / L.VW;
  const row = {
    label,
    vw,
    canvas,
    mode: L.phone ? '手机' : '原稿',
    scale,
    cell: px(L.rect.cell, L, canvas),
    cols: L.tray.cols,
    trayRows: L.tray.rows,
    tile: px(L.tray.tw, L, canvas),
    height: Math.round(L.VH * scale),
    // 物品栏最后一排的屏幕位置，越过程序底部就是「要滚动才够得着」。
    trayBottom: Math.round((L.tray.y + (L.tray.rows - 1) * L.tray.pitch + L.tray.tileH) * scale),
    // 容器还留多少（负 = 画布比容器宽，会横向溢出）。
    room: (vw - CSS_PAD) - canvas,
    // 画布比窗口高多少（原稿的目标是一屏排完，手机页面本来就要滚，所以只看原稿那几行）。
    scroll: Math.round(L.VH * scale) - vh,
  };
  rows.push(row);
  if (prev && prev.mode !== row.mode) {
    // 接缝处：两套稿的棋盘格在屏幕上差多少。
    row.jump = row.cell / prev.cell;
  }
  prev = row;
}

const f = n => n.toFixed(1).padStart(6);
console.log(`关卡 ${LEVEL}（6×6 盘面、18 件旧物）\n`);
console.log('视口                画布  版式  缩放   棋盘格   箱子格  物品栏    画布高  画布高-窗口  横向余量');
console.log('─'.repeat(96));
for (const r of rows) {
  // 「画布高-窗口」只对原稿有意义：原稿的卖点是一屏排完；手机页面本来就是滚动文档。
  const roll = r.mode === '原稿' && r.scroll > 0 ? ' 要滚 ←' : '';
  const flag = r.room < 0 ? ' 横向溢出 ←' : '';
  console.log(
    `${r.label.padEnd(20)} ${String(r.canvas).padStart(4)}  ${r.mode}  ${r.scale.toFixed(2)}  ${f(r.cell)}  ${f(r.tile)}  ` +
    `${String(r.cols + '列' + r.trayRows + '行').padEnd(8)} ${String(r.height).padStart(6)}  ${String(r.scroll).padStart(10)}  ` +
    `${String(r.room).padStart(8)}${roll}${flag}`
  );
}

console.log('\n接缝（两套稿切换处）:');
const seams = rows.filter(r => r.jump);
if (!seams.length) console.log('  本次采样没跨过断点，看不出接缝。');
for (const r of seams) {
  console.log(`  视口 ${r.vw} → 棋盘格从 ${r.jump > 1 ? '小变大' : '大变小'} ${(r.jump * 100).toFixed(0)}%（${r.label}）`);
}
console.log('  断点和 style.css 的媒体查询同为视口 650，切换时整页的排布（按钮分排、游戏区提前）' +
  '一起变，所以屏幕上的这次跳变是「整页换模式」，不是画布单独抽风。');

const problems = [];
for (const r of rows) {
  if (r.room < 0) problems.push(`${r.label}：画布比容器宽 ${-r.room}px，会横向溢出`);
  if (r.mode === '手机' && r.cell < 40) problems.push(`${r.label}：手机版式棋盘格只有 ${r.cell.toFixed(1)} CSS px，偏小`);
  if (r.mode === '原稿' && r.scroll > 0) problems.push(`${r.label}：原稿画布比窗口高 ${r.scroll}px，桌面不该出现滚动`);
}
console.log('\n问题:', problems.length);
for (const p of problems) console.log('  -', p);
if (!problems.length) console.log('  视口档位全部正常 ✓');
process.exit(problems.length ? 1 : 0);
