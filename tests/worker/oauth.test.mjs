import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Worker runtime: real OAuth consent, PKCE, callbacks, refresh and account isolation with mocked Microsoft',async()=>{
  const calls=[];
  const mf=new Miniflare(convertV4MiniflareOptions({
    modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
    kvNamespaces:['OAUTH_KV'],bindings:{MS_CLIENT_ID:'test-app',MS_CLIENT_SECRET:'test-secret',PUBLIC_BASE_URL:'https://bridge.test'},
    outboundService:async req=>{
      const url=new URL(req.url);calls.push({host:url.host,path:url.pathname});
      if(url.host==='login.microsoftonline.com' && url.pathname.endsWith('/token')) {
        const p=new URLSearchParams(await req.text());
        assert.equal(p.get('client_secret'),'test-secret');
        const user=p.get('grant_type')==='refresh_token'?p.get('refresh_token').slice(2):p.get('code');
        assert.ok(['A','B'].includes(user));
        return Response.json({access_token:'T_'+user,refresh_token:'R_'+user,expires_in:3600});
      }
      if(url.href==='https://graph.microsoft.com/v1.0/me') return Response.json({id:req.headers.get('Authorization').slice(-1)});
      if(url.href==='https://graph.microsoft.com/v1.0/me/todo/lists') return Response.json({value:[{id:req.headers.get('Authorization').slice(-1)}]});
      return new Response('Unexpected external request',{status:500});
    }
  }));
  const f=(path,init)=>mf.dispatchFetch('https://bridge.test'+path,{...init,redirect:'manual'});
  const cookie=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  try {
    const health=await f('/health');assert.equal((await health.json()).configured,true);
    const unauth=await f('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(unauth.status,401);assert.match(unauth.headers.get('WWW-Authenticate'),/resource_metadata/);
    const metadataUrl=unauth.headers.get('WWW-Authenticate').match(/resource_metadata="([^"]+)"/)[1];
    const metadata=await mf.dispatchFetch(metadataUrl);assert.equal(metadata.status,200);assert.equal((await metadata.json()).resource,'https://bridge.test/mcp');
    const reg=await f('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'test-client',redirect_uris:['https://client.example/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
    assert.equal(reg.status,201);const {client_id}=await reg.json();
    const verifier='v'.repeat(64),challenge=createHash('sha256').update(verifier).digest('base64url');
    const params=new URLSearchParams({client_id,response_type:'code',redirect_uri:'https://client.example/callback',scope:'todo:readwrite',state:'CLIENT_STATE',code_challenge:challenge,code_challenge_method:'S256',resource:'https://bridge.test/mcp'});
    const consent=async()=>{
      const r=await f('/authorize?'+params);assert.equal(r.status,200);
      assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
      // Browser form POST redirects must allow upstream sign-in and the exact
      // validated client origin, while retaining the embedding restriction.
      const csp=r.headers.get('Content-Security-Policy');
      assert.match(csp,/form-action 'self' https:\/\/login.microsoftonline.com https:\/\/login.live.com https:\/\/account.live.com https:\/\/client.example;/);
      assert.ok(!csp.includes('*'));
      const html=await r.text(),form=html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)[1];
      assert.match(form,/name="scope"/);
      return {handle:form.match(/name="handle" value="([^"]+)"/)[1],cookie:cookie(r)};
    };
    const submit=(c,decision='approve')=>f('/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:c.cookie,Origin:'https://bridge.test'},body:new URLSearchParams({handle:c.handle,decision,scope:'todo:readwrite'})});
    const denied=await submit(await consent(),'deny');assert.equal(denied.status,302);
    assert.equal(new URL(denied.headers.get('Location')).searchParams.get('error'),'access_denied');
    const unbound=await consent();
    assert.notEqual((await submit({...unbound,cookie:''})).status,302);
    const authorize=async user=>{
      const c=await consent(),approved=await submit(c);assert.equal(approved.status,302);
      assert.notEqual((await submit(c)).status,302);
      const ms=new URL(approved.headers.get('Location'));assert.equal(ms.hostname,'login.microsoftonline.com');assert.equal(ms.searchParams.get('code_challenge_method'),'S256');
      const callback='/callback?'+new URLSearchParams({state:ms.searchParams.get('state'),code:user});
      const r=await f(callback,{headers:{Cookie:cookie(approved)}});assert.equal(r.status,302);
      assert.notEqual((await f(callback,{headers:{Cookie:cookie(approved)}})).status,302);
      const redirect=new URL(r.headers.get('Location'));assert.equal(redirect.searchParams.get('state'),'CLIENT_STATE');
      const token=await f('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id,code:redirect.searchParams.get('code'),redirect_uri:'https://client.example/callback',code_verifier:verifier,resource:'https://bridge.test/mcp'})});
      assert.equal(token.status,200);return token.json();
    };
    const a=await authorize('A'),b=await authorize('B');
    assert.ok(a.refresh_token);assert.ok(b.refresh_token);
    const lists=async token=>{
      const r=await f('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_task_lists',arguments:{}}})});
      assert.equal(r.status,200);const data=await r.json();assert.notEqual(data.result.isError,true,JSON.stringify(data));return JSON.parse(data.result.content[0].text).items;
    };
    assert.deepEqual(await lists(a.access_token),[{id:'A'}]);assert.deepEqual(await lists(b.access_token),[{id:'B'}]);
    const refreshed=await f('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id,refresh_token:a.refresh_token,resource:'https://bridge.test/mcp'})});
    assert.equal(refreshed.status,200);assert.deepEqual(await lists((await refreshed.json()).access_token),[{id:'A'}]);
    const mismatch=await mf.dispatchFetch('https://wrong.test/health');assert.equal(mismatch.status,421);
    assert.ok(calls.some(c=>c.host==='login.microsoftonline.com'));
  } finally {await mf.dispose();}
});
