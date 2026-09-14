// 真实浏览器验收「手机版式」。
// 假 DOM 能核对几何数字，但「按钮在手机上真的在两排吗」「棋盘到底占多少像素」
// 「有没有横向溢出」只有真浏览器算数。这里用 CDP 的手机视口跑一遍。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const PORT = 9341;

const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label}  → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};
const ok = (label, cond) => check(label, !!cond, true);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-mobile-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  const client = await new cdp.Cdp(PORT).connect();
  const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  const wait = ms => new Promise((r) => setTimeout(r, ms));
  const shot = async name => {
    const r = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
  };
  // 量一个元素的盒子（CSS px）
  const box = sel => client.eval(`(()=>{const e=document.querySelector('${sel}');if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})()`);

  try {
    // ── 手机视口：iPhone 12/13 一档 ──
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.goto(base + '?consent=yes&test=1&level=78');
    await client.eval(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));
      window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection:'+String(e.reason)))`);
    await wait(700);

    check('1) 进入第 11 关（6×6、18 件）', await client.eval(`GameDebug.levelId()`), 'drawer-78');
    const phone = await client.eval(`GameDebug.layout().phone`);
    check('2) 手机上切到窄屏版式', phone, true);

    // ── 画布与棋盘的实际像素 ──
    const geo = await client.eval(`(()=>{
      const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      const s=r.width/L.VW;
      return {cssW:Math.round(r.width),cssH:Math.round(r.height),cell:+(L.rect.cell*s).toFixed(1),
        board:Math.round(L.cols*L.rect.cell*s),tile:+(L.tray.tw*s).toFixed(1),
        trayCols:L.tray.cols,trayRows:L.tray.rows,canvasH:Math.round(L.VH*s)};
    })()`);
    console.log('   量到的尺寸：', JSON.stringify(geo));
    ok(`3) 棋盘格 ≥44 CSS px（${geo.cell}）`, geo.cell >= 44);
    ok(`3) 棋盘占画布宽度 ≥75%（${Math.round(geo.board / geo.cssW * 100)}%）`, geo.board / geo.cssW >= 0.75);
    ok(`3) 箱子每格 ≥44 CSS px（${geo.tile}）`, geo.tile >= 44);
    check('3) 箱子每排 4 件、共 5 行', [geo.trayCols, geo.trayRows], [4, 5]);
    ok(`3) 画布没有横向溢出（${geo.cssW} ≤ 366）`, geo.cssW <= 367);

    // ── 操作按钮：分成两排、够大、都在视口里 ──
    const tools = await client.eval(`(()=>{
      const ids=['hint','auto','clear','rotate','return','undo','reset'];
      const b=ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();
        return {id,top:Math.round(r.top),h:Math.round(r.height),w:Math.round(r.width),
          vis:e.offsetParent!==null&&r.width>0&&r.height>0,
          text:(e.querySelector('span')||e).textContent.trim()};});
      return b;
    })()`);
    for (const b of tools) {
      ok(`4) ${b.id} 按钮可见且 ≥44px 高（${b.h}px）`, b.vis && b.h >= 44);
    }
    const rescueTops = tools.slice(0, 3).map(b => b.top);
    const basicTops = tools.slice(3).map(b => b.top);
    ok('4) 上排三个「救援」在同一行', new Set(rescueTops).size === 1);
    ok('4) 下排四个「基础操作」在同一行', new Set(basicTops).size === 1);
    ok('4) 两排高度不同（确实是两排）', rescueTops[0] !== basicTops[0]);
    ok('4) 救援排比基础排更高更显眼', tools[0].h > tools[5].h);
    console.log('   按钮尺寸：', tools.map(b => `${b.id} ${b.w}×${b.h}`).join('  '));

    // ── 手机上游戏区排在委托信/委托簿前面 ──
    const order = await client.eval(`(()=>{const p=document.querySelector('.play-area').getBoundingClientRect();
      const j=document.querySelector('.journal').getBoundingClientRect();
      return {play:Math.round(p.top),journal:Math.round(j.top)}})()`);
    ok('5) 游戏区排在委托簿之前', order.play < order.journal);

    // ── 没有横向滚动条 ──
    const overflow = await client.eval(`document.documentElement.scrollWidth - window.innerWidth`);
    ok(`6) 页面没有横向溢出（多出 ${overflow}px）`, overflow <= 1);

    await shot('mobile-01-18件.png');

    // ── 真交互：先点箱子里的物品、再点棋盘格，物品要真的落上去 ──
    const tap = await client.eval(`(()=>{
      const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      const s=r.width/L.VW;
      const K=window.Keepsake,l=K.byId('drawer-78');
      const id=l.items.find(i=>!GameDebug.getState().placed[i]);
      const q=GameDebug.itemRect(id);
      const tile=GameDebug.tileRect(l.items.indexOf(id));
      const px=x=>r.left+x*s, py=y=>r.top+y*s;
      const fire=(type,x,y)=>c.dispatchEvent(new PointerEvent(type,{pointerId:1,pointerType:'touch',isPrimary:true,
        bubbles:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1}));
      const before=Object.keys(GameDebug.getState().placed).length;
      // 一次完整的「点一下」＝ pointerdown + pointerup。少了 pointerup，拖拽不会结束，
      // 下一次 pointerdown 会被 if(drag)return 直接吃掉。
      fire('pointerdown',px(tile.x+tile.w/2),py(tile.y+tile.h/2));
      fire('pointerup',px(tile.x+tile.w/2),py(tile.y+tile.h/2));
      const selected=GameDebug.getState().selected;
      // 找一个合法落点
      let spot=null;
      for(let y=0;y<l.rows&&!spot;y++)for(let x=0;x<l.cols&&!spot;x++) if(K.canPlace(l,GameDebug.getState().placed,id,x,y,0)) spot={x,y};
      const b=GameDebug.getState().board;
      fire('pointerdown',px(b.x+(spot.x+.5)*b.cell),py(b.y+(spot.y+.5)*b.cell));
      fire('pointerup',px(b.x+(spot.x+.5)*b.cell),py(b.y+(spot.y+.5)*b.cell));
      const after=GameDebug.getState().placed;
      return {selectedId:selected,want:id,placed:!!after[id],before,count:Object.keys(after).length,
        pos:after[id]?{x:after[id].x,y:after[id].y}:null,spot};
    })()`);
    check('7) 点箱子里的物品能选中', tap.selectedId, tap.want);
    ok('7) 再点棋盘格真的放下了', tap.placed && tap.pos && tap.pos.x === tap.spot.x && tap.pos.y === tap.spot.y);
    await wait(300);
    await shot('mobile-02-放下后.png');

    // ── 极端窄屏也别崩 ──
    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
    await wait(500);
    const small = await client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      const s=r.width/L.VW,ids=['hint','auto','clear','rotate','return','undo','reset'];
      return {phone:L.phone,cell:+(L.rect.cell*s).toFixed(1),tile:+(L.tray.tw*s).toFixed(1),
        overflow:document.documentElement.scrollWidth-window.innerWidth,
        small:ids.filter(id=>document.getElementById(id).getBoundingClientRect().height<44)}})()`);
    console.log('   320 宽：', JSON.stringify(small));
    ok('8) 320 宽仍用手机版式', small.phone);
    ok(`8) 320 宽棋盘格 ≥24 CSS px（${small.cell}）`, small.cell >= 24);
    ok(`8) 320 宽箱子格 ≥44 CSS px（${small.tile}）`, small.tile >= 44);
    ok(`8) 320 宽按钮都不低于 44px（${JSON.stringify(small.small)}）`, small.small.length === 0);
    ok(`8) 320 宽没有横向溢出（${small.overflow}px）`, small.overflow <= 1);
    await shot('mobile-03-320宽.png');

    // ── 桌面「矮窗口」：画布被 max-width 压到 450 上下，仍然必须是原设计稿 ──
    // 这一档曾经被「画布窄于 480 就算手机」的兜底误判成手机，于是桌面变成一张比窗口还高的
    // 长画布：棋盘是大了，物品栏掉到屏幕外，拖东西得来回滚。所以单独守一条。
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await wait(500);
    const short = await client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      return {phone:L.phone,VW:L.VW,VH:L.VH,cssW:Math.round(r.width),cssH:Math.round(r.height),
        cell:+(L.rect.cell*r.width/L.VW).toFixed(1),cols:L.tray.cols,rows:L.tray.rows}})()`);
    console.log('   1280×800（矮窗口）：', JSON.stringify(short));
    ok('9) 矮窗口仍是原设计稿，不换成手机稿', !short.phone && short.VW === 640 && short.VH === 640);
    ok(`9) 矮窗口画布没被拉长（${short.cssW}×${short.cssH}，原稿是方的）`, short.cssW === short.cssH);
    check('9) 矮窗口物品栏仍是 6 列 3 行', [short.cols, short.rows], [6, 3]);

    // ── 桌面视口：版式必须还是原来那一套 ──
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await wait(600);
    const desk = await client.eval(`(()=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),L=GameDebug.layout();
      const s=r.width/L.VW;
      return {phone:L.phone,VW:L.VW,VH:L.VH,cell:L.rect.cell,sepY:L.sep.y,cols:L.tray.cols,
        tools:document.querySelector('.tools').getBoundingClientRect().height,
        order:Math.round(document.querySelector('.play-area').getBoundingClientRect().top-document.querySelector('.journal').getBoundingClientRect().top)}})()`);
    console.log('   桌面：', JSON.stringify(desk));
    ok('10) 桌面仍是原设计稿（逻辑 640×640）', desk.VW === 640 && desk.VH === 640 && !desk.phone);
    check('10) 桌面分隔线仍在 y=380', desk.sepY, 380);
    check('10) 桌面 18 件仍是 6 列', desk.cols, 6);
    ok('10) 桌面委托簿仍在游戏区左边（同一行）', desk.order <= 0);
    await shot('mobile-04-桌面.png');

    const errs = await client.eval(`window.__errs`);
    // 「ResizeObserver loop completed with undelivered notifications」是浏览器在
    // 「观察对象的尺寸在回调里被改掉」时给的提示，不是页面报错——画布高度本来就随版式变。
    // 这里只在它出现时提一句，不算失败；其它任何报错都必须为 0。
    const real = errs.filter(e => !/ResizeObserver loop/.test(e));
    if (real.length !== errs.length) console.log(`   （忽略了 ${errs.length - real.length} 条 ResizeObserver 提示，属正常）`);
    check('11) 全程无 JS 报错', real, []);

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
