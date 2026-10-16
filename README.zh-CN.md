# Microsoft To Do MCP Bridge

[English](README.md) · [安全说明](SECURITY.md) · [数据处理说明](PRIVACY.md)

部署在自己 Cloudflare 账户的 Microsoft To Do 远程 MCP 服务，支持**个人微软账号**。连接 ChatGPT 等兼容 OAuth 的 MCP 客户端后，可以读取清单、新建任务、修改截止日期和标记完成。

这是独立社区项目，非微软、OpenAI 或 Cloudflare 官方产品。**v0.2.0 为个人部署预览版**，不应直接作为未经审查的公开多用户托管服务。

## 让 AI 引导安装

新增 Codex 插件及独立 skills。把下面这段话发给支持本地工具的 AI：

> 请读取 https://github.com/luwaup/microsoft-todo-mcp-bridge 的 v0.2.0 版本中 plugins/personal-todo/skills/personal-todo-setup/SKILL.md，按这个技能帮我部署到自己的 Cloudflare，配置 MCP 并读取 To Do 清单验证。登录、授权及密钥输入由我在对应网页或自己的终端完成。

完整步骤、插件源安装命令、AI 能自动完成的部分和人工登录边界见 **[AI 安装说明](INSTALL.zh-CN.md)**。每个人都用自己的服务，不连接维护者的个人实例。普通聊天读取仓库不能替代本地部署工具。

## 部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luwaup/microsoft-todo-mcp-bridge)

按钮提供 Cloudflare 的部署入口，完整按钮流程尚未验收。它**不能代替微软应用注册、密钥配置和首次授权**。建议先使用以下向导流程。

准备 Node.js 22+、自己的 Cloudflare 账户、个人微软账号，以及可注册应用的 Entra 目录。仅拥有微软账号不一定已经有目录，必要时先通过微软提供的 Azure／Microsoft 365 入口取得目录；现有 To Do 账号和任务不用迁移。

```bash
git clone https://github.com/luwaup/microsoft-todo-mcp-bridge.git
cd microsoft-todo-mcp-bridge
npm ci
npm run check
npm run setup
```

`npm run setup` 显示分阶段说明。先在自己的终端完成 `npx wrangler login`，再让 AI 运行 `npm run setup -- --prepare`；注册微软应用后，自己运行 `npm run setup -- --configure` 输入凭据，最后运行 `npm run client:configure -- --client codex` 配置 MCP。各阶段复用 `.personal/wrangler.json`，不修改公开模板。

1. 在 Entra 注册应用，名称建议用 **Personal To Do Bridge**。含 Microsoft 品牌字样的应用名称或回调域名可能被微软拒绝。
2. 支持账户类型选**仅限个人 Microsoft 账号**。本服务使用 `/consumers` 授权入口。
3. 回调类型选 **Web**，精确填写自己的地址：`https://personal-todo-bridge.your-subdomain.workers.dev/callback`。
4. 添加 Microsoft Graph **委托权限** `User.Read` 和 `Tasks.ReadWrite`。登录时还会申请 `offline_access`，用于刷新授权。
5. 创建客户端密钥，把**密钥值**直接填入 Wrangler 或 Cloudflare Secrets 的 `MS_CLIENT_SECRET`；把**应用程序（客户端）ID**填入 `MS_CLIENT_ID`。不要混用密钥 ID、租户 ID。
6. 连接 MCP 客户端时完成微软登录与同意授权。健康检查 `configured:true` 只表示配置项存在，不代表密钥有效或已经访问 To Do。

**不要把密码、客户端密钥、令牌、授权码、任务内容或账号标识发到聊天、GitHub Issue、公开源码或截图中。每位部署者使用自己的应用和密钥。**

## 连接 ChatGPT

在 [ChatGPT 插件](https://chatgpt.com/plugins) 中选择“添加 → 添加自定义 MCP 服务器”，认证选 OAuth，地址填自己的：

```text
https://personal-todo-bridge.your-subdomain.workers.dev/mcp
```

服务支持 CIMD 和 DCR 自动发现。ChatGPT 的 OAuth 客户端与微软应用是两层不同配置，不要把微软密钥填到 ChatGPT 的高级 OAuth 客户端表单里。先核对服务授权页展示的客户端回调域名，再到微软页面登录授权。具体入口受账号和工作区功能影响。

连接后可说：“查看我的 To Do 清单”“新增一个明天到期的买菜任务”“重新读取这个任务后修改截止日期”“把它标记完成”。清单和任务使用不同的 opaque ID，应先读取再修改。`due_date:null` 可清除日期；截止日期不等于提醒时间。

## 功能与安全边界

- 4 个读取工具：清单、任务列表、单个任务、检查项。
- 8 个写入工具：新建／重命名清单，新建／修改／完成／重新打开／删除任务，添加检查项。
- 列表返回 `items` 和 `truncated`，不会把截断结果称为完整数据。
- 请求实时访问 Microsoft Graph，没有后台定时同步、离线缓存或独立提醒服务。
- 密钥放 Cloudflare Secrets；微软访问令牌和刷新令牌放 OAuth provider 管理的加密授权属性。
- 授权包含 PKCE、state、浏览器绑定和校验回调；Graph 路径及分页受限。写入不自动重试，避免超时后重复创建。
- 默认关闭调用日志，避免保留包含授权码的回调地址；不回显微软错误响应正文。
- 删除需要 `confirm:true` 和客户端确认。多设备并发修改暂不自动解决冲突，应先重新读取。

新版向导将个人 KV 和服务地址写入已忽略的 `.personal/wrangler.json`。手动部署如果修改本地 `wrangler.jsonc`，不要提交该个性化文件。维护自己的 fork 时，可通过 Wrangler 的 `--config` 参数指定 `.personal/` 内的配置。公开仓库和发布包中只保留占位配置，不附带任何人的可访问实例或密钥。

## 已验证与未验证

类型检查、19 项单元／协议测试、构建及 1 项本地 Worker OAuth 场景已通过；本地微软响应为模拟，包括刷新和双账户隔离。

一个真实个人部署已完成 ChatGPT CIMD 授权，加载全部 12 个工具。ChatGPT 创建清单和任务、修改标题并标记完成后，已在微软 To Do 网页独立核对。测试对话回复发生显示失败，未发布其原始返回记录；客户端回复异常时，应先读回任务确认是否已写入。

长期真实令牌刷新、全部其他工具、两个真实账号的线上隔离、公开多用户托管及部署按钮完整流程尚未全面验收。当前不宣称经过独立安全审计或“零配置即用”。

## 开发与发布

```bash
npm run check
npm run security:check
npm audit --omit=dev
npm run release:pack -- v0.1.2
```

公开文件检查不会输出命中的秘密值。打包只接受干净的 Git 工作区，从指定提交取文件并加入 SHA-256 清单，逐项复查压缩包内容。个人配置、日志、截图和本地验收记录不进入公开仓库或发布包。扫描有检测边界，不能替代审查。

数据处理、撤销授权和安全报告见 [PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md)。协议与手动部署细节见 [英文说明](README.md)。MIT 许可证见 [LICENSE](LICENSE)。
