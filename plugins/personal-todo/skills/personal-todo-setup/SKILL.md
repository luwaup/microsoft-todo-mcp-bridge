---
name: personal-todo-setup
description: Deploy the Microsoft To Do MCP bridge to the user's own Cloudflare, guide Microsoft application registration and safe credential entry, configure a supported MCP client, and verify OAuth access. Requires local terminal access for deployment.
---

# Deploy and connect your own To Do bridge

Use the user's language. This is a self-hosting installer skill, not a shared hosted service. The user owns the Worker, KV, Microsoft application and authorization. Do not substitute a maintainer's personal endpoint or credentials.

## Get the source and establish scope

Use https://github.com/luwaup/microsoft-todo-mcp-bridge at release tag `v0.2.0`. The same repository contains `INSTALL.zh-CN.md`, which gives user-facing steps and limitations. If installed as a standalone skill without repository files, clone that tag into a user-authorized directory; do not assume the plugin cache contains the server source or write into the installed cache.

Reuse a matching checkout and its ignored `.personal` configuration when resuming. Do not reset user changes or create another deployment just because a previous run was interrupted. Check the current directory and configuration before choosing to clone or deploy.

Check Node.js 22+, Git and terminal capabilities. If the client has no terminal/deployment capability, explain this limitation and hand off to a capable local client; do not claim ordinary chat can deploy by reading these instructions alone.

Explain that the workflow creates a dedicated Cloudflare Worker and KV, registers a Microsoft application, and adds one MCP connection. Stay within that scope; do not alter existing unrelated resources or automatically approve new access, terms or billable services.

## Prepare deployment

Run `npm ci` and `npm run check` in the reviewed checkout. Have the user complete `npx wrangler login` in their own terminal/browser if needed. Run `npm run setup -- --prepare`; the command chooses a distinct neutral Worker name, stores settings under ignored `.personal/wrangler.json`, creates a dedicated KV and prints the actual callback URL. It leaves the tracked template untouched.

If the account is ambiguous, resolve the user's intended Cloudflare account before deploying and use the documented `--account-id` option. Do not guess from the first account returned. If resource creation succeeds but the next step fails, inspect saved configuration and the provider before retrying. Never interpret an unrecognized creation response as permission to create duplicates.

## Guide the Microsoft application

Use the real callback printed by setup. In Entra create **Personal To Do Bridge**, select **personal Microsoft accounts only**, and register a **Web** redirect URI with the exact `/callback`. A personal Microsoft login may first need access to an Entra directory; guide through the supported Microsoft onboarding without migrating existing To Do tasks.

Add Microsoft Graph delegated `User.Read` and `Tasks.ReadWrite`. The sign-in flow also requests `offline_access`. Explain the requested identity, task read/write and continued-access permissions. Microsoft app registration, permission consent, terms, passkeys and verification follow the host's approval/handoff rules; do not silently accept them.

Have the user create an application client secret and run `npm run setup -- --configure` in their own interactive terminal, or enter the values directly in Cloudflare Secrets for this Worker. They enter the application client ID and client secret **value**. Do not ask for a password, OTP, passkey, secret, authorization code or token in chat, agent stdin or command arguments. Do not inspect clipboard contents or capture a generated-secret page. Client ID is not tenant ID; secret value is not secret ID.

## Configure the client

Run `npm run setup -- --status` to check presence of configuration. This is not proof of valid credentials or Graph access.

For Codex with the official CLI, run `npm run client:configure -- --client codex`. This registers one named MCP using the CLI; it refuses to overwrite another endpoint under the same name. If needed, select a different name with `--name`. Let the user complete `codex mcp login personal-todo` (or the selected name) through the client's OAuth browser flow. The add command may itself initiate authorization depending on CLI version. Never place the Microsoft application secret in client OAuth settings.

For another MCP client, run `npm run client:configure -- --client generic` and import `.personal/mcp.json` through its supported settings. Adapt to that client's documented format and OAuth capabilities; do not replace the user's entire MCP configuration. Do not promise all clients support the same UI or automatic install.

Start a new client session or refresh tools as required. Find the installed bridge tools and perform a read-only list call. A successful read confirms the connection; do not claim success solely from deployment, configuration or a login window.

## Verify and finish

Report deployment prepared, application configured, client registered, OAuth completed and read access verified as separate states. If an optional write test is authorized, use a synthetic test list/task only, read back, rename, complete and verify it. Do not modify existing tasks as part of installation.

If a write response is missing or the UI fails, read back before retrying. Keep personal URLs/configuration out of public commits, issues and screenshots. Never run broad `git add .` in a personalized checkout. Do not publish or share this user's endpoint without authorization.
