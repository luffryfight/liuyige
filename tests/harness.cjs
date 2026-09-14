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
function game(initialSave, consent = 'yes') {
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
  const context = vm.createContext({
    window, document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    KeepsakeArt: {}, URLSearchParams, location: { search: '?test=1' },
    requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
    ResizeObserver: class { observe() {} },
  });
  for (const file of ['core.js', 'music.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
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
  const idle = () => {
    assert.equal(state().drag, null, 'drag has ended');
    assert.equal(state().ghost, null, 'no object follows the pointer');
    assert.equal(canvas.captures.size, 0, 'pointer capture has ended');
  };
  // 换一台「设备」。用哪套版式只看视口宽度（和 style.css 的媒体查询同一个断点），
  // 画布宽度是它的结果——手机上约等于视口宽减去页面左右内边距，默认按 0.94 折算。
  const setViewport = (w, canvasW = Math.round(w * 0.94)) => {
    window.innerWidth = w;
    canvas.__cssWidth = canvasW;
    debug.resize();
  };
  // 只改画布宽度、不动视口：用来核对「宽视口 + 被压窄的画布」仍然走原设计稿。
  const setCanvasWidth = w => { canvas.__cssWidth = w; debug.resize(); };
  return { debug, state, canvas, document, window, storage, element, pointer, client, grid, tray, click, key, right, idle, setCanvasWidth, setViewport };
}

module.exports = { game };
