const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped event handlers without a browser. Rendering and native
// event delivery remain browser checks; the fake DOM only supplies their inputs.
//
// 第二个参数是环境设置，目前只用来预置隐私同意状态：
//   game()                     —— 全新安装，还没弹过窗（同意前不写盘）
//   game(null, 'yes')          —— 已经同意过（正常写盘）
//   game(null, 'no')           —— 已经拒绝过（不写盘，但照常能玩）
// 大部分老测试关心的是「存档里有没有东西」，所以默认按「已同意」起步，
// 免得每条都要重复写一次同意；隐私相关的行为由 privacy.test.cjs 专门守。
//
// 第三个参数是可选的环境开关：
//   { search:'?test=1&unlock=all' }        —— 换掉 location.search
//   { ads:{ adUnitId:'x', tap:fakeTap } }  —— 装上 ads.js 并塞一个假的 tap SDK，
//                                             用来验「看广告→发奖」这条链
function game(initialSave, consent = 'yes', opts = {}) {
  class Element {
    constructor() { this.listeners = new Map(); this.children = []; this.parts = new Map(); this.captures = new Set(); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, values = {}) {
      const event = { preventDefault() { this.defaultPrevented = true; }, ...values };
      if (type === 'lostpointercapture') this.captures.delete(event.pointerId);
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
    setAttribute(name, value) { this[name] = value; }
    getAttribute(name) { return this[name] ?? null; }
    querySelector(selector) {
      if (!this.parts.has(selector)) this.parts.set(selector, new Element());
      return this.parts.get(selector);
    }
    appendChild(child) { this.children.push(child); return child; }
    focus() {}
    getContext() { return {}; }
    // 画布在屏幕上按 CSS 宽度等比缩放，版式随视口宽切换；测试用 setViewport / setCanvasWidth 换环境。
    // 高度要跟当前版式的高宽比一致（浏览器里 height:auto 就是这么算的），
    // 否则 position() 换算纵向坐标会失真。__layout 由下面的 game() 注入。
    getBoundingClientRect() {
      const w = this.__cssWidth ?? 640;
      const L = this.__layout ? this.__layout() : null;
      return { left: 0, top: 0, width: w, height: L ? w * L.VH / L.VW : w };
    }
    setPointerCapture(pointerId) { this.captures.add(pointerId); }
    hasPointerCapture(pointerId) { return this.captures.has(pointerId); }
    releasePointerCapture(pointerId) {
      if (this.captures.delete(pointerId)) this.emit('lostpointercapture', { pointerId });
    }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const document = new Element();
  document.getElementById = element;
  document.createElement = () => new Element();
  document.querySelectorAll = selector => {
    if (selector === '.level-button') return element('levels').children;
    if (selector === '.mode-button') return element('mode-tabs').children;
    return [];
  };
  const storage = new Map();
  if (initialSave) storage.set('liuyige-mvp-v1', initialSave);
  // 预置隐私选择。null = 全新安装，留给测试自己走一次弹窗流程。
  if (consent === 'yes' || consent === 'no') storage.set('liuyige-privacy-v1', consent);
  const window = new Element();
  // 版式只看视口宽度，所以桩里得有个像样的视口。默认按宽屏桌面（1024）起步——
  // 老测试全都写在「原设计稿 + CSS 宽 640」这个前提上，默认行为不受影响。
  window.innerWidth = 1024;
  window.innerHeight = 900;
  // 触摸手势里「直接划过去＝滚页面」是自己算的位移（画布挂着 touch-action:none，
  // 浏览器不会替我们滚），所以这里得有个能记账的 scrollBy 让测试看得见滚了多少。
  const scroll = { y: 0 };
  window.scrollBy = (x, y) => { scroll.y = Math.max(0, scroll.y + y); };
  if (opts.ads && opts.ads.tap) window.tap = opts.ads.tap;
  // 定时器排队而不是直接丢掉：游戏里有个「按住 130ms 才算搬东西」的判定，
  // 测试要能手动把这 130ms 走过去（flushTimers），别的回调保持不自动执行。
  const timers = new Map();
  let timerSeq = 0;
  const context = vm.createContext({
    window, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    KeepsakeArt: {}, URLSearchParams, location: { search: opts.search || '?test=1' },
    requestAnimationFrame() {}, clearTimeout: id => { timers.delete(id); },
    setTimeout: (fn, ms) => { const id = ++timerSeq; timers.set(id, { fn, ms }); return id; },
    ResizeObserver: class { observe() {} },
  });
  const files = ['core.js', 'music.js'];
  if (opts.ads) files.push('ads.js');
  files.push('game.js');
  for (const file of files) {
    let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    if (file === 'ads.js') {
      // 广告位 ID 是由服务端下发、写进 ads.js 那一行常量的，测试就替换那一行。
      // 替换必须命中且只命中一次——否则说明常量被改写了，这条测试会变成假通过。
      const line = "const AD_UNIT_ID = '';";
      assert.equal(source.split(line).length - 1, 1, 'ads.js 里的广告位常量必须还是那一行');
      source = source.replace(line, `const AD_UNIT_ID = ${JSON.stringify(opts.ads.adUnitId || '')};`);
    }
    vm.runInContext(source, context, { filename: file });
    if (file === 'core.js') context.Keepsake = window.Keepsake;
  }
  const debug = window.GameDebug;
  const state = () => JSON.parse(JSON.stringify(debug.getState()));
  const canvas = element('game');
  // 让画布元素能按当前版式报出自己的高宽比（浏览器里由 height:auto 决定）。
  canvas.__layout = () => debug.layout();
  const pointer = (type, point, extra = {}) => canvas.emit(type, {
    pointerId: 1, pointerType: 'mouse', button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: point.x, clientY: point.y, ...extra,
  });
  // 画布在屏幕上按 CSS 宽度等比缩放，pointer 事件里的 clientX/Y 要用这个比例换算。
  // 宽屏（逻辑宽 640、CSS 宽也是 640）时比例正好是 1，老测试的行为不受影响。
  const scale = () => (canvas.__cssWidth ?? 640) / debug.layout().VW;
  const client = point => ({ x: point.x * scale(), y: point.y * scale() });
  const grid = (x, y) => {
    const b = state().board;
    return client({ x: b.x + (x + .5) * b.cell, y: b.y + (y + .5) * b.cell });
  };
  const tray = id => {
    const r = debug.itemRect(id);
    return client({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  };
  const click = point => { pointer('pointerdown', point); pointer('pointerup', point); };
  const key = key => canvas.emit('keydown', { key });
  const right = point => pointer('contextmenu', point, { button: 2, buttons: 0 });
  // 触摸：pointerId 用 2，和鼠标那套（pointerId 1）区分开。
  // 画布上的意图判定分三种，这里给全：轻点 clickTouch／直接划过 swipe（滚页面）／按住再拖 swipe(hold=true)。
  // 坐标是 client 坐标（也就是 h.client(...) 的产物），因为滚动量按 client 位移算。
  const touch = (type, point, extra = {}) => canvas.emit(type, {
    pointerId: 2, pointerType: 'touch', button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: point.x, clientY: point.y, ...extra,
  });
  const flushTimers = () => {
    const due = [...timers.entries()];
    for (const [id, t] of due) { timers.delete(id); t.fn(); }
    return due.length;
  };
  const clickTouch = point => { touch('pointerdown', point); touch('pointerup', point); };
  const swipe = (from, to, hold = false, steps = 4) => {
    touch('pointerdown', from);
    if (hold) flushTimers();          // 把「按住 130ms」这条判定走完
    for (let i = 1; i <= steps; i++) touch('pointermove', { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps });
    touch('pointerup', to);
  };
  const idle = () => {
    assert.equal(state().drag, null, 'drag has ended');
    assert.equal(state().ghost, null, 'no object follows the pointer');
    assert.equal(canvas.captures.size, 0, 'pointer capture has ended');
  };
  // 换一台「设备」。用哪套版式只看视口宽度（和 style.css 的媒体查询同一个断点），
  // 画布宽度是它的结果——手机上约等于视口宽减去页面左右内边距，默认按 0.94 折算。
  // 第三个参数是可选的视口高度：手机上「一张画布比一屏还高」才需要手指滚动，
  // 手势测试要造出这个处境，就得能改它（不传就沿用默认的 900）。
  const setViewport = (w, canvasW = Math.round(w * 0.94), viewportH) => {
    window.innerWidth = w;
    if (viewportH) window.innerHeight = viewportH;
    canvas.__cssWidth = canvasW;
    debug.resize();
  };
  // 只改画布宽度、不动视口：用来核对「宽视口 + 被压窄的画布」仍然走原设计稿。
  const setCanvasWidth = w => { canvas.__cssWidth = w; debug.resize(); };
  return {
    debug, state, canvas, document, window, storage, element, pointer, client, grid, tray, click, key, right, idle,
    setCanvasWidth, setViewport, touch, clickTouch, swipe, flushTimers, scrollY: () => scroll.y,
  };
}

// 假 tap SDK（TapTap 小游戏/H5 的激励视频接口）。记录每一次创建与播放，
// 并让测试**手动**决定广告怎么收场——真机上的口径是「只有 onClose 里的 isEnded 为 true
// 才发奖励」，所以这里绝不能在 show() 里顺手把奖励发出来，否则测出来的东西是假的。
//   const tap = fakeTap();  game(null,'yes',{ads:{adUnitId:'SPACE',tap:tap.api}})
//   tap.close({isEnded:true})  —— 看完了；tap.close({isEnded:false}) —— 中途关掉
//   fakeTap({failShows:1})     —— show() 先失败一次（验「load 一次再试」那条恢复链）
function fakeTap(opts = {}) {
  const log = { created: 0, shown: 0, loaded: 0, params: null };
  const handlers = {};
  let failShows = Number(opts.failShows) || 0;
  const ad = {
    onLoad(cb) { handlers.load = cb; },
    onError(cb) { handlers.error = cb; },
    onClose(cb) { handlers.close = cb; },
    onReward(cb) { handlers.reward = cb; },
    load() { log.loaded++; return Promise.resolve(); },
    show() { log.shown++; return failShows-- > 0 ? Promise.reject(new Error('not loaded')) : Promise.resolve(); },
  };
  const api = { createRewardedVideoAd(params) { log.created++; log.params = params; return ad; } };
  return {
    api, log,
    open() { if (handlers.load) handlers.load(); },
    close({ isEnded = true } = {}) { if (handlers.close) handlers.close({ isEnded }); },
    reward() { if (handlers.reward) handlers.reward(); },
    fail(err) { if (handlers.error) handlers.error(err || {}); },
    hasAd: () => !!handlers.close,
  };
}

module.exports = { game, fakeTap };
