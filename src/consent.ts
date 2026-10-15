import type { ConsentDescription } from '@cloudflare/workers-oauth-provider';

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);

export function consentPage(d:ConsentDescription,handle:string) {
  const scopes=d.scope.map(s=>`<label><input name="scope" type="checkbox" value="${escapeHtml(s)}" checked> ${escapeHtml(s)}</label>`).join('<br>');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize To Do MCP</title><style>body{font:16px system-ui;margin:8vh auto;max-width:600px;padding:0 20px;line-height:1.6}button{padding:10px 24px;margin-right:12px}section{background:#f3f4f6;padding:16px;border-radius:12px}</style></head><body><h1>Connect Microsoft To Do</h1><p><b>${escapeHtml(d.clientName)}</b> requests permission to manage your tasks.</p><section><p>${d.clientDomain?`Client domain: <b>${escapeHtml(d.clientDomain)}</b>`:'This client self-registered: its name is not verified.'}</p><p>The MCP client callback is <b>${escapeHtml(d.redirectHost)}</b>. Microsoft tokens stay with this bridge.</p>${d.redirectIsLoopback?'<p><b>This destination is on your local computer. Continue only if you started this sign-in.</b></p>':''}</section><p>By allowing, this MCP client can read, create, change and delete your To Do tasks. You will sign in with Microsoft next.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(handle)}"><p>Permissions:</p>${scopes}<p><button name="decision" value="approve">Allow and sign in</button><button name="decision" value="deny">Deny</button></p></form></body></html>`;
}

export function consentHeaders(headers:Headers,redirectUri:string):Headers {
  // Chromium also applies form-action to the redirect chain after a POST.
  // Include Microsoft's consumer sign-in hosts and the provider-validated client
  // callback, so approval and denial can leave this page without a wildcard.
  const callback=new URL(redirectUri);
  const destination=['https:','http:'].includes(callback.protocol)?callback.origin:callback.protocol;
  const formSources="'self' https://login.microsoftonline.com https://login.live.com https://account.live.com "+destination;
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; form-action ${formSources}; frame-ancestors 'none'; base-uri 'none'`);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  return headers;
}
