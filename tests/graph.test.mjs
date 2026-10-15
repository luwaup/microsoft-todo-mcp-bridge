import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphTodo,taskPath,taskDate,GraphError} from '../.test-dist/graph.js';
import {authorizationUrl,challenge,refreshMicrosoft} from '../.test-dist/microsoft.js';

test('URL segments are encoded; invalid paths rejected',async()=>{
  const graph=new GraphTodo('abc',async()=>Response.json({}));
  assert.match(taskPath('foo/bar','t?x'),/foo%2Fbar\/tasks\/t%3Fx/);
  await assert.rejects(graph.request('GET','/me/messages'),/Out-of-scope/);
});

test('list pagination aggregates Microsoft Graph pages',async()=>{
 const seen=[];
 const graph=new GraphTodo('TOKEN',async (url,options)=>{
   seen.push([url,options.headers.Authorization]);
   if(seen.length===1) return Response.json({value:[{id:'1'}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/me/todo/lists?$skiptoken=x'});
   return Response.json({value:[{id:'2'}]});
 });
 assert.deepEqual(await graph.all('/me/todo/lists'),[{id:'1'},{id:'2'}]);
 assert.equal(seen.length,2);
 assert.equal(seen[0][1],'Bearer TOKEN');
});

test('reject nextLink to non-Microsoft domain', async()=>{
 const graph=new GraphTodo('TOKEN',async()=>Response.json({value:[{id:'1'}],'@odata.nextLink':'https://evil.test/steal'}));
 await assert.rejects(graph.all('/me/todo/lists'),/Unsafe Graph pagination/);
});

test('scopes and dates validate correctly',async()=>{
 assert.deepEqual(taskDate('2026-10-15'),{dateTime:'2026-10-15T00:00:00',timeZone:'UTC'});
 assert.throws(()=>taskDate('2026-02-30'),/Expected calendar/);
 assert.throws(()=>taskDate('not-a-date'),/Expected calendar/);
});

test('Graph error omits private response body',async()=>{
 const graph=new GraphTodo('TOKEN',async()=>new Response('private task title',{status:401}));
 await assert.rejects(graph.request('GET','/me/todo/lists'),e=>e instanceof GraphError && !e.message.includes('private'));
});

test('DELETE responds successfully with empty JSON',async()=>{
 const graph=new GraphTodo('TOKEN',async(_url,request)=>{
   assert.equal(request.method,'DELETE');
   return new Response(null,{status:204});
 });
 assert.deepEqual(await graph.request('DELETE','/me/todo/lists/l/tasks/t'),{deleted:true});
});

test('Microsoft authorization is personal-account OAuth with PKCE',async()=>{
 const verifier='v'.repeat(50);
 const url=new URL(authorizationUrl('client','https://bridge.example/callback','STATE',await challenge(verifier)));
 assert.equal(url.pathname,'/consumers/oauth2/v2.0/authorize');
 assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.match(url.searchParams.get('scope'),/Tasks.ReadWrite/);
});

test('refresh requests Microsoft token endpoint without exposing secret in URL',async()=>{
 const response=await refreshMicrosoft('refresh-abc','client-id','secret-key',async(url,request)=>{
   assert.equal(url,'https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
   assert.equal(request.method,'POST');
   const form=new URLSearchParams(request.body);
   assert.equal(form.get('refresh_token'),'refresh-abc');
   assert.equal(form.get('client_secret'),'secret-key');
   return Response.json({access_token:'new',refresh_token:'next',expires_in:3600});
 });
 assert.equal(response.access_token,'new');
});
