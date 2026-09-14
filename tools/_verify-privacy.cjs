// 真实浏览器里验收隐私弹窗：5 个场景，逐个截图 + 断言。
// 假 DOM 单测能保证逻辑对，但按钮点击、遮罩、localStorage 真写没写，
// 只有真浏览器算数。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const PORT = 9335;
const W = 760, H = 1400;

const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label}  → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-priv-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  const client = await new cdp.Cdp(PORT).connect();
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  const shot = async (name) => {
    const r = await client.send('Page.captureScreenshot', { format: 'png' });
    const out = path.join(SHOTS, name);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return (fs.statSync(out).size / 1024).toFixed(0) + ' KB';
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    await client.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

    // ── 场景 1：全新安装，首启必须弹窗，且遮罩挡住棋盘
    await client.goto(url);
    await wait(800);
    check('1) 首次启动弹窗打开', await client.eval(`document.getElementById('privacy-dialog').open`), true);
    check('1)「不同意」按钮文案', await client.eval(`document.getElementById('privacy-decline').textContent.trim()`), '不同意');
    check('1)「同意」按钮文案', await client.eval(`document.getElementById('privacy-accept').textContent.trim()`), '同意并开始');
    check('1) 弹窗里没有默认勾选框', await client.eval(`document.querySelectorAll('#privacy-dialog input[type=checkbox]').length`), 0);
    // 初始焦点要落在「同意并开始」上。落在政策链接上的话，每次打开弹窗链接都挂一圈
    // 焦点环（showModal 的默认行为），看着像页面坏了。
    check('1) 初始焦点在」同意」按钮上（不是政策链接）',
      await client.eval(`document.activeElement && document.activeElement.id`), 'privacy-accept');
    check('1) 政策链接没有多余的焦点环',
      await client.eval(`(() => { const cs = getComputedStyle(document.getElementById('privacy-link')); return cs.outlineStyle === 'none' || cs.outlineWidth === '0px'; })()`), true);
    // 同意之前点棋盘，应该点不到（模态遮罩生效）
    const blocked = await client.eval(`(() => {
      const c = document.getElementById('game'), r = c.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return el ? el.tagName.toLowerCase() : 'none';
    })()`);
    check('1) 同意前棋盘被遮罩挡住', blocked !== 'canvas', true);
    console.log('    截图 privacy-dialog.png', await shot('privacy-dialog.png'));

    // ── 场景 2：点「不同意」——记住、关窗、还能玩、不写盘
    await client.eval(`document.getElementById('privacy-decline').click()`);
    await wait(400);
    check('2) 弹窗已关闭', await client.eval(`document.getElementById('privacy-dialog').open`), false);
    check('2) 选择已记住', await client.eval(`localStorage.getItem('liuyige-privacy-v1')`), 'no');
    check('2) 尚未写进度存档', await client.eval(`localStorage.getItem('liuyige-mvp-v1')`), null);
    // 拒绝之后棋盘要能点
    const blocked2 = await client.eval(`(() => {
      const c = document.getElementById('game'), r = c.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return el ? el.tagName.toLowerCase() : 'none';
    })()`);
    check('2) 拒绝后棋盘可点（基础功能保留）', blocked2, 'canvas');

    // ── 场景 3：从「玩法说明」里重开弹窗并同意，之后才开始写盘
    await client.eval(`document.getElementById('help').click()`);
    await wait(300);
    check('3) 玩法说明已打开', await client.eval(`document.getElementById('help-dialog').open`), true);
    check('3) 说明里有政策入口', await client.eval(`!!document.getElementById('privacy-open')`), true);
    console.log('    截图 privacy-help-entry.png', await shot('privacy-help-entry.png'));
    await client.eval(`document.getElementById('privacy-open').click()`);
    await wait(400);
    check('3) 入口能把弹窗叫回来', await client.eval(`document.getElementById('privacy-dialog').open`), true);
    check('3) 玩法说明已让位', await client.eval(`document.getElementById('help-dialog').open`), false);

    await client.eval(`document.getElementById('privacy-accept').click()`);
    await wait(400);
    check('3) 同意后已记录', await client.eval(`localStorage.getItem('liuyige-privacy-v1')`), 'yes');
    check('3) 同意后才开始写盘', await client.eval(`!!localStorage.getItem('liuyige-mvp-v1')`), true);

    // ── 场景 4：已同意 → 刷新不再弹
    await client.goto(url);
    await wait(800);
    check('4) 已同意，刷新后不再弹', await client.eval(`document.getElementById('privacy-dialog').open`), false);
    check('4) 同意状态保留', await client.eval(`localStorage.getItem('liuyige-privacy-v1')`), 'yes');

    // ── 场景 5：已拒绝 → 刷新也不反复弹
    await client.eval(`localStorage.setItem('liuyige-privacy-v1','no')`);
    await client.goto(url);
    await wait(800);
    check('5) 已拒绝，刷新后不反复弹', await client.eval(`document.getElementById('privacy-dialog').open`), false);

    // ── 附加：政策全文链接的 href 是不是真的指得对
    await client.eval(`localStorage.removeItem('liuyige-privacy-v1')`);
    await client.goto(url);
    await wait(600);
    const href = await client.eval(`document.getElementById('privacy-link').getAttribute('href')`);
    check('附加) 弹窗里政策全文的相对路径', href, './docs/privacy.html');
    // 真跳一次，确认能打开
    await client.goto(url.replace('index.html', 'docs/privacy.html'));
    await wait(500);
    check('附加) 政策页真的能打开且有标题',
      await client.eval(`document.querySelector('h1') ? document.querySelector('h1').textContent : null`),
      '《留一格》隐私政策');
    check('附加) 政策页样式已生效（不是裸 HTML）',
      await client.eval(`getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'`), true);
  } finally {
    try { client.close(); } catch { /* 忽略 */ }
    chrome.kill();
  }

  const bad = results.filter(r => !r.ok);
  console.log('---');
  console.log(`共 ${results.length} 项，通过 ${results.length - bad.length}，失败 ${bad.length}`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
