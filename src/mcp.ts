import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createTodoServer } from './tools.js';
import type { Env,Props } from './types.js';

// Tools need no subscriptions or resumable sessions. Bind each request to its
// validated OAuth props, including freshly refreshed upstream credentials.
export async function handleMcp(request:Request,_env:Env,ctx:ExecutionContext):Promise<Response> {
  const props=ctx.props as Props|undefined;
  if(!props?.accessToken || !props.grantedScopes?.includes('todo:readwrite')) return new Response('Unauthorized',{status:401});
  const server=createTodoServer(()=>props);
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch {
    return Response.json({jsonrpc:'2.0',id:null,error:{code:-32603,message:'MCP request failed'}},{status:500});
  } finally {
    await server.close();
  }
}
