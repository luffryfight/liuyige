// 验收截图。用无头 Chrome 打开 index.html，按需要先摆好一关再截。
//
// 用法：
//   node tools/shots.cjs                      截默认几张（新手关 / 中段 / 大师关）
//   node tools/shots.cjs drawer-15:auto       指定关卡，:auto = 先自动求解再截
//   node tools/shots.cjs drawer-1:raw         只截开局（抽屉盖已打开的那一瞬）
//   node tools/shots.cjs --codex              额外截一张图鉴面板
//
// 注意：Windows 下 file:// 必须用绝对路径且带盘符（file:///C:/...），
// 相对路径不行 —— 上一版就是这么空截了好几张。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', 'shots');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const K = require('../core.js');
const args = process.argv.slice(2);
const wantCodex = args.includes('--codex');
const specs = args.filter(a => !a.startsWith('--'));
const jobs = (specs.length ? specs : ['drawer-1:raw', 'drawer-9:auto', 'drawer-45:auto']).map(s => {
  const [id, mode = 'raw'] = s.split(':');
  const index = K.levels.findIndex(l => l.id === id);
  if (index < 0) throw new Error(`没有这一关：${id}`);
  return { id, index: index + 1, auto: mode === 'auto' };
});

fs.mkdirSync(OUT, { recursive: true });

function shoot(name, url) {
  const file = path.join(OUT, name);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--window-size=760,1400', '--screenshot=' + file, url,
  ], { stdio: 'ignore' });
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ${name.padEnd(16)} ${String(kb).padStart(4)} KB`);
}

console.log('输出目录：' + OUT);
for (const j of jobs) {
  const name = `${j.id.replace('drawer-', 'lv')}${j.auto ? '-auto' : ''}.png`;
  // game.js 认的是 ?level=<1 基序号>（按章节重排之后的真实顺序）。
  const url = `${PAGE}?level=${j.index}${j.auto ? '&test=1&solve=1' : ''}`;
  console.log(`${j.id}  第 ${j.index} 关  ${j.auto ? '自动摆好' : '开局'}`);
  shoot(name, url);
}
if (wantCodex) {
  console.log('图鉴面板');
  const i = K.levels.findIndex(l => l.id === 'drawer-11') + 1;
  shoot('codex.png', `${PAGE}?level=${i}&test=1&solve=1&codex=1`);
}
