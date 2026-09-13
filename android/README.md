# Android 壳工程（APK 分发）

把 `index.html` 那套 H5 游戏装进一个最小的 WebView 壳，产出一个可以直接装到安卓手机上的 APK。

产物：`dist/liuyige.apk`

---

## 一、这里为什么不是 Gradle 工程

没有 `build.gradle`、没有 `settings.gradle`、没有 Android Studio 工程文件。原因很直接：

- **这个壳只有一个 Java 文件、三份 XML、五个密度的图标。** Gradle 在这里带来的只有几百 MB 的依赖、一层看不见的构建缓存，以及一份需要长期跟随 AGP 版本升级的配置。收益为零。
- 构建链只用 Android SDK 的 build-tools 里那几个命令行工具：`aapt2` → `javac` → `d8` → `zipalign` → `apksigner`。每一步都能单独看见中间产物，出错时不用在被 Gradle 吞掉的日志里翻。
- 同样没用 Cordova / Capacitor：它们替你做的主要是「生成一个 WebView 壳」，那部分代码在这里一共 100 行，而多引入一个 npm 依赖树换来的是版本升级时的一堆麻烦。

代价是构建脚本要自己写（`tools/build-apk.cjs`，约 280 行），但那个脚本把每一步都摊开在终端里，是可读的。

## 二、目录

```
android/
├── AndroidManifest.xml          清单：竖屏锁定、图标、入口 Activity
├── src/com/liuyige/game/
│   └── MainActivity.java        唯一的 Java 文件：配置 WebView、载入本地资源、跟随生命周期
├── res/
│   ├── values/{strings,colors,styles}.xml
│   └── mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
├── assets-src/icon.html         图标源文件（一张 512×512 的 HTML）
├── tools/
│   ├── setup-sdk.cjs            装 JDK/SDK 之外的最小 Android SDK
│   ├── fetch-multi.cjs          多连接分块下载器（对付 dl.google.com 的单连接限速）
│   ├── unzip-zip.cjs            自研 zip 解压器（逐条目验 CRC，用于定位坏包）
│   ├── make-icon.cjs            用无头 Chrome 渲染 icon.html，再降采样出 5 个密度
│   ├── build-apk.cjs            主构建脚本
│   └── verify-apk.cjs           产物校验（结构 + 逐字节比对 + 签名 + 泄露检查）
├── assets/                      构建时从项目根复制的游戏文件（可再生成，不进仓库）
├── build/                       中间产物（不进仓库）
├── liuyige-release.jks          签名密钥（不进仓库）
└── keystore.properties          密钥口令（不进仓库）
```

## 三、构建

```bash
# 一次性：装 JDK 17 与 Android build-tools / platform-34
node android/tools/setup-sdk.cjs

# 图标变了才需要重跑
node android/tools/make-icon.cjs

# 出包
node android/tools/build-apk.cjs

# 校验
node android/tools/verify-apk.cjs
```

`build-apk.cjs` 会依次做：

| 步 | 动作 |
|---|---|
| 1 | 把 7 个运行时文件复制进 `android/assets/liuyige/`，逐个比对 sha256 |
| 1.5 | 检查 XML 注释里没有连续的 `--`（XML 不允许，aapt2 的报错完全看不出位置） |
| 2 | `aapt2 compile` 编译 `res/` |
| 3 | `aapt2 link` 链接资源 + assets + 清单 |
| 3.5 | 修正条目名里被 aapt2 写进去的反斜杠 |
| 4 | `javac` 编译 `MainActivity.java` |
| 5 | `d8` 转 dex，再用 `aapt add` 塞进 APK 根目录 |
| 6 | `zipalign -p -f 4` |
| 7 | `apksigner sign`（v1 + v2 + v3） |

产物信息（0.5.0）：包名 `com.liuyige.game`，versionCode `500`，minSdk `24`，targetSdk `34`，约 81 KB。

### 签名密钥

首次构建自动生成 `android/liuyige-release.jks`（RSA 2048，有效期 30 年），口令写在 `android/keystore.properties`。两个文件都在 `.gitignore` 里。

**升级已上架的应用必须用同一份密钥**，换机器时请把这两个文件一起带走，否则新包无法覆盖安装。

## 四、踩过的坑（下次别再犯）

这一节是这个文档存在的主要理由。五条里有四条都属于「构建全绿、装上去才发现不对」的类型。

### 1. aapt2 在 Windows 上把 assets 条目名写成反斜杠

`assets/liuyige/index.html` 会被写成 `assets/liuyige\index.html` —— 前两级用正斜杠、文件名前用反斜杠。

**给 `-A` 传正斜杠路径没用**，aapt2 内部按 Windows 原生分隔符拼。后果极隐蔽：zip 合法、`apksigner` 照签、`apksigner verify` 全绿，但 Android 的 AssetManager 按 `assets/liuyige/index.html` 查找，找不到 → **装上打开是白屏**。

解法是构建后原地修正：`\` 和 `/` 都是单字节，条目名长度不变，所以直接在中央目录和本地文件头里替换字节即可，不用重写压缩包（文件名不参与 CRC，CRC 与签名都不受影响）。见 `normalizeEntrySeparators()`。

### 2. d8 的 `--output` 指向已有 zip 时是「覆盖」不是「追加」

第一版把 `aapt2 link` 的输出（`app-unsigned.zip`）直接喂给 `d8 --output`，出来只剩一个 `classes.dex`，资源和 `AndroidManifest.xml` 全没了。症状是 `apksigner` 报 `Missing AndroidManifest.xml`。

改成 `d8 --output <目录>` 产出 dex，再用 `aapt` v1 的 `add` 子命令拼进 APK 根目录。

另外 d8 **按扩展名判断输出类型**，喂 `.apk` 会直接拒绝（`Output must be a .zip or .jar archive or an existing directory`），所以 `aapt2 link` 的输出故意用 `.zip` 后缀。

### 3. XML 注释里不能有连续的 `--`

注释里写了 CSS 变量名，aapt2 报：

```
colors.xml:0: error: xml parser error: not well-formed (invalid token).
```

行号是 `0`，完全看不出位置。已在构建脚本里加了预检，命中会直接指名文件。

### 4. 不要用 HEAD 的 `content-length` 当文件总长

`dl.google.com` 上 `HEAD` 返回的 `content-length` 比真实文件**小**（实测 `build-tools_r34-windows.zip` 少 162536 字节）。分块下载据此切块，永远覆盖不到尾部，下出来一个「下载完成」却没有中央目录的 zip。

这时 `tar` 只给一句 `Error exit delayed from previous errors`，不说是哪个条目、也不说 CRC 对不对。工具链里因此多了一个 `unzip-zip.cjs` —— 它逐条目报 CRC，就是为定位这类问题写的。

修法是改用 `Range: bytes=0-0` 的 `content-range` 里的总长，那是跟随实际响应体的。

### 5. dl.google.com 单连接被限速

实测单连接 0.06–0.4 MB/s，16 连接分块能到 0.2–2 MB/s。`fetch-multi.cjs` 就是为此写的，同时支持从已有文件长度续传。

（顺带：`build-tools` 与 `platform-34` 的 sha1 与官方 `repository2-1.xml` 现在**能对上**——之前对不上正是因为下载不完整。所以 `setup-sdk.cjs` 保留 sha1 校验，只在真的不匹配时降级为内容校验。）

## 五、壳做了什么

`MainActivity.java` 只有一件事：把 WebView 配成能跑这个游戏的样子。

- `setJavaScriptEnabled` + `setDomStorageEnabled`：本机存档（整齐度、图鉴、声音偏好）走 `localStorage`，不开就丢档
- `setMediaPlaybackRequiresUserGesture(false)`：BGM 由页面在首次点击时启动，这里放开只是不让 WebView 二次拦截
- `setCacheMode(LOAD_NO_CACHE)`：全静态资源，避免改了包还读旧的
- `setOverScrollMode(NEVER)`：关掉回弹，否则拖棋盘时页面会跟着晃
- 竖屏锁定（`android:screenOrientation="portrait"`）
- 窗口背景色与页面纸色一致（`#f4efe3`），避免启动瞬间闪白
- **不做沉浸式**：系统栏保持可见，刘海和底部横条天然压不到内容，就不必依赖 `env(safe-area-inset-*)` 在 WebView 里的实现差异

游戏本体一行代码都没改，全部原样跑在 `assets/liuyige/` 里。

## 六、尚未验证的部分

**没有真机、也没有模拟器，这个 APK 从未在安卓上真正启动过。**

能确定的是：包结构完整、游戏文件与源文件逐字节一致、签名有效、清单里的包名／版本／图标／入口 Activity 都正确。不能确定的是 WebView 里的实际渲染与触摸手感。

第一次真机安装时重点看：
1. 打开是否白屏 —— 若白屏，先怀疑 assets 路径问题（虽然已修，但这是 1 号坑的症状）
2. BGM 是否在首次点击后起播
3. 拖动棋盘时页面会不会跟着滚（`touch-action:none` 是否生效）
4. 存档在杀进程后是否还在（`localStorage` 的 DOM Storage 开关）
