// 逐文件跑测试并汇总。为什么不用 tools/_runtests.cjs：那个在 bash 里整条会被 SIGTERM，
// 而且把 7 个文件串在同一个 node 进程里等，累计时间会超过 shell 的超时。
// 这里单独 spawn 每个文件、各自计时，结果写文件，放在后台跑最稳。
const { spawnSync } = require('child_process');
const fs = require('fs');
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';

const FILES = [
  'core.test.cjs',
  'polish.test.cjs',
  'difficulty.test.cjs',
  'input.test.cjs',
  'render.test.cjs',
  'layout.test.cjs',
  'privacy.test.cjs',
  'hint.test.cjs',
  'gesture.test.cjs',
  'freeze.test.cjs',
  'ads.test.cjs',
  'rotate.test.cjs',
  'skins.test.cjs',
];

const lines = [];
let totalPass = 0, totalFail = 0, totalTests = 0;
for (const file of FILES) {
  const t0 = Date.now();
  const r = spawnSync(NODE, ['--test', 'tests/' + file], {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = re => Number((out.match(re) || [])[1] || 0);
  const tests = num(/# tests (\d+)/), pass = num(/# pass (\d+)/), fail = num(/# fail (\d+)/);
  totalTests += tests; totalPass += pass; totalFail += fail;
  const flag = r.status === 0 ? '' : (r.signal ? ' <<< ' + r.signal : ' <<< FAILED');
  lines.push(`${file.padEnd(22)} tests ${String(tests).padStart(3)}  pass ${String(pass).padStart(3)}  fail ${String(fail).padStart(3)}  ${Date.now() - t0}ms${flag}`);
  if (r.status !== 0) {
    out.split('\n').filter(l => /^not ok|error:/.test(l)).forEach(l => lines.push('      ' + l.trim().slice(0, 160)));
  }
}
lines.push(`=== 合计 tests ${totalTests}  pass ${totalPass}  fail ${totalFail} ===`);
const report = lines.join('\n');
fs.writeFileSync('tools/_all-tests.txt', report);
console.log(report);
