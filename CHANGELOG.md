# Changelog

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
