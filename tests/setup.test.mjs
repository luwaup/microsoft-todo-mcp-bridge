import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {personalConfig,workerOrigin,requirePersonal} from '../scripts/setup.mjs';
import {connectionPlan,configurationAction} from '../scripts/configure-client.mjs';

test('setup never needs to customize the tracked template and scopes paths correctly',()=>{
  const template=readFileSync('wrangler.jsonc','utf8');
  const config=personalConfig(template,'personal-todo-bridge-test');
  assert.equal(JSON.parse(template).name,'personal-todo-bridge');
  assert.equal(config.main,'../src/index.ts');
  assert.equal(config.kv_namespaces[0].id,'REPLACE_WITH_KV_NAMESPACE_ID');
  assert.notEqual(personalConfig(template).name,personalConfig(template).name);
  assert.throws(()=>requirePersonal(config),/prepare/);
});
test('origin detection rejects a version URL, another Worker and ambiguous output',()=>{
  const origin='https://'+'personal-todo-bridge.example.workers.dev';
  assert.equal(workerOrigin(`deployed ${origin}`, 'personal-todo-bridge'),origin);
  assert.throws(()=>workerOrigin('https://'+'version-personal-todo-bridge.example.workers.dev','personal-todo-bridge'));
  assert.throws(()=>workerOrigin(`${origin} https://`+'personal-todo-bridge.other.workers.dev','personal-todo-bridge'));
});
test('MCP connection plans reject unsafe input and require complete personal settings',()=>{
  const config={vars:{PUBLIC_BASE_URL:'https://'+'personal-todo-bridge.example.workers.dev'},kv_namespaces:[{id:'a'.repeat(32)}]};
  assert.equal(connectionPlan(config,'codex').commands[0][2],'personal-todo');
  assert.throws(()=>connectionPlan(config,'codex','name; command'));
  assert.throws(()=>connectionPlan(config,'unknown'));
  assert.throws(()=>connectionPlan({...config,vars:{PUBLIC_BASE_URL:'https://example.com/path'}}));
});
test('client registration preserves another server and fails closed on unreadable configuration',()=>{
  const url='https://example.com/mcp';
  assert.equal(configurationAction({status:0,stdout:JSON.stringify({transport:{url}})},url),'keep');
  assert.equal(configurationAction({status:1,stderr:"No MCP server named 'personal-todo' found."},url),'add');
  assert.throws(()=>configurationAction({status:0,stdout:JSON.stringify({transport:{url:'https://other.example/mcp'}})},url),/not overwritten/);
  assert.throws(()=>configurationAction({status:1,stderr:'Permission denied'},url),/nothing was overwritten/);
  assert.throws(()=>configurationAction({status:1,stderr:'Config file not found'},url),/nothing was overwritten/);
  assert.throws(()=>configurationAction({status:0,stdout:'invalid config'},url));
});
test('staged preparation reuses KV and keeps secrets and client output out of tracked files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'todo-setup-'));
  try {
    for(const path of ['scripts','src','node_modules/wrangler/bin']) mkdirSync(join(dir,path),{recursive:true});
    for(const file of ['setup.mjs','configure-client.mjs']) copyFileSync(resolve('scripts',file),join(dir,'scripts',file));
    copyFileSync('wrangler.jsonc',join(dir,'wrangler.jsonc'));
    writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    writeFileSync(join(dir,'node_modules/wrangler/bin/wrangler.js'),`
      const fs=require('fs'),path=require('path');
      const args=process.argv.slice(2), cp=args[args.indexOf('--config')+1];
      if(args[0]==='whoami') process.exit(0);
      const config=JSON.parse(fs.readFileSync(cp));
      if(config.main!=='../src/index.ts') process.exit(4);
      if(args[0]==='kv') {
        const marker=path.join(path.dirname(cp),'created');
        if(fs.existsSync(marker)) process.exit(5);
        fs.writeFileSync(marker,'once');
        console.log(JSON.stringify({id:'a'.repeat(32)}));
      } else if(args[0]==='deploy') {
        console.log('https://'+config.name+'.example.workers.dev');
      } else process.exit(6);
    `);
    const run=(script,args)=>spawnSync(process.execPath,[join(dir,'scripts',script),...args],{encoding:'utf8',cwd:dir});
    const template=readFileSync(join(dir,'wrangler.jsonc'),'utf8');
    for(let pass=0;pass<2;pass++) {
      const result=run('setup.mjs',['--prepare']);
      assert.equal(result.status,0,result.stderr);
      assert.match(result.stdout,/Prepared is not authenticated/);
      assert.equal(readFileSync(join(dir,'wrangler.jsonc'),'utf8'),template);
    }
    const config=JSON.parse(readFileSync(join(dir,'.personal/wrangler.json')));
    assert.match(config.vars.PUBLIC_BASE_URL,/^https:/);
    assert.ok(!JSON.stringify(config).includes('MS_CLIENT_SECRET'));
    const credentialStep=run('setup.mjs',['--configure']);
    assert.equal(credentialStep.status,1);
    assert.match(credentialStep.stderr,/own interactive terminal/);
    const client=run('configure-client.mjs',['--client','generic']);
    assert.equal(client.status,0,client.stderr);
    const local=JSON.parse(readFileSync(join(dir,'.personal/mcp.json')));
    assert.equal(local.mcpServers['personal-todo'].url,config.vars.PUBLIC_BASE_URL+'/mcp');
  } finally {
    assert.equal(dirname(resolve(dir)),resolve(tmpdir()));
    assert.match(basename(dir),/^todo-setup-/);
    rmSync(dir,{recursive:true,force:true});
  }
});

test('plugin marketplace, manifests, onboarding and versions resolve to public files',()=>{
  const catalog=JSON.parse(readFileSync('.agents/plugins/marketplace.json'));
  const pluginRoot=catalog.plugins[0].source.path;
  assert.equal(pluginRoot,'./plugins/personal-todo');
  const portable=JSON.parse(readFileSync(join(pluginRoot,'plugin.json')));
  const compatible=JSON.parse(readFileSync(join(pluginRoot,'.codex-plugin/plugin.json')));
  assert.equal(portable.version,JSON.parse(readFileSync('package.json')).version);
  assert.equal(compatible.version,portable.version);
  const onboarding=portable.extensions['com.openai'].onboardingSkill;
  assert.match(readFileSync(join(pluginRoot,onboarding),'utf8'),/^---\nname: personal-todo-setup/);
  assert.equal(compatible.extensions['com.openai'].onboardingSkill,onboarding);
});
