# Microsoft To Do MCP + AI Skills

[English](README.md) · [安全说明](SECURITY.md) · [数据处理说明](PRIVACY.md)

**把安装技能交给 Codex，让 AI 引导你部署并连接自己的微软待办。**

本项目提供安装 skill、日常任务管理 skill 和 Microsoft To Do MCP 服务。AI 帮你检查环境、部署到自己的 Cloudflare、配置客户端连接；你在微软及 Cloudflare 的页面完成登录、应用注册确认和授权，并直接配置自己的密钥。连接后，可以在对话里读取清单、新建任务、修改截止日期和标记完成。

[开始安装](INSTALL.zh-CN.md) · [安装 skill](https://github.com/luwaup/microsoft-todo-mcp-bridge/blob/v0.2.0/plugins/personal-todo/skills/personal-todo-setup/SKILL.md) · [下载 skills 包](https://github.com/luwaup/microsoft-todo-mcp-bridge/releases/download/v0.2.0/personal-todo-skills-v0.2.0.zip) · [版本发布](https://github.com/luwaup/microsoft-todo-mcp-bridge/releases/tag/v0.2.0)

这是独立社区项目，非微软、OpenAI 或 Cloudflare 官方产品。**v0.2.0 为个人部署预览版**，不应直接作为未经审查的公开多用户托管服务。

## 让 AI 引导安装

把下面这段话发给 Codex，或其他具备本地终端／部署能力、支持 skills 的 AI 客户端：

> 请安装并使用这个技能：https://github.com/luwaup/microsoft-todo-mcp-bridge/blob/v0.2.0/plugins/personal-todo/skills/personal-todo-setup/SKILL.md 。帮我部署到自己的 Cloudflare，配置本客户端的 MCP，并读取 To Do 清单验证。先检查环境并复用本项目已有配置。登录、应用注册确认、授权和密钥输入，请引导我在对应网页或自己的终端完成，不要让我在聊天里发送密码或密钥。

完整步骤、插件源安装命令、AI 能自动完成的部分和人工登录边界见 **[AI 安装说明](INSTALL.zh-CN.md)**。每个人都用自己的服务，不连接维护者的个人实例。普通聊天读取仓库不能替代本地部署工具。

## 发布的 skills 与插件

| 内容 | 用途 | 获取 |
| --- | --- | --- |
| `personal-todo-setup` | 检查环境、引导部署和授权、配置 MCP、读取清单验收 | [查看 skill](plugins/personal-todo/skills/personal-todo-setup/SKILL.md) |
| `manage-personal-todo` | 查找任务、按要求修改和完成、处理不确定的写入结果 | [查看 skill](plugins/personal-todo/skills/manage-personal-todo/SKILL.md) |
| 独立 skills 包 | 下载两个技能，按客户端支持的方式安装 | [下载 ZIP](https://github.com/luwaup/microsoft-todo-mcp-bridge/releases/download/v0.2.0/personal-todo-skills-v0.2.0.zip) |
| Codex 插件包 | 一起安装两个技能及安装后引导入口 | [下载插件](https://github.com/luwaup/microsoft-todo-mcp-bridge/releases/download/v0.2.0/personal-todo-plugin-v0.2.0.zip) |

支持仓库插件源的 Codex 可执行：

```bash
codex plugin marketplace add luwaup/microsoft-todo-mcp-bridge --ref v0.2.0
```

然后在支持的桌面客户端插件目录中，选择 **Personal To Do Bridge** 来源并安装 **personal-todo**，刷新后运行 setup。安装方式以客户端版本为准，详见安装说明。

这里发布的是 **GitHub skills／仓库插件源**，尚未上架 OpenAI 公共插件目录。技能引导工作流，MCP 服务负责实际认证和任务读写；个人连接地址在部署后生成，不随包预填。

## 部署细节

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

v0.2.0 的类型检查、29 项单元／协议／发布及安装检查、构建及 1 项本地 Worker OAuth 场景已通过；新增部署流程使用模拟 Wrangler，本地微软响应也为模拟，包括刷新和双账户隔离。技能格式检查已通过。

一个真实个人部署已完成 ChatGPT CIMD 授权，加载全部 12 个工具。ChatGPT 创建清单和任务、修改标题并标记完成后，已在微软 To Do 网页独立核对。测试对话回复发生显示失败，未发布其原始返回记录；客户端回复异常时，应先读回任务确认是否已写入。

新用户完整的技能安装、真实 Codex OAuth、所有其他客户端安装、长期真实令牌刷新、全部其他工具、两个真实账号的线上隔离、公开多用户托管及部署按钮完整流程尚未全面验收。当前不宣称经过独立安全审计或“零配置即用”。

## 开发与发布

```bash
npm run check
npm run security:check
npm audit --omit=dev
npm run release:pack -- HEAD
```

公开文件检查不会输出命中的秘密值。打包只接受干净的 Git 工作区，从指定提交取文件并加入 SHA-256 清单，逐项复查压缩包内容。个人配置、日志、截图和本地验收记录不进入公开仓库或发布包。扫描有检测边界，不能替代审查。

数据处理、撤销授权和安全报告见 [PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md)。协议与手动部署细节见 [英文说明](README.md)。MIT 许可证见 [LICENSE](LICENSE)。
