import OAuthProvider, { OAuthError } from '@cloudflare/workers-oauth-provider';
import { handleMcp } from './mcp.js';
import { authHandler } from './auth.js';
import { refreshMicrosoft, MicrosoftTokenError } from './microsoft.js';
import type { Env, Props } from './types.js';

export default {
  fetch(request:Request,env:Env,ctx:ExecutionContext) {
    const origin=env.PUBLIC_BASE_URL || new URL(request.url).origin;
    try {
      const configured=new URL(origin);
      if(configured.origin!==origin || (configured.protocol!=='https:' && !['http://localhost:8787','http://127.0.0.1:8787'].includes(origin))) throw new Error();
      if(new URL(request.url).origin!==origin) return new Response('Use the configured public service URL.',{status:421});
    } catch { return new Response('Invalid PUBLIC_BASE_URL configuration.',{status:503}); }
    const app=new OAuthProvider<Env>({
      apiRoute:'/mcp',apiHandler:{fetch:handleMcp},defaultHandler:authHandler(),
      authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/register',
      scopesSupported:['todo:readwrite'],requiredScopes:['todo:readwrite'],
      resourceMetadata:{resource:`${origin}/mcp`,authorization_servers:[origin]},
      clientIdMetadataDocumentEnabled:true,
      tokenExchangeCallback:async options=>{
        const p=options.props as Props;
        if(options.grantType==='authorization_code') {
          return {accessTokenTTL:Math.max(60,Math.min(3000,Math.floor((p.expiresAt-Date.now())/1000)-120))};
        }
        if(options.grantType!=='refresh_token') return;
        try {
          const t=await refreshMicrosoft(p.msRefreshToken,options.env.MS_CLIENT_ID,options.env.MS_CLIENT_SECRET);
          const next:Props={...p,accessToken:t.access_token,msRefreshToken:t.refresh_token||p.msRefreshToken,expiresAt:Date.now()+t.expires_in*1000};
          return {newProps:next,accessTokenTTL:Math.max(60,Math.min(3000,t.expires_in-120)),refreshTokenIdleTTL:30*24*3600};
        } catch(e) {
          if(e instanceof MicrosoftTokenError && e.status===400) throw new OAuthError('invalid_grant',{description:'Microsoft login expired or revoked; please sign in again.'});
          throw new OAuthError('temporarily_unavailable',{description:'Microsoft login refresh temporarily failed.',statusCode:503});
        }
      },
    });
    return app.fetch(request,env,ctx);
  }
};
