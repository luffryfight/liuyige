const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The other suites stub requestAnimationFrame into a no-op, so render() never runs.
// This harness gives the canvas a recording 2D context and a synchronous frame
// callback, which exercises the real drawing path for every commission.
function canvasHarness() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => { calls.push([prop, args]); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  class Element {
    constructor() { this.listeners = new Map(); this.children = []; this.parts = new Map(); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    setAttribute(name, value) { this[name] = value; }
    querySelector(selector) {
      if (!this.parts.has(selector)) this.parts.set(selector, new Element());
      return this.parts.get(selector);
    }
    appendChild(child) { this.children.push(child); }
    focus() {}
    getContext() { return ctx; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
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
  document.querySelectorAll = selector => (selector === '.level-button' ? element('levels').children : []);
  const window = new Element();
  const context = vm.createContext({
    window, document,
    localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, location: { search: '?test=1' },
    requestAnimationFrame(cb) { cb(); },
    setTimeout() {},
    ResizeObserver: class { observe() {} },
  });
  for (const file of ['core.js', 'art.js', 'music.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    if (file === 'core.js') context.Keepsake = window.Keepsake;
    if (file === 'art.js') context.KeepsakeArt = window.KeepsakeArt;
  }
  return { window, calls, element };
}

test('every commission draws through the real render path without throwing', () => {
  const K = require('../core.js');
  const h = canvasHarness();
  assert.ok(h.window.GameDebug, 'debug hook is available');
  const debug = h.window.GameDebug;
  for (let i = 0; i < K.levels.length; i++) {
    h.calls.length = 0;
    assert.doesNotThrow(() => debug.load(i), `${K.levels[i].id} renders`);
    assert.ok(h.calls.length > 100, `${K.levels[i].id} actually painted something`);
  }
  // A tall grid must still leave the tray area free: the board is drawn above y=380.
  const tall = K.levels.findIndex(l => l.rows === 6);
  debug.load(tall);
  const fills = h.calls.filter(([name]) => name === 'fillRect').map(([, a]) => a);
  const lowestBoardPixel = Math.max(...fills.filter(([, y]) => y < 380).map(([, y]) => y));
  assert.ok(lowestBoardPixel < 380, 'no board cell is painted over the tray divider');
});
