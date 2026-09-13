# TapTap 上传说明

对应版本 **V1.0.1**（2026-09-13）

---

## 一、包在哪、怎么重新生成

```bash
node tools/pack-taptap.cjs         # H5 包：铺开的目录 + zip
node android/tools/build-apk.cjs   # 安卓 APK
```

三份产物，对应三种收件口：

```
dist/liuyige/          铺开的目录 —— 交给官方 MCP / CLI 上传时用这个
dist/liuyige.zip       单层文件夹的 zip —— H5 包体、PC 游戏 WebGL 试玩
dist/liuyige.apk       安卓安装包 —— APK 下载渠道
```

只想知道目录长什么样、不出 zip：给打包器加 `--no-zip`。

两个打包器都会走一遍结构自检，任何一条不合规就退出码 1 并指出问题。改完游戏重新跑一次即可，不用手工挑文件。APK 那份还可以单独再验一次：

```bash
node android/tools/verify-apk.cjs
```

它会拆开 APK 核对框架文件是否齐全、`assets/liuyige/` 下 7 个游戏文件是否与源文件逐字节一致、条目名有没有混进反斜杠、签名是否有效、有没有把测试或文档打进包。详见 `android/README.md`。

---

## 二、包结构

```
liuyige.zip
└── liuyige/                  ← 唯一的第一级文件夹，只含英文+数字
    ├── index.html            ← 入口，必须在第一层
    ├── style.css
    ├── core.js
    ├── art.js
    ├── music.js
    ├── ads.js
    ├── game.js
    ├── game.json             ← 小游戏配置，声明竖屏
    └── project.config.json   ← 小游戏工程配置
```

压缩后 **55.7 KB**（压缩前 157.0 KB），上限 60 MB，占用 0.091%。体积不是问题。

### 为什么只有这九个文件

前七个是运行时真正需要的：`index.html` 是入口，其余六个是它 `defer` 引入的依赖（样式、关卡与求解器、插画、音乐、激励视频适配层、交互），少一个就打不开。

**没进包的东西同样是有意为之：**

| 排除项 | 原因 |
|---|---|
| `tools/` | 生成器、诊断脚本、历代截图。不影响运行，却会把内部思路一起交出去 |
| `tests/` | 52 个单测，同上 |
| `serve.cjs` | 只给本地开发用的静态服务器 |
| `*.md` 文档 | 含下一版提案、发布计划、已知短板 |
| `tools/shots/` | 29 张历代迭代图，只有做物料才用得上 |

包内每个文件都与仓库里的源文件**逐字节一致**——没有压缩、混淆或裁剪。包和代码永远是同一份东西，改一行就能对比出来。

---

## 三、自检覆盖了什么

打包器不信自己刚写进内存的数据，一律读回磁盘上的 zip 再验：

- 第一级只有 1 个文件夹，且名字是 `liuyige`
- 文件夹名只含英文/数字
- `liuyige/index.html` 存在，且深度恰好为 1（没套第二层）
- 所有条目都在包内、无空目录、无反斜杠、无 `__MACOSX`／`.DS_Store` 一类垃圾
- 每个条目解压回来与源文件逐字节相同
- 压缩后体积在 60 MB 内

**为什么不用 PowerShell 的 `Compress-Archive`。** 它的旧实现会把条目名的分隔符写成反斜杠，而 zip 规范只认正斜杠；平台解析器不一定容错，症状是「包体解析错误」却看不出原因。所以 `tools/pack-taptap.cjs` 自己写 zip，分隔符、压缩方法、CRC 全在掌控里，零第三方依赖。

除打包器自身的检查，还用 **Python 的 `zipfile`** 做了独立复核（完全不同的实现）：CRC 全部通过、8 个条目、第一级去重后只有 `liuyige`、无反斜杠、无空目录、内容与源文件一致。

---

## 四、走哪条路线（先看这节）

TapTap 现时支持三种承载形式，**收件口和包结构都不一样**。选错不会报「类型不对」，只会报「包体解析错误」。

### ✅ A. H5 游戏「快速上架」／H5 小游戏 —— 推荐，本项目直接可用

官方明确写着支持两种包体上架：**普通小游戏**和 **H5小游戏**。「快速上架」是 H5 那条的入口，官方原话：

> 你只需准备好 H5 游戏包，**无需等待认证审核**，即可在 TapTap 快速上架，几分钟内让游戏触达海量玩家，**移动端和 Web 端都能轻松体验**。

H5 小游戏跑在 **WebView** 里，有完整的 DOM / CSS / Web Audio——本项目的架构原样适用，**不需要改一行代码**。上传后游戏展示在你的个人主页作品集里。

对包的要求只有一条硬的：**目录里有 `index.html` 作为入口**。`dist/liuyige/` 就是为这个准备的。

两条子路径，任选：

- **A1. 官方 MCP（已在本机配好，见第五节）** —— 一句话上传，全程不用手点后台
- **A2. 开发者中心后台** —— 登录 [开发者中心](https://developer.taptap.cn/) → 创建游戏 → 填写名称与类型 → 点右侧「快速上架」→ 上传图标 → 保存并提交 → 按要求上传文件

### ⚠️ B. 普通小游戏 —— 本项目跑不了，需要改写

文档：`developer.taptap.cn/minigameapidoc`

- 包体必须是**通过 TapTap 打包工具产出的指定 zip**
- 运行环境是个 JS VM，**没有 BOM 和 DOM**，只有 `tap.*` 系列 API
- 入口是 `game.js`，配置是 `game.json` 和 `project.config.json`

本项目是 DOM + Canvas 混合：`<dialog>` 弹窗、按钮、模板字符串 `innerHTML`、整套 CSS 布局（flex / grid / 媒体查询）。这些在无 DOM 环境里全部不存在，等于要有个 mini 浏览器才行。官方对 Cocos／Laya／Egret 的方案是**各引擎自己写 adapter 抹平差异**，纯手写 H5 没有现成的。

真要走路 B，实际工作量是**把界面层重写成 Canvas 绘制**——顶栏、委托簿、四个弹窗、玩法说明全部改成画在 canvas 上，点击命中检测自己算。玩法与关卡逻辑（`core.js`，67 KB）可以整块复用，改的主要是 `game.js` 的渲染与命中层。

**只有当你需要「普通小游戏」独有的能力时才值得走**，比如 TapADN 广告变现（平台零分成、支持个人开发者）。纯粹为了上架，A 更快。

### C. PC 游戏 WebGL 试玩

zip → 单一文件夹 → `index.html`，跑在内嵌浏览器里，也有完整 DOM。`dist/liuyige.zip` 正好符合这套结构。这条路官方文档挂在《PC 游戏包体上传注意事项》下。

### D. 激励视频：代码已接好，能不能用取决于走哪条路

游戏里的「超出免费额度的一点提示」和「消除一件旧物」都挂在激励视频上，适配层在 `ads.js`（约 80 行）。它只回答一个问题——**这一次机会给不给**——游戏主体不关心广告从哪来。

官方口径（`minigameapidoc` → 开放能力 → 广告）：

```js
const ad = tap.createRewardedVideoAd({ adUnitId });   // 单例
ad.onLoad(cb) / ad.onError(cb) / ad.onClose(res => res.isEnded);
ad.show();          // 返回 Promise，没加载完会 reject，要 ad.load() 之后重试
```

**铁律：只有 `onClose` 回调里 `res.isEnded === true` 才算看完，才能发奖励。** 不能 `show()` 一返回就发——玩家中途划走也算「返回成功」了。

| 路线 | `tap` 全局 | 广告能不能用 |
|---|---|---|
| A. H5 快速上架（WebView） | **尚未确证** | 官方文档目前只覆盖 JS VM 小游戏，WebView 里有没有 `tap` 需要在真机/真环境里实测一次 `typeof tap` |
| B. 普通小游戏（JS VM） | 有 | 可以，这也是走 B 的主要理由之一 |
| C. PC WebGL 试玩 | 没有 | 不能 |
| APK（系统 WebView） | 没有 | 不能 |

所以 `ads.js` 按「拿不到就降级」写，`AD_UNIT_ID` 留空即视为未接入：

- 拿不到广告 → 直接放行（`STRICT = false`），并在状态栏说明原因。网页版、WebView 版、APK 都能照常玩，不会出现「点了没反应」。
- 正式变现时，去 TapTap 开发者后台（或 Dirichlet 媒体管理平台）建一个「激励视频」广告位，把 ID 填进 `ads.js` 的 `AD_UNIT_ID`；要把「拿不到广告就不给奖励」打开，再把 `STRICT` 改成 `true`。
- 状态栏会给明确的失败原因：`ended / skipped / unavailable / load-failed / timeout / busy`，不会静默失败。

另外，「消除一件」在播广告**之前**就先算好了要消哪件，并且用求解器验过「消掉之后这一关仍然可解」——不会让玩家看完广告才被告知这件消不得。取舍关尤其需要这一层：玩家人手只放 `keepCount` 件，能凑满格数的挑法本来就少。

---

## 五、APK 版本（另一条渠道）

H5 包跑在 WebView 里，APK 也跑在 WebView 里 —— **同一份游戏文件**，区别只是容器归谁。所以这条路没改游戏代码，`android/` 下那一个 Java 文件就是全部。

```
dist/liuyige.apk   89 KB
包名               com.liuyige.game
版本               1.0.1 (versionCode 1001)
minSdk / targetSdk 24 (Android 7.0) / 34
签名               v1 + v2 + v3，自签名
```

构建链不用 Gradle，直接调 Android SDK 的 `aapt2 → javac → d8 → zipalign → apksigner`。原因和那几条「构建全绿、装上却白屏」的坑（aapt2 在 Windows 上往条目名里写反斜杠、d8 覆盖而非追加、XML 注释里的 `--`、HEAD 报的 `content-length` 会偏小）都记在 `android/README.md`。

```bash
node android/tools/setup-sdk.cjs    # 一次性：装最小 Android SDK
node android/tools/build-apk.cjs    # 出包
node android/tools/verify-apk.cjs   # 校验
```

### 双渠道要额外做的事

官方文档对「同时提供 APK 下载与小游戏」的要求：

> 如希望同时提供 APK 下载与小游戏二种游玩方式，请接 TapTap 登陆开放能力并确保版本间用户数据互通。

**这一条现在没做。** 当前 APK 的存档只在手机本机（WebView 的 localStorage），和小游戏那份不互通。只发单渠道不受这条约束；两个渠道都发，就得先接 TapTap 登录。

资质要求也随之变化：

| 资质 | 只发小游戏 | 同时发 APK |
|---|---|---|
| 未成年人防沉迷 | 平台自动开启，无需操作 | **必须自行完善，或接入 TapPlay** |
| 小游戏前置备案 | 不涉及内购无需版号，但需完成前置备案 | 同左 |

### 签名密钥

首次构建自动生成 `android/liuyige-release.jks`（RSA 2048，有效期 30 年）与 `android/keystore.properties`（口令），两者都在 `.gitignore` 里。**升级已上架的应用必须用同一份密钥**，换机器时要把这两个文件一起带走，否则新包无法覆盖安装。

> ⚠️ **这个 APK 还没有在真机上启动过。** 本机既没有安卓设备也没有模拟器。已验证的是：包结构完整、`assets/liuyige/` 下 6 个文件与源文件逐字节一致、条目名没有反斜杠、签名有效、清单里的包名／版本／图标／入口 Activity 正确。**没验证的是** WebView 里的实际渲染与触摸手感。首次安装重点看四件事：会不会白屏、BGM 是否在首次点击后起播、拖棋盘时页面会不会跟着滚、杀进程后存档还在不在。

---

## 六、用官方工具上传（已配好）

### 首选：官方 CLI（`@taptap/cli`）

TapTap 官方维护的命令行工具，覆盖 9 个业务域、71 个操作，**本机已装**（v2026.9.11）。`doctor` 自检结果：

```
[pass] cli_version: 2026.9.11
[pass] installation: @taptap/cli installation detected via npm
[fail] config: profile default has not been saved
[fail] credentials: no TapTap credential is configured
[pass] server_url: https://developer.taptap.cn
[pass] server_health: https://developer.taptap.cn reachable
[pass] metadata: catalog 1.0.42 with 71 operations is ready
```

只有「配置」和「凭据」两项待办 —— 那是登录，需要你来完成（`auth login` 会给一条链接，你在浏览器里确认一次即可）。

和本项目有关的命令：

| 命令 | 用途 |
|---|---|
| `upload-h5-package <zip>` | 上传 H5 zip 并创建 H5 版本。带 `--screen-orientation 1` 声明竖屏 |
| `upload-apk <apk>` | 上传 APK 并创建包体记录 |
| `upload-pc-package` | 上传 Windows 包体 |
| `packages:overview` | 查看包体管理概览 |
| `test-qr-code` | 生成该版本的自测二维码 |
| `auth login` / `auth status` / `auth logout` | 登录态管理 |
| `doctor` | 检查配置、凭据与连通性 |

**一个硬约束**：传给它的文件路径必须在**当前工作目录内** —— 绝对路径、`..`、越出工作目录的软链接都会被拒。所以要在项目根目录下执行：

```bash
cd <项目根目录>
taptap-cli upload-h5-package dist/liuyige.zip --screen-orientation 1 --yes
```

> 本机为了不污染全局环境，CLI 装在隔离目录而非 `npm i -g`，调用时走
> `node ~/.workbuddy/binaries/node/workspace/node_modules/@taptap/cli/scripts/run.js <命令>`。
> 想直接用 `taptap-cli` 这个短名字，把它全局装一次即可。

### 备选：官方 MCP

本机 `~/.workbuddy/mcp.json` 也已加入官方 MCP 服务器，原有的 `xiaohongshu` 未改动：

```json
{
  "mcpServers": {
    "tds-mcp-server": {
      "command": "npx",
      "args": ["-y", "@taptap/tds-mcp-server"]
    }
  }
}
```

`@taptap/tds-mcp-server` 是 TapTap 官方包（MIT，npm 上 v0.1.6），提供这些工具：

| 工具 | 用途 |
|---|---|
| `tap_web_game_info_gatherer` | 收集并校验项目信息 |
| `tap_web_game_uploader` | 压缩并上传 |
| `tap_create_app` | 在 TapTap 创建游戏 |
| `tap_create_developer` | 创建开发者身份 |
| `tap_edit_app` | 改游戏信息（描述、横竖屏、沟通群） |
| `tap_get_app_status` | 查审核状态 |
| `tap_get_all_app` | 列出全部游戏 |
| `tap_logout` | 退出登录 |

### 启用步骤

1. 打开连接器管理页，在右上角「自定义连接器」里找到 `tds-mcp-server`，点 **Trust**。
   **新写的 MCP 配置不会自动生效**，必须点这一次。
2. 然后直接说一句「把这个 H5 游戏发布到 TapTap」，或让它指向 `dist/liuyige/` 这个目录。
3. 首次会走 TapTap 登录与开发者身份绑定（`tap_create_developer`）。**上传前需要 TapTap 开发者账号已完成认证**，这是官方 FAQ 里「上传失败」的第一条排查项。

注意 MCP 是**自己压缩上传**的，所以交给它的是**目录** `dist/liuyige/`，不是 `dist/liuyige.zip`。zip 那份留给 CLI（`upload-h5-package`）与 PC 游戏 WebGL 试玩；APK 走 `upload-apk`。

---

## 七、控制台要填的字段

| 位置 | 填什么 |
|---|---|
| 创建游戏 → 游玩提供方式 | 小游戏（H5） |
| 包体管理 → 上传包体 | 路线 A 交目录给 MCP；路线 C 传 `dist/liuyige.zip` |
| 版本设置 → 版本号 | `V1.0.1`（格式 `V x.y.z`，每段是整数） |
| 游戏资料 → **隐私政策链接** | `https://luffryfight.github.io/liuyige/privacy.html`（开启步骤见第七之二节） |
| 商店 → 商店资料 | 走完基础信息 + 物料，再提交审核 |

版本号规则：新版本必须**高于**旧版本，且提审／发布的版本号不能与已上线或审核中的重复。所以 0.4.1 和 0.5.0 都用掉了，这次传的是 1.0.1，下次再传就得从 1.0.2 起。

当前版本号散在 8 个文件里（README / 本文件 / TEST_REPORT / DEVELOPMENT_PLAN / NEXT_VERSION_PROPOSAL / android/README / pack-taptap / build-apk），手工改必漏。用升档器一次改齐：

```bash
node tools/bump-version.cjs 1.0.2 1002           # 升到 1.0.2 / versionCode 1002
node tools/bump-version.cjs 1.0.2 1002 --check   # 只体检引用点，不写文件
```

它要求每条替换**精确命中恰好 1 次**，对不上就整批中止（退出码 1），不会改一半；**历史小节标题不在替换表里**，因为那些记的是当年的事实，跟着新版本号走会变成假历史。`versionCode` 必须严格大于旧值，否则新包装不上去。

### 资质

| 资质 | 本项目情况 |
|---|---|
| 未成年人防沉迷 | 游玩方式**仅有小游戏**时平台自动开启，无需额外操作。如果同时提供 APK 下载，就必须自己做或接 TapPlay |
| 小游戏前置备案 | **不涉及内购的小游戏不需要版号**，但正式上架前要完成小游戏前置备案 |

备案有外部流程和等待时间，建议现在就启动，别等物料齐了才发现卡在这。

---

## 七之二、隐私政策链接（GitHub Pages）

审核要填一个「隐私政策链接」，点开必须能正常打开。这份政策放在仓库的 `docs/` 目录，用 GitHub Pages 发布。

### 三个文件

| 文件 | 作用 |
|---|---|
| `docs/privacy.html` | **公网要打开的就是这一份**，`privacy.css` 是它唯一的样式（无外链） |
| `docs/privacy.css` | 单独一份样式，不复用游戏那份 `style.css` |
| `docs/privacy.md` | 仓库里给人读的同一份正文，方便 review 与 diff |

### 开启 Pages（一次性，需要你在网页上点）

1. 打开 https://github.com/luffryfight/liuyige/settings/pages
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `v1`，目录选 **`/docs`**，Save
4. 等一两分钟，页面顶部会给出地址

拿到之后，要填进 TapTap 的链接就是：

```
https://luffryfight.github.io/liuyige/privacy.html
```

> 仓库名是小写 `liuyige`，地址里的这一段**必须小写**，GitHub Pages 的域名部分不区分大小写但路径区分。

### 为什么样式要单独抄一份

TapTap 审核第 2.2.3 条要求隐私政策「字体格式务必统一，请勿出现字体时大时小、多种字体随意穿插使用」。`docs/privacy.css` 里只有**一套字体族、一套正文尺寸、一套行高**：标题层级靠字号和间距拉开，不靠换字体。反过来，游戏那份 `style.css` 里有大量 `clamp()`、媒体查询和装饰性字号，直接复用会让政策页在窄屏上出现字号跳变——所以两份样式表是刻意分开的。

### 政策里为什么没有「我们会收集…」的清单

本项目的实际情况是：`localStorage` 只有两处读写（`game.js` 的存档键 `liuyige-mvp-v1` 与同意键 `liuyige-privacy-v1`），**零** `fetch` / `XMLHttpRequest`，`index.html` **零外链**，**零 SDK 依赖**，不申请任何设备权限（`AndroidManifest.xml` 只声明了 `INTERNET`，是给将来 TapTap 登录预留的，当前代码没有用到）。

既然确实没有数据，政策就**照实写短**，逐条说明「不收集什么」以及为什么。这比照抄模板里「我们可能收集设备 ID、IP 地址、实名信息」更可信，也更好过审——**政策里写的每一句，审核都可能实际核对**（第 2.2.1 条：填写的政策内容必须与 App 内的协议内容一致且真实有效）。

### 游戏内的对应实现

政策不是只挂一个链接就完事，App 内也得有。本项目在 `index.html` 加了首次启动的隐私弹窗 `#privacy-dialog`：

- 两个按钮「不同意」/「同意并开始」，等宽并列，**没有**「好的，我知道了」这类含糊文案，也**没有**默认勾选
- 点「不同意」：不写任何进度，但游戏照常能玩（审核要求「无论用户拒绝任何权限，都需提供基础功能」）
- 选择会被记住，不会每次打开都弹
- 「玩法说明」弹窗里有一个常驻入口，随时能重新查看，也能改主意
- 游戏内摘要与 `docs/privacy.html` 的正文口径一致（两边各说一套是这条最常见的翻车点，`tests/privacy.test.cjs` 里有一条测试专门比对）

自动化验收时的两个入口：`?consent=yes` / `?consent=no` 预置同意状态（截图用，免得每张图都被遮罩盖住）；不开这个参数就是正常的首次启动流程。

### 若 GitHub Pages 在国内打不开

Pages 用的是 `github.io`，国内访问偶有不稳。审核是在浏览器里人工点开核对的，打不开就等于这条不过。真遇到，可换成任一能稳定访问的静态托管，**只要正文一字不改**（改了就违反 2.2.1）。政策正文在 `docs/privacy.md`，粘到任何平台都能用。


---

## 八、物料清单

尺寸取自官方《游戏物料要求》，`*` 为必填。

| 物料 | 尺寸 / 要求 | 状态 |
|---|---|---|
| 图标 * | ≥512×512（1:1），png/jpg。**直接传直角方图，不要自己裁圆角**；不得用默认图标、白底、黑底或透明底 | ❌ 待做 |
| 竖版封面图 | 600×900，≤3MB。必须带游戏 LOGO 和标题，不得有其他宣传性文字 | ❌ 待做 |
| 宣传图 16:9 * | ≥1920×1080，≤4MB。必须展示清晰游戏名；**不得直接用游戏截图或简单拼贴**；除游戏名外不得有其他文字 | ❌ 待做 |
| 宣传图 1:1 | ≥1440×1440，≤4MB。仅上传**竖版**实机录屏时需要 | ❌ 待做 |
| 游戏截图 * | ≥3 张，竖版 ≥720×1280，宽高比 3:8~5:8，单张 ≤4MB，方向与比例必须一致，实机画面占比 ≥50% | ✅ **9 张现成可用** |
| 游戏实机录屏 * | MP4/MOV，H.264，>15 秒、≤30 分钟（建议 ≤2 分钟），短边 ≥540px | ❌ 待录 |
| 简介 * | 描述类型／玩法／特色，**建议前 50 字抓住人**；不得出现联系方式、兑换码、交流群、外部链接 | ❌ 待写 |
| 开发者的话 | 设计理念与心路。建议前 50 字，且**不要与简介雷同** | ❌ 待写 |
| 更新日志 * | 本次更新内容，有序列表即可 | ❌ 待写 |

### 现成可用的截图

`tools/shots/` 里有 9 张 **760×1400** 实机截图，比例 0.543 落在 3:8~5:8 区间内，尺寸和体积（123~191 KB）都直接达标：

| 文件 | 内容 |
|---|---|
| `lv1.png` | 第 1 关开局，新手章节 |
| `lv9-auto.png` | 基础收纳 |
| `lv13-auto.png` | 隔板抽屉 |
| `lv31-auto.png` | 隔板分区 |
| `lv45-auto.png` | 大师委托 |
| `lv87-auto.png` | 隔板抽屉 · 秋 · 起风，双条件（隔板 + 恰好放满） |
| `lv99-auto.png` | 大师委托 · 第二辑 |
| `lv100-auto.png` | 第 100 关，顶栏 `100 / 100` |
| `codex.png` | 回忆图鉴面板 |

挑 3~6 张上传，**按关卡由浅入深排**，让看的人先看懂玩法再看体量。官方要求「实机画面至少占图片 50%」——这几张都是整屏实机，没问题。

其余 20 张（`fix*`、`level-*`、`wide-*`、`v2-*`）尺寸或比例不达标，是历代迭代留下的，别传。

---

## 九、上传前检查清单

- [ ] `node tools/pack-taptap.cjs` 跑过，末尾是「结构合规 ✓ 可以直接上传」
- [ ] 手动解压 `dist/liuyige.zip` 看过：第一层只有 `liuyige/`，里面直接是 `index.html`
- [ ] 连接器里 `tds-mcp-server` 已点 **Trust**；或 `taptap-cli doctor` 里 config / credentials 两项都 pass
- [ ] TapTap 开发者账号**已完成认证**（官方 FAQ 里上传失败的头号原因）
- [ ] 图标／封面／宣传图／录屏／三份文案齐了
- [ ] 小游戏前置备案已启动
- [ ] 版本号填 `V1.0.1`（下次传从 V1.0.2 起，编号不能重复）
- [ ] **隐私政策链接已填**，且真的用浏览器（最好手机）点开过一次能正常显示
- [ ] **App 内首次启动有隐私弹窗**，两个按钮是明确的「同意」/「拒绝」
- [ ] 激励视频广告位：要么在后台建好并把 ID 填进 `ads.js`，要么确认 `AD_UNIT_ID` 仍为空、按「未接入」放行

走 APK 渠道时另加：

- [ ] `node android/tools/build-apk.cjs` 跑过，末尾有 SHA-256
- [ ] `node android/tools/verify-apk.cjs` 全绿
- [ ] 真机安装启动过（**目前还没做过**，见第五节的警告）
- [ ] 如需「APK + 小游戏」双渠道：已接 TapTap 登录并打通两边存档；已自行完善防沉迷或接入 TapPlay

---

## 十、移动端适配与窄视口验证

上线包跑在 WebView 里，不是独立标签页，那里的默认手势会和拖拽打架。`style.css` 末尾为此加了一层：

- `body` 关掉下拉刷新（`overscroll-behavior:none`）、长按选字与弹「存储图片」（`user-select` / `-webkit-touch-callout`）
- `canvas` 设 `touch-action:none`，否则拖动棋盘时浏览器会把 `pointermove` 截走去滚页面
- 按钮用 `touch-action:manipulation` 只关掉双击缩放和 300ms 延迟，**双指缩放保留**——小字号正文还要能放大，没必要为防误触牺牲无障碍
- 用 `body` 的 `padding:env(safe-area-inset-*)` 避开刘海和底部横条（桌面浏览器上 `env` 解析为 0，等于没改）

音频不用额外处理：BGM 本来就在**第一次点画面或按键**时起播，符合 WebView 的自动播放策略。

### 实测结果

用 `node tools/overflow.cjs` 在 **320 / 360 / 375 / 390 / 414 / 430 / 540 / 650 / 760 / 900 / 1024 / 1280** 十二个宽度下真实渲染，全部**无横向溢出**：

| 视口宽 | 棋盘宽 | | 视口宽 | 棋盘宽 |
|---|---|---|---|---|
| 320 | 294 | | 540 | 514 |
| 360 | 334 | | 650 | 624 |
| 375 | 349 | | 760 | 464 |
| 390 | 364 | | 900 / 1024 / 1280 | 492 |
| 414 / 430 | 388 / 404 | | | |

棋盘在 320px 的窄机上也还有 294px，够玩；760 起被 `max-width` 收住，不再继续长。视觉确认见 `tools/shots/vp-390.png`。

> 这个工具是这轮现做的，过程里先误报过一次「390px 下溢出 148px」。原因是**无头 Chrome 的 `--window-size` 有 500px 下限**——它按 500 排版再把图裁到 390，看上去就像溢出。改成用 iframe 造真实窄视口后复测，才是上表的结果。详见 `TEST_REPORT.md`。
