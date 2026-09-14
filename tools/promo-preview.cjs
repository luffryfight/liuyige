/* 宣传片预览：把分镜在若干时间点各渲染一帧截下来，不录制。
 * 改分镜时先跑这个看画面，比等 15 秒录一遍快得多。
 *
 * 用法：node tools/promo-preview.cjs [秒 秒 秒 ...]
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9353;
const SHOTS = path.join(ROOT, 'tools', 'shots');
const times = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));

(async () => {
  const list = times.length ? times : [1.2, 2.3, 4.6, 6.1, 7.4, 9.0, 11.0, 12.5, 14.0];
  fs.mkdirSync(SHOTS, { recursive: true });
  const profile = path.join(os.tmpdir(), 'liuyige-preview-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });

  let client;
  try {
    client = await new cdp.Cdp(PORT).connect();
    await client.send('Emulation.setDeviceMetricsOverride',
      { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.goto('file:///' + path.join(ROOT, 'promo', 'promo.html').replace(/\\/g, '/'),
      { waitFor: '!!window.PROMO_READY', timeout: 30000 });
    const info = await client.eval('window.PROMO.info');
    console.log(`分镜：${info.scenes.map((s) => `${s.id} ${s.start}~${(s.start + s.dur).toFixed(1)}s`).join('  |  ')}\n`);

    const out = [];
    for (const t of list) {
      await client.eval(`window.PROMO.renderAt(${t})`);
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      const name = `promo-prev-${String(t).replace('.', '_')}.png`;
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(shot.data, 'base64'));
      out.push(`${t}s → tools/shots/${name}`);
    }
    console.log(out.join('\n'));
  } finally {
    client && client.close();
    chrome.kill();
  }
})().catch((e) => { console.error('预览失败：', e.message); process.exit(1); });
