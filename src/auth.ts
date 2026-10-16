import { AuthorizationError, CimdFetchError, authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import { authorizationUrl, challenge, exchangeCode, getMicrosoftUserId } from './microsoft.js';
import { consentPage,consentHeaders } from './consent.js';
import type { Env, Props } from './types.js';

export function authHandler() {
  return {
    async fetch(req:Request, env:Env):Promise<Response> {
      const url=new URL(req.url);
      const oauth=env.OAUTH_PROVIDER!;
      try {
      if(url.pathname==='/') return new Response('Microsoft To Do MCP Bridge is running. Connect an OAuth-enabled MCP client to /mcp.\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
      if(url.pathname==='/health') return Response.json({ok:true,service:'microsoft-todo-mcp-bridge',version:'0.2.0',configured:Boolean(env.MS_CLIENT_ID?.trim() && env.MS_CLIENT_SECRET?.trim())},{headers:{'Cache-Control':'no-store'}});
      if(url.pathname==='/authorize' && (!env.MS_CLIENT_ID?.trim() || !env.MS_CLIENT_SECRET?.trim())) return new Response('Microsoft application is not configured yet.',{status:503,headers:{'Cache-Control':'no-store'}});
      if(url.pathname==='/authorize' && req.method==='GET') {
        const authReq=await oauth.parseAuthRequest(req);
        const details=await oauth.describeConsent(authReq);
        const consent=await oauth.beginConsent(authReq);
        consentHeaders(consent.headers,details.redirectUri);
        return new Response(consentPage(details,consent.handle),{headers:consent.headers});
      }
      if(url.pathname==='/authorize' && req.method==='POST') {
        const form=await req.formData();
        const handle=String(form.get('handle')||'');
        if(form.get('decision')!=='approve') {
          const denied=await oauth.denyConsent(req,handle);
          return new Response(null,{status:302,headers:denied.headers});
        }
        const selectedScopes=[...new Set(form.getAll('scope').map(String))];
        if(selectedScopes.length!==1 || selectedScopes[0]!=='todo:readwrite') {
          const denied=await oauth.denyConsent(req,handle);
          return new Response(null,{status:302,headers:denied.headers});
        }
        const approved=await oauth.approveConsent(req,handle,{scope:selectedScopes});
        const verifier=crypto.randomUUID()+crypto.randomUUID();
        const upstream=await oauth.beginUpstream(approved.request,{data:{verifier},headers:approved.headers});
        const redirectUri=new URL('/callback',url.origin).href;
        upstream.headers.set('Location', authorizationUrl(env.MS_CLIENT_ID,redirectUri,upstream.state,await challenge(verifier)));
        return new Response(null,{status:302,headers:upstream.headers});
      }
      if(url.pathname==='/callback' && req.method==='GET') {
        const callback=await oauth.finishUpstream<{verifier:string}>(req);
        const params=url.searchParams;
        if(params.get('error')) {
          // The provider constructs a verified client redirect including state.
          callback.headers.set('Location',authorizationErrorRedirect(callback.request,'access_denied'));
          return new Response(null,{status:302,headers:callback.headers});
        }
        const code=params.get('code');
        if(!code) return new Response('Missing Microsoft authorization code',{status:400});
        const redirectUri=new URL('/callback',url.origin).href;
        const token=await exchangeCode(code,callback.data.verifier,redirectUri,env.MS_CLIENT_ID,env.MS_CLIENT_SECRET);
        if(!token.refresh_token) throw new Error('Microsoft did not supply offline_access refresh token');
        const userId=await getMicrosoftUserId(token.access_token);
        const grant=await oauth.completeAuthorization({
          request:callback.request,userId,metadata:{label:'Microsoft To Do user'},scope:callback.request.scope,
          props:{accessToken:token.access_token,msRefreshToken:token.refresh_token,userId,expiresAt:Date.now()+token.expires_in*1000,grantedScopes:callback.request.scope} satisfies Props,
        });
        callback.headers.set('Location',grant.redirectTo);
        return new Response(null,{status:302,headers:callback.headers});
      }
      return new Response('Not found',{status:404});
      } catch (e) {
        if(e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo,302);
        if(e instanceof AuthorizationError || e instanceof CimdFetchError) return new Response('Invalid or expired authorization request; restart sign-in.',{status:400});
        return new Response('Authorization failed. Restart sign-in; contact your deployment administrator if this continues.',{status:502,headers:{'Cache-Control':'no-store'}});
      }
    }
  };
}
