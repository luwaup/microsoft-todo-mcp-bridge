# 让 AI 帮你部署并连接 Microsoft To Do

面向 Codex，以及具备本地终端／部署能力、支持 skills 的客户端。每个人使用自己的 Cloudflare、微软应用和 To Do 账号。普通聊天仅阅读 GitHub 链接，不会自动获得部署权限。

## 最简单的开始方式

把这段话发给有本地工具的 AI 客户端：

> 请从 https://github.com/luwaup/microsoft-todo-mcp-bridge 的 v0.2.0 版本读取并使用 plugins/personal-todo/skills/personal-todo-setup/SKILL.md，帮我部署到我自己的 Cloudflare，再配置本客户端的 MCP 连接。先检查环境，复用已有的本项目配置。微软登录、授权和密钥输入请引导我在对应网页或自己的终端完成，不要让我在聊天里发送密码或密钥。完成后读取 To Do 清单验证连接。

## 安装独立 skills

支持 skill 安装器的客户端，可让 AI 安装以下两个技能目录：

- [personal-todo-setup：安装和连接](https://github.com/luwaup/microsoft-todo-mcp-bridge/tree/v0.2.0/plugins/personal-todo/skills/personal-todo-setup)
- [manage-personal-todo：日常管理任务](https://github.com/luwaup/microsoft-todo-mcp-bridge/tree/v0.2.0/plugins/personal-todo/skills/manage-personal-todo)

可以直接说：

> 请使用本客户端的 skill 安装器，从 luwaup/microsoft-todo-mcp-bridge 仓库的 v0.2.0 版本安装 plugins/personal-todo/skills/personal-todo-setup 和 plugins/personal-todo/skills/manage-personal-todo 两个技能。不要修改我已有的同名技能，发现冲突时先说明。

也可 [下载独立 skills ZIP](https://github.com/luwaup/microsoft-todo-mcp-bridge/releases/download/v0.2.0/personal-todo-skills-v0.2.0.zip)（[SHA-256](https://github.com/luwaup/microsoft-todo-mcp-bridge/releases/download/v0.2.0/personal-todo-skills-v0.2.0.zip.sha256)）。解压后按客户端说明安装两个技能文件夹；每个文件夹内都有 `SKILL.md`。压缩包里的许可证、提交标识和校验清单用于溯源，不需要作为技能安装。

`SKILL.md` 文件链接用于直接阅读；需要仓库目录的安装器，请使用上面的技能目录链接。安装后按客户端要求开启新会话，再说“帮我连接微软 To Do”。安装技能提供工作流，实际部署还需要后面的服务源码和本地工具。

## Codex 插件方式

添加本仓库为插件源：

```bash
codex plugin marketplace add luwaup/microsoft-todo-mcp-bridge --ref v0.2.0
```

在支持的桌面客户端中打开插件目录，选择 **Personal To Do Bridge** 来源，安装 **personal-todo**。按客户端提示刷新／重启后，运行插件的 setup，或说“帮我部署自己的微软 To Do 连接”。可用入口以客户端版本为准。

仓库包含标准插件清单、Codex 兼容清单和两个 skills。这里先安装的是部署／使用流程；因为每个人的服务地址不同，包内没有预填 MCP 地址或任何人的插件连接 ID。部署后才生成个人连接配置。

插件包亦随 GitHub Release 提供。仓库插件源和独立 skill 分发，不代表已进入 OpenAI 公共插件目录；没有发布共享托管服务。

## AI 会完成什么，你需要做什么

| 步骤 | AI 辅助执行 | 你完成 |
|---|---|---|
| 检查环境 | 检查 Node.js 22+、Git、源码与依赖，运行检查 | 提供可用的本地环境 |
| Cloudflare 登录 | 提供登录入口、核对目标账号 | 登录及必要验证 |
| 部署服务 | 创建独立 Worker 和 KV，保存本机配置 | 确认目标账户和资源范围 |
| 微软应用 | 按实际回调地址说明表单，可用时协助填表 | 登录、注册／条款及权限确认 |
| 配置密钥 | 说明应填字段、检查配置项是否存在 | 将密钥值直接输入自己终端或 Cloudflare Secrets |
| 配置 MCP | Codex CLI 注册具名连接，其他客户端导入配置 | 完成 OAuth 登录与权限同意 |
| 验收 | 读取清单；获准后在测试清单做写入验证 | 决定是否进行写入测试 |

AI 能自动化部署和配置，不会绕过账号登录、条款或权限同意。没有浏览器控制能力的客户端，可以给你确切地址与表单内容，不能假装已操作网页。

## 分阶段命令

AI 从源码执行时，依次使用：

```bash
git clone --branch v0.2.0 https://github.com/luwaup/microsoft-todo-mcp-bridge.git
cd microsoft-todo-mcp-bridge
npm ci
npm run check
npx wrangler login
npm run setup -- --prepare
```

`--prepare` 创建一个带随机后缀的独立 Worker，创建专用 KV，将设置保存在已忽略的 `.personal/wrangler.json`。跟踪中的 `wrangler.jsonc` 保持占位模板。中断后复用此目录和配置重试，不要另建一套资源。

如果 Cloudflare 有多个账户，先确认目标账号再执行 `npm run setup -- --prepare --account-id <你的账户ID>`。账户 ID 不是 API 密钥，但也不要放到公开 Issue 或截图里。

根据打印的真实 `/callback` 地址，在 Entra 注册中性名称 **Personal To Do Bridge**，账号类型选“仅限个人 Microsoft 账号”，回调类型 **Web**。添加 Graph 委托权限 `User.Read` 和 `Tasks.ReadWrite`；登录申请 `offline_access` 以刷新授权。仅有个人微软登录不一定已有可注册应用的目录，需要时先按微软支持的流程取得目录访问权限。

创建客户端密钥后，**在你自己打开的交互终端中**执行：

```bash
npm run setup -- --configure
```

按 Wrangler 提示输入应用程序的客户端 ID 和客户端密钥值。该命令不接受把密钥放在参数、聊天或 agent stdin 中；不要把“租户 ID”当作客户端 ID，不要把“密钥 ID”当作密钥值。也可以直接在该 Worker 的 Cloudflare Secrets 页面配置 `MS_CLIENT_ID`、`MS_CLIENT_SECRET`。

然后让 AI 继续：

```bash
npm run setup -- --status
npm run client:configure -- --client codex
```

Codex CLI 会注册默认名 `personal-todo`。若该名字已指向别的地址，脚本会停止，使用 `--name my-personal-todo` 等新名字继续，不覆盖原连接。CLI 不可用时，使用 `--client generic`，从 `.personal/mcp.json` 导入客户端支持的配置入口。

在你自己的终端／客户端完成 OAuth：

```bash
codex mcp login personal-todo
```

部分 CLI 版本添加连接时就会启动授权。使用实际注册名，在微软页面完成登录与同意。刷新工具或新建会话后，先读取 To Do 清单；读成功才表示连接完成。`configured:true` 仅证明配置项存在。

## 已验证的范围

原有真实个人部署已通过 ChatGPT OAuth 连接及创建、改名、完成的核心验收。新增分阶段部署与客户端配置逻辑有离线测试，使用模拟 Wrangler，避免测试创建云资源或获取真实凭据。插件清单、公开文件、打包内容另行检查。

新用户全新账户的完整技能引导、所有客户端安装和 Codex 的真实 OAuth 登录，仍需按本流程实际验收，不能把离线检查称为这些环节都已跑通。

## 出错时

保留本地 `.personal` 配置。先检查登录账号、应用账号类型、精确回调、密钥是否过期及客户端入口。不要为排障公开配置文件、回调授权码或令牌。

如果创建任务后回复失败，先重新读取确认是否已写入。不要直接重复创建。

不要共享你的运行实例给公众，也不要将个性化配置提交 GitHub。数据流和撤销授权见 [PRIVACY.md](PRIVACY.md)，安全说明见 [SECURITY.md](SECURITY.md)。

官方分发与连接依据：[插件打包和 onboarding](https://developers.openai.com/plugins/build/plugins)、[skill 与 MCP](https://developers.openai.com/plugins/build/skills)、[Codex MCP 配置](https://developers.openai.com/learn/docs-mcp)。
