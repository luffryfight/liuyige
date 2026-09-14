const test = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./harness.cjs');
const K = require('../core.js');

// 典型手机上的画布 CSS 宽度：390 屏宽，减去页面左右各 12 的内边距。
const PHONE_W = 366;
// 宽屏（桌面/平板）的参考宽度，用来核对原设计稿还在。
const DESK_W = 640;
// 换设备只认视口宽度，所以手机那几条都按「视口 390 / 画布 366」来切。
const asPhone = h => h.setViewport(390, PHONE_W);

// 把逻辑坐标换算成「屏幕上实际有多少 CSS px」，两套版式这样才比得起来。
const cssPx = (logical, layout, cssW) => logical * cssW / layout.VW;

test('手机宽度下换成窄屏版式，棋盘明显变大', () => {
  const h = game();
  h.debug.loadId('drawer-78');                 // 6×6、18 件，后段最挤的一类
  const desk = h.debug.layout();
  asPhone(h);
  const phone = h.debug.layout();

  assert.equal(desk.phone, false, '宽画布沿用原设计稿');
  assert.equal(phone.phone, true, '窄画布换成手机版式');

  const before = cssPx(desk.rect.cell, desk, PHONE_W);
  const after = cssPx(phone.rect.cell, phone, PHONE_W);
  assert.ok(after > before * 1.6, `棋盘格至少要放大 1.6 倍（${before.toFixed(1)} → ${after.toFixed(1)} CSS px）`);
  assert.ok(after >= 44, `棋盘格要够手指点（现在 ${after.toFixed(1)} CSS px）`);
  // 棋盘本身也得占满画布宽度，不能再像原来那样两侧空一大截
  const boardRatio = phone.cols * phone.rect.cell / phone.VW;
  assert.ok(boardRatio > 0.75, `棋盘要占满画布宽度（现在 ${(boardRatio * 100).toFixed(0)}%）`);
});

test('手机版式下物品栏每排少放一件、多排一行，格子更宽', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  const l = K.byId('drawer-78');
  const desk = h.debug.layout().tray;
  // 挑这一关最大的一件来量「物品显示大小」：图标能画多大，取决于它。
  const biggest = l.items.slice().sort((a, b) => K.items[b].cells.length - K.items[a].cells.length)[0];
  const artBefore = h.debug.itemRect(biggest).u * PHONE_W / 640;
  asPhone(h);
  const phone = h.debug.layout().tray;
  const artAfter = h.debug.itemRect(biggest).u * PHONE_W / 400;

  assert.equal(desk.cols, 6, '原来 18 件排 6 列 3 行');
  assert.ok(phone.cols < desk.cols, `每排要比原来少（${desk.cols} → ${phone.cols}）`);
  assert.ok(phone.rows > desk.rows, `行数要比原来多（${desk.rows} → ${phone.rows}）`);

  const twBefore = desk.tw * PHONE_W / 640;
  const twAfter = phone.tw * PHONE_W / 400;
  assert.ok(twAfter > twBefore * 1.3, `箱子里每格要更宽（${twBefore.toFixed(0)} → ${twAfter.toFixed(0)} CSS px）`);
  assert.ok(artAfter > artBefore * 1.3, `物品本身要画得更大（${artBefore.toFixed(1)} → ${artAfter.toFixed(1)} CSS px）`);
});

test('手机版式在 100 关上都排得下：不越界、不压线、格子够大', () => {
  const h = game();
  asPhone(h);
  for (const l of K.levels) {
    h.debug.loadId(l.id);
    const L = h.debug.layout();
    assert.equal(L.phone, true, `${l.id} 应当走手机版式`);
    assert.ok(L.rect.y + l.rows * L.rect.cell <= L.sep.y, `${l.id} 棋盘没压到分隔线`);
    assert.ok(L.tray.y > L.sep.y, `${l.id} 物品栏在分隔线以下`);
    assert.ok(L.tray.x >= 0 && L.tray.x + L.tray.w <= L.VW, `${l.id} 物品栏横向没出画布`);
    const lastTrayY = L.tray.y + (L.tray.rows - 1) * L.tray.pitch + L.tray.tileH;
    assert.ok(lastTrayY <= L.VH, `${l.id} 物品栏最后一排没超出画布`);
    assert.ok(L.rect.cell * PHONE_W / L.VW >= 24, `${l.id} 棋盘格太小`);
    assert.ok(L.tray.tw * PHONE_W / L.VW >= 44, `${l.id} 物品格太小`);
  }
});

test('宽画布仍然用原设计稿，数值与改版前逐项一致', () => {
  const h = game();
  for (const l of K.levels) {
    h.debug.loadId(l.id);
    const L = h.debug.layout();
    assert.equal(L.phone, false, `${l.id} 宽画布不该用手机版式`);
    const cell = Math.max(28, Math.min(52, Math.floor(275 / l.rows), Math.floor(530 / l.cols)));
    assert.equal(L.rect.cell, cell, `${l.id} 棋盘格`);
    assert.equal(L.rect.y, 64, `${l.id} 棋盘起始高度`);
    assert.equal(L.sep.y, 380, `${l.id} 分隔线`);
    assert.equal(L.VW, DESK_W, `${l.id} 逻辑宽`);
    assert.equal(L.VH, DESK_W, `${l.id} 逻辑高`);
    const cols = l.items.length <= 6 ? 3 : l.items.length <= 8 ? 4 : l.items.length <= 10 ? 5 : 6;
    assert.equal(L.tray.cols, cols, `${l.id} 物品栏列数`);
  }
});

test('手机版式下：先点物品、再点棋盘格，能正常放下', () => {
  const h = game();
  asPhone(h);
  h.debug.loadId('drawer-1');
  const Kk = h.window.Keepsake;
  const l = Kk.byId('drawer-1');
  const id = l.items[0];

  h.click(h.tray(id));
  assert.equal(h.state().selected, id, '点箱子里的物品会选中它');

  let spot = null;
  for (let y = 0; y < l.rows && !spot; y++) {
    for (let x = 0; x < l.cols && !spot; x++) if (Kk.canPlace(l, {}, id, x, y, 0)) spot = { x, y };
  }
  assert.ok(spot, '存在合法落点');
  h.click(h.grid(spot.x, spot.y));
  const p = h.state().placed[id];
  assert.ok(p && p.x === spot.x && p.y === spot.y, '点棋盘格后物品落在那一格');
  h.idle();
});

test('手机版式下：把物品拖进箱子区域会放回桌面', () => {
  const h = game();
  asPhone(h);
  h.debug.loadId('drawer-1');
  const Kk = h.window.Keepsake;
  const l = Kk.byId('drawer-1');
  const id = l.items[0];
  let spot = null;
  for (let y = 0; y < l.rows && !spot; y++) {
    for (let x = 0; x < l.cols && !spot; x++) if (Kk.canPlace(l, {}, id, x, y, 0)) spot = { x, y };
  }
  h.click(h.tray(id));
  h.click(h.grid(spot.x, spot.y));
  assert.ok(h.state().placed[id], '先把它放上去');

  const L = h.debug.layout();
  const from = h.grid(spot.x, spot.y);
  const to = h.client({ x: L.VW / 2, y: L.tray.y + 12 });
  assert.ok(to.y > L.sep.y, '落点在分隔线以下');
  h.pointer('pointerdown', from);
  h.pointer('pointermove', to);
  h.pointer('pointerup', to);
  assert.ok(!h.state().placed[id], '拖到箱子区域就放回桌面了');
  h.idle();
});

test('视口宽窄能在两套版式之间来回切换', () => {
  const h = game();
  h.debug.loadId('drawer-78');
  assert.equal(h.debug.layout().phone, false);
  asPhone(h);
  assert.equal(h.debug.layout().phone, true);
  const phoneCell = h.debug.layout().rect.cell;
  h.setViewport(1280, 760);
  const back = h.debug.layout();
  assert.equal(back.phone, false, '视口宽回来就回原设计稿');
  assert.ok(back.rect.cell < phoneCell, '原设计稿的格子更小');
  asPhone(h);
  assert.equal(h.debug.layout().rect.cell, phoneCell, '再窄回去还是同一套');
});

test('宽视口下画布被压窄，仍按原设计稿排（不换成要滚动的长画布）', () => {
  // 1280×800 的桌面窗口：画布被 max-width 压到 450 左右，但视口仍然很宽。
  // 早先这里是按「画布窄于 480」判手机，于是桌面窗口矮一点就变成一张比窗口还高的
  // 长画布，物品栏掉到屏幕外、拖东西得来回滚——这一条就是守这个坑的。
  const h = game();
  h.debug.loadId('drawer-78');
  h.setCanvasWidth(450);                     // 只压窄画布，视口不动（默认 1024）
  const L = h.debug.layout();
  assert.equal(L.phone, false, '视口宽就用原稿，画布被压多窄都不算手机');
  assert.equal(L.VH, 640, '还是一屏排完的 640 稿，不拉长');
  assert.equal(L.tray.cols, 6, '物品栏保持原稿的六列三行');
  assert.equal(L.tray.rows, 3, '物品栏保持原稿的六列三行');
  // 反过来：画布宽度一样、只把视口换窄，就该切成手机版式——判据是视口，不是画布。
  h.setViewport(390, 450);
  assert.equal(h.debug.layout().phone, true, '画布宽度不是判据，视口才是');
});

test('画布位图按版式宽高比设置，内容不会被压扁', () => {
  const h = game();
  asPhone(h);
  for (const id of ['drawer-1', 'drawer-78', 'drawer-30']) {
    h.debug.loadId(id);
    const L = h.debug.layout();
    assert.equal(h.canvas.width, PHONE_W, `${id} 位图宽度跟着 CSS 宽度`);
    assert.equal(h.canvas.height, Math.round(PHONE_W * L.VH / L.VW), `${id} 位图高度跟着版式比例`);
    assert.ok(L.VH > L.VW, `${id} 手机版式比宽要高（棋盘 + 箱子上下排）`);
  }
});
