# Data handling for self-hosted deployments

This describes the code's design. It is not a substitute for the policies or obligations of a person hosting a service for other users.

## Data flow

1. Your MCP client contacts your Worker and receives its own OAuth authorization.
2. You sign in on Microsoft's pages. Your Microsoft password and MFA verification are not entered into this bridge.
3. The Worker exchanges the authorization code with Microsoft and binds the grant to the stable Graph user ID.
4. Microsoft access and refresh tokens are stored in encrypted OAuth grant properties managed by Cloudflare's provider and KV. The Worker can decrypt and use them; the deployment owner controls that environment. Client ID and secret are Cloudflare secret bindings.
5. Authorized tools send requests to Microsoft Graph and return relevant task data to the requesting MCP client. The bridge has no separate task-content database or background sync job.

Cloudflare processes requests and storage for the deployment. Microsoft processes sign-in and To Do data. ChatGPT or another MCP client receives the tool results and may retain conversation data under its own settings and policies. This project cannot promise zero retention across those services.

## Stored information

OAuth provider state may include client registrations, consent transactions, user/grant identifiers, scopes, token records and encrypted upstream credentials. Retention depends on provider token/transaction lifetimes and deployment administration. Expiry is not a guarantee of immediate physical deletion from every infrastructure backup.

Invocation logging is disabled by default to reduce accidental storage of authorization codes in callback URLs. Do not enable logs, analytics or debugging exports that capture headers, callback query parameters, secrets or task content without deliberate redaction and retention controls.

## Control and deletion

Disconnect the MCP client and revoke the application's Microsoft consent to stop future authorized use. The Cloudflare owner can remove this deployment's grants and storage, taking care not to delete unrelated resources. Disconnecting does not delete Microsoft To Do tasks or previous conversations from a client. Manage those in their respective products.

Do not post personal deployment URLs, client/tenant IDs, screenshots, task exports or logs in public support issues. Share only minimal redacted diagnostics through an appropriate private channel.

## Publication

The public source and release ZIP contain placeholders, code and synthetic tests. They do not contain a working personal endpoint, application credentials, personal account IDs, task records, local screenshots or authenticated session data. Publishing this repository is not publishing anyone's Worker instance.
