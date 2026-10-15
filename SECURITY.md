# Security policy

## Supported use

The current pre-release targets an individually owned Worker and Microsoft application. Do not use it as an unreviewed shared multi-user service. No independent security audit has been completed.

## Report a vulnerability privately

Use this repository's **Security → Report a vulnerability** when enabled. Do not put secrets, tokens, OAuth codes, task content, deployment URLs or account identifiers in public issues. If private reporting is unavailable, request a private reporting channel without describing an exploit or posting sensitive data publicly.

## Controls and boundaries

- Delegated Microsoft `User.Read`, `Tasks.ReadWrite` and `offline_access`; no application-wide To Do permission.
- Separate MCP OAuth consent, PKCE, state, browser-bound upstream authorization, per-client grants and resource-bound tokens through `@cloudflare/workers-oauth-provider`.
- Microsoft credentials in Cloudflare Secrets; upstream tokens in the provider's encrypted grant properties stored in KV.
- The consent screen displays the verified client domain when available and the callback host. For dynamically registered clients, a display name is not identity verification.
- CSP permits only the bridge, required Microsoft sign-in hosts and the validated client callback for form navigation. Embedding and untrusted scripts are blocked.
- Graph calls stay on Microsoft To Do paths. Pagination must remain in the original collection; redirects are not followed. Extra authorization headers cannot be injected.
- Timeouts are bounded. Writes are not automatically retried. Error bodies are not echoed into tool responses.
- No bulk deletion tool; one-task deletion requires explicit `confirm: true` and human approval in the MCP host.
- Invocation logging is off by default. Host or infrastructure logs and third-party clients are outside this code's guarantees.

MCP client permissions determine whether an assistant asks before changing tasks. A tool annotation is a hint, not an authorization boundary. The Microsoft delegated permission grants broad task read/write access; the bridge does not offer a separate read-only scope in this release.

## Credential handling

Create credentials yourself in Entra and save only their value to the intended deployment's encrypted secret store. Never commit `.dev.vars`, `.env`, `.personal`, runtime state, authorization screenshots or exported task data. Do not reuse this project's maintainer's credentials or instance.

If a secret or token is exposed, revoke/replace it at the issuing service first, then update the deployment and disconnect/reconnect affected clients as needed. Removing it from the latest commit or deleting an issue does not erase prior exposure. Restrict access to Cloudflare and your development computer.

To revoke Microsoft access, remove the app's consent in your Microsoft account and disconnect the MCP client. Rotate a leaked client secret independently. Microsoft revocation does not guarantee that an already issued token disappears immediately; disconnect and invalidate the corresponding MCP grant as well.

## Release checks

CI runs without deployment credentials and uses read-only repository permissions. Run `npm run check`, `npm run security:check` and a current dependency audit before release. Release archives are generated from committed, allowlisted Git files with a SHA-256 manifest. The scanner does not detect every secret format or replace review.

Before broader production use, separately validate real-account isolation, long-running refresh and revocation, token mix-up defenses, malicious redirects, cancellation, rate limiting, abuse prevention, operational logging and publisher-verification requirements.
