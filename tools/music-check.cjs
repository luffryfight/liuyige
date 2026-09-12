// 背景音乐离线体检。
//
// 单元测试只能证明「开关」这层是对的（测试环境里没有 AudioContext，声音一律空转）。
// 音乐引擎本身——和弦有没有排上、小节有没有走够八个、循环有没有绕回去、
// 音高是不是有限值、包络有没有从 0 起再回到 0——都得另找办法验。
//
// 做法：造一个只记账不发声的假 AudioContext，把 music.js 原样加载进来，
// 用假时钟把前瞻调度器推着走完两个循环（64 秒），再看它到底排了些什么。
// 这样不用耳朵也能抓住写错一个音、少排一小节、包络目标为 0 之类的问题。
//
// 用法：node tools/music-check.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const errors = [];
const fail = m => errors.push(m);

// ---- 假 AudioContext：每个参数都记账，指数斜坡还会替你检查非法目标 ----
class Param {
  constructor(v) { this.value = v; this.marks = []; }
  setValueAtTime(v, t) { this.marks.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.marks.push(['lin', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) {
    // Web Audio 的真实约束：起点和目标都必须 > 0，否则浏览器抛异常。
    if (!(v > 0)) throw new Error(`exponentialRampToValueAtTime 的目标必须 > 0，收到 ${v}`);
    if (!(this.value > 0)) throw new Error(`exponentialRampToValueAtTime 的起点必须 > 0`);
    this.marks.push(['exp', v, t]); this.value = v; return this;
  }
  cancelScheduledValues(t) { this.marks.push(['cancel', t]); this.value = this.value; return this; }
}

const oscs = [];
let clock = 0;

class FakeCtx {
  constructor() { this.sampleRate = 44100; this.destination = { name: 'destination' }; }
  get currentTime() { return clock; }
  resume() { return Promise.resolve(); }
  createGain() { return { kind: 'gain', gain: new Param(1), connect() { } }; }
  createOscillator() {
    const o = { kind: 'osc', type: 'sine', frequency: new Param(440), detune: new Param(0), t0: null, t1: null, connect() { }, start(t) { o.t0 = t; }, stop(t) { o.t1 = t; } };
    oscs.push(o); return o;
  }
  createBiquadFilter() { return { kind: 'filter', type: 'lowpass', frequency: new Param(350), Q: new Param(1), connect() { } }; }
  createConvolver() { return { kind: 'convolver', buffer: null, connect() { } }; }
  createDynamicsCompressor() {
    return { kind: 'comp', threshold: new Param(-24), knee: new Param(30), ratio: new Param(12), attack: new Param(.003), release: new Param(.25), connect() { } };
  }
  createBuffer(ch, len) { return { length: len, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }; }
}

const ctx = new FakeCtx();
let tickFn = null;

const sandbox = {
  window: { AudioContext: function () { return ctx; } },
  document: { hidden: false, addEventListener() { } },
  setInterval: fn => { tickFn = fn; return 1; },
  clearInterval: () => { tickFn = null; },
  setTimeout: fn => { fn(); return 0; },
  Math, JSON, Array, Object, Promise, Float32Array, console,
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'music.js'), 'utf8'), sandbox, { filename: 'music.js' });

const M = sandbox.window.KeepsakeMusic;
if (!M) { console.error('music.js 没有挂在 window 上'); process.exit(1); }
if (!M.supported()) { console.error('假 AudioContext 没被认出来'); process.exit(1); }

// ---- 推着调度器走完两个循环 ----
const BEAT = 1, BAR = 4, LOOP = 32;
if (!M.set(true)) fail('set(true) 应当能启动');
if (!M.playing()) fail('启动后 playing() 应当是 true');
if (!tickFn) fail('调度器没有装上定时器');

const firstBar = oscs.length;                      // set(true) 里已经排过第一小节
for (clock = 0; clock <= LOOP * 2 + 1; clock += 0.2) tickFn();

if (M.playing() !== true) fail('跑完两个循环后仍应在播');

// ---- 按起音时间把音符分组 ----
const groups = new Map();
for (const o of oscs) {
  if (o.t0 === null) { fail('有振荡器排了却没 start()'); continue; }
  if (!Number.isFinite(o.t0) || !Number.isFinite(o.t1)) { fail('起止时间是 NaN'); continue; }
  if (o.t1 <= o.t0) fail(`停止时间不晚于开始时间：${o.t0} → ${o.t1}`);
  if (!Number.isFinite(o.frequency.value) || o.frequency.value <= 0) { fail(`非法频率 ${o.frequency.value}`); continue; }
  if (o.frequency.value < 20 || o.frequency.value > 8000) fail(`频率超出可用范围：${o.frequency.value.toFixed(1)}Hz`);
  const key = o.t0.toFixed(3);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(o);
}
if (oscs.length < firstBar) fail('启动时没有排任何音符');

const starts = [...groups.keys()].map(Number).sort((a, b) => a - b);

// 小节起点 = 排了和弦音（三角波）的那些起音时刻。
// 别用「时间 ÷ 4 秒」去猜小节号——旋律和低音会在小节中间制造起音，那样会算歪。
const barStarts = starts.filter(t => groups.get(t.toFixed(3)).some(o => o.type === 'triangle'));
const barOf = k => groups.get(barStarts[k].toFixed(3));
const shapeOf = k => barOf(k).map(o => `${o.type}@${o.frequency.value.toFixed(2)}`).sort().join('|');
if (barStarts.length < 16) fail(`两个循环应当排够 16 个小节，实际 ${barStarts.length}`);

// 每一小节都必须恰好排上 4 个和弦音（每个和弦音是 2 个微失谐的三角波）。
barStarts.forEach((t, k) => {
  const n = barOf(k).filter(o => o.type === 'triangle').length;
  if (n !== 8) fail(`第 ${k + 1} 小节的和弦音是 ${n} 个三角波，应当是 8（4 个音 × 2 个失谐）`);
});

// 循环得真的绕回去：第 9 个小节应该和第 1 个排得一模一样。
for (let k = 0; k < 8; k++) if (shapeOf(k) !== shapeOf(k + 8)) fail(`第 ${k + 9} 小节没有回到循环开头的和声`);

// 和声应当一节一换，不能整段同一个和弦。
const chordsPerLoop = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(shapeOf));
if (chordsPerLoop.size < 5) fail(`八个小节只有 ${chordsPerLoop.size} 种和声，太单调`);

// 低音：每小节两下，且明显低于和弦音域。
const bass = oscs.filter(o => o.type === 'sine' && o.frequency.value < 130);
if (bass.length < barStarts.length * 2 - 2) fail(`低音只排了 ${bass.length} 下，两个循环应当接近 ${barStarts.length * 2}`);

// 旋律：音盒主旋律的基音（四倍频泛音被上面 1200Hz 的上限滤掉了，只数基音）。
// 两个完整循环是 18 × 2 = 36 个音；这里跑到第 17 小节，会多出下一轮开头的 2 个。
const lead = oscs.filter(o => o.type === 'sine' && o.frequency.value >= 130 && o.frequency.value < 1200);
if (lead.length < 36) fail(`旋律只有 ${lead.length} 个音，两个完整循环应当有 36 个（每循环 18 个）`);
if (lead.some(o => o.frequency.value < 250)) fail(`旋律里出现了过低的音：${lead.map(o => o.frequency.value.toFixed(0)).join(',')}`);

// ---- 关闭：立刻收声，且不再排新的 ----
const before = oscs.length;
M.set(false);
if (M.playing() !== false) fail('关掉之后 playing() 应当是 false');
if (M.enabled() !== false) fail('关掉之后 enabled() 应当是 false');
if (tickFn !== null) fail('关掉之后定时器应当被清掉');
if (oscs.length !== before) fail('收声不该再产生新节点');
if (oscs.some(o => o.t1 === null)) fail('关掉之后有振荡器还没有安排停止时间');

const total = oscs.length;
const pads = oscs.filter(o => o.type === 'triangle').length;

console.log('背景音乐离线体检');
console.log(`  排出的振荡器     ${total} 个（和弦 ${pads} / 旋律 ${lead.length} / 低音 ${bass.length}）`);
console.log(`  覆盖小节         ${barStarts.length} 节（${LOOP} 秒一个循环）`);
console.log(`  八小节的和声     ${chordsPerLoop.size} 种`);
console.log(`  音域             ${Math.min(...oscs.map(o => o.frequency.value)).toFixed(1)} – ${Math.max(...oscs.map(o => o.frequency.value)).toFixed(1)} Hz`);
console.log(`  循环回到开头     ${shapeOf(0) === shapeOf(8) ? '是' : '否'}`);

if (errors.length) {
  console.log(`\n发现 ${errors.length} 个问题：`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('\n全部通过 ✓');
