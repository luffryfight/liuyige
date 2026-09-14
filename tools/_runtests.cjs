// 一次性工具：逐个跑测试文件，输出每个文件的 tests/pass/fail 汇总。
// 全量一起跑会超时被沙盒 SIGTERM，所以拆开跑。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const names = process.argv.slice(2);
const files = (names.length ? names : ['core', 'polish', 'difficulty', 'input', 'render', 'privacy'])
  .map(n => `tests/${n}.test.cjs`);

let total = 0, pass = 0, fail = 0;
const details = [];
for (const f of files) {
  const r = spawnSync(process.execPath, ['--test', f], { encoding: 'utf8', cwd: root, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const g = re => Number((out.match(re) || [])[1] || 0);
  const t = g(/# tests (\d+)/), p = g(/# pass (\d+)/), x = g(/# fail (\d+)/);
  total += t; pass += p; fail += x;
  details.push(`${f.replace('tests/', '').padEnd(18)} tests=${t} pass=${p} fail=${x}`);
  if (x > 0) {
    const bad = out.split('\n').filter(l => /^not ok/.test(l));
    details.push(...bad.map(l => '   ' + l.trim()));
  }
}
details.push('-'.repeat(46));
details.push(`合计 tests=${total} pass=${pass} fail=${fail}`);
const text = details.join('\n');
console.log(text);
fs.writeFileSync(path.join(root, 'tools', '_all-tests.txt'), text + '\n');
