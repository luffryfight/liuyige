/* 留一格：回忆收纳师 · 宣传片
 * ---------------------------------------------------------------------------
 * 16 秒 / 1920×1080 / 30fps / 横屏。
 *
 * 为什么是 16 秒不是 15：TapTap 要求「长度不少于 15s」，而录出来正好 15.000 就卡在边界上——
 * MediaRecorder 的时间戳取整、各家播放器按时长四舍五入，都可能被读成 14.99。末场定格多留
 * 一秒，总长落到 16.0s，余量就出来了。
 *
 * 为什么不是把实机录一遍：TapTap 要求「宣传片内容不得与实机视频内容高度雷同」。
 * 所以这里重新写了一套分镜——没有指针、没有按钮、没有状态栏、没有操作过程，
 * 只有旧物落位、特写蒙太奇和品牌片头片尾。美术沿用 art.js 那一套（同一批旧物、
 * 同一套画法），风格和游戏一致，但构图、节奏、镜头完全是另一套东西。
 *
 * 输出走 Chrome 的 MediaRecorder：canvas.captureStream(30) 配 Web Audio 现场
 * 合成的 BGM，直接编成 H.264/AAC 的 MP4，不需要 ffmpeg。
 *
 * 时间轴（共 16.0s）：
 *   0.0–2.4   旧物浮现   一件胶片相机从格线里浮出来，标题落下
 *   2.4–6.2   归位       九件旧物依次落进盘面，每落一件格子亮一下
 *   6.2–10.0  特写       相机 / 耳机 / 来信，各配一句它自己的回忆
 *   10.0–12.6 合箱       箱子合拢，只留一格亮着
 *   12.6–16.0 落版       品牌定格
 */
(function () {
  'use strict';

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const FPS = 30, TOTAL = 16;

  const K = window.Keepsake;
  const Art = window.KeepsakeArt;
  if (!K || !Art) throw new Error('core.js / art.js 没加载上，宣传片画不出来');

  /* ── 调色板：跟游戏内同一套纸木色 ─────────────────────────────────── */
  const P = {
    paper: '#f3eddf',
    ink: '#4b544a',
    ink2: '#5d6559',
    soft: '#7d8577',
    green: '#b6c8a4',
    wood: '#c8a97e',
    woodLine: 'rgba(150,116,78,.28)',
  };

  /* ── 小工具 ──────────────────────────────────────────────────────── */
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOutBack = (t, s = 1.2) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  const seg = (t, a, b) => clamp01((t - a) / (b - a || 1e-6));
  const fadeIn = (t, w) => easeInOut(seg(t, 0, w));
  const fadeOut = (t, dur, w) => 1 - easeInOut(seg(t, dur - w, dur));

  /* 纸纹颗粒：固定随机种子生成一次，否则每帧抖动会闪。 */
  const GRAIN = (() => {
    let s = 20260914;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out = [];
    for (let i = 0; i < 1500; i++) out.push([rnd() * W, rnd() * H, rnd() < .82 ? 1 : 2]);
    return out;
  })();

  let vignette = null;
  function paper() {
    ctx.fillStyle = P.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(126,116,94,.055)';
    for (const [x, y, s] of GRAIN) ctx.fillRect(x, y, s, s);
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H / 2, H * .34, W / 2, H / 2, H * .96);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(74,66,50,.13)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  /** 按「中心点」画一件旧物（art.js 的 draw 收的是左上角，这里换算一下）。 */
  function drawItem(c, id, cx, cy, unit, rot = 0, alpha = 1) {
    const b = K.bounds(K.items[id].cells);
    const w = b.w * unit, h = b.h * unit;
    Art.draw(c, id, cx - w / 2, cy - h / 2, unit, rot, alpha);
    return { w, h };
  }

  /** 手动排字距——canvas 没有 letter-spacing，中文标题需要它。 */
  function drawSpaced(c, text, cx, y, size, gap, color) {
    c.save();
    c.font = `400 ${size}px "Microsoft YaHei",sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const chars = [...text];
    const widths = chars.map((ch) => c.measureText(ch).width);
    let x = cx - (widths.reduce((a, v) => a + v, 0) + gap * (chars.length - 1)) / 2;
    c.fillStyle = color;
    for (let i = 0; i < chars.length; i++) { c.fillText(chars[i], x, y); x += widths[i] + gap; }
    c.restore();
  }

  /* ── 盘面与落位坐标 ──────────────────────────────────────────────── */
  // 5 列 × 3 行、格边 180：恰好 900×540 居中，且九个落点的中点是画面正中。
  const BOARD = { cols: 5, rows: 3, cell: 180, x0: 510, y0: 270 };
  const slot = (i) => ({
    cx: BOARD.x0 + ((i % 3) * 2 + 0.5) * BOARD.cell,
    cy: BOARD.y0 + (Math.floor(i / 3) + 0.5) * BOARD.cell,
  });

  function drawBoard(a) {
    const { cols, rows, cell, x0, y0 } = BOARD;
    const w = cols * cell, h = rows * cell;
    Art.rr(ctx, x0, y0, w, h, 18, `rgba(214,203,176,${.34 * a})`);
    ctx.strokeStyle = `rgba(128,122,98,${.42 * a})`;
    ctx.lineWidth = 2;
    for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(x0 + c * cell, y0); ctx.lineTo(x0 + c * cell, y0 + h); ctx.stroke(); }
    for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + r * cell); ctx.lineTo(x0 + w, y0 + r * cell); ctx.stroke(); }
    Art.rr(ctx, x0, y0, w, h, 18, null, `rgba(112,106,84,${.62 * a})`);
    ctx.lineWidth = 3.5;
    Art.rr(ctx, x0, y0, w, h, 18, null, `rgba(112,106,84,${.62 * a})`);
  }

  // 九件旧物的落位顺序；下标 4 落在正中央，是合箱那一幕留在窗口里的那件。
  const PLACE_ITEMS = ['tape', 'photo', 'letter', 'mug', 'camera', 'book', 'glasses', 'keys', 'headphones'];

  /* ── 场景 1｜旧物浮现（2.4s）────────────────────────────────────── */
  function sceneOpen(c, p, t) {
    // 格线从画面中心一圈圈长出来——先把「格子」这个概念放进去
    const C = 120;
    for (let n = -9; n <= 9; n++) {
      const d = Math.abs(n), g = seg(t, .02 + d * .045, .55 + d * .045);
      if (g <= 0) continue;
      c.strokeStyle = `rgba(122,126,106,${.15 * g})`;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(W / 2 + n * C, 0); c.lineTo(W / 2 + n * C, H); c.stroke();
    }
    for (let n = -6; n <= 6; n++) {
      const d = Math.abs(n), g = seg(t, .02 + d * .045, .55 + d * .045);
      if (g <= 0) continue;
      c.strokeStyle = `rgba(122,126,106,${.15 * g})`;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, H / 2 + n * C); c.lineTo(W, H / 2 + n * C); c.stroke();
    }

    // 相机浮现，慢慢放大并轻轻上浮（像被拿起来）
    const aIn = easeOutCubic(seg(t, .15, .95));
    const unit = lerp(52, 94, easeOutCubic(seg(t, .2, 1.7)));
    const cy = lerp(H / 2 + 46, H / 2 - 46, easeOutCubic(seg(t, .2, 1.9)));
    const box = drawItem(c, 'camera', W / 2, cy, unit, lerp(-.05, 0, easeOutCubic(seg(t, .3, 1.5))), aIn * .98);
    c.fillStyle = `rgba(90,84,66,${.13 * aIn})`;
    c.beginPath(); c.ellipse(W / 2, cy + box.h / 2 + 26, 150, 22, 0, 0, 6.283); c.fill();

    // 标题
    const t1 = easeOutCubic(seg(t, .95, 1.6));
    if (t1 > 0) {
      c.globalAlpha = t1;
      c.fillStyle = P.ink;
      c.font = '700 106px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('留一格', W / 2, 838 - (1 - t1) * 18);
      c.globalAlpha = 1;
    }
    const t2 = easeOutCubic(seg(t, 1.35, 2.05));
    if (t2 > 0) {
      c.globalAlpha = t2 * .92;
      drawSpaced(c, '回忆收纳师', W / 2, 908, 42, 14, P.soft);
      c.globalAlpha = 1;
    }
  }

  /* ── 场景 2｜归位（3.8s）────────────────────────────────────────── */
  function scenePlace(c, p, t) {
    drawBoard(seg(t, 0, .55));

    for (let i = 0; i < PLACE_ITEMS.length; i++) {
      const s0 = .18 + i * .36;
      const k = seg(t, s0, s0 + .52);
      if (k <= 0) continue;
      const s = slot(i);

      // 落地瞬间：那一格亮一下（收纳「安顿好了」的反馈）
      const gl = seg(t, s0 + .42, s0 + 1.05);
      if (gl > 0 && gl < 1) {
        c.globalAlpha = (1 - gl) * .40 * easeOutCubic(k);
        Art.rr(c, s.cx - BOARD.cell / 2, s.cy - BOARD.cell / 2, BOARD.cell, BOARD.cell, 14, P.green);
        c.globalAlpha = 1;
      }

      const y = lerp(s.cy - 190, s.cy, easeOutBack(k, 1.2));
      drawItem(c, PLACE_ITEMS[i], s.cx, y, 50,
        lerp(-.08, 0, easeOutCubic(k)), easeOutCubic(seg(t, s0, s0 + .24)));
    }

    const ta = easeOutCubic(seg(t, 1.4, 2.3));
    if (ta > 0) {
      c.globalAlpha = ta * .95;
      drawSpaced(c, '每一件旧物，都值得留一格', W / 2, 998, 44, 6, '#6b7365');
      c.globalAlpha = 1;
    }
  }

  /* ── 场景 3｜特写蒙太奇（3.8s）──────────────────────────────────── */
  // 文案直接取 core.js 里每件旧物自己的 memory，不另写——本来就有味道。
  const CLOSEUPS = [
    { id: 'camera', text: '里面还有一张没拍完的胶卷。' },
    { id: 'headphones', text: '线缠在一起的样子，也很熟悉。' },
    { id: 'letter', text: '地址写得很认真，邮票贴得有点歪。' },
  ];
  const CLOSEUP_DUR = 3.8;

  function sceneCloseup(c, p, t) {
    const per = CLOSEUP_DUR / 3;
    for (let i = 0; i < CLOSEUPS.length; i++) {
      const s0 = i * per;
      // 出场与入场首尾相接、绝不交叠：这一件在 s0+per 归零，下一件才从 s0+per 开始淡入。
      // 早先两段是交叠的（淡出窗口一直拖到 s0+per+.22），于是相机滑出去的时候，
      // 耳机的左耳罩正好压在同一位置，两件半透明地叠在一起糊成一坨——
      // 蒙太奇这里要的是「切」，不是「溶」。
      const a = Math.min(
        easeOutCubic(seg(t, s0, s0 + .12)),
        1 - easeInOut(seg(t, s0 + per - .12, s0 + per))
      );
      if (a <= .002) continue;

      const k = seg(t, s0 - .20, s0 + per + .26);
      const cx = lerp(W / 2 + 130, W / 2 - 130, k), cy = 468;
      // 三件的格数差得多（相机 3×2、耳机 3×3、来信 2×1），同一个 unit 画出来来信只有别人
      // 一半大；按「最长边 ≈ 560」折算单位，三件在特写里的体量才相当。
      const b = K.bounds(K.items[CLOSEUPS[i].id].cells);
      const unit = Math.min(240, Math.max(180, 560 / Math.max(b.w, b.h)));

      const glow = c.createRadialGradient(cx, cy, 20, cx, cy, 640);
      glow.addColorStop(0, `rgba(228,216,184,${.55 * a})`);
      glow.addColorStop(1, 'rgba(228,216,184,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H);

      c.fillStyle = `rgba(92,86,68,${.14 * a})`;
      c.beginPath(); c.ellipse(cx, cy + 232, 212, 26, 0, 0, 6.283); c.fill();

      drawItem(c, CLOSEUPS[i].id, cx, cy, unit, 0, a);

      c.globalAlpha = a * easeOutCubic(seg(t, s0 + .10, s0 + .58));
      c.fillStyle = P.ink2;
      c.font = '400 46px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText(CLOSEUPS[i].text, W / 2, 932);
      c.globalAlpha = 1;
    }
  }

  /* ── 场景 4｜合箱（2.6s）────────────────────────────────────────── */
  function sceneBox(c, p, t) {
    drawBoard(1);

    const stay = 1 - easeInOut(seg(t, .55, 1.15));
    for (let i = 0; i < PLACE_ITEMS.length; i++) {
      const s = slot(i);
      if (i === 4) {
        // 正中那件留到最后，并在窗口里放大——「留一格」就是留它
        drawItem(c, PLACE_ITEMS[i], s.cx, s.cy, 50 * (1 + easeInOut(seg(t, .7, 1.7)) * 1.1), 0, 1);
      } else {
        drawItem(c, PLACE_ITEMS[i], s.cx, s.cy, 50, 0, stay);
      }
    }

    const k = easeInOut(seg(t, .8, 1.9));
    if (k <= 0) {
      const ta0 = easeOutCubic(seg(t, 1.5, 2.15));
      if (ta0 > 0) {
        c.globalAlpha = ta0;
        c.fillStyle = '#6b7365';
        c.font = '500 46px "Microsoft YaHei",sans-serif';
        c.textAlign = 'center';
        c.fillText('100 段委托，等你安顿', W / 2, 980);
        c.globalAlpha = 1;
      }
      return;
    }

    const win = lerp(H, 430, k);
    const wx = W / 2 - win / 2, wy = 540 - win / 2;

    // 用 evenodd 抠掉窗口，木箱就「围」出来了
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.rect(wx, wy, win, win);
    c.clip('evenodd');
    c.fillStyle = P.wood;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = P.woodLine;
    c.lineWidth = 2.5;
    for (let y = 24; y < H; y += 52) {
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= W; x += 160) c.lineTo(x, y + Math.sin((x + y) * .021) * 3.5);
      c.stroke();
    }
    c.restore();

    // 窗口内沿的一道投影，让「里面」沉下去
    const sh = c.createLinearGradient(wx, wy, wx, wy + 72);
    sh.addColorStop(0, 'rgba(92,72,48,.32)');
    sh.addColorStop(1, 'rgba(92,72,48,0)');
    c.fillStyle = sh;
    c.fillRect(wx, wy, win, 72);

    c.strokeStyle = `rgba(170,186,158,${.85 * easeOutCubic(seg(t, 1.35, 1.95))})`;
    c.lineWidth = 3;
    c.strokeRect(wx + 1.5, wy + 1.5, win - 3, win - 3);

    const ta = easeOutCubic(seg(t, 1.5, 2.15));
    if (ta > 0) {
      c.globalAlpha = ta;
      c.fillStyle = '#f2e8d4';
      c.font = '500 46px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('100 段委托，等你安顿', W / 2, wy + win + 118);
      c.globalAlpha = 1;
    }
  }

  /* ── 场景 5｜落版（2.4s，定格不淡出）────────────────────────────── */
  function sceneLogo(c, p, t) {
    const k = easeOutCubic(seg(t, .12, 1.15));
    const fw = lerp(320, 680, k), fh = lerp(190, 310, k);
    const fx = W / 2 - fw / 2, fy = 540 - fh / 2 - 30;

    c.globalAlpha = easeOutCubic(seg(t, .12, .95)) * .78;
    c.strokeStyle = '#9e9478';
    c.lineWidth = 3;
    c.strokeRect(fx, fy, fw, fh);
    c.fillStyle = '#9e9478';
    for (const [px, py] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) {
      c.beginPath(); c.arc(px, py, 5, 0, 6.283); c.fill();
    }
    c.globalAlpha = 1;

    const ta = easeOutCubic(seg(t, .35, 1.05));
    if (ta > 0) {
      c.globalAlpha = ta;
      c.fillStyle = P.ink;
      c.font = '700 118px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('留一格', W / 2, fy + fh / 2 + 34);
      c.globalAlpha = 1;
    }
    const sa = easeOutCubic(seg(t, .7, 1.35));
    if (sa > 0) {
      c.globalAlpha = sa * .92;
      drawSpaced(c, '回忆收纳师', W / 2, fy + fh / 2 + 100, 42, 14, P.soft);
      c.globalAlpha = 1;
    }
    const a2 = easeOutCubic(seg(t, 1.15, 1.85));
    if (a2 > 0) {
      c.globalAlpha = a2 * .88;
      c.fillStyle = '#6b7365';
      c.font = '300 36px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.fillText('把旧物安顿好，给生活留一点位置', W / 2, fy + fh + 108);
      c.globalAlpha = 1;
    }
  }

  /* ── 时间轴 ──────────────────────────────────────────────────────── */
  const SCENES = [
    { id: '开场', dur: 2.4, draw: sceneOpen },
    { id: '归位', dur: 3.8, draw: scenePlace },
    { id: '特写', dur: 3.8, draw: sceneCloseup },
    { id: '合箱', dur: 2.6, draw: sceneBox },
    { id: '落版', dur: 3.4, draw: sceneLogo },
  ];
  let acc = 0;
  for (const s of SCENES) { s.start = acc; acc += s.dur; }
  const OVERLAP = .34; // 相邻场景的叠化时长

  function renderAt(t) {
    t = clamp01(t / TOTAL) * TOTAL;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    paper();

    let i = 0;
    while (i < SCENES.length - 1 && t >= SCENES[i].start + SCENES[i].dur) i++;
    const cur = SCENES[i], local = t - cur.start;

    // 第一个场景自己淡入，其余都在上一场的叠化里已经淡入过了；
    // 最后一个场景不淡出（宣传片定格在落版上比淡成空白好）。
    const a = (i === 0 ? fadeIn(local, OVERLAP) : 1) *
      (i === SCENES.length - 1 ? 1 : fadeOut(local, cur.dur, OVERLAP));
    ctx.globalAlpha = a;
    cur.draw(ctx, clamp01(local / cur.dur), local, cur.dur);
    ctx.globalAlpha = 1;

    if (i < SCENES.length - 1 && local > cur.dur - OVERLAP) {
      const nx = SCENES[i + 1], nl = local - (cur.dur - OVERLAP);
      ctx.globalAlpha = fadeIn(nl, OVERLAP);
      nx.draw(ctx, clamp01(nl / nx.dur), nl, nx.dur);
      ctx.globalAlpha = 1;
    }
  }

  /** 用真实时间推进（MediaRecorder 按挂钟打时间戳），但重绘节流到 30fps。 */
  function playOnce(t0) {
    return new Promise((resolve) => {
      let last = -1;
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        const f = Math.floor(t * FPS);
        if (f !== last) { last = f; renderAt(Math.min(t, TOTAL)); }
        if (t < TOTAL) requestAnimationFrame(loop);
        else { renderAt(TOTAL); resolve(); }
      };
      requestAnimationFrame(loop);
    });
  }

  /* ── 背景音乐：16 秒的现场合成，不挂音频文件 ─────────────────────── */
  const A4 = 440;
  async function buildBGM() {
    const SR = 44100;
    const off = new OfflineAudioContext(2, SR * TOTAL, SR);

    const master = off.createGain();
    master.gain.setValueAtTime(0.0001, 0);
    master.gain.exponentialRampToValueAtTime(.34, .7);
    master.gain.setValueAtTime(.34, 13.2);
    master.gain.exponentialRampToValueAtTime(.0001, 14.9);
    master.connect(off.destination);

    // 一点点空间感：阻尼反馈延迟，比接 ConvolverNode 省事也够暖
    const dly = off.createDelay(1);
    dly.delayTime.value = .29;
    const damp = off.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 2400;
    const fb = off.createGain(); fb.gain.value = .26;
    const wet = off.createGain(); wet.gain.value = .30;
    dly.connect(damp); damp.connect(fb); fb.connect(dly);
    damp.connect(wet); wet.connect(master);

    const note = (t, freq, dur, peak, type = 'sine') => {
      const o = off.createOscillator();
      o.type = type; o.frequency.value = freq;
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + .014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); g.connect(dly);
      o.start(t); o.stop(t + dur + .06);
      // 三次泛音：让音色带点木头的硬度，不然纯正弦太糊
      const o3 = off.createOscillator();
      o3.type = 'sine'; o3.frequency.value = freq * 3;
      const g3 = off.createGain();
      g3.gain.setValueAtTime(0.0001, t);
      g3.gain.exponentialRampToValueAtTime(peak * .10, t + .010);
      g3.gain.exponentialRampToValueAtTime(0.0001, t + dur * .55);
      o3.connect(g3); g3.connect(master);
      o3.start(t); o3.stop(t + dur * .6);
    };

    // Cmaj7 – Am7 – Fmaj7 – G6，四个和弦铺满 15 秒
    const CHORDS = [
      { bass: 130.81, notes: [261.63, 329.63, 392.00, 493.88] },
      { bass: 110.00, notes: [220.00, 261.63, 329.63, 392.00] },
      { bass: 87.31, notes: [174.61, 220.00, 261.63, 329.63] },
      { bass: 98.00, notes: [196.00, 246.94, 293.66, 329.63] },
    ];
    const STEP = TOTAL / CHORDS.length;
    CHORDS.forEach((ch, i) => {
      const t0 = i * STEP;
      note(t0, ch.bass, 3.4, .26, 'triangle');
      ch.notes.forEach((f, j) => note(t0 + .06 + j * .17, f, 2.4, .13));
    });

    // 高音点缀，稀疏一点，别把画面抢了
    for (const [t, f] of [
      [3.9, 783.99], [4.5, 880.00], [5.3, 659.26],
      [7.7, 1046.50], [8.2, 880.00], [9.0, 783.99],
      [11.4, 659.26], [12.1, 783.99],
    ]) note(t, f, 1.8, .085);

    return off.startRendering();
  }

  /* ── 录制 ────────────────────────────────────────────────────────── */
  function pickMime(withAudio) {
    const list = withAudio
      ? ['video/mp4;codecs="avc1.640033,mp4a.40.2"', 'video/mp4;codecs="avc1.4D4028,mp4a.40.2"', 'video/mp4']
      : ['video/mp4;codecs="avc1.640033"', 'video/mp4'];
    for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  async function record(name = 'liuyige-promo.mp4') {
    const vstream = canvas.captureStream(FPS);

    let actx = null, src = null, audio = false, audioTracks = [];
    try {
      actx = new AudioContext({ sampleRate: 44100 });
      await actx.resume();
      const buf = await buildBGM();
      const dest = actx.createMediaStreamDestination();
      src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      audioTracks = dest.stream.getAudioTracks();
      audio = audioTracks.length > 0;
    } catch (e) {
      audio = false;
      console.warn('BGM 合成失败，改录无声视频：', e && e.message);
    }

    const tracks = [...vstream.getVideoTracks()];
    if (audio) tracks.push(...audioTracks);
    const stream = new MediaStream(tracks);
    const mime = pickMime(audio);
    if (!mime) throw new Error('这个 Chrome 不支持录 MP4');

    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 1.0e7,
      audioBitsPerSecond: 160e3,
    });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });

    const t0 = performance.now();
    rec.start(500);
    if (src) src.start();
    await playOnce(t0);
    rec.stop();
    await stopped;
    try { src && src.stop(); actx && actx.close(); } catch { /* 忽略 */ }

    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    saveBlob(blob, name);
    const ms = Math.round(performance.now() - t0);
    return {
      // seconds 是设计时长（TOTAL），elapsed 是这次录制真正花的挂钟时间——
      // 校验要拿 elapsed 说话，不然「录了多久」就成了自说自话。
      ok: true, mime, audio, bytes: blob.size, chunks: chunks.length,
      ms, elapsed: +(ms / 1000).toFixed(2),
      width: W, height: H, fps: FPS, seconds: TOTAL,
    };
  }

  /* ── 对外 ────────────────────────────────────────────────────────── */
  window.PROMO = {
    record, renderAt, playOnce,
    info: { width: W, height: H, fps: FPS, seconds: TOTAL, scenes: SCENES.map((s) => ({ id: s.id, start: s.start, dur: s.dur })) },
  };

  renderAt(0); // 先摆一个首帧，页面打开就能看到东西
  window.PROMO_READY = true;
})();
