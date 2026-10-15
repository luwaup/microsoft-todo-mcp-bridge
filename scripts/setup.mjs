#!/usr/bin/env node
// Guided deploy wizard. No secrets are written to disk by this program.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const rl=createInterface({input,output});
const run=(args,capture=false)=> {
  // Run the locked local tool directly: .cmd spawning without a shell fails on Windows.
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),...args], {encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(r.error) throw r.error;
  if(r.status!==0) throw new Error(`wrangler ${args.join(' ')} failed`);
  return `${r.stdout||''}\n${r.stderr||''}`;
};
try {
  console.log('Microsoft To Do MCP Bridge — guided Cloudflare deployment');
  console.log('Prerequisites: Node 22+, Cloudflare account, and a Microsoft personal account.');
  try {run(['whoami'],true);} catch {
    await rl.question('Press Enter to sign in to Cloudflare...');
    run(['login']);
  }
  let config=readFileSync('wrangler.jsonc','utf8');
  if(config.includes('REPLACE_WITH_KV_NAMESPACE_ID')) {
    console.log('Creating OAuth KV namespace...');
    const text=run(['kv','namespace','create','OAUTH_KV'],true);
    const match=text.match(/"id"\s*:\s*"([a-f0-9]{32})"/i) || text.match(/id\s*=\s*"([a-f0-9]{32})"/i);
    const id=match?.[1] || (await rl.question('Paste the KV namespace id shown by Wrangler: ')).trim();
    if(!/^[a-f0-9]{32}$/i.test(id)) throw new Error('Invalid KV namespace id');
    config=config.replace('REPLACE_WITH_KV_NAMESPACE_ID',id);
    writeFileSync('wrangler.jsonc',config);
  }
  console.log('Deploying worker before configuring Microsoft callback...');
  run(['deploy']);
  console.log('\nFind the deployed https://...workers.dev URL above.');
  const origin=(await rl.question('Enter your deployed Worker URL (without /mcp): ')).trim().replace(/\/$/,'');
  if(!/^https:\/\/[a-zA-Z0-9.-]+\.workers\.dev$/.test(origin)) throw new Error('Expected HTTPS workers.dev URL');
  const parsed=JSON.parse(config);
  parsed.vars={...parsed.vars,PUBLIC_BASE_URL:origin};
  config=JSON.stringify(parsed,null,2)+'\n';
  writeFileSync('wrangler.jsonc',config);
  console.log(`\nMicrosoft callback URI: ${origin}/callback`);
  console.log('Open https://entra.microsoft.com/ -> Identity -> Applications -> App registrations -> New registration.');
  console.log('Supported account types: Personal Microsoft accounts only (or personal + organizational).');
  console.log('Use a neutral app name such as Personal To Do Bridge. Microsoft branding in app names or callback hosts may be rejected.');
  console.log(`Redirect URI type: Web; URL: ${origin}/callback`);
  console.log('Create a client secret; API permissions: delegated User.Read and Tasks.ReadWrite.');
  console.log('Never paste the secret into chat or a public GitHub issue.');
  await rl.question('Press Enter after the Microsoft app and secret have been created...');
  console.log('Add Microsoft Application (client) ID (entered invisibly into Wrangler secret prompt):');
  run(['secret','put','MS_CLIENT_ID']);
  console.log('Add Microsoft client secret (entered into Wrangler):');
  run(['secret','put','MS_CLIENT_SECRET']);
  run(['deploy']);
  const health=await fetch(`${origin}/health`,{signal:AbortSignal.timeout(15000)});
  if(!health.ok || !(await health.json()).configured) throw new Error('Worker deployed but Microsoft application configuration is incomplete.');
  console.log(`\nWorker deployed and configured. Live Microsoft authorization is still required. MCP URL: ${origin}/mcp`);
  console.log(`Health check: ${origin}/health`);
  console.log('Test with npx @modelcontextprotocol/inspector then sign in through Microsoft.');
} catch(e) { console.error('Setup stopped:',e.message); process.exitCode=1; }
finally {rl.close();}
