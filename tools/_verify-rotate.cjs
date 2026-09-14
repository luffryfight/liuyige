// 真实浏览器验收「手机上翻转一件已经放好的旧物」。
//
// 为什么必须真浏览器：这一组要回答的是「手指够不够得着、按下去到底有没有反应」。
// 假 DOM 里元素位置和 CSS 都是空壳——`#rotate-fab` 是不是真的在视口里、是不是真的贴右下角、
// 宽屏下是不是真的被 CSS 藏掉、真手指点上去是不是真的触发一次翻转，只有真 Chrome 能答。
//
// 用 CDP 派发**真触摸事件**（不是页面里造 PointerEvent），所以「连着点两下」走的就是
// 真机那条路：真 touchstart/touchend 让浏览器合成 pointer 事件，再落到 game.js 的判定里。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const PORT = 9345;

const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label}  → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};
const ok = (label, cond) => check(label, !!cond, true);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-rotate-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  const client = await new cdp.Cdp(PORT).connect();
  const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async name => {
    const r = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
  };
  // 真触摸：CDP 的 Input.dispatchTouchEvent。坐标是视口内的 CSS px。
  const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
  // 一次轻点。按住 ~55ms 是真人拍下去再抬起来的手感，也避开「按下即抬起」被判成抖动。
  const tap = async (x, y, hold = 55) => { await touch('touchStart', x, y); await wait(hold); await touch('touchEnd'); await wait(90); };
  const allErrs = [];
  const installErrs = () => client.eval(`window.__errs=window.__errs||[];if(!window.__errsHooked){window.__errsHooked=1;window.addEventListener('error',e=>window.__errs.push(String(e.message)))};0`);
  const readErrs = async () => (await client.eval(`window.__errs||[]`)) || [];
  // 手指落点必须在视口里，否则这条测试根本不成立（滚页面/点元素都轮不到我们）。
  const inView = async (pt, label) => {
    const v = await client.eval(`({w:innerWidth,h:innerHeight})`);
    ok(`${label}：落点在视口内（${Math.round(pt.x)},${Math.round(pt.y)} / ${v.w}×${v.h}）`,
      pt.x >= 0 && pt.x <= v.w && pt.y >= 0 && pt.y <= v.h - 4);
  };
  // 画布上任意一格的中心，换算成视口里的 CSS 坐标。
  // 注意 b.x / b.y 已经是逻辑像素，别再乘一次格子尺寸——只有格序号要乘。
  const cellAt = (x, y) => client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
    const s=r.width/L.VW,b=L.rect;
    return {x:r.left+(b.x+(${x}+.5)*b.cell)*s,y:r.top+(b.y+(${y}+.5)*b.cell)*s}})()`);
  // 旧物箱里某件旧物的中心，同样换算。
  const trayAt = id => client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
    const s=r.width/L.VW,q=GameDebug.itemRect(${JSON.stringify(id)});
    return {x:r.left+(q.x+q.w/2)*s,y:r.top+(q.y+q.h/2)*s}})()`);
  const fabRect = () => client.eval(`(()=>{const f=document.getElementById('rotate-fab'),r=f.getBoundingClientRect(),
    st=getComputedStyle(f);return {hidden:f.hidden,display:st.display,position:st.position,
      x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
      right:Math.round(innerWidth-r.right),bottom:Math.round(innerHeight-r.bottom),
      cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
  const snapshot = () => client.eval(`(()=>{const st=GameDebug.getState();return {selected:st.selected,
    tape:st.placed.tape||null,rotTape:st.rotations.tape,moves:st.moves,drag:st.drag,ghost:st.ghost,
    status:document.getElementById('status').textContent}})()`);

  try {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 2, mobile: true });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await client.goto(base + '?consent=yes&test=1');
    await installErrs();
    await wait(700);
    await client.eval(`GameDebug.loadId('drawer-1')`);   // 4×4 空盘面，形状判断不受隔板干扰
    await wait(300);

    // ── 1) 翻转键本身：默认不露面、定位方式对不对 ──
    const idleFab = await fabRect();
    console.log('   没选中时：', JSON.stringify(idleFab));
    check('1) 手机版式下翻转键是 display:none（没选中就不该挡在屏幕上）', idleFab.display, 'none');
    check('1) 用 fixed 定位（跟着视口走，不随画布滚掉）', idleFab.position, 'fixed');

    // ── 2) 选中一件能转的旧物，翻转键就露出来 ──
    const tapePt = await trayAt('tape');
    await inView(tapePt, '2) 旧物箱里的 tape');
    await tap(tapePt.x, tapePt.y);
    const picked = await snapshot();
    check('2) 轻点一下选中了它', picked.selected, 'tape');
    const litFab = await fabRect();
    console.log('   选中后：', JSON.stringify(litFab));
    check('2) 翻转键露出来了', [litFab.hidden, litFab.display], [false, 'flex']);
    ok(`2) 尺寸够拇指点（${litFab.w}×${litFab.h} CSS px，门槛 44）`, litFab.w >= 44 && litFab.h >= 44);
    check('2) 贴在视口右下角（拇指够得着，不随画布滚走）', [litFab.right <= 24, litFab.bottom <= 24], [true, true]);
    ok('2) 它整块都在视口里', litFab.x >= 0 && litFab.y >= 0 && litFab.x + litFab.w <= 390 && litFab.y + litFab.h <= 700);
    await shot('rotate-01-翻转键.png');

    // ── 3) 真手指按翻转键 = 转一下 ──
    await tap(litFab.cx, litFab.cy);
    const afterFab = await snapshot();
    console.log('   按完翻转键：', JSON.stringify(afterFab));
    check('3) 按一下真的把方向转了过来', afterFab.rotTape, 1);
    check('3) 手势状态收得干净（没留下 ghost／drag）', [afterFab.drag, afterFab.ghost], [null, null]);

    // ── 4) 原地转不开的那一下：双击就就近挪位，而不是「点了没反应」 ──
    // tape 是 2×1，横着躺在最后一行 (0,3)，转成竖的就出界——正是玩家会碰到的那种「转不开」。
    await client.eval(`GameDebug.place('tape',0,3,0)`);
    await wait(200);
    const stuckBefore = await snapshot();
    const cell03 = await cellAt(0, 3);
    await inView(cell03, '4) 棋盘最后一行的 (0,3)');
    check('4) 前提：它现在横躺在最后一行', stuckBefore.tape, { x: 0, y: 3, rot: 0 });
    await tap(cell03.x, cell03.y);           // 第一下：选中
    await tap(cell03.x, cell03.y);           // 第二下：转
    const rotated = await snapshot();
    console.log('   双击之后：', JSON.stringify(rotated));
    check('4) 转好了，而且就近挪到了 (0,2)', rotated.tape, { x: 0, y: 2, rot: 1 });
    ok('4) 状态栏说明了它挪过位置', /挪了 1 格/.test(rotated.status));
    await shot('rotate-02-就近翻转.png');

    // ── 5) 两下之间隔太久就不算双击（不然每一次点选都会顺手转一下） ──
    await client.eval(`GameDebug.place('tape',0,0,0)`);
    await wait(200);
    const cell00 = await cellAt(0, 0);
    await tap(cell00.x, cell00.y);
    await wait(600);                          // 远超双击窗口
    await tap(cell00.x, cell00.y);
    const slow = await snapshot();
    console.log('   隔 600ms 点两下：', JSON.stringify(slow));
    check('5) 隔太久就只是选中，方向不动', [slow.selected, slow.tape], ['tape', { x: 0, y: 0, rot: 0 }]);

    // ── 6) 宽屏上不出现（桌面还是只认工具栏和 R 键） ──
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    await wait(400);
    await client.eval(`GameDebug.select('tape')`);
    await wait(200);
    const desktop = await fabRect();
    console.log('   桌面视口：', JSON.stringify(desktop));
    check('6) 宽屏一律藏掉（哪怕选中了）', desktop.display, 'none');
    ok('6) 桌面仍是原设计稿（逻辑宽 640）', (await client.eval(`GameDebug.layout().VW`)) === 640);

    allErrs.push(...await readErrs());
    check('7) 全程无 JS 报错', allErrs, []);

    const failed = results.filter(r => !r.ok);
    console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
    if (failed.length) {
      console.log('未通过：');
      for (const f of failed) console.log('  ★', f.label, '实际', JSON.stringify(f.actual), '期望', JSON.stringify(f.expected));
    }
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.log('验收脚本自己出错了：', e.message);
    process.exitCode = 2;
  } finally {
    try { client.close(); } catch {}
    try { chrome.kill(); } catch {}
  }
})();
