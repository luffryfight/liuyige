// 真实浏览器验收「一点提示 / 帮我放一件 / 消除一件」三个救援按钮。
// 假 DOM 单测能保证逻辑对，但「HTML 里到底有没有这个按钮」「点了界面上真的变了没」
// 只有真浏览器算数——之前就吃过一次亏：逻辑全过，但按钮在页面上根本不存在。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const PORT = 9337;
const W = 760, H = 1400;

const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label}  → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};
const ok = (label, cond) => check(label, !!cond, true);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-hint-' + Date.now());
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

  try {
    await client.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

    // 收集页面里的 JS 报错。静默失败是之前反复踩的坑。
    await client.goto(base + '?consent=yes&test=1');
    await wait(900);
    await client.eval(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));
      window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection:'+String(e.reason)))`);

    // ── 1. 三个按钮都真实存在于页面上
    ok('1) 「一点提示」按钮在页面上', await client.eval(`!!document.getElementById('hint')`));
    ok('1) 「帮我放一件」按钮在页面上', await client.eval(`!!document.getElementById('auto')`));
    ok('1) 「消除一件」按钮在页面上', await client.eval(`!!document.getElementById('clear')`));
    check('1) 提示按钮文案', await client.eval(`document.getElementById('hint').querySelector('span').textContent`), '一点提示');
    check('1) 代放按钮文案', await client.eval(`document.getElementById('auto').querySelector('span').textContent`), '帮我放一件');
    check('1) 消除按钮文案', await client.eval(`document.getElementById('clear').querySelector('span').textContent`), '消除一件');
    // 广告位没配好（AD_UNIT_ID 为空）时这几次帮忙是**直接免费给**的，按钮就不该写「看广告」：
    // 游戏内的隐私政策写着「没有接入任何广告 SDK」，两处必须对得上。配好广告位之后文案
    // 会自动变成「看广告 · …」（updateUI 读的是 KeepsakeAds.supported()）。
    ok('1) 广告位未配置时按钮不谎称「看广告」', await client.eval(
      `['hint','auto','clear'].every(id=>!document.getElementById(id).querySelector('span').textContent.includes('看广告'))`));
    ok('1) 三个按钮都可见', await client.eval(`['hint','auto','clear'].every(id=>{const b=document.getElementById(id);return b.offsetParent!==null})`));

    // ── 2. 进大师委托第 11 关，点提示应当给出位置
    const idx = await client.eval(`(()=>{const K=window.Keepsake;return K.levels.findIndex(l=>l.id==='drawer-78')})()`);
    await client.eval(`window.GameDebug.load(${idx})`);
    await wait(400);
    check('2) 已进入第 11 关', await client.eval(`window.GameDebug.levelId()`), 'drawer-78');
    await client.eval(`document.getElementById('hint').click()`);
    await wait(500);
    const hint = await client.eval(`window.GameDebug.getState().hint`);
    ok('2) 点提示后有高亮目标', hint && hint.id);
    ok('2) 高亮的是一件本关物品', await client.eval(`(()=>{const s=window.GameDebug.getState();return !!s.hint && window.Keepsake.byId('drawer-78').items.includes(s.hint.id)})()`));
    const statusText = await client.eval(`document.getElementById('status').textContent`);
    ok('2) 状态栏说明了位置和方向', /绿色虚线/.test(statusText) && /方向|横放|竖放|倒放/.test(statusText));
    await shot('hint-01-提示.png');

    // ── 3. 摆错时提示应当点名元凶
    // 必须放在「消除」之前：消除会把物品从本关存档里摘掉，之后这个死局组合就未必还成立。
    await client.eval(`window.GameDebug.loadId('drawer-78')`);
    await wait(350);
    await client.eval(`(()=>{const g=window.GameDebug;g.place('headphones',0,0,0);g.place('camera',0,4,0)})()`);
    await wait(200);
    const deadlock = await client.eval(`window.GameDebug.solve().status`);
    check('3) 当前是一个死局', deadlock, 'unsolvable');
    await client.eval(`window.GameDebug.giveHint()`);
    await wait(300);
    const warnHint = await client.eval(`window.GameDebug.getState().hint`);
    ok('3) 摆错时给出警示高亮', warnHint && warnHint.warn === true);
    const warnText = await client.eval(`document.getElementById('status').textContent`);
    ok('3) 状态栏点名是哪一件卡住（实际：' + warnText + '）', /卡住的是/.test(warnText));
    await shot('hint-02-点名元凶.png');

    // ── 4. 干净盘面上点「帮我放一件」，应当刚好 +1
    // 先走一遍「重新整理」把上一场景留下的摆法清掉，否则拿到的是脏盘面。
    const resetLevel = async () => {
      await client.eval(`document.getElementById('reset').click()`);
      await wait(200);
      await client.eval(`document.getElementById('confirm-reset').click()`);
      await wait(450);
    };
    await resetLevel();
    check('4) 重置后是空盘面', await client.eval(`Object.keys(window.GameDebug.getState().placed).length`), 0);
    await client.eval(`document.getElementById('auto').click()`);
    await wait(600);
    check('4) 代放后件数 +1', await client.eval(`Object.keys(window.GameDebug.getState().placed).length`), 1);
    check('4) 代放用完文案变「已代放」', await client.eval(`document.getElementById('auto').querySelector('span').textContent`), '已代放');
    check('4) 代放用完后按钮禁用', await client.eval(`document.getElementById('auto').disabled`), true);
    check('4) 额度只扣一次（不是两次）', await client.eval(`window.GameDebug.getState().autoPlaced`), 1);
    ok('4) 状态栏告知放了哪一件', /帮你把/.test(await client.eval(`document.getElementById('status').textContent`)));
    await shot('hint-03-代放.png');

    // ── 5. 一次撤销要把代放整件事退回（不能只退一半）
    await client.eval(`document.getElementById('undo').click()`);
    await wait(400);
    check('5) 撤销后回到代放前的空盘面', await client.eval(`Object.keys(window.GameDebug.getState().placed).length`), 0);

    // ── 6. 死局上点代放：应当「收走放错的那件 + 放好一件」，件数净不变，且一次撤销能整体退回
    await resetLevel();
    await client.eval(`(()=>{const g=window.GameDebug;g.place('headphones',0,0,0);g.place('camera',0,4,0)})()`);
    await wait(200);
    check('6) 先造出一个死局', await client.eval(`window.GameDebug.solve().status`), 'unsolvable');
    await client.eval(`document.getElementById('auto').click()`);
    await wait(600);
    check('6) 代放后件数仍是 2（收一件、放一件）', await client.eval(`Object.keys(window.GameDebug.getState().placed).length`), 2);
    check('6) 死局被解开', await client.eval(`window.GameDebug.solve().status`), 'solved');
    ok('6) 状态栏说明了收走放错的那件', /收了回来/.test(await client.eval(`document.getElementById('status').textContent`)));
    await client.eval(`document.getElementById('undo').click()`);
    await wait(400);
    const afterUndo2 = await client.eval(`Object.keys(window.GameDebug.getState().placed).length`);
    check('6) 一次撤销整体退回（回到死局那 2 件）', afterUndo2, 2);
    check('6) 退回到的是死局状态', await client.eval(`window.GameDebug.solve().status`), 'unsolvable');
    await shot('hint-04-死局代放.png');

    // ── 7. 点「消除一件」，应当少一件并有明确反馈
    await client.eval(`document.getElementById('clear').click()`);
    await wait(600);
    ok('7) 消除有明确反馈', /已经消掉/.test(await client.eval(`document.getElementById('status').textContent`)));
    await shot('hint-05-消除.png');

    // ── 8. 全程没有 JS 报错
    check('8) 全程无 JS 报错', await client.eval(`window.__errs`), []);

    await client.send('Runtime.evaluate', { expression: '1' });
  } catch (err) {
    console.log('★★ 脚本异常：' + err.message);
    results.push({ ok: false, label: '脚本执行', actual: err.message, expected: '无异常' });
  } finally {
    try { client.close(); } catch {}
    try { chrome.kill(); } catch {}
  }

  const bad = results.filter(r => !r.ok);
  console.log('\n===== 汇总 =====');
  console.log(`通过 ${results.length - bad.length} / ${results.length}`);
  if (bad.length) { bad.forEach(b => console.log('  ✗ ' + b.label)); process.exitCode = 1; }
})();
