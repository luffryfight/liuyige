// 真实浏览器验收「收纳工作台皮肤」。
//
// 为什么必须真浏览器：这一组要回答三件事，假 DOM 一件都答不了——
//   1. 面板真的能打开、6 张卡真的排出来了（CSS 布局在假 DOM 里是空壳）；
//   2. **台子真的换了个颜色**：直接读画布位图的像素。单测只能验「传给 canvas 的
//      色字符串对不对」，验不到「它是不是真被画上去了、有没有被后面一层盖掉」；
//   3. 换皮肤**不动任何判定**：切换前后摆法、分数逐项一致。
//
// 另外它顺带把六款皮肤各截一张图存进 tools/shots/ —— 观感这块最终还是得靠眼睛，
// 但「六张图是不是真的不一样」可以机器判：任意两张字节相同就说明皮肤没生效。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const PORT = 9346;

const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label}  → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};
const ok = (label, cond) => check(label, !!cond, true);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-skins-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--window-size=760,1500', 'about:blank',
  ], { stdio: 'ignore' });

  const client = await new cdp.Cdp(PORT).connect();
  const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async name => {
    const r = await client.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.data, 'base64');
    fs.writeFileSync(path.join(SHOTS, name), buf);
    return buf;
  };
  // 只截棋盘那块。整页截图里台子只占中间一小条，缩到能一眼比较的大小时
  // 连格线都看不清——「换皮肤到底换了什么」必须看得见才叫验过了。
  const shotCanvas = async name => {
    await client.eval(`document.getElementById('game').scrollIntoView({block:'center'})`);
    await wait(160);
    const clip = await client.eval(`(()=>{const c=document.getElementById('game').getBoundingClientRect();
      return {x:Math.round(c.left),y:Math.round(c.top),width:Math.round(c.width),height:Math.round(c.height)}})()`);
    const r = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
  };
  const allErrs = [];
  const installErrs = () => client.eval(`window.__errs=window.__errs||[];if(!window.__errsHooked){window.__errsHooked=1;window.addEventListener('error',e=>window.__errs.push(String(e.message)))};0`);
  const readErrs = async () => (await client.eval(`window.__errs||[]`)) || [];
  // 画布上某个**逻辑坐标**处的颜色。位图是逻辑尺寸 × scale，所以要先乘缩放比再采样。
  const pixel = (lx, ly) => client.eval(`(()=>{const c=document.getElementById('game'),g=c.getContext('2d');
    const s=c.width/GameDebug.layout().VW;
    const d=g.getImageData(Math.round(${lx}*s),Math.round(${ly}*s),1,1).data;
    return '#'+[d[0],d[1],d[2]].map(n=>n.toString(16).padStart(2,'0')).join('')})()`);
  // 一小块区域里出现最多的颜色。纸纹是半透明的点，单点采样会被它带偏，
  // 取众数才拿得到「这一片到底铺的是什么底色」。
  const modeColor = (lx, ly, n = 9) => client.eval(`(()=>{const c=document.getElementById('game'),g=c.getContext('2d');
    const s=c.width/GameDebug.layout().VW,x0=Math.round(${lx}*s),y0=Math.round(${ly}*s);
    const d=g.getImageData(x0,y0,${n},${n}).data,tally={};
    for(let i=0;i<d.length;i+=4){const k='#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');tally[k]=(tally[k]||0)+1;}
    return Object.entries(tally).sort((a,b)=>b[1]-a[1])[0][0]})()`);
  const boardCorner = () => client.eval(`(()=>{const b=GameDebug.layout().rect;return {x:b.x,y:b.y,cell:b.cell}})()`);
  const palette = () => client.eval(`GameDebug.skins().palette`);
  const skinsInfo = () => client.eval(`GameDebug.skins()`);
  const settled = () => client.eval(`(()=>{const st=GameDebug.getState();return {placed:st.placed,
    score:GameDebug.score(),finished:st.finished}})()`);

  try {
    // ── 开局：一关没摆过的空台子，台面上除底色什么都没有 ────────────────────
    await client.goto(`${base}?test=1&consent=yes&level=1`);
    await installErrs();
    await wait(350);

    check('0a) 默认皮肤是原木台', (await skinsInfo()).current, 'oak');
    check('0b) 画布左上角就是原木台的底', await pixel(6, 6), '#eee7d7');

    // ── 面板 ────────────────────────────────────────────────────────────────
    await client.eval(`document.getElementById('skins').click()`);
    await wait(250);
    ok('1) 面板真的打开了', await client.eval(`document.getElementById('skins-dialog').open`));
    const cards = await client.eval(`[...document.querySelectorAll('#skins-grid .skin-card')].map(c=>({
      name:c.querySelector('.skin-name').textContent, tag:c.querySelector('.skin-tag').textContent,
      note:c.querySelector('.skin-note').textContent, btn:c.querySelector('.skin-use').textContent,
      disabled:c.querySelector('.skin-use').disabled, preview:c.querySelector('.skin-prev').width+'x'+c.querySelector('.skin-prev').height}))`);
    check('2) 六张卡都排出来了', cards.length, 6);
    check('3) 六款皮肤的名字', cards.map(c => c.name),
      ['栖湾原木台', '玄铁九鼎案', '赤霄朱漆台', '青玉藏龙案', '鎏金万象案', '长夜星砂台']);
    ok('4) 每张卡都带一块真的预览画布', cards.every(c => c.preview === '320x200'));
    // 网页版没有 window.tap，所以锁着的卡只能写「还不能拿」——绝不能喊「看广告」：
    // 游戏内的隐私政策写着「没有接入任何广告 SDK」，喊了就对不上。
    check('5) 无广告位时锁着的卡不喊「看广告」',
      cards.slice(1).map(c => c.btn), ['还不能拿', '还不能拿', '还不能拿', '还不能拿', '还不能拿']);
    check('6) 默认那款卡上是「正在使用」', [cards[0].btn, cards[0].disabled], ['正在使用', true]);
    ok('7) 锁着的卡把「还差多少」写清楚了',
      cards[1].note.includes('10 份委托') && cards[5].note.includes('18 段回忆'));
    ok('8) 预览画布真的被画过（左上角不是空白）', await client.eval(`(()=>{
      const cv=document.querySelector('#skins-grid .skin-prev'),g=cv.getContext('2d');
      const d=g.getImageData(2,2,1,1).data;return d[0]+d[1]+d[2]>0&&d[3]===255})()`));

    // ── 一款一款换过去，看像素是不是真变了 ──────────────────────────────────
    // 先把面板关掉再截图：面板是模态的，开着截到的只有一层模糊的背板，
    // 而这一组截图是给人看「台子长什么样」的。
    await client.eval(`document.getElementById('skins-dialog').close()`);
    await wait(200);
    const info = await skinsInfo();
    const ids = info.list.map(s => s.id);
    const palettes = {};
    const seen = new Map();
    for (const id of ids) {
      await client.eval(`GameDebug.useSkin(${JSON.stringify(id)})`);
      await wait(220);
      const p = await palette();
      palettes[id] = p;
      const corner = await modeColor(6, 6);
      const b = await boardCorner();
      const surface = await modeColor(b.x + 4, b.y + 4);
      seen.set(id, corner + '|' + surface);
      check(`9.${id}) 换成「${p.bg}」底+「${p.surface}」台面`, [corner, surface], [p.bg, p.surface]);
      await shotCanvas(`skin-${id}.png`);
    }
    // 六款两两不能撞色——撞了就说明有一款其实没生效（或者种子色填重了）。
    const unique = new Set([...seen.values()]);
    check('10) 六款皮肤的画布颜色两两不同', unique.size, 6);

    // ── 换皮肤不许动判定：同一盘棋，切回来分毫不差 ──────────────────────────
    await client.goto(`${base}?test=1&consent=yes&level=45&solve=1`);
    await wait(500);
    const before = await settled();
    ok('11a) 这一盘确实摆上了东西（不是空盘）', Object.keys(before.placed).length > 0);
    for (const id of ['star', 'iron', 'oak']) {
      await client.eval(`GameDebug.useSkin(${JSON.stringify(id)})`);
      await wait(150);
    }
    const after = await settled();
    check('11b) 换三款皮肤后摆法逐件不变', after.placed, before.placed);
    check('11c) 换三款皮肤后整齐度三项不变', after.score, before.score);
    check('11d) 通关状态也不变', after.finished, before.finished);
    await shot('skin-level45-iron.png');

    // ── 换皮肤要落盘，?skin= 深链不能落盘 ────────────────────────────────────
    await client.eval(`GameDebug.useSkin('jade')`);
    await wait(120);
    check('12a) 换皮肤写进存档', await client.eval(`JSON.parse(localStorage.getItem('liuyige-mvp-v1')).skin`), 'jade');
    await client.goto(`${base}?test=1&consent=yes&level=1&skin=gold`);
    await wait(350);
    check('12b) ?skin=gold 深链直接生效', (await skinsInfo()).current, 'gold');
    check('12c) 深链不改存档里的选择（仍是 jade）',
      await client.eval(`JSON.parse(localStorage.getItem('liuyige-mvp-v1')).skin`), 'jade');

    // ── 换个窄视口再看一眼面板，顺手截一张手机版 ────────────────────────────
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.goto(`${base}?test=1&consent=yes&level=1&skin=star`);
    await wait(350);
    await client.eval(`document.getElementById('skins').click()`);
    await wait(250);
    const phoneGrid = await client.eval(`(()=>{const g=document.getElementById('skins-grid'),
      r=g.getBoundingClientRect(),cards=[...g.querySelectorAll('.skin-card')].map(c=>c.getBoundingClientRect());
      return {cols:getComputedStyle(g).gridTemplateColumns.split(' ').length,
        overflowRight:Math.round(Math.max(...cards.map(c=>c.right))-innerWidth),
        dialogFits:document.getElementById('skins-dialog').getBoundingClientRect().right<=innerWidth+1}})()`);
    check('13) 手机上仍是两列且不出屏', [phoneGrid.cols, phoneGrid.dialogFits], [2, true]);
    ok('14) 手机上面板没有横向溢出', phoneGrid.overflowRight <= 0);
    await shot('skin-phone-panel.png');

    allErrs.push(...await readErrs());
    check('15) 全程无 JS 报错', allErrs, []);

    const failed = results.filter(r => !r.ok);
    console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
    if (failed.length) {
      console.log('未通过：');
      for (const f of failed) console.log('  ★', f.label, '实际', JSON.stringify(f.actual), '期望', JSON.stringify(f.expected));
    }
    console.log(`截图：${SHOTS}`);
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.log('验收脚本自己出错了：', e.message);
    process.exitCode = 2;
  } finally {
    try { client.close(); } catch { /* 忽略 */ }
    try { chrome.kill(); } catch { /* 忽略 */ }
  }
})();
