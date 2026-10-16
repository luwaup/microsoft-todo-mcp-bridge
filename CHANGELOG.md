# Changelog

## Distribution update — 2026-10-16

- Reorganized the English and Chinese homepages around AI-guided self-hosting, with direct setup/task skill links and copyable install prompts.
- Added a standalone skills archive and checksum alongside the existing v0.2.0 assets. The skills come from the unchanged v0.2.0 tag; existing source and plugin archives remain unchanged.
- Added explicit skill-directory installation links and clarified the difference between GitHub distribution and public plugin-directory approval.

## 0.2.0 — 2026-10-16

AI-guided self-hosting and client setup pre-release.

- Installable repository plugin marketplace, portable/Codex manifests, onboarding skill and task-management skill; standalone skills work with capable local agents.
- Staged preparation, human credential entry and status checks. Dedicated Worker names and ignored personal configuration avoid publishing settings or overwriting the tracked template.
- Codex MCP registration refuses to replace another endpoint under the same name; generic MCP configuration is generated locally for other clients.
- Chinese installation guide with a copyable AI prompt, resumable steps and explicit login/consent boundaries.
- Offline setup regression tests use a simulated Wrangler; no new real account or cloud resources are used for those tests. Fresh-user onboarding and real Codex OAuth still require live acceptance testing.

This release distributes a self-hosting workflow, not a shared service or a public-directory approval.

## 0.1.2 — 2026-10-16

Initial public pre-release for individually owned deployments.

- Stateless Streamable HTTP MCP with 12 tools and per-request OAuth context.
- Microsoft personal-account authorization with PKCE, consent, refresh handling, CIMD and dynamic client registration.
- Correct consent form submission and Chromium-compatible form redirect policy.
- Workers-compatible fetch handling, constrained Graph pagination, safe error messages, bounded timeouts and no automatic write retries.
- Read/write/destructive annotations, truncated-list indicators and nullable due dates.
- Guided Windows-compatible deployment, neutral Worker/app naming, exact dependency lockfile and credential-free CI.
- Public-file privacy gate, synthetic regression tests, private reporting guidance and Git-based source archives with verified SHA-256 manifests.

Validation: 19 existing unit/protocol tests and a local Worker OAuth scenario, plus release-safety tests. A personal live ChatGPT authorization and task create/update/complete flow were independently checked in Microsoft To Do. Long-running live refresh, remaining tools and multi-user hosting are not fully validated.

Earlier 0.1.0 and 0.1.1 development packages were local review iterations and are not release assets in this repository.
