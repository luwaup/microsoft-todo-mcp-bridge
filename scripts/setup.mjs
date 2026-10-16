#!/usr/bin/env node
// Personal settings are ignored; humans enter secrets into Wrangler, not chat.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const configPath=resolve(root,'.personal/wrangler.json');
export function personalConfig(template,name=`personal-todo-bridge-${randomBytes(3).toString('hex')}`) {
  const config=JSON.parse(template);
  config.name=name;
  config.main='../src/index.ts';
  config.$schema='../node_modules/wrangler/config-schema.json';
  return config;
}
export function workerOrigin(output,name) {
  const urls=output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/gi)||[];
  const matches=[...new Set(urls.filter(value=>new URL(value).hostname.split('.')[0]===name))];
  if(matches.length!==1) throw new Error('Cannot identify one stable Worker URL. Inspect Cloudflare; do not guess a callback URL.');
  return matches[0];
}
export function requirePersonal(config) {
  const origin=config.vars?.PUBLIC_BASE_URL;
  if(typeof origin!=='string' || !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(origin)) throw new Error('Run npm run setup -- --prepare first.');
  if(!/^[a-f0-9]{32}$/i.test(config.kv_namespaces?.[0]?.id||'')) throw new Error('A dedicated OAuth KV is not configured.');
  return origin;
}
const save=config=>writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
function wrangler(args,interactive=false) {
  const r=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,encoding:'utf8',stdio:interactive?'inherit':'pipe'});
  if(r.error || r.status!==0) throw new Error(`Wrangler ${args[0]} failed. Check login, account and resource permissions in your own terminal. Raw output was not copied to chat.`);
  return `${r.stdout||''}\n${r.stderr||''}`;
}
export async function setup(argv=process.argv.slice(2)) {
  const mode=argv[0]||'--help';
  if(!['--prepare','--configure','--status','--help'].includes(mode)) throw new Error('Use --prepare, --configure or --status.');
  if(mode==='--help') {
    console.log('1. npm run setup -- --prepare [--account-id YOUR_ACCOUNT_ID]\n2. Register Microsoft app using the printed callback.\n3. In your own terminal: npm run setup -- --configure\n4. npm run client:configure -- --client codex\nResume/check: npm run setup -- --status');
    return;
  }
  const accountIndex=argv.indexOf('--account-id');
  if(argv.length!==1 && !(mode==='--prepare' && argv.length===3 && accountIndex===1 && /^[a-f0-9]{32}$/i.test(argv[2]))) throw new Error('Invalid setup arguments. Do not pass credentials as arguments.');
  let config;
  if(existsSync(configPath)) config=JSON.parse(readFileSync(configPath,'utf8'));
  else {
    if(mode!=='--prepare') throw new Error('Run --prepare first.');
    config=personalConfig(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
    if(config.kv_namespaces?.[0]?.id!=='REPLACE_WITH_KV_NAMESPACE_ID') throw new Error('Tracked template is customized. Restore it before setup; do not reuse an unknown namespace.');
    mkdirSync(dirname(configPath),{recursive:true,mode:0o700});save(config);
  }
  const scoped=args=>[...args,'--config',configPath];
  if(mode==='--prepare') {
    if(accountIndex!==-1) {config.account_id=argv[2];save(config);}
    try {wrangler(['whoami']);} catch {throw new Error('Complete Cloudflare login in your own terminal: npx wrangler login. Then rerun --prepare.');}
    if(config.kv_namespaces[0].id==='REPLACE_WITH_KV_NAMESPACE_ID') {
      const result=wrangler(scoped(['kv','namespace','create','OAUTH_KV']));
      const id=result.match(/"id"\s*:\s*"([a-f0-9]{32})"/i)?.[1] || result.match(/id\s*=\s*"([a-f0-9]{32})"/i)?.[1];
      if(!id) throw new Error('KV was requested but its ID was not recognized. Inspect Cloudflare before retrying creation.');
      config.kv_namespaces[0].id=id;save(config);
    }
    const origin=workerOrigin(wrangler(scoped(['deploy'])),config.name);
    if(config.vars?.PUBLIC_BASE_URL && config.vars.PUBLIC_BASE_URL!==origin) throw new Error('Deployment URL changed. Review saved configuration and Microsoft callback.');
    config.vars={...config.vars,PUBLIC_BASE_URL:origin};save(config);
    wrangler(scoped(['deploy']));
    console.log(`Worker prepared. Microsoft Web callback: ${origin}/callback`);
    console.log('Register Personal To Do Bridge for personal Microsoft accounts only. Add delegated User.Read and Tasks.ReadWrite. Create a client secret and enter its VALUE using --configure in your own terminal.');
    console.log('Prepared is not authenticated: app configuration and OAuth consent are still required.');
    return;
  }
  const origin=requirePersonal(config);
  if(mode==='--configure') {
    if(!process.stdin.isTTY) throw new Error('Human step: open your own interactive terminal and run npm run setup -- --configure. Do not send secrets through chat, agent stdin or command arguments.');
    console.log('Enter Application (client) ID, not tenant ID:');
    wrangler(scoped(['secret','put','MS_CLIENT_ID']),true);
    console.log('Enter client secret VALUE, not secret ID. Never paste it into chat:');
    wrangler(scoped(['secret','put','MS_CLIENT_SECRET']),true);
    wrangler(scoped(['deploy']));
  }
  const response=await fetch(`${origin}/health`,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('Health check failed. Inspect your own deployment.');
  const health=await response.json();
  console.log(JSON.stringify({configured:health.configured===true,mcpUrl:`${origin}/mcp`,callback:`${origin}/callback`,liveAuthorizationVerified:false}));
  if(!health.configured) throw new Error('Microsoft app configuration is missing. Complete --configure.');
  console.log('Configuration exists; this does not prove a valid secret. Complete OAuth and verify with a read tool.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) setup().catch(error=>{console.error(error.message);process.exitCode=1;});
