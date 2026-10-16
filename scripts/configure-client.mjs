#!/usr/bin/env node
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,delimiter,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {root,configPath,requirePersonal} from './setup.mjs';

export function connectionPlan(config,client='generic',name='personal-todo') {
  if(!['generic','codex'].includes(client)|| !/^[a-z][a-z0-9_-]{0,47}$/.test(name)) throw new Error('Use --client codex|generic and a simple --name.');
  const origin=requirePersonal(config);
  return {client,name,url:`${origin}/mcp`,commands:[['mcp','add',name,'--url',`${origin}/mcp`],['mcp','login',name]]};
}
export function findCodex(pathValue=process.env.PATH||'') {
  for(const dir of pathValue.split(delimiter).filter(Boolean)) {
    const executable=resolve(dir,process.platform==='win32'?'codex.exe':'codex');
    if(existsSync(executable)) return {file:executable,prefix:[]};
    // npm's .cmd wrapper cannot be spawned without a shell on Windows. Run the
    // official package's JS entry with Node; never interpolate shell commands.
    if(process.platform==='win32' && existsSync(resolve(dir,'codex.cmd'))) {
      const entry=resolve(dir,'node_modules/@openai/codex/bin/codex.js');
      const pkg=resolve(dir,'node_modules/@openai/codex/package.json');
      if(existsSync(entry)&&existsSync(pkg)&&JSON.parse(readFileSync(pkg,'utf8')).name==='@openai/codex') return {file:process.execPath,prefix:[entry]};
    }
  }
  throw new Error('Codex CLI not found. Use the generated generic MCP config or install the official Codex CLI.');
}
export function configurationAction(result,url) {
  if(result.error) throw new Error('Cannot inspect Codex MCP configuration. No configuration changed.');
  if(result.status===0) {
    let current;
    try {current=JSON.parse(result.stdout);} catch {throw new Error('Codex returned invalid configuration metadata. No configuration changed.');}
    if((current.transport?.url||current.url)!==url) throw new Error('That Codex MCP name already points elsewhere. Rerun with a different --name; existing settings were not overwritten.');
    return 'keep';
  }
  if(!/no mcp server named|mcp server .*(?:not found|does not exist)/i.test(`${result.stdout||''}\n${result.stderr||''}`)) throw new Error('Could not establish that the MCP name is unused. Inspect Codex settings; nothing was overwritten.');
  return 'add';
}
export function configureClient(argv=process.argv.slice(2)) {
  const opts={client:'generic',name:'personal-todo'};
  for(let i=0;i<argv.length;i+=2) {
    if(!['--client','--name'].includes(argv[i])||!argv[i+1]) throw new Error('Use --client codex|generic [--name personal-todo].');
    opts[argv[i].slice(2)]=argv[i+1];
  }
  if(!existsSync(configPath)) throw new Error('Prepare and configure your own Worker first.');
  const plan=connectionPlan(JSON.parse(readFileSync(configPath,'utf8')),opts.client,opts.name);
  const file=resolve(root,'.personal/mcp.json');
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  writeFileSync(file,JSON.stringify({mcpServers:{[plan.name]:{url:plan.url}}},null,2)+'\n',{mode:0o600});
  if(plan.client==='generic') {console.log('Saved .personal/mcp.json. Import through your client\'s supported MCP settings and OAuth UI. No tokens are included.');return;}
  const codex=findCodex();
  const run=(args,interactive=false)=>spawnSync(codex.file,[...codex.prefix,...args],{encoding:'utf8',stdio:interactive?'inherit':'pipe'});
  // Inspect only configuration metadata in memory. Never print the full config,
  // which can contain environment/header credentials from an unrelated server.
  const existing=run(['mcp','get',plan.name,'--json']);
  if(configurationAction(existing,plan.url)==='keep') {
    console.log('Existing Codex MCP URL matches; keeping it.');
  } else {
    // Only treat an explicit not-found response as absence; fail closed for
    // damaged configuration, permission errors or unsupported CLI versions.
    const added=run(plan.commands[0]);
    if(added.error||added.status!==0) throw new Error('Codex MCP registration failed. Inspect CLI settings locally.');
    console.log('Registered the named MCP without editing other servers.');
  }
  console.log(`Complete Microsoft OAuth in your own terminal: codex mcp login ${plan.name}`);
  console.log('After login, start a new client session and verify with a read tool. Registration alone is not a successful To Do connection.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {configureClient();} catch(error) {console.error(error.message);process.exitCode=1;}
}
