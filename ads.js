// 激励视频广告适配层。
//
// 为什么单独一层：这个游戏是纯静态、双击 index.html 就能玩的。广告位只有在
// TapTap 客户端（小游戏/H5 宿主）里运行、并且后台开通了广告变现之后才拿得到，
// 网页版、TapTap 网页版都没有。所以这里只做一件事——把「这一次机会给不给」
// 收在一个地方，游戏本体不关心广告从哪来。
//
// 接入口径（TapTap 小游戏/H5 的全局 tap API，与官方 AdManager 示例一致）：
//   const ad = tap.createRewardedVideoAd({ adUnitId })
//   ad.onLoad(cb) / ad.onError(cb) / ad.onClose(res => res.isEnded) / ad.onReward(cb)
//   ad.show() 未加载完会 reject → 只能 load() 一次再 show()，不允许循环重试
// 两条硬规则：
//   1. **只有 isEnded 为 true 才发奖励**，不能 show() 一返回就发；
//   2. 广告位 ID 由服务端下发（MCP 的 check_ads_status），不许手工填、不许跨应用借用。
//      所以这行常量由 tools/set-ad-unit.cjs 写入，别手改。
(function (root) {
  'use strict';

  // ↓↓↓ 广告位 ID（TapTap 服务端下发）：由 tools/set-ad-unit.cjs 写入到下面这行的引号里。
  const AD_UNIT_ID = '';
  // ↑↑↑ 留空 = 视为未接入：不给玩家使绊子，直接放行，但会在状态栏说明原因。

  // true = 拿不到广告就不给奖励（真开始变现时打开）。
  // false = 拿不到就免费送一次。广告没拉到本质上是我们的问题，不该罚玩家；
  //         而且纯网页版没有广告接口，卡死在这里等于把试玩的人挡在门外。
  const STRICT = false;

  const TIMEOUT_MS = 90000;      // 广告卡住时的兜底，免得界面一直等
  // 参数键名按官方示例是 adUnitId；服务端那边叫 space_id。两个都带一份，
  // 改动只需要动这一行，不必回来翻 show() 的逻辑。
  const AD_UNIT_KEYS = ['adUnitId', 'spaceId'];

  let ad = null, loaded = false, lastError = null, showing = false, rewarded = false;
  let pendingResolve = null, pendingTimer = null;

  const tapApi = () => (root && typeof root.tap !== 'undefined' && root.tap) ? root.tap : null;
  const canCreate = () => { const t = tapApi(); return !!(t && typeof t.createRewardedVideoAd === 'function'); };
  const supported = () => canCreate() && !!AD_UNIT_ID;

  function params() {
    const out = {};
    for (const key of AD_UNIT_KEYS) out[key] = AD_UNIT_ID;
    return out;
  }

  function ensure() {
    if (ad || !supported()) return ad;
    try {
      ad = tapApi().createRewardedVideoAd(params());
      if (typeof ad.onLoad === 'function') ad.onLoad(() => { loaded = true; lastError = null; });
      if (typeof ad.onError === 'function') ad.onError(err => { loaded = false; lastError = err || {}; });
      if (typeof ad.onReward === 'function') ad.onReward(() => { rewarded = true; });
      if (typeof ad.onClose === 'function') {
        ad.onClose(res => {
          // 以 isEnded 为准；有的宿主只回调 onReward，那就认 onReward。
          const ended = !!(res && res.isEnded) || rewarded;
          finish(ended, ended ? 'ended' : 'skipped');
        });
      }
    } catch (err) { lastError = err; ad = null; }
    return ad;
  }

  // 只结算一次：广告关闭、超时、加载失败三条路都指向这里。
  function finish(ok, reason) {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    const resolve = pendingResolve; pendingResolve = null; showing = false; rewarded = false;
    if (resolve) resolve({ ok, reason });
  }

  // 播一次激励视频。resolve({ok, reason})：
  //   ok=true  → 可以发奖励
  //   reason   → ended / skipped / unavailable / load-failed / busy / timeout
  function show() {
    return new Promise(resolve => {
      if (!supported()) return resolve({ ok: !STRICT, reason: 'unavailable' });
      if (showing) return resolve({ ok: false, reason: 'busy' });
      showing = true;
      rewarded = false;
      pendingResolve = resolve;
      pendingTimer = setTimeout(() => finish(false, 'timeout'), TIMEOUT_MS);
      const inst = ensure();
      if (!inst) return finish(false, 'load-failed');
      const attempt = inst.show();
      if (attempt && typeof attempt.then === 'function') {
        attempt.catch(() => {
          // 素材还没拉好：load 一次再试（官方口径只允许这一次恢复重试）。
          // 仍然失败就认输，不把玩家晾在那儿。
          const reload = inst.load();
          const again = reload && typeof reload.then === 'function' ? reload.then(() => inst.show()) : inst.show();
          if (again && typeof again.catch === 'function') again.catch(() => finish(false, 'load-failed'));
        });
      }
    });
  }

  // 出结果之后给玩家的一句话。放在这里而不是游戏主体里，是为了「广告有什么结果、
  // 该说什么话」只有一份，不会出现按钮说看完就发、状态栏却说没看的情况。
  const REASON = {
    ended: '',
    skipped: '要看完广告才能拿到这一次机会，这次先不算。',
    unavailable: '这台设备上没有广告可看，这次直接给你。',
    busy: '上一个广告还没播完，稍等一下再点。',
    timeout: '广告迟迟没打开，这次先不算，稍后再试。',
    'load-failed': '广告没加载出来，这次先不算，稍后再试。',
  };
  const explain = reason => REASON[reason] !== undefined ? REASON[reason] : '广告没播完，这次先不算。';

  // 「为什么这一次不用看广告」的一句话，给玩法说明／隐私政策用。
  // 注意：**别把这句话塞进游戏状态栏**。按钮文案本来就会按同一个条件显示成
  // 「看广告 · XX」或「XX」，玩家按下去直接拿到东西就够了；而且状态栏紧接着就会被
  // 动作自己的话盖掉（「把「XX」放到绿色虚线…」），写了也看不见。详见 game.js 的 withAd。
  function status() {
    if (!canCreate()) return '当前环境没有 TapTap 广告接口（网页版或未接入），本次直接给你。';
    if (!AD_UNIT_ID) return '广告位还没配置，本次直接给你。';
    if (lastError) return '广告没拉到，稍后再试；这一次先给你。';
    return '';
  }

  root.KeepsakeAds = { supported, canCreate, show, status, explain, AD_UNIT_ID, STRICT, REASON };
})(typeof window !== 'undefined' ? window : globalThis);
