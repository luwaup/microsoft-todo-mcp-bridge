# Microsoft To Do MCP Bridge

[中文说明](README.zh-CN.md) · [Security](SECURITY.md) · [Data handling](PRIVACY.md)

A self-hosted remote MCP server for **personal Microsoft To Do accounts**. Connect an OAuth-capable client such as ChatGPT to read lists, create tasks, change due dates and mark tasks complete.

This is an independent community project, not an official Microsoft, OpenAI or Cloudflare integration. **v0.2.0 is a pre-release for individual deployments**, not a reviewed multi-user hosting service.

## Let your AI client guide installation

The repository now includes a Codex plugin marketplace and standalone setup/task skills. In a local client with terminal access, ask the AI to use `plugins/personal-todo/skills/personal-todo-setup/SKILL.md` from this repository at `v0.2.0`, deploy into your own Cloudflare account, configure MCP and verify a To Do read. Sign in, consent and enter secrets directly in your own browser/terminal.

See [AI-guided installation](INSTALL.zh-CN.md) for the copyable prompt, plugin source and resumable commands. No maintainer endpoint, credentials or preconfigured MCP connection are bundled. Skills do not grant a plain chat environment local deployment tools.

## Deploy to your own account

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luwaup/microsoft-todo-mcp-bridge)

The button is an optional Cloudflare deployment entry point. Its full onboarding flow has not been verified. It **does not configure Microsoft OAuth or bypass consent**. Use the guided setup below for the tested deployment approach.

Requirements: Node.js 22+, your own Cloudflare account, a personal Microsoft account, and an Entra directory in which you can register an application. A Microsoft account by itself may not have that directory; obtain access through Microsoft's supported Azure or Microsoft 365 onboarding first. Keep the same To Do account and tasks.

```bash
git clone https://github.com/luwaup/microsoft-todo-mcp-bridge.git
cd microsoft-todo-mcp-bridge
npm ci
npm run check
npm run setup
```

`npm run setup` prints staged instructions. Sign in with `npx wrangler login`, then run `npm run setup -- --prepare`. Register the Microsoft app using the printed callback, run `npm run setup -- --configure` in your own terminal for credential entry, and run `npm run client:configure -- --client codex`. Personal settings stay in ignored `.personal/wrangler.json`; reruns reuse that file and leave the public template intact. Other clients can use `--client generic` and import the generated local MCP configuration through their supported settings.

1. Register an Entra application with a neutral name, for example **Personal To Do Bridge**. Microsoft-branded app names and callback hostnames can be rejected.
2. Choose **Personal Microsoft accounts only**. The server uses the Microsoft `/consumers` authority.
3. Add a **Web** redirect URI matching your deployment exactly: `https://personal-todo-bridge.your-subdomain.workers.dev/callback`.
4. Add Microsoft Graph **delegated** permissions `User.Read` and `Tasks.ReadWrite`. The sign-in request also asks for `offline_access` to refresh authorization.
5. Create a client secret. Save its **value**, not the secret ID, directly to Wrangler or Cloudflare Secrets as `MS_CLIENT_SECRET`. Save the application's **client ID**, not the tenant ID, as `MS_CLIENT_ID`.
6. Complete Microsoft sign-in and consent when connecting an MCP client. A `configured: true` health response checks only that settings exist; it does not prove their validity or task access.

Do not put secrets into chat, GitHub issues, source code, screenshots or a public deployment form. Each deployer must supply their own credentials.

### Connect ChatGPT or another client

Open [ChatGPT Plugins](https://chatgpt.com/plugins), choose **Add → Add custom MCP server**, select **OAuth**, and enter:

```text
https://personal-todo-bridge.your-subdomain.workers.dev/mcp
```

The server advertises CIMD and dynamic registration. ChatGPT can discover OAuth settings automatically; its OAuth client is separate from your Microsoft application. Follow the bridge consent page, check the client callback domain, then authorize on Microsoft's sign-in pages. Availability depends on your account and workspace.

Example requests:

- Show my To Do lists.
- Add “Buy groceries” to my Tasks list, due tomorrow.
- Re-read this task and move its due date to next Friday.
- Mark this task complete.

Resolve opaque list and task IDs with read tools before making changes. Due dates are calendar dates, not reminder times. `due_date: null` clears the due date. Destructive changes require the host's approval; deleting one task additionally requires `confirm: true`.

### Manual deployment

```bash
npm ci
npx wrangler login
npx wrangler kv namespace create OAUTH_KV
# Put only your namespace ID into your local wrangler.jsonc.
npx wrangler deploy
# Register the exact /callback URL in Entra, then:
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler deploy
```

Set `PUBLIC_BASE_URL` to the exact Worker origin in local deployment configuration. The guided setup sets it for you. Do not commit the locally edited deployment file: the release privacy check rejects personal namespace IDs or account configuration. Keep personal configurations in the ignored `.personal/` directory when maintaining a fork.

`GET /health` is a no-task-data check. Unauthenticated `/mcp` must return 401. Local development uses the ignored `.dev.vars` file, a separate development app, and `http://localhost:8787/callback`.

## Tools

| Read | Write |
| --- | --- |
| `list_task_lists` | `create_task_list`, `rename_task_list` |
| `list_tasks`, `get_task` | `create_task`, `update_task` |
| `list_checklist_items` | `complete_task`, `reopen_task` |
| | `add_checklist_item`, `delete_task` |

Bounded list responses return `{ items, truncated }`. This project makes live Graph requests; it has no background synchronization or independent reminder scheduler.

## Security model

Microsoft credentials are stored as Cloudflare Secrets. Per-user access and refresh tokens are held in encrypted OAuth grant properties managed by Cloudflare's OAuth provider and KV. Task content is returned only through authorized tool calls; the bridge has no separate task-content database.

The MCP side uses PKCE, state, browser-bound upstream transactions, validated callbacks and resource-bound OAuth tokens. Graph requests are restricted to Microsoft To Do paths and pagination stays in the original collection. Writes are not automatically retried. Microsoft error bodies are not echoed. Invocation logging is disabled by default because callback URLs can contain authorization codes.

MCP clients and Microsoft still process data under their own policies. The Cloudflare account owner controls the deployment and storage. See [PRIVACY.md](PRIVACY.md) for boundaries and revocation steps. Do not expose a shared multi-user service without a separate security review, rate limiting and operational controls.

## Validation and limits

- TypeScript checks, 19 protocol/unit tests and a complete local Worker OAuth scenario passed. OAuth integration tests use mocked Microsoft responses, including refresh and two-account isolation.
- A personal live deployment completed ChatGPT CIMD authorization and discovered all 12 tools. Creating a test list/task, changing its title and completing it were independently confirmed in the Microsoft To Do web UI.
- The ChatGPT test reply had a rendering failure. Actual task changes were confirmed separately; raw reply/tool-result transcripts are not published. If a client reply fails, read back before retrying a write.
- Long-running real refresh, all remaining live tools, two real-account isolation and the deployment-button onboarding are not fully verified. No independent penetration test has been performed.
- There are no transactional bulk updates or automatic ETag conflict resolution. Re-read before editing tasks that other devices may change.

## Development and release hygiene

```bash
npm run check          # Typecheck, protocol tests, build, Worker OAuth scenario
npm run security:check # Check tracked public files without printing matched secrets
npm audit --omit=dev
npm run release:pack -- v0.1.2
```

The packer accepts a **clean Git checkout**, packages committed public files only, adds a SHA-256 manifest, and verifies ZIP contents against Git. It never packages `.personal`, local logs or deployment evidence. The scanner is a defense against accidental publication, not proof that every possible secret is detectable.

CI runs without Microsoft or Cloudflare credentials. Dependency versions are pinned in `package-lock.json`; GitHub Actions are pinned to commit SHAs with read-only repository permissions.

## References

- [Microsoft To Do Graph API](https://learn.microsoft.com/en-us/graph/todo-concept-overview)
- [Register a Microsoft application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider)
- [Cloudflare deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [OpenAI MCP authentication](https://developers.openai.com/apps-sdk/build/auth/)

MIT licensed. See [LICENSE](LICENSE).
