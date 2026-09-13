/**
 * 极简 CDP 客户端 —— 只依赖 node 内置的 fetch / WebSocket，不装任何包。
 *
 * 用法：
 *   const cdp = new Cdp('http://127.0.0.1:9333');
 *   await cdp.connect();                       // 连到浏览器，建一个新页
 *   await cdp.send('Page.navigate', {...});
 *   await cdp.eval('1+1');                     // 求值（awaitPromise + returnByValue）
 *   cdp.close();
 *
 * 为什么自己写：这台机器零依赖、装 npm 包要联网，而 CDP 的握手只有几行。
 * Node 22 起 WebSocket 是内置全局，不需要 ws 包。
 */
'use strict';

class Cdp {
  constructor(port = 9333, host = '127.0.0.1') {
    this.base = `http://${host}:${port}`;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.sessionId = null;
  }

  static async waitForBrowser(port = 9333, host = '127.0.0.1', tries = 40) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(`http://${host}:${port}/json/version`);
        if (r.ok) return (await r.json()).webSocketDebuggerUrl;
      } catch { /* 还没起来 */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`CDP 在 ${host}:${port} 上没起来`);
  }

  async connect() {
    const url = await Cdp.waitForBrowser(new URL(this.base).port, new URL(this.base).hostname);
    this.ws = new WebSocket(url);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = () => rej(new Error('CDP WebSocket 打不开'));
    });
    this.ws.onmessage = (ev) => this._onMessage(ev.data);

    // 建一个自己的页，避免和别的 target 抢
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
    return this;
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? ' :: ' + msg.error.data : ''}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method && this.handlers.has(msg.method)) {
      for (const h of this.handlers.get(msg.method)) h(msg.params, msg.sessionId);
    }
  }

  send(method, params = {}, useSession = true) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (useSession && this.sessionId) payload.sessionId = this.sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 120000);
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  /** 在页面里求值。表达式可以是 async IIFE；返回结构化值。 */
  async eval(expression, { awaitPromise = true } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`页面里抛异常：${d.exception?.description || d.text}`);
    }
    return r.result.value;
  }

  /** 等到页面里的条件成立（轮询求值），超时抛错。 */
  async waitFor(expression, { timeout = 30000, interval = 100, label = expression } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.eval(`!!(${expression})`)) return true;
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`等待超时：${label}`);
  }

  async goto(url, { waitFor = 'document.readyState === "complete"', timeout = 30000 } = {}) {
    await this.send('Page.navigate', { url });
    await this.waitFor(waitFor, { timeout, label: url });
  }

  /** 把 base64 数据落盘。大文件分块返回时用它避免一次塞爆 CDP。 */
  close() {
    try { this.ws && this.ws.close(); } catch { /* 忽略 */ }
  }
}

module.exports = { Cdp };
