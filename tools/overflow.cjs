#!/usr/bin/env node
'use strict';

// 窄视口体检 / 截图。回答两个问题：**会不会横向溢出**，**棋盘在手机上还剩多大**。
//
// 为什么需要它：截图只能看出「右边被切了」，看不出是谁撑破的。这个脚本在若干视口宽度下
// 真实渲染，让浏览器自己报出 scrollWidth 和每个越界元素，把猜测变成数字。
//
// ⚠️ 三个必须绕开的坑，都踩过：
//
//   1. **无头 Chrome 的 `--window-size` 有 500px 下限。** 直接开 390 的窗口，它按 500 排版
//      再把截图裁到 390 —— 看上去像页面溢出，其实是被裁了（第一版就是这么误报的）。
//      所以这里用 **iframe 造真实窄视口**：iframe 内部的媒体查询按 iframe 自己的宽度算。
//      代价是 file:// 在 Chrome 里算不透明源，必须加 `--allow-file-access-from-files`。
//
//   2. **不能等 iframe 的 `load` 事件。** 如果 iframe 在脚本挂上监听前就加载完了，事件
//      永远不再触发，测量悬在那里，最后回传空结果 —— 而空结果最容易被当成「没问题」。
//      改成在**父页面的 `load`** 里同步测量：父页面的 load 本来就要等所有子 frame 加载完。
//
//   3. **不要把十几个 iframe 放在同一页。** 游戏有常驻的 requestAnimationFrame 渲染循环，
//      十几个实例同时跑会让 Chrome 的虚拟时间推不动，`--dump-dom` 拍到的 `<pre>` 是空的。
//      改成**一个宽度一个探针页**，逐次启动。
//
// 用法：
//   node tools/overflow.cjs                 量一组默认宽度
//   node tools/overflow.cjs 390 430         只量这几个宽度
//   node tools/overflow.cjs --shot 390 430  另存窄视口截图到 tools/shots/vp-<宽>.png

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.PROBE_ROOT ? path.resolve(process.env.PROBE_ROOT) : path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 回传不走「特殊标记 + indexOf」。原因：标记字符串本身也会出现在注入脚本的源码里，
// --dump-dom 把 <script> 的原样打出来，于是 lastIndexOf 会匹配到脚本而不是 <pre>，
// 解析出来的是半截 JS 代码 —— 而且这种错误很容易被当成「格式不对」而不是「工具坏了」。
// 直接正则取 <pre id="probe-out"> 的内容最稳。
const OUT_ID = 'probe-out';
const unescapeHtml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const DEFAULT_WIDTHS = [320, 360, 375, 390, 414, 430, 540, 650, 760, 900, 1024, 1280];
const FRAME_H = 844;

const FLAGS = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
];

const url = p => 'file:///' + p.replace(/\\/g, '/');
const run = args => execFileSync(CHROME, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 128 * 1024 * 1024,
});

// 一个宽度一个探针页，在父页面 load 里同步测量 iframe 内部。
function buildProbePage(width) {
  const html = `<!doctype html><meta charset="utf-8"><title>probe ${width}</title>
<body style="margin:0">
<pre id="${OUT_ID}"></pre>
<script>
const lines = [];
const f = document.createElement('iframe');
f.style.cssText = 'width:${width}px;height:${FRAME_H}px;border:0';
f.onload = () => {
  try {
    const doc = f.contentDocument;
    if (!doc) throw new Error('读不到 iframe 内部（--allow-file-access-from-files 没生效？）');
    const de = doc.documentElement;
    const vw = de.clientWidth;
    const over = [];
    for (const el of doc.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 0.5) {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? '#' + el.id : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\\s+/)[0] : '';
        over.push({ dx: Math.round(r.right - vw), sel: tag + id + cls, w: Math.round(r.width) });
      }
    }
    over.sort((a, b) => b.dx - a.dx);
    const cv = doc.getElementById('game');
    // 棋盘格 / 箱子格在屏幕上到底多大：画布是等比缩放的，宽度数字本身说明不了问题，
    // 得乘上「CSS 宽 ÷ 逻辑宽」。GameDebug 只在 ?test=1 时挂上，所以 iframe 用带参数的地址。
    let cell = null, tile = null, phone = null;
    try {
      const L = doc.defaultView.GameDebug && doc.defaultView.GameDebug.layout();
      if (L && cv) {
        const s = cv.getBoundingClientRect().width / L.VW;
        cell = Math.round(L.rect.cell * s * 10) / 10;
        tile = Math.round(L.tray.tw * s * 10) / 10;
        phone = L.phone ? 1 : 0;
      }
    } catch { /* 量不到就算了，不影响溢出结论 */ }
    lines.push('width=${width} client=' + vw + ' scroll=' + de.scrollWidth
      + ' board=' + (cv ? Math.round(cv.getBoundingClientRect().width) : 'null')
      + ' cell=' + cell + ' tile=' + tile + ' phone=' + phone
      + ' n=' + over.length);
    for (const o of over.slice(0, 6)) lines.push('  +' + o.dx + 'px w=' + o.w + ' ' + o.sel);
  } catch (e) {
    lines.push('width=${width} client=null scroll=null board=null cell=null tile=null phone=null n=0 ERR=' + (e && e.message));
  }
  document.getElementById('${OUT_ID}').textContent = lines.join('\\n');
};
f.src = '${url(path.join(ROOT, 'index.html'))}?test=1&consent=yes';
document.body.appendChild(f);
</script>
</body>`;
  const p = path.join(__dirname, `_probe-${width}.html`);
  fs.writeFileSync(p, html);
  return p;
}

function buildShotPage(width) {
  const html = `<!doctype html><meta charset="utf-8"><title>shot ${width}</title>
<body style="margin:0;background:#9a9a9a">
<iframe src="${url(path.join(ROOT, 'index.html'))}"
        style="width:${width}px;height:${FRAME_H}px;border:0;display:block"></iframe>
</body>`;
  const p = path.join(__dirname, `_viewport-${width}.html`);
  fs.writeFileSync(p, html);
  return p;
}

function measure(width, keep) {
  const probe = buildProbePage(width);
  let dom;
  try {
    // 这里**不能**加 --virtual-time-budget。iframe 里跑着游戏的 requestAnimationFrame 渲染循环，
    // 它会把虚拟时间飞快耗尽，预算一到期 Chrome 就 dump —— 而那时父页面的 load 还没触发，
    // <pre> 是空的。不加这个参数时 --dump-dom 会老老实实等到 load。
    dom = run([...FLAGS, '--window-size=1400,1000', '--dump-dom', url(probe)]);
  } catch (e) {
    return { width, err: '启动 Chrome 失败：' + String(e.message || e).slice(0, 80) };
  }
  if (keep) fs.writeFileSync(path.join(__dirname, `_dump-${width}.html`), dom);
  else { try { fs.unlinkSync(probe); } catch { } }

  const pre = dom.match(new RegExp('<pre id="' + OUT_ID + '">([\\s\\S]*?)<\\/pre>'));
  if (!pre) return { width, err: 'dump 里找不到 <pre id="' + OUT_ID + '">（加 --keep 保留 dump 排查）' };
  const body = unescapeHtml(pre[1]).trim();
  if (!body) return { width, err: '探针回传是空的（load 没触发或内部抛错，加 --keep 排查）' };
  const m = body.match(/^width=(\d+) client=(-?\d+|null) scroll=(-?\d+|null) board=(-?\d+|null) cell=([\d.]+|null) tile=([\d.]+|null) phone=(\d|null) n=(\d+)(?: ERR=(.*))?$/m);
  if (!m) return { width, err: '回传格式不认识：' + JSON.stringify(body.slice(0, 100)) };
  const offenders = body.split('\n').filter(l => l.trim().startsWith('+')).map(l => l.trim());
  const client = m[2] === 'null' ? null : +m[2];
  const scroll = m[3] === 'null' ? null : +m[3];
  const board = m[4] === 'null' ? null : +m[4];
  const num = v => (v === 'null' ? null : +v);
  if (client === null || scroll === null) return { width, err: m[9] || '缺少测量值' };
  return {
    width, client, scroll, board, over: scroll - client, offenders,
    cell: num(m[5]), tile: num(m[6]), phone: m[7] === 'null' ? null : m[7] === '1', err: null,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const keep = argv.includes('--keep');
  const shotMode = argv.includes('--shot');
  const widths = argv.filter(a => /^\d+$/.test(a)).map(Number);
  const list = widths.length ? widths : DEFAULT_WIDTHS;

  if (shotMode) {
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const w of list) {
      const page = buildShotPage(w);
      const out = path.join(SHOTS, `vp-${w}.png`);
      // 窗口有 500 下限，所以窗口取 max(500, w+2)，画面里左侧就是 w 宽的 iframe。
      run([...FLAGS, '--virtual-time-budget=5000', `--window-size=${Math.max(500, w + 2)},${FRAME_H + 2}`, `--screenshot=${out}`, url(page)]);
      const buf = fs.readFileSync(out);
      console.log(`  ${('vp-' + w + '.png').padEnd(15)} ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}  ${(buf.length / 1024).toFixed(0)}KB`);
      try { fs.unlinkSync(page); } catch { }
    }
    return;
  }

  console.log('窄视口体检（iframe 造真实视口，无头 Chrome 实测）');
  console.log('');
  console.log('  视口    client  文档宽  画布宽  棋盘格  箱子格  版式   结论');
  console.log('  ' + '-'.repeat(88));

  let bad = 0, fail = 0, small = 0;
  for (const w of list) {
    const r = measure(w, keep);
    if (r.err) { fail++; console.log('  ' + String(w).padEnd(7) + '测量失败  ' + r.err); continue; }
    if (r.over > 0) bad++;
    // 棋盘格小于 40 CSS px 就只能用指尖尖去点，算「太小」；这是这轮改版最关心的指标。
    // 但只在**手机版式**下这么判：宽屏走原设计稿，它的取舍是「一屏看全、不滚动」，
    // 桌面窗口越矮画布越窄、格子越小是这个稿子的固有代价（改版前就是这个口径，本轮没动）。
    const tiny = r.phone === true && r.cell !== null && r.cell < 40;
    if (tiny) small++;
    console.log('  ' + String(w).padEnd(7) + String(r.client).padEnd(9) + String(r.scroll).padEnd(8)
      + String(r.board).padEnd(8) + String(r.cell ?? '-').padEnd(8) + String(r.tile ?? '-').padEnd(8)
      + (r.phone === null ? '-' : r.phone ? '手机' : '宽屏').padEnd(6)
      + (r.over > 0 ? '✗ 溢出 ' + r.over + 'px' : tiny ? '△ 棋盘格仅 ' + r.cell + 'px' : '✓'));
    for (const o of r.offenders) console.log('        ' + ''.padEnd(33) + o);
  }

  console.log('');
  if (fail) { console.log(`${fail} 个视口测量失败 —— 剔除，不计入通过。`); process.exitCode = 1; }
  if (bad) { console.log(`${bad} 个视口存在横向溢出。`); process.exitCode = 1; }
  if (small) console.log(`${small} 个窄屏视口的棋盘格小于 40 CSS px（这些宽度下点击偏吃力）。`);
  if (!bad && !fail && !small) console.log('所有视口均无横向溢出，窄屏的棋盘格都在可点范围 ✓');
}

main();
