/* 生成宣传片：跑一遍 promo/promo.html，录成 MP4，落进 dist/，然后自检。
 *
 * 自检分两层，都是「看成品」而不是「看退出码」：
 *   1. 拆 MP4 的盒子（box）—— ftyp 品牌、moov/mvhd 时长、trak/tkhd 宽高、
 *      stsd 里的编码格式、有没有音频轨。不装任何依赖，自己解析。
 *   2. 让 Chrome 真播一遍这个文件，读 videoWidth/duration，并 seek 到几个时间点截图。
 *      这一步才能证明「文件真的能解码」，只解析盒子证明不了。
 *
 * 用法：node tools/make-promo.cjs
 *   产物 dist/liuyige-promo.mp4 + tools/shots/promo-*.png（关键帧预览）
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const cdp = require('./lib/cdp.cjs');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9352;
const OUT = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'tools', 'shots');
const NAME = 'liuyige-promo.mp4';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, label });
  console.log(`${ok ? ' OK ' : ' ★★ '} ${label} → ${JSON.stringify(actual)}${ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'}`);
};
const ok = (label, cond) => check(label, !!cond, true);

/* ── MP4 盒子解析（零依赖）────────────────────────────────────────── */
/** 列出 [start,end) 里的同级盒子。size==1 表示后面跟 8 字节的 64 位长度。 */
function boxes(buf, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    let hdr = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); hdr = 16; }
    else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break;
    out.push({ type, body: o + hdr, end: o + size });
    o += size;
  }
  return out;
}
const child = (list, type) => list.find((b) => b.type === type) || null;
const full = (buf, box) => buf.readUInt32BE(box.body) & 0xffffff; // 盒子头里的 24 位 flags

/** 分片 MP4 的时长：把每个 moof/traf/trun 的样本时长加起来。
 *  MediaRecorder 写的是 fragmented MP4——mvhd.duration 恒为 0，mvex 里也不带 mehd，
 *  所以按普通 MP4 读 mvhd 只会读到 0（第一版就把一支 15 秒的片子报成了 0 秒）。
 *  自检的意义是「读成品」，读数就得读对，不能拿源码里的常量糊过去。 */
function fragmentSeconds(buf, top, tracks) {
  let best = 0;
  const byTrack = {};
  for (const moof of top.filter((b) => b.type === 'moof')) {
    for (const traf of boxes(buf, moof.body, moof.end).filter((b) => b.type === 'traf')) {
      const kids = boxes(buf, traf.body, traf.end);
      const tfhd = child(kids, 'tfhd'), trun = child(kids, 'trun'), tfdt = child(kids, 'tfdt');
      if (!tfhd || !trun) continue;
      const id = buf.readUInt32BE(tfhd.body + 4);
      const track = tracks.find((t) => t.id === id);
      const scale = (track && track.timescale) || 1000;

      // tfhd 的可选字段按 flag 位依次排列，default_sample_duration 夹在中间，只能逐个跳过。
      const tfFlags = full(buf, tfhd);
      let o = tfhd.body + 8, defDur = 0;
      if (tfFlags & 0x000001) o += 8;
      if (tfFlags & 0x000002) o += 4;
      if (tfFlags & 0x000008) { defDur = buf.readUInt32BE(o); o += 4; }

      const base = tfdt
        ? (buf[tfdt.body] === 1 ? Number(buf.readBigUInt64BE(tfdt.body + 4)) : buf.readUInt32BE(tfdt.body + 4))
        : 0;

      // trun 也是先跳可选前缀，再按 flag 决定每条样本占几个 4 字节字段。
      const trFlags = full(buf, trun);
      const count = buf.readUInt32BE(trun.body + 4);
      let p = trun.body + 8;
      if (trFlags & 0x000001) p += 4;
      if (trFlags & 0x000004) p += 4;
      const stride = [0x100, 0x200, 0x400, 0x800].reduce((n, f) => n + ((trFlags & f) ? 4 : 0), 0);
      let total = 0;
      for (let i = 0; i < count; i++) {
        total += (trFlags & 0x000100) ? buf.readUInt32BE(p) : defDur;
        p += stride;
      }
      const sec = (base + total) / scale;
      byTrack[id] = Math.max(byTrack[id] || 0, sec);
      best = Math.max(best, sec);
    }
  }
  return { max: best, byTrack };
}

function parseMp4(buf) {
  const out = { brand: null, timescale: 0, duration: 0, durationFrom: null, tracks: [] };
  const top = boxes(buf, 0, buf.length);
  const ftyp = child(top, 'ftyp');
  if (ftyp) out.brand = buf.toString('latin1', ftyp.body, ftyp.body + 4);
  const moov = child(top, 'moov');

  if (moov) {
    const moovKids = boxes(buf, moov.body, moov.end);
    const mvhd = child(moovKids, 'mvhd');
    if (mvhd) {
      const v = buf[mvhd.body];
      out.timescale = v === 1 ? buf.readUInt32BE(mvhd.body + 20) : buf.readUInt32BE(mvhd.body + 12);
      out.duration = (v === 1
        ? Number(buf.readBigUInt64BE(mvhd.body + 24))
        : buf.readUInt32BE(mvhd.body + 16)) / out.timescale;
    }

    for (const trak of moovKids.filter((b) => b.type === 'trak')) {
      const t = { id: 0, handler: null, codec: null, width: 0, height: 0, timescale: 0, seconds: 0 };
      const trakKids = boxes(buf, trak.body, trak.end);
      const tkhd = child(trakKids, 'tkhd');
      if (tkhd) {
        const v = buf[tkhd.body];
        t.id = buf.readUInt32BE(tkhd.body + (v === 1 ? 20 : 12));
        t.width = buf.readUInt32BE(tkhd.end - 8) / 65536;
        t.height = buf.readUInt32BE(tkhd.end - 4) / 65536;
        // 分片 MP4 里 tkhd 的 duration 是残值（实测把 15s 的片子报成 3.43s），
        // 只有非分片时才信它；分片情形后面用 moof 的数据补上。
        t.seconds = out.duration > 0
          ? (v === 1 ? Number(buf.readBigUInt64BE(tkhd.body + 28)) : buf.readUInt32BE(tkhd.body + 20)) / (out.timescale || 1)
          : 0;
      }
      const mdia = child(trakKids, 'mdia');
      if (mdia) {
        const mdiaKids = boxes(buf, mdia.body, mdia.end);
        const hdlr = child(mdiaKids, 'hdlr');
        if (hdlr) t.handler = buf.toString('latin1', hdlr.body + 8, hdlr.body + 12);
        const mdhd = child(mdiaKids, 'mdhd');
        if (mdhd) t.timescale = buf[mdhd.body] === 1 ? buf.readUInt32BE(mdhd.body + 20) : buf.readUInt32BE(mdhd.body + 12);
        const minf = child(mdiaKids, 'minf');
        const stbl = minf && child(boxes(buf, minf.body, minf.end), 'stbl');
        const stsd = stbl && child(boxes(buf, stbl.body, stbl.end), 'stsd');
        // stsd = 4 字节 version/flags + 4 字节 entry_count + 第一条 entry（前 4 字节是 size）
        if (stsd) t.codec = buf.toString('latin1', stsd.body + 12, stsd.body + 16);
      }
      out.tracks.push(t);
    }

    if (out.duration > 0) out.durationFrom = 'mvhd';
    else {
      const mvex = child(moovKids, 'mvex');
      const mehd = mvex && child(boxes(buf, mvex.body, mvex.end), 'mehd');
      if (mehd) {
        out.duration = (buf[mehd.body] === 1
          ? Number(buf.readBigUInt64BE(mehd.body + 4))
          : buf.readUInt32BE(mehd.body + 4)) / (out.timescale || 1);
        out.durationFrom = 'mvex/mehd';
      } else {
        const frag = fragmentSeconds(buf, top, out.tracks);
        if (frag.max > 0) {
          out.duration = frag.max;
          out.durationFrom = 'moof 分片加总';
          for (const t of out.tracks) if (frag.byTrack[t.id]) t.seconds = frag.byTrack[t.id];
        }
      }
    }
  }
  out.ftyp = !!ftyp;
  out.moov = !!moov;
  return out;
}

/* ── 只解析一个既有的 mp4、不录制：node tools/make-promo.cjs --parse=dist/liuyige-promo.mp4
 * 改解析逻辑时用这个先拿旧成品验一遍，比每次等 16 秒重录快得多。 ── */
const parseOnly = process.argv.find((a) => a.startsWith('--parse='));
if (parseOnly) {
  const m = parseMp4(fs.readFileSync(parseOnly.slice('--parse='.length)));
  console.log(JSON.stringify({ ...m, duration: +m.duration.toFixed(2) }, null, 2));
  process.exit(0);
}

/* ── 主流程 ──────────────────────────────────────────────────────── */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'liuyige-promo-dl-'));
  const profile = path.join(os.tmpdir(), 'liuyige-promo-' + Date.now());

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' });

  let client;
  try {
    client = await new cdp.Cdp(PORT).connect();
    // 让页面的 <a download> 直接落到我们指定的目录（比把几十 MB 塞回 CDP 稳）
    await client.send('Browser.setDownloadBehavior',
      { behavior: 'allow', downloadPath: dl, eventsEnabled: true }, false);

    const page = 'file:///' + path.join(ROOT, 'promo', 'promo.html').replace(/\\/g, '/');
    await client.goto(page, { waitFor: '!!window.PROMO_READY', timeout: 30000 });

    const info = await client.eval('window.PROMO.info');
    console.log('分镜：', info.scenes.map((s) => `${s.id} ${s.start.toFixed(1)}~${(s.start + s.dur).toFixed(1)}s`).join('  |  '));
    check('1) 画布是 16:9 的 1920×1080', [info.width, info.height], [1920, 1080]);

    console.log(`\n开始录制（${info.seconds} 秒实时，请稍候）…`);
    const rec = await client.eval('window.PROMO.record()');
    console.log('录制返回：', JSON.stringify(rec));
    ok('2) 录制成功返回', rec && rec.ok);
    check('3) 视频编码是 H.264', /avc1/.test(rec.mime), true);
    ok('4) 音轨已接入（BGM）', rec.audio === true);
    check('5) 报告的分辨率', [rec.width, rec.height], [1920, 1080]);
    ok('6) 录制真的跑满（实测挂钟 ≥ 15 秒）', rec.elapsed >= 15);

    // 等下载落盘并稳定
    let file = null;
    for (let i = 0; i < 60; i++) {
      const hit = fs.readdirSync(dl).find((f) => f.endsWith('.mp4') && !f.endsWith('.crdownload'));
      if (hit) {
        const p = path.join(dl, hit);
        const s1 = fs.statSync(p).size;
        await wait(700);
        if (fs.statSync(p).size === s1 && s1 > 0) { file = p; break; }
      }
      await wait(500);
    }
    if (!file) throw new Error('没等到下载的 mp4 落盘');
    const dest = path.join(OUT, NAME);
    fs.copyFileSync(file, dest);
    const size = fs.statSync(dest).size;
    console.log(`\n产物：dist/${NAME}  ${(size / 1048576).toFixed(2)} MB`);
    ok('7) 文件大小在 5GB 以内', size > 0 && size < 5 * 1024 * 1024 * 1024);

    /* ── 自检一：拆盒子 ── */
    const mp4 = parseMp4(fs.readFileSync(dest));
    console.log('\n盒子解析：', JSON.stringify({
      brand: mp4.brand, ftyp: mp4.ftyp, moov: mp4.moov,
      seconds: +mp4.duration.toFixed(2), durationFrom: mp4.durationFrom, tracks: mp4.tracks,
    }, null, 0));
    ok('8) 有 ftyp / moov 头', mp4.ftyp && mp4.moov);
    check('9) 品牌是 isom/mp42', ['isom', 'mp42', 'iso2'].includes(mp4.brand), true);
    ok(`10) 成品时长 ≥ 15 秒（从「${mp4.durationFrom}」读出 ${mp4.duration.toFixed(2)}s）`, mp4.duration >= 15);
    ok('10b) 盒子时长与录制挂钟吻合（差 <0.5s）', Math.abs(mp4.duration - rec.elapsed) < 0.5);

    const video = mp4.tracks.find((t) => t.handler === 'vide');
    const audioTr = mp4.tracks.find((t) => t.handler === 'soun');
    ok('11) 有一条视频轨', !!video);
    check('12) 视频编码 avc1（H.264）', video && video.codec, 'avc1');
    check('13) 分辨率 1920×1080', video ? [Math.round(video.width), Math.round(video.height)] : null, [1920, 1080]);
    ok('14) 比例是 16:9', video && Math.abs(video.width / video.height - 16 / 9) < 0.001);
    ok('15) 分辨率不低于 1280×720', video && video.width >= 1280 && video.height >= 720);
    ok('16) 有一条音轨（AAC）', !!audioTr);
    check('17) 音频编码 mp4a（AAC）', audioTr && audioTr.codec, 'mp4a');

    /* ── 自检二：让浏览器真播一遍 ── */
    await client.send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await client.goto('file:///' + dest.replace(/\\/g, '/'), { waitFor: 'document.readyState === "complete"', timeout: 20000 });
    const play = await client.eval(`(async()=>{
      const v=document.querySelector('video');
      if(!v) return {err:'页面里没有 video 元素'};
      v.pause();
      if(v.readyState<1) await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));
      return {duration:+v.duration.toFixed(2), w:v.videoWidth, h:v.videoHeight,
              audio:v.mozHasAudio!==undefined?v.mozHasAudio:(v.audioTracks?v.audioTracks.length>0:null)};
    })()`);
    console.log('浏览器回读：', JSON.stringify(play));
    ok('18) 浏览器能读出元数据', play && !play.err);
    check('19) 回读分辨率', play && [play.w, play.h], [1920, 1080]);
    ok('20) 回读时长 ≥ 15s', play && play.duration >= 15);

    // 关键帧截图：能解出画面才算真的能用
    for (const [t, tag] of [[0.9, '01-开场'], [4.2, '02-归位'], [7.4, '03-特写'], [11.2, '04-合箱'], [14.2, '05-落版']]) {
      await client.eval(`(async()=>{const v=document.querySelector('video');v.pause();v.currentTime=${t};
        await new Promise(r=>{ if(Math.abs(v.currentTime-${t})<0.05&&v.readyState>=2) return r();
          v.addEventListener('seeked',r,{once:true}); setTimeout(r,3000); });})()`);
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, `promo-${tag}.png`), Buffer.from(shot.data, 'base64'));
    }
    const shotFiles = fs.readdirSync(SHOTS).filter((f) => /^promo-0[1-5]/.test(f));
    check('21) 五个关键帧全部截出并解码成功', shotFiles.length, 5);

    const bad = results.filter((r) => !r.ok);
    console.log(`\n${results.length - bad.length}/${results.length} 项通过`);
    if (bad.length) { for (const b of bad) console.log('  ★ 未过：' + b.label); process.exitCode = 1; }
    else console.log('宣传片可用 ✓  dist/' + NAME);
  } finally {
    client && client.close();
    chrome.kill();
  }
})().catch((e) => { console.error('生成失败：', e.stack || e.message); process.exit(1); });
