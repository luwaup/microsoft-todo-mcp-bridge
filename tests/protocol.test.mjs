import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTodoServer } from '../.test-dist/tools.js';
import { handleMcp } from '../.test-dist/mcp.js';
import { consentPage } from '../.test-dist/consent.js';
import { GraphTodo,taskPath,GraphError } from '../.test-dist/graph.js';
import { refreshMicrosoft } from '../.test-dist/microsoft.js';

const props=(token='ACCOUNT_A')=>({accessToken:token,msRefreshToken:'REFRESH',userId:token,expiresAt:Date.now()+3600000,grantedScopes:['todo:readwrite']});

async function connect(getProps,fetcher) {
  const server=createTodoServer(getProps,fetcher);
  const client=new Client({name:'test-client',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  return {client,close:async()=>{await client.close(); await server.close();}};
}

test('real MCP client lists all 12 tools with accurate read and delete annotations',async()=>{
  const {client,close}=await connect(()=>props(),async()=>Response.json({value:[]}));
  try {
    const {tools}=await client.listTools();
    assert.equal(tools.length,12);
    assert.equal(tools.find(t=>t.name==='list_tasks').annotations.readOnlyHint,true);
    assert.equal(tools.find(t=>t.name==='create_task').annotations.readOnlyHint,false);
    assert.equal(tools.find(t=>t.name==='delete_task').annotations.destructiveHint,true);
    const data=await client.callTool({name:'list_tasks',arguments:{list_id:'l'}});
    assert.deepEqual(JSON.parse(data.content[0].text),{items:[],truncated:false});
  } finally {await close();}
});

test('MCP update preserves omitted fields and can explicitly clear a due date',async()=>{
  let body;
  const {client,close}=await connect(()=>props(),async(_url,req)=>{body=JSON.parse(req.body);return Response.json({id:'t',...body});});
  try {
    const r=await client.callTool({name:'update_task',arguments:{list_id:'l',task_id:'t',due_date:null}});
    assert.notEqual(r.isError,true);
    assert.deepEqual(body,{dueDateTime:null});
  } finally {await close();}
});

test('invalid delete confirmation cannot reach Graph',async()=>{
  let calls=0;
  const {client,close}=await connect(()=>props(),async()=>{calls++;return new Response(null,{status:204});});
  try {
    const r=await client.callTool({name:'delete_task',arguments:{list_id:'l',task_id:'t',confirm:false}});
    assert.equal(r.isError,true); assert.equal(calls,0);
  } finally {await close();}
});

test('expired and missing grants block Graph; refreshed props are used on the next call',async()=>{
  let current={...props(),expiresAt:0}; const seen=[];
  const {client,close}=await connect(()=>current,async(_url,req)=>{seen.push(req.headers.Authorization);return Response.json({value:[]});});
  try {
    assert.equal((await client.callTool({name:'list_task_lists',arguments:{}})).isError,true);
    current=undefined;
    assert.equal((await client.callTool({name:'list_task_lists',arguments:{}})).isError,true);
    current=props('ACCOUNT_B');
    await client.callTool({name:'list_task_lists',arguments:{}});
    assert.deepEqual(seen,['Bearer ACCOUNT_B']);
  } finally {await close();}
});

test('independent MCP clients cannot select another account through tool arguments',async()=>{
  const seen=[];
  const fetcher=async(_url,req)=>{seen.push(req.headers.Authorization);return Response.json({value:[]});};
  const a=await connect(()=>props('A'),fetcher), b=await connect(()=>props('B'),fetcher);
  try {
    await a.client.callTool({name:'list_task_lists',arguments:{userId:'B'}});
    await b.client.callTool({name:'list_task_lists',arguments:{userId:'A'}});
    assert.deepEqual(seen,['Bearer A','Bearer B']);
  } finally {await a.close();await b.close();}
});

test('unsafe unexpected exceptions never echo credentials into tool results',async()=>{
  const {client,close}=await connect(()=>props(),async()=>{throw new Error('secret-refresh-token private-task-title');});
  try {
    const r=await client.callTool({name:'list_task_lists',arguments:{}});
    assert.equal(r.isError,true);assert.doesNotMatch(JSON.stringify(r),/secret-refresh|private-task/);
  } finally {await close();}
});

test('stateless Web Standard transport completes initialize and tools/list over JSON HTTP',async()=>{
  const request=(id,method,params)=>new Request('https://bridge.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  const ctx={props:props()};
  const init=await handleMcp(request(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'http-test',version:'1'}}),{},ctx);
  assert.equal(init.status,200); assert.equal((await init.json()).result.serverInfo.version,'0.1.2');
  const tools=await handleMcp(request(2,'tools/list',{}),{},ctx);
  assert.equal(tools.status,200);assert.equal((await tools.json()).result.tools.length,12);
  assert.equal((await handleMcp(request(3,'tools/list',{}),{},{props:undefined})).status,401);
});

test('consent permission fields belong to submitted form and client text is escaped',()=>{
  const html=consentPage({clientName:'<script>bad</script>',clientDomain:'client.example',redirectHost:'client.example',scope:['todo:readwrite']},'handle');
  const form=html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)[1];
  assert.match(form,/name="scope"/);assert.match(form,/value="todo:readwrite" checked/);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&\#60;script/);
});

test('Graph pagination reports truncation and rejects jumping to another collection',async()=>{
  const graph=new GraphTodo('x',async()=>Response.json({value:[1,2,3]}));
  assert.deepEqual(await graph.collect('/me/todo/lists',2),{items:[1,2],truncated:true});
  const hostile=new GraphTodo('x',async()=>Response.json({value:[], '@odata.nextLink':'https://graph.microsoft.com/v1.0/me/todo/lists/OTHER/tasks'}));
  await assert.rejects(hostile.collect('/me/todo/lists'),/Unsafe Graph pagination/);
  assert.throws(()=>taskPath('..','t'),/Invalid resource/);
});

test('Graph preserves Retry-After and never retries potentially committed writes',async()=>{
  let calls=0;
  const graph=new GraphTodo('x',async()=>{calls++;return new Response('private',{status:429,headers:{'Retry-After':'15'}});});
  await assert.rejects(graph.request('POST','/me/todo/lists/l/tasks',{title:'x'}),e=>e instanceof GraphError && e.retryAfter===15);
  assert.equal(calls,1);
  await assert.rejects(graph.request('GET','/me/todo/lists',undefined,{Authorization:'override'}),/Unsupported Graph header/);
});

test('Microsoft rejects unusable token expiry values',async()=>{
  await assert.rejects(refreshMicrosoft('r','id','s',async()=>Response.json({access_token:'a',expires_in:-1})),/Incomplete Microsoft token/);
});
