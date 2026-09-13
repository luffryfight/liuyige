// 激励视频广告适配层。
//
// 为什么要单独一层：这个游戏是纯静态、双击 index.html 就能玩的。广告位只有在
// TapTap 客户端内运行、并且后台建好广告位之后才拿得到，网页版/TapTap 网页版都没有。
// 所以这里只做一件事——把「要不要给奖励」这个判断收到一个地方，游戏主体不关心
// 广告从哪来。
//
// TapTap 小游戏的激励视频用法（官方文档 minigameapidoc / 开放能力 / 广告）：
//   const ad = tap.createRewardedVideoAd({ adUnitId })
//   ad.onLoad(cb) / ad.onError(cb) / ad.onClose(res => res.isEnded)
//   ad.show() 返回 Promise，未加载完会 reject，需要 ad.load() 之后重试
// 关键一条：**只有 onClose 里的 isEnded 为 true 才能发奖励**，不能 show() 一返回就发。
(function (root) {
  'use strict';

  // 在 TapTap 开发者后台（或 Dirichlet 媒体管理平台）创建「激励视频」广告位后，把 ID 填这里。
  // 留空 = 视为未接入：不给玩家使绊子，直接放行，但会在状态栏说明原因。
  const AD_UNIT_ID = '';
  // true = 拿不到广告就不给奖励（正式变现时打开）。
  // false = 拿不到就免费送一次，保证纯网页版也能正常玩。
  const STRICT = false;

  const TIMEOUT_MS = 90000;      // 广告卡住时的兜底，免得界面一直等
  let ad = null, loaded = false, lastError = null, showing = false;
  let pendingResolve = null, pendingTimer = null;

  const tapApi = () => (root && typeof root.tap !== 'undefined' && root.tap) ? root.tap : null;
  const canCreate = () => { const t = tapApi(); return !!(t && typeof t.createRewardedVideoAd === 'function'); };
  const supported = () => canCreate() && !!AD_UNIT_ID;

  function ensure() {
    if (ad || !supported()) return ad;
    try {
      ad = tapApi().createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
      ad.onLoad(() => { loaded = true; lastError = null; });
      ad.onError(err => { loaded = false; lastError = err || {}; });
      ad.onClose(res => finish(!!(res && res.isEnded), res && res.isEnded ? 'ended' : 'skipped'));
    } catch (err) { lastError = err; ad = null; }
    return ad;
  }

  function finish(ok, reason) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    const resolve = pendingResolve; pendingResolve = null; showing = false;
    if (resolve) resolve({ ok, reason });
  }

  // 播一次激励视频。resolve({ok, reason})：
  //   ok=true  → 可以发奖励
  //   reason   → ended / skipped / unavailable / load-failed / timeout
  function show() {
    return new Promise(resolve => {
      if (!supported()) return resolve({ ok: !STRICT, reason: 'unavailable' });
      if (showing) return resolve({ ok: false, reason: 'busy' });
      showing = true;
      pendingResolve = resolve;
      pendingTimer = setTimeout(() => finish(false, 'timeout'), TIMEOUT_MS);
      const inst = ensure();
      if (!inst) return finish(false, 'load-failed');
      const attempt = inst.show();
      if (attempt && typeof attempt.then === 'function') {
        attempt.catch(() => {
          // 素材还没拉好：load 一次再试。仍然失败就认输，不把玩家晾在那儿。
          const reload = inst.load();
          const again = reload && typeof reload.then === 'function' ? reload.then(() => inst.show()) : inst.show();
          if (again && typeof again.catch === 'function') again.catch(() => finish(false, 'load-failed'));
        });
      }
    });
  }

  // 给状态栏/设置页用的一句话说明，免得「点了没反应」这种静默失败。
  function status() {
    if (!canCreate()) return '当前环境没有 TapTap 广告接口（网页版或未接入），本次直接给你。';
    if (!AD_UNIT_ID) return '广告位还没配置，本次直接给你。';
    if (lastError) return '广告没拉到，稍后再试；这一次先给你。';
    return '';
  }

  root.KeepsakeAds = { supported, canCreate, show, status, AD_UNIT_ID, STRICT };
})(typeof window !== 'undefined' ? window : globalThis);
