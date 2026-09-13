/**
 * 多连接分块下载器 —— 专门对付 dl.google.com 这类「单连接被限速、但支持 Range」的源。
 *
 * 用法: node fetch-multi.cjs <url> <输出文件> [连接数]
 *
 * ⚠️ 一个真实踩过的坑：不要用 HEAD 的 content-length 当文件总长。
 * dl.google.com 上 HEAD 返回的 content-length 比真实文件小（实测 build-tools_r34 少 162536 字节），
 * 于是分块永远覆盖不到尾部，下出来的 zip「下载完成」却没有中央目录，
 * tar 只丢一句 "Error exit delayed from previous errors"，很难查。
 * 现在改用 `Range: bytes=0-0` 的 content-range 里的总长，那是跟随实际响应体的，可信。
 *
 * 特性: 从已有文件长度处续传；每块失败重试 3 次（指数退避）；定位写；
 * 下载完毕核对字节数。
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const url = process.argv[2];
const dest = process.argv[3];
const conns = Number(process.argv[4] || 8);
const CHUNK = 3 * 1024 * 1024;
const UA = 'Mozilla/5.0';

if (!url || !dest) {
  console.error('usage: node fetch-multi.cjs <url> <dest> [conns]');
  process.exit(2);
}

const fmt = (n) => (n / 1048576).toFixed(1) + 'MB';

/** 用 GET + Range 0-0 探真实总长；顺带判断服务器支不支持 Range */
async function probe(url) {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0', 'User-Agent': UA } });
  const cr = res.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)\s*$/);
  const size = m ? Number(m[1]) : Number(res.headers.get('content-length') || 0);
  try {
    if (res.body) await res.body.cancel();
  } catch (e) {}
  if (res.status === 206 && size) return { total: size, ranges: true };
  if (res.status === 200 && size) return { total: size, ranges: false };
  throw new Error('无法确定文件大小 (HTTP ' + res.status + ')');
}

async function main() {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const { total, ranges } = await probe(url);
  let have = 0;
  try {
    have = fs.statSync(dest).size;
  } catch (e) {}
  if (have > total) have = 0;
  if (have === total) {
    console.log(`已完整: ${fmt(total)}`);
    return total;
  }

  const fh = await fsp.open(dest, have > 0 ? 'r+' : 'w+');
  if (have === 0) await fh.truncate(0);

  const t0 = Date.now();
  let done = have;
  let lastReport = Date.now();

  // 服务器不支持 Range 时退回单连接顺序下载
  if (!ranges) {
    console.log(`服务器不支持 Range，改用单连接（总计 ${fmt(total)}）`);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    for await (const buf of res.body) {
      await fh.write(buf, 0, buf.length, done);
      done += buf.length;
      if (Date.now() - lastReport > 3000) {
        lastReport = Date.now();
        console.log(`  ${fmt(done)} / ${fmt(total)}  ${((done / total) * 100).toFixed(1)}%`);
      }
    }
    await fh.close();
    const size = fs.statSync(dest).size;
    if (size !== total) throw new Error(`大小不符: ${size} != ${total}`);
    console.log(`完成 ${fmt(size)}`);
    return size;
  }

  const blocks = [];
  for (let s = have; s < total; s += CHUNK) {
    blocks.push([s, Math.min(s + CHUNK, total) - 1]);
  }
  console.log(`总计 ${fmt(total)}，已有 ${fmt(have)}，待下 ${blocks.length} 块 / ${conns} 连接`);

  async function fetchBlock(s, e) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const base = done; // 本块的进度基线，失败重试时要回滚，否则进度会虚高
      try {
        const res = await fetch(url, {
          headers: { Range: `bytes=${s}-${e}`, 'User-Agent': UA },
          signal: AbortSignal.timeout(180000),
        });
        if (res.status !== 206) throw new Error('Range 不被支持: HTTP ' + res.status);
        let pos = s;
        for await (const buf of res.body) {
          await fh.write(buf, 0, buf.length, pos);
          pos += buf.length;
          done += buf.length;
          if (Date.now() - lastReport > 3000) {
            lastReport = Date.now();
            const spd = (done - have) / 1048576 / ((Date.now() - t0) / 1000);
            console.log(`  ${fmt(done)} / ${fmt(total)}  ${((done / total) * 100).toFixed(1)}%  ${spd.toFixed(2)}MB/s`);
          }
        }
        if (pos !== e + 1) throw new Error(`块不完整 ${pos - 1}/${e}`);
        return;
      } catch (err) {
        done = base;
        if (attempt === 3) throw new Error(`块 ${s}-${e} 重试 3 次仍失败: ${err.message}`);
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }

  let idx = 0;
  const workers = Array.from({ length: Math.min(conns, blocks.length) }, async () => {
    while (true) {
      const my = idx++;
      if (my >= blocks.length) return;
      await fetchBlock(blocks[my][0], blocks[my][1]);
    }
  });

  await Promise.all(workers);
  await fh.close();

  const size = fs.statSync(dest).size;
  const sec = (Date.now() - t0) / 1000;
  console.log(`完成 ${fmt(size)} / 用时 ${sec.toFixed(1)}s (平均 ${(size / 1048576 / sec).toFixed(2)}MB/s)`);
  if (size !== total) throw new Error(`大小不符: ${size} != ${total}`);
  return size;
}

main().catch((e) => {
  console.error('FAIL: ' + e.message);
  process.exit(1);
});
