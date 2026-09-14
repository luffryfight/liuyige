# TapTap MCP 与广告接入

配置日期：2026-09-13。依据项目中的 `AI_SETUP_GUIDE.md`，安装官方 `@taptap/instant-games-open-mcp@1.24.14`。

## 已完成

- 本机 Node.js v24.19.0，满足官方最低版本要求。
- MCP 安装于 `.taptap-mcp/runtime`，未修改全局 npm 设置。
- Cursor 项目配置：`.cursor/mcp.json`。用 Cursor 打开本文件所在的游戏根目录即可发现配置。
- 启动器：`tools/start-taptap-mcp.cjs`。固定项目路径、production 环境、stdio 传输；缓存、临时文件和日志都在 `.taptap-mcp/`。
- 已实际完成 MCP initialize、tools/list 和 check_environment；服务器报告版本 1.24.14，Native Signer 可用，尚未完成用户授权。
- 已通过 MCP 读取 `get_ads_integration_workflow`，并生成官方扫码二维码。

`.taptap-mcp/` 已加入 `.gitignore`，其中会保存授权凭据；不要将该目录作为游戏资源或源码压缩包分发。现有 `tools/pack-taptap.cjs` 按运行文件白名单打包，不包含这个目录。

## 在 Cursor 使用

打开 `keepsake-mvp` 游戏目录。若已打开，重新加载窗口后在 MCP 设置中启用 `taptap-minigame`。本次已通过本地 MCP 客户端验证服务器连接，未在 Cursor 窗口内验证绿色连接状态。

官方安装指南推荐用户级配置；Cursor 官方文档也支持项目级 `.cursor/mcp.json`，本项目采用后者，配置仅随该项目启用：
https://prod.cursor.com/docs/mcp

首次在另一台机器配置时，在游戏根目录执行：

```powershell
npm.cmd install --prefix .taptap-mcp/runtime --cache .taptap-mcp/npm-cache --ignore-scripts --no-audit --no-fund --save-exact @taptap/instant-games-open-mcp@1.24.14 --registry https://registry.npmjs.org
```

## 当前待办

1. 用户用 TapTap App 扫码确认；在发起扫码的同一个 MCP 会话中调用 `complete_oauth_authorization` 完成授权。二维码过期或会话重启时需要重新生成。
2. 调用 `get_current_app_info`；如未选择游戏，列出应用，核对目标开发者和游戏，再选择。
3. 调用 `check_ads_status`。只使用本次官方查询返回的当前游戏广告位，不手填、不复用其他游戏参数。
4. 若未开通，按工具返回的链接完成开通；用户完成后再查询。必须同时满足“已生效”和“有效广告位”才能获取代码指南。
5. 调用 `get_ad_integration_guide`，据此更新现有 `ads.js` 及相关激励入口，测试完成、提前关闭、加载失败、重复回调和切关行为。
6. 在 TapTap H5 宿主中真机验证。MCP 连接或广告状态生效不等于已成功播放广告。

目前没有改动游戏中的 `ads.js` 或虚构广告位 ID，广告 SDK 接入尚待上述授权与平台状态检查。APK 的广告集成不使用此 H5 全局 `tap` 接口，应另走对应 SDK。

## 本地诊断

无需 Cursor 也可以启动同一官方 MCP 进行诊断：

```powershell
node tools/taptap-mcp-session.cjs
```

启动会显示工具列表。每行输入一个 JSON 请求，例如：

```json
{"tool":"check_environment"}
{"tool":"get_ads_integration_workflow"}
{"tool":"start_oauth_authorization"}
```

扫码成功后，在同一进程输入：

```json
{"tool":"complete_oauth_authorization"}
```

这个小客户端仅用于本地连接与诊断，不随游戏发布。二维码保存到 `.taptap-mcp/oauth-qr.png`；输出会隐藏 token 等认证字段。

官方工作流：https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/mcp-setup/
