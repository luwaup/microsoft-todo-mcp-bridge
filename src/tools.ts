import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GraphTodo, GraphError, listPath, tasksPath, taskPath, checklistPath, taskDate, type Fetcher } from './graph.js';
import type { Props } from './types.js';

const result = (value:unknown) => ({content:[{type:'text' as const,text:JSON.stringify(value)}]});
const errorResult = (error:unknown) => ({isError:true,content:[{type:'text' as const,text: error instanceof GraphError ? error.message : error instanceof Error && /^(No changes provided|Expected calendar date|Microsoft To Do authorization|Microsoft token expired)/.test(error.message) ? error.message : 'Task operation failed; no automatic write retry was performed.'}],...(error instanceof GraphError && error.status===401 ? {_meta:{'mcp/www_authenticate':['Bearer error="invalid_token", error_description="Reconnect your Microsoft account"']}} : {})});
const schemaId = z.string().min(1).max(1024);
const schemaTitle = z.string().trim().min(1).max(255);
const schemaDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schemaImportance = z.enum(['low','normal','high']);
const timezone = z.string().min(1).max(60).default('UTC');

const readAnnotations={readOnlyHint:true,destructiveHint:false,openWorldHint:true};
const writeAnnotations={readOnlyHint:false,destructiveHint:false,openWorldHint:true};
const updateAnnotations={readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true};
const deleteAnnotations={readOnlyHint:false,destructiveHint:true,openWorldHint:true};

export function createTodoServer(getProps:()=>Props|undefined,fetcher:Fetcher=fetch) {
  const server=new McpServer({name:'microsoft-todo-mcp-bridge',version:'0.1.2'});
    const call = async (f:(graph:GraphTodo)=>Promise<unknown>)=>{
      try {
        const props=getProps();
        if (!props?.accessToken || !props.grantedScopes?.includes('todo:readwrite')) throw new Error('Microsoft To Do authorization was not granted');
        if (Date.now() > props.expiresAt - 30000) throw new Error('Microsoft token expired. Reconnect or refresh the MCP authorization to continue.');
        return result(await f(new GraphTodo(props.accessToken,fetcher)));
      } catch(e) { return errorResult(e); }
    };

    server.tool('list_task_lists','Read your Microsoft To Do lists. No changes.',{},
      readAnnotations,
      async()=>call(g=>g.collect('/me/todo/lists',500)));

    server.tool('list_tasks','Read tasks in one list, including completed tasks, with a bounded number of results.',
      {list_id:schemaId,max_items:z.number().int().min(1).max(1000).default(200)},
      readAnnotations,
      async({list_id,max_items})=>call(g=>g.collect(tasksPath(list_id),max_items)));

    server.tool('get_task','Get the current details of one task.',
      {list_id:schemaId,task_id:schemaId},
      readAnnotations,
      async({list_id,task_id})=>call(g=>g.request('GET',taskPath(list_id,task_id))));

    server.tool('create_task_list','Create a To Do list in your own Microsoft account.',
      {name:schemaTitle},
      writeAnnotations,
      async({name})=>call(g=>g.request('POST','/me/todo/lists',{displayName:name})));

    server.tool('rename_task_list','Rename an existing To Do list.',
      {list_id:schemaId,name:schemaTitle},
      updateAnnotations,
      async({list_id,name})=>call(g=>g.request('PATCH',listPath(list_id),{displayName:name})));

    server.tool('create_task','Create a task. A due_date means the calendar date, not a reminder time.',
      {list_id:schemaId,title:schemaTitle,description:z.string().max(12000).optional(),due_date:schemaDate.nullable().optional(),time_zone:timezone,importance:schemaImportance.optional()},
      writeAnnotations,
      async({list_id,title,description,due_date,time_zone,importance})=>call(g=>{
        const body:Record<string,unknown>={title};
        if(description!==undefined) body.body={contentType:'text',content:description};
        if(due_date!==undefined) body.dueDateTime=due_date===null?null:taskDate(due_date,time_zone);
        if(importance) body.importance=importance;
        return g.request('POST',tasksPath(list_id),body);
      }));

    server.tool('update_task','Update task title, description, due calendar date, or importance. Unspecified fields are preserved.',
      {list_id:schemaId,task_id:schemaId,title:schemaTitle.optional(),description:z.string().max(12000).optional(),due_date:schemaDate.nullable().optional(),importance:schemaImportance.optional(),time_zone:timezone},
      updateAnnotations,
      async({list_id,task_id,title,description,due_date,importance,time_zone})=>call(g=>{
        const body:Record<string,unknown>={};
        if(title!==undefined) body.title=title;
        if(description!==undefined) body.body={contentType:'text',content:description};
        if(due_date!==undefined) body.dueDateTime=due_date===null?null:taskDate(due_date,time_zone);
        if(importance!==undefined) body.importance=importance;
        if(Object.keys(body).length===0) throw new Error('No changes provided');
        return g.request('PATCH',taskPath(list_id,task_id),body);
      }));

    server.tool('complete_task','Mark a task as completed in Microsoft To Do.',
      {list_id:schemaId,task_id:schemaId},
      updateAnnotations,
      async({list_id,task_id})=>call(g=>g.request('PATCH',taskPath(list_id,task_id),{status:'completed'})));

    server.tool('reopen_task','Restore a completed task to not started.',
      {list_id:schemaId,task_id:schemaId},
      updateAnnotations,
      async({list_id,task_id})=>call(g=>g.request('PATCH',taskPath(list_id,task_id),{status:'notStarted'})));

    server.tool('delete_task','Permanently delete one task. Requires explicit confirm=true; ask the human before deleting.',
      {list_id:schemaId,task_id:schemaId,confirm:z.literal(true)},
      deleteAnnotations,
      async({list_id,task_id})=>call(g=>g.request('DELETE',taskPath(list_id,task_id))));

    server.tool('list_checklist_items','Read checklist subtasks for a task.',
      {list_id:schemaId,task_id:schemaId},
      readAnnotations,
      async({list_id,task_id})=>call(g=>g.collect(checklistPath(list_id,task_id),300)));

    server.tool('add_checklist_item','Add a checklist item under an existing task.',
      {list_id:schemaId,task_id:schemaId,title:schemaTitle},
      writeAnnotations,
      async({list_id,task_id,title})=>call(g=>g.request('POST',checklistPath(list_id,task_id),{displayName:title})));
  return server;
}
