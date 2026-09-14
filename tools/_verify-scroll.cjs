// 真实浏览器验收「画布上的手势」——用 CDP 派发**真触摸事件**，不是页面里造 PointerEvent。
//
// 为什么必须真浏览器：这一组要回答的问题正是「手指在画布上滑，页面到底动不动」。
// 假 DOM 里 window.scrollBy 是我们自己的桩，永远会「成功」；只有真 Chrome 里
// 真的发生了一次滚动（scrollY 真的变大、文档真的比一屏高），才能证明修好了。
// 画布挂 touch-action:none（不挂的话拖物品会被浏览器抢走），所以页面自己不会滚——
// 滚动完全由 game.js 在「直接划过去」这条路上手动 scrollBy 完成，这一组就守它。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const PORT = 9343;

const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label}  → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};
const ok = (label, cond) => check(label, !!cond, true);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-scroll-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  const client = await new cdp.Cdp(PORT).connect();
  const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async name => {
    const r = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
  };
  // 真触摸：CDP 的 Input.dispatchTouchEvent。坐标是视口内的 CSS px。
  const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const allErrs = [];
  // 错误钩子每次导航后重装一次（不同文档是新的 window）。
  const installErrs = () => client.eval(`window.__errs=window.__errs||[];if(!window.__errsHooked){window.__errsHooked=1;window.addEventListener('error',e=>window.__errs.push(String(e.message)))};0`);
  const readErrs = async () => (await client.eval(`window.__errs||[]`)) || [];
  // 把画布滚到视口顶部：画布比一屏高，旧物箱在画布最下面，不滚过去的话
  // 手指会落在视口外——那时滚页面的是浏览器原生行为，测出来的不是我们要守的东西。
  const canvasToTop = async () => {
    await client.eval(`document.getElementById('game').scrollIntoView({block:'start'})`);
    await wait(350);
    return client.eval(`Math.round(scrollY)`);
  };
  // 手指落点必须在视口里，否则这条测试不成立。
  const inView = async (points, label) => {
    const v = await client.eval(`({w:innerWidth,h:innerHeight})`);
    for (const [name, p] of Object.entries(points)) {
      ok(`${label}：${name} 落在视口内（${Math.round(p.x)},${Math.round(p.y)} / ${v.w}×${v.h}）`,
        p.x >= 0 && p.x <= v.w && p.y >= 0 && p.y <= v.h - 8);
    }
  };

  try {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 2, mobile: true });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await client.goto(base + '?consent=yes&test=1');
    await installErrs();
    await wait(700);

    // ── 依次解锁：全新存档下默认只开第一关，锁着的那几关点不动、而且写明了原因 ──
    // （这一条要放在挑关卡之前：挑关卡会直接调 GameDebug.load 跳关。）
    const locks = await client.eval(`(()=>{const bs=[...document.querySelectorAll('.level-button')];
      const locked=bs.filter(b=>b.getAttribute('aria-disabled')==='true');
      const tick=i=>bs[i]?bs[i].querySelector('.tick').textContent:null;
      const label=i=>bs[i]?bs[i].querySelector('.level-name').textContent:null;
      return {level:GameDebug.levelId(),total:bs.length,lockedCount:locked.length,
        firstTick:tick(0),secondTick:tick(1),secondLabel:label(1),
        secondDisabled:bs[1]?bs[1].disabled:null,limit:GameDebug.unlock.limit(),
        at0:GameDebug.unlock.at(0),at1:GameDebug.unlock.at(1)}})()`);
    console.log('   委托簿：', JSON.stringify(locks));
    check('1) 全新存档停在第一关', locks.level, 'drawer-1');
    check('1) 只有第一关是开着的', [locks.at0, locks.at1], [true, false]);
    check('1) 锁着的关卡写着「锁」', locks.secondTick, '锁');
    ok('1) 第一关没有「锁」字样', locks.firstTick !== '锁');
    check('1) 没用 disabled（否则点了连反馈都没有）', locks.secondDisabled, false);
    ok(`1) 99 关锁着、第 1 关开着（共 ${locks.total} 关）`, locks.lockedCount === locks.total - 1);
    await client.eval(`document.querySelectorAll('.level-button')[1].click()`);
    await wait(250);
    const lockedTry = await client.eval(`(()=>({level:GameDebug.levelId(),status:document.getElementById('status').textContent}))()`);
    check('1) 点锁着的关卡不会跳过去', lockedTry.level, 'drawer-1');
    ok('1) 并且会说明「整理完才会打开」', /整理完/.test(lockedTry.status));
    console.log('   锁着时点的反馈：', JSON.stringify(lockedTry.status));
    await shot('scroll-00-依次解锁.png');

    // ── 挑一关「手机版式下一张画布确实比一屏高」的关，而不是写死关卡号 ──
    // （顺带也确认 100 关的版式都能算出来，没有哪一关把 resize 算崩。）
    const tallest = await client.eval(`(()=>{let best=0,bestH=0;
      for(let i=0;i<window.Keepsake.levels.length;i++){GameDebug.load(i);
        const h=document.getElementById('game').getBoundingClientRect().height;
        if(h>bestH){bestH=h;best=i;}}
      GameDebug.load(best);
      return {index:best,id:window.Keepsake.levels[best].id,canvasH:Math.round(bestH)}})()`);
    await wait(400);
    console.log('   挑中的关卡：', JSON.stringify(tallest));

    const setup = await client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      return {level:GameDebug.levelId(),phone:L.phone,canvasH:Math.round(r.height),viewH:innerHeight,
        docH:document.documentElement.scrollHeight,touchAction:getComputedStyle(c).touchAction,
        scrollY:Math.round(scrollY)}})()`);
    console.log('   前提：', JSON.stringify(setup));
    check('2) 停在画布最高的那一关', setup.level, tallest.id);
    ok('2) 用的是手机版式', setup.phone);
    ok(`2) 画布（${setup.canvasH}px）确实比一屏（${setup.viewH}px）高`, setup.canvasH > setup.viewH);
    ok(`2) 页面本身能滚（文档 ${setup.docH}px > 视口 ${setup.viewH}px）`, setup.docH > setup.viewH + 40);
    check('2) 画布挂着 touch-action:none（所以浏览器不会替我们滚）', setup.touchAction, 'none');

    const swipe = async (from, to, { hold = 0, steps = 6 } = {}) => {
      await touch('touchStart', [{ x: from.x, y: from.y }]);
      if (hold) await wait(hold);
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }]);
        await wait(18);
      }
      await touch('touchEnd', []);
    };
    // 画布内的坐标换算：逻辑坐标 → 视口 CSS px。
    const pointIn = (expr, extra = '') => client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      const s=r.width/L.VW,st=GameDebug.getState(),K=window.Keepsake,l=K.byId(GameDebug.levelId());
      const px=x=>r.left+x*s,py=y=>r.top+y*s;${extra}
      return {${expr}}})()`);

    // ── 在旧物箱上直接划过去：页面必须真的滚 ──
    await canvasToTop();
    const trayPoint = await pointIn(`x:px(t.x+t.w/2),y:py(t.y+t.h/2),id`,
      `const id=l.items.find(i=>!st.placed[i]&&!st.locked.includes(i));const t=GameDebug.tileRect(l.items.indexOf(id));`);
    await inView({ 旧物箱: trayPoint }, '3)');
    // 比的是「这一划让页面多滚了多少」，不是绝对值——canvasToTop() 已经把页面滚下来了，
    // 拿绝对值去比的话，哪怕这一划完全没生效也会「通过」。
    const before3 = await client.eval(`Math.round(scrollY)`);
    await swipe(trayPoint, { x: trayPoint.x, y: trayPoint.y - 90 });
    const afterSwipe = await client.eval(`(()=>{const st=GameDebug.getState();
      return {scrollY:Math.round(scrollY),selected:st.selected,placed:Object.keys(st.placed).length}})()`);
    console.log(`   划完：${before3} → ${afterSwipe.scrollY}`);
    ok(`3) 在旧物箱上划过去，页面真的滚了（多滚了 ${afterSwipe.scrollY - before3}px）`, afterSwipe.scrollY - before3 >= 40);
    check('3) 滚动不该顺手选中物品', afterSwipe.selected, null);
    check('3) 更不能把物品放到别处去', afterSwipe.placed, 0);
    await shot('scroll-01-划过旧物箱.png');

    // ── 在棋盘空白处划过去：同样滚 ──
    await canvasToTop();
    const boardPoint = await pointIn(`x:px(b.x+4),y:py(b.y+6)`, `const b=st.board;`);
    await inView({ 棋盘: boardPoint }, '4)');
    const before2 = await client.eval(`Math.round(scrollY)`);
    await swipe(boardPoint, { x: boardPoint.x, y: boardPoint.y - 90 });
    const after2 = await client.eval(`Math.round(scrollY)`);
    ok(`4) 在棋盘空白处划过去也能滚（${before2} → ${after2}）`, after2 > before2 + 30);

    // ── 按住再拖：搬东西，页面一动不动 ──
    // 旧物箱在画布最下面、棋盘在最上面，两者要同时在视口里才谈得上「拖」——
    // 把画布顶对齐视口顶就正好：画布只比一屏高一点，棋盘和箱子都能看见。
    await canvasToTop();
    const drag = await pointIn(`id,spot,g,from:{x:px(t.x+t.w/2),y:py(t.y+t.h/2)},to:{x:px(bd.x+(spot.x+g.x+.5)*bd.cell),y:py(bd.y+(spot.y+g.y+.5)*bd.cell)}`,
      `const id=l.items.find(i=>!st.placed[i]&&!st.locked.includes(i));const t=GameDebug.tileRect(l.items.indexOf(id));
       const bb=K.bounds(K.shape(id,st.rotations[id]||0)),g={x:Math.floor(bb.w/2),y:Math.floor(bb.h/2)};
       const bd=st.board;const H=innerHeight,W=innerWidth;let spot=null;
       const okHere=(x,y)=>{const d={x:px(bd.x+(x+g.x+.5)*bd.cell),y:py(bd.y+(y+g.y+.5)*bd.cell)};
         return d.x>=4&&d.x<=W-4&&d.y>=4&&d.y<=H-12;};
       for(let y=0;y<l.rows&&!spot;y++)for(let x=0;x<l.cols&&!spot;x++)
         if(K.canPlace(l,st.placed,id,x,y,0)&&x+g.x<l.cols&&y+g.y<l.rows&&okHere(x,y)) spot={x,y};`);
    console.log('   拖拽计划：', JSON.stringify(drag));
    await inView({ 抓取点: drag.from, 落点: drag.to }, '5)');
    ok('5) 找到了一处「棋盘与落点都在视口里」的落点', !!drag.spot);
    // 判据是「手势期间滚动量不变」，不是「scrollY 恒为 0」——画布比一屏高，
    // 测试自己也得先滚到能看到旧物箱的位置，此时 scrollY 本来就不是 0。
    const base5 = await client.eval(`Math.round(scrollY)`);
    // 分步走，好在「按住之后、抬手之前」看一眼中途状态。
    await touch('touchStart', [{ x: drag.from.x, y: drag.from.y }]);
    await wait(260);                                  // 走完「按住 130ms」
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [{ x: drag.from.x + (drag.to.x - drag.from.x) * i / 8, y: drag.from.y + (drag.to.y - drag.from.y) * i / 8 }]);
      await wait(18);
    }
    const mid = await client.eval(`(()=>{const st=GameDebug.getState();
      return {moving:!!(st.drag&&st.drag.moving),ghost:st.ghost,scrollY:Math.round(scrollY)}})()`);
    await touch('touchEnd', []);
    const afterDrag = await client.eval(`(()=>{const st=GameDebug.getState();return {scrollY:Math.round(scrollY),
      placed:st.placed[${JSON.stringify(drag.id)}]||null,drag:st.drag,ghost:st.ghost,
      status:document.getElementById('status').textContent}})()`);
    console.log('   中途：', JSON.stringify(mid));
    console.log('   拖完：', JSON.stringify(afterDrag));
    ok('6) 按住之后确实进入了拖拽（ghost 跟着手指）', mid.moving && !!mid.ghost);
    check('6) 拖拽过程中页面一动不动', mid.scrollY - base5, 0);
    check('6) 抬手后页面也不该滚动', afterDrag.scrollY - base5, 0);
    ok('6) 旧物真的落在预定的那一格', afterDrag.placed && afterDrag.placed.x === drag.spot.x && afterDrag.placed.y === drag.spot.y);
    check('6) 手指抬起后拖拽要收干净（没有留下 ghost）', [afterDrag.drag, afterDrag.ghost], [null, null]);
    await shot('scroll-02-拖放后.png');

    // ── 轻点选中、再点空格放下：全程不滚动 ──
    await canvasToTop();
    const tapPlan = await pointIn(`id,spot,from:{x:px(t.x+t.w/2),y:py(t.y+t.h/2)},to:{x:px(bd.x+(spot.x+.5)*bd.cell),y:py(bd.y+(spot.y+.5)*bd.cell)}`,
      `const id=l.items.find(i=>!st.placed[i]&&!st.locked.includes(i));const t=GameDebug.tileRect(l.items.indexOf(id));
       const bd=st.board;const W=innerWidth;let spot=null;
       for(let y=0;y<l.rows&&!spot;y++)for(let x=0;x<l.cols&&!spot;x++)
         if(K.canPlace(l,st.placed,id,x,y,0)&&px(bd.x+(x+.5)*bd.cell)<=W-4) spot={x,y};`);
    const tapAt = async p => { await touch('touchStart', [{ x: p.x, y: p.y }]); await wait(40); await touch('touchEnd', []); };
    await inView({ 旧物箱: tapPlan.from, 落点: tapPlan.to }, '7)');
    const base7 = await client.eval(`Math.round(scrollY)`);
    await tapAt(tapPlan.from);
    const picked = await client.eval(`GameDebug.getState().selected`);
    await tapAt(tapPlan.to);
    const afterTap = await client.eval(`(()=>{const st=GameDebug.getState();return {scrollY:Math.round(scrollY),
      placed:st.placed[${JSON.stringify(tapPlan.id)}]||null}})()`);
    check('7) 轻点一下是选中', picked, tapPlan.id);
    ok('7) 再点空格就放下', afterTap.placed && afterTap.placed.x === tapPlan.spot.x);
    check('7) 轻点全程不滚动', afterTap.scrollY - base7, 0);

    allErrs.push(...await readErrs());

    // ── 鼠标：桌面视口下行为必须一个字不改 ──
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.goto(base + '?consent=yes&test=1&unlock=all&level=1');
    await installErrs();
    await wait(600);
    const mouse = await client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      const s=r.width/L.VW,st=GameDebug.getState(),K=window.Keepsake,l=K.byId(GameDebug.levelId());
      const id=l.items.find(i=>!st.placed[i]&&!st.locked.includes(i));
      const t=GameDebug.tileRect(l.items.indexOf(id));
      const b=K.bounds(K.shape(id,st.rotations[id]||0)),g={x:Math.floor(b.w/2),y:Math.floor(b.h/2)};
      let spot=null;
      for(let y=0;y<l.rows&&!spot;y++)for(let x=0;x<l.cols&&!spot;x++)
        if(K.canPlace(l,st.placed,id,x,y,0)&&x+g.x<l.cols&&y+g.y<l.rows) spot={x,y};
      const bd=st.board,px=x=>r.left+x*s,py=y=>r.top+y*s;
      return {id,spot,phone:L.phone,VW:L.VW,
        from:{x:px(t.x+t.w/2),y:py(t.y+t.h/2)},
        to:{x:px(bd.x+(spot.x+g.x+.5)*bd.cell),y:py(bd.y+(spot.y+g.y+.5)*bd.cell)}}})()`);
    const mouseAt = (type, p, buttons) => client.send('Input.dispatchMouseEvent', {
      type, x: p.x, y: p.y, button: 'left', buttons, clickCount: type === 'mousePressed' ? 1 : 0,
    });
    await mouseAt('mousePressed', mouse.from, 1);
    for (let i = 1; i <= 6; i++) {
      await mouseAt('mouseMoved', { x: mouse.from.x + (mouse.to.x - mouse.from.x) * i / 6, y: mouse.from.y + (mouse.to.y - mouse.from.y) * i / 6 }, 1);
      await wait(20);
    }
    await mouseAt('mouseReleased', mouse.to, 0);
    const afterMouse = await client.eval(`(()=>{const st=GameDebug.getState();return {scrollY:Math.round(scrollY),
      placed:st.placed[${JSON.stringify(mouse.id)}]||null,phone:GameDebug.layout().phone}})()`);
    console.log('   鼠标拖完：', JSON.stringify(afterMouse), '期望落在', JSON.stringify(mouse.spot));
    ok('8) 桌面视口仍是原设计稿', !afterMouse.phone && !mouse.phone && mouse.VW === 640);
    ok('8) 鼠标按下即拖，不需要先按住', afterMouse.placed && afterMouse.placed.x === mouse.spot.x && afterMouse.placed.y === mouse.spot.y);
    check('8) 鼠标不动页面滚动', afterMouse.scrollY, 0);
    await shot('scroll-03-鼠标拖后.png');

    allErrs.push(...await readErrs());
    check('9) 全程无 JS 报错', allErrs, []);

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
