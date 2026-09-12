const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped event handlers without a browser. Rendering and native
// event delivery remain browser checks; the fake DOM only supplies their inputs.
function game(initialSave) {
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
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
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
  const window = new Element();
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
  const pointer = (type, point, extra = {}) => canvas.emit(type, {
    pointerId: 1, pointerType: 'mouse', button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: point.x, clientY: point.y, ...extra,
  });
  const grid = (x, y) => {
    const b = state().board;
    return { x: b.x + (x + .5) * b.cell, y: b.y + (y + .5) * b.cell };
  };
  const tray = id => {
    const r = debug.itemRect(id);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const click = point => { pointer('pointerdown', point); pointer('pointerup', point); };
  const key = key => canvas.emit('keydown', { key });
  const right = point => pointer('contextmenu', point, { button: 2, buttons: 0 });
  const idle = () => {
    assert.equal(state().drag, null, 'drag has ended');
    assert.equal(state().ghost, null, 'no object follows the pointer');
    assert.equal(canvas.captures.size, 0, 'pointer capture has ended');
  };
  return { debug, state, canvas, document, window, storage, element, pointer, grid, tray, click, key, right, idle };
}

module.exports = { game };
