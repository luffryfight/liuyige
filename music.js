// 留一格 · 背景音乐
//
// 为什么是「合成」而不是一个 mp3：
//   1. 这个项目是纯静态、零构建的，双击 index.html 就能玩。挂一个几 MB 的音频文件，
//      首屏和离线包都会变笨重，还要额外处理 file:// 下的解码差异。
//   2. 合成不占体积，循环处天然无缝（相位连续，不会有接头爆音），也不牵扯音乐授权。
//   3. 音色能跟着状态走——以后想加「摆好一件轻轻响一声」这类细节，直接调函数就行。
//
// 曲风取向贴合主题「旧物 / 回忆 / 不赶时间」：
//   八小节循环（32 秒）—— 慢起的暖垫（I–vi–IV–V 走两遍）+ 稀疏的音盒主旋律 + 心跳一样的低音。
//   60 BPM，一小节 4 秒，空拍比音符多。它是背景，不是主角。
//
// 排程用的是业界标准的前瞻式（look-ahead）调度：每 200ms 醒一次，把未来 1 秒内的音符
// 按 AudioContext 的绝对时间排进去。不用一堆 setTimeout 逐个音符——标签页被节流后那样会散架，
// 而排进音频时钟的节点不受节流影响。
window.KeepsakeMusic = (function () {
  'use strict';

  const BPM = 60, BEAT = 60 / BPM, BAR = BEAT * 4;     // 一拍 1 秒、一小节 4 秒
  const LOOP_BARS = 8, LOOKAHEAD = 1.0, TICK = 200;
  const LEVEL = 0.75;                                    // 总音量（先过压缩器再输出）

  // 和声：一小节一个和弦，八小节循环。记的是 MIDI 音高，一律取开放排列（根音 + 五度 + 三度 + 七度），
  // 这样低音区不会糊成一团。第 8 小节落在 A7，回到第 1 小节的 Dmaj9 正好收住。
  const CHORDS = [
    [38, 57, 66, 73], // 1  Dmaj9    D2 A3 F#4 C#5
    [47, 54, 62, 69], // 2  Bm7      B2 F#3 D4 A4
    [43, 55, 62, 66], // 3  Gmaj7    G2 G3 D4 F#4
    [45, 57, 62, 67], // 4  A7sus4   A2 A3 D4 G4
    [38, 57, 66, 73], // 5  Dmaj9
    [42, 57, 61, 64], // 6  F#m7     F#2 A3 C#4 E4
    [43, 55, 62, 66], // 7  Gmaj7
    [45, 57, 61, 67], // 8  A7       A2 A3 C#4 G4
  ];
  const BASS = [38, 47, 43, 45, 38, 42, 43, 45];        // 每小节的低音，在第 1 拍和第 3.5 拍各响一下

  // 音盒主旋律：[从循环起点起算的拍数, MIDI, 时值(拍)]。刻意排得稀，留白多。
  const MELODY = [
    [0.0, 78, 1.6], [1.5, 81, 1.0],                      // 第 1 小节
    [5.0, 76, 1.4], [6.6, 74, 1.2],                      // 第 2 小节
    [8.5, 74, 1.0], [10.0, 78, 1.8],                     // 第 3 小节
    [12.0, 76, 1.2], [13.6, 74, 1.0], [15.0, 69, 1.4],   // 第 4 小节
    [16.0, 78, 1.6], [18.2, 81, 1.2],                    // 第 5 小节
    [21.0, 76, 1.2], [22.4, 78, 1.4],                    // 第 6 小节
    [24.0, 74, 1.4], [25.8, 79, 1.6],                    // 第 7 小节
    [28.5, 76, 1.2], [30.0, 73, 1.4], [31.2, 74, 2.0],   // 第 8 小节
  ];

  const freq = m => 440 * Math.pow(2, (m - 69) / 12);

  let ctx = null, mix = null, padBus = null, leadBus = null, bassBus = null, master = null;
  let on = false, playing = false, timer = null, nextBar = 0, bar = 0, ducked = false;
  const live = [];                                       // 已排出去的振荡器，用来在关闭时立刻收声

  // ---- 音频图：三条支路 → 混音 →（干声 + 混响）→ 压缩器 → 总音量 → 输出 ----
  function build() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch { return false; }

    mix = ctx.createGain(); mix.gain.value = 1;
    padBus = ctx.createGain(); padBus.gain.value = 0.05;
    leadBus = ctx.createGain(); leadBus.gain.value = 0.11;
    bassBus = ctx.createGain(); bassBus.gain.value = 0.09;
    padBus.connect(mix); leadBus.connect(mix); bassBus.connect(mix);

    const dry = ctx.createGain(); dry.gain.value = 0.8;
    const verb = ctx.createConvolver(); verb.buffer = impulse(2.4, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.34;
    // 压缩器只是兜底：垫音和弦交叠时偶尔叠得高，避免削顶。
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.02; comp.release.value = 0.4;
    master = ctx.createGain(); master.gain.value = 0;

    mix.connect(dry); dry.connect(comp);
    mix.connect(verb); verb.connect(wet); wet.connect(comp);
    comp.connect(master); master.connect(ctx.destination);
    return true;
  }

  // 一段指数衰减的噪声当作房间混响。比纯干声好听太多，成本只有几十毫秒。
  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function track(o, end) { live.push({ o, end }); o.onended = () => { const i = live.findIndex(v => v.o === o); if (i >= 0) live.splice(i, 1); }; }

  // 暖垫：两个微失谐的三角波，慢起慢落，尾巴拖进下一小节，接缝听不出来。
  function padVoice(midi, t) {
    const f = freq(midi), end = t + BAR + 1.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 1.4);
    g.gain.setValueAtTime(1, t + BAR - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.4;
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = f; o.detune.value = detune;
      const vg = ctx.createGain(); vg.gain.value = detune < 0 ? 1 : 0.6;
      o.connect(vg); vg.connect(g); o.start(t); o.stop(end); track(o, end);
    }
    g.connect(lp); lp.connect(padBus);
  }

  // 音盒：正弦基音 + 一点点四倍频泛音（金属味），快起长落。
  function boxVoice(midi, t, dur) {
    const f = freq(midi), len = Math.max(0.9, dur), end = t + len + 0.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4.02;
    const g2 = ctx.createGain(); g2.gain.value = 0.11;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(leadBus);
    o.start(t); o2.start(t); o.stop(end); o2.stop(end);
    track(o, end); track(o2, end);
  }

  // 低音：纯正弦，只在每小节的第 1 拍和第 3.5 拍各一下，像呼吸。
  function bassVoice(midi, t, dur) {
    const end = t + dur + 0.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq(midi);
    o.connect(g); g.connect(bassBus); o.start(t); o.stop(end);
    track(o, end);
  }

  function scheduleBar(b, t0) {
    for (const midi of CHORDS[b % CHORDS.length]) padVoice(midi, t0);
    const root = BASS[b % BASS.length];
    bassVoice(root, t0, 2.4);
    bassVoice(root, t0 + BEAT * 2.5, 1.8);
    const from = b * 4, to = from + 4;
    for (const [at, midi, dur] of MELODY) {
      if (at < from || at >= to) continue;
      boxVoice(midi, t0 + (at - from) * BEAT, dur * BEAT * 0.9);
    }
  }

  function tick() {
    if (!playing || !ctx) return;
    // 页面被挂起过之后 currentTime 会跳，别把落下的几十小节一次性补发出来。
    if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.1;
    while (nextBar < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(bar, nextBar);
      nextBar += BAR;
      bar = (bar + 1) % LOOP_BARS;
    }
  }

  function fadeTo(v, seconds) {
    if (!master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(v, t + seconds);
  }

  function startScheduler() {
    if (playing) return;
    playing = true; bar = 0; nextBar = ctx.currentTime + 0.15;
    tick();
    if (typeof setInterval === 'function') timer = setInterval(tick, TICK);
  }

  function stopScheduler() {
    playing = false;
    if (timer !== null && typeof clearInterval === 'function') { clearInterval(timer); timer = null; }
    // 已经排进去的音符会顺着总音量的淡出自然收尾，1.4 秒后再硬切，避免残留。
    if (typeof setTimeout === 'function') setTimeout(killVoices, 1400);
  }

  function killVoices() {
    for (const v of live.slice()) { try { v.o.stop(); } catch { } }
    live.length = 0;
  }

  function resume() {
    const p = ctx.resume();
    if (p && p.catch) p.catch(() => { });
  }

  // 切到别的标签页就别响了，回来再接上：既省电，也免得用户找不到声音从哪来。
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (!playing) return;
      if (document.hidden === true) { ducked = true; fadeTo(0, 0.6); }
      else if (ducked) { ducked = false; if (on) fadeTo(LEVEL, 1.2); }
    });
  }

  return {
    // 浏览器是否具备音频能力（**不**创建 AudioContext——加载时创建会在控制台留警告）
    supported() { try { return !!(window.AudioContext || window.webkitAudioContext); } catch { return false; } },
    // 供 game.js 复用同一个 AudioContext，别为了一声提示音再开一个
    ctx() { return build() ? ctx : null; },
    enabled() { return on; },
    playing() { return playing; },
    // 开关。开的时候必须在用户手势里调用，否则浏览器不让响。
    set(want) {
      want = !!want;
      if (want === on) return on;
      on = want;
      if (!on) { fadeTo(0, 1.0); stopScheduler(); return on; }
      if (!build()) { on = false; return on; }
      resume();
      fadeTo(LEVEL, 2.5);
      startScheduler();
      return on;
    },
    toggle() { return this.set(!on); },
  };
})();
