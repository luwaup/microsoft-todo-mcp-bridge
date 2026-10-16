import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPath,inspectPublicFile} from '../scripts/check-public.mjs';
import {sourceZip,verifySourceZip,standaloneSkillFiles} from '../scripts/release-pack.mjs';

test('public release excludes private evidence, runtime state and symlink paths',()=>{
  for(const path of ['.personal/wrangler.jsonc','.dev.vars','.env','REVIEW.zh-CN.md','verification.txt','proof.png','node_modules/a.js','src/../../secret.ts','src/a.ts/secret']) assert.equal(allowedPath(path),false,path);
  for(const path of ['README.md','src/auth.ts','tests/worker/oauth.test.mjs','scripts/release-pack.mjs','.github/workflows/ci.yml']) assert.equal(allowedPath(path),true,path);
});

test('release privacy rules reject representative credentials without returning their values',()=>{
  const fixtures=[
    ['github-token','ghp_'+'A'.repeat(36)],
    ['non-placeholder-secret-assignment','MS_CLIENT_SECRET='+'opaque-secret-value'],
    ['personal-account-email','someone'+'@outlook.com'],
    ['personal-worker-url','https://'+'private-service.owner.workers.dev'],
    ['account-or-session-guid',['12345678','1234','1234','1234','123456789abc'].join('-')],
    ['local-user-path',['C:','Users','example','secret.txt'].join('\\')],
  ];
  for(const [rule,value] of fixtures) {
    const findings=inspectPublicFile('README.md',value);
    assert.ok(findings.some(finding=>finding.rule===rule),rule);
    assert.ok(!JSON.stringify(findings).includes(value),'Never echo matched values');
  }
  assert.deepEqual(inspectPublicFile('.dev.vars.example','MS_CLIENT_SECRET=replace-with-your-secret'),[]);
  assert.deepEqual(inspectPublicFile('README.md','https://personal-todo-bridge.your-subdomain.workers.dev'),[]);
});

test('public deployment template rejects real namespace IDs and account settings',()=>{
  assert.deepEqual(inspectPublicFile('wrangler.jsonc',JSON.stringify({kv_namespaces:[{id:'REPLACE_WITH_KV_NAMESPACE_ID'}]})),[]);
  for(const config of [{account_id:'x'},{vars:{MS_CLIENT_SECRET:'x'}},{kv_namespaces:[{id:'a'.repeat(32)}]}]) assert.ok(inspectPublicFile('wrangler.jsonc',JSON.stringify(config)).length>0);
});

test('release ZIP verification rejects tampering and unexpected inventory',()=>{
  const files=[{path:'source/README.md',data:Buffer.from('Public source')}];
  const expected=new Map(files.map(file=>[file.path,file.data]));
  const zip=sourceZip(files);
  assert.equal(verifySourceZip(zip,expected),1);
  const altered=Buffer.from(zip);altered[30+Buffer.byteLength(files[0].path)]^=1;
  assert.throws(()=>verifySourceZip(altered,expected),/verification failed/);
  assert.throws(()=>verifySourceZip(zip,new Map()),/inventory mismatch/);
  assert.throws(()=>verifySourceZip(zip,new Map([['source/other.md',Buffer.from('Public source')]])),/Unexpected/);
});

test('standalone skills archive contains installable skill roots and omits unrelated files',()=>{
  const entries=[
    {path:'plugins/personal-todo/skills/personal-todo-setup/SKILL.md',data:Buffer.from('setup instructions')},
    {path:'plugins/personal-todo/skills/manage-personal-todo/SKILL.md',data:Buffer.from('task instructions')},
    {path:'plugins/personal-todo/plugin.json',data:Buffer.from('{}')},
    {path:'.personal/wrangler.json',data:Buffer.from('private configuration')},
  ];
  const files=standaloneSkillFiles(entries);
  assert.deepEqual(files.map(file=>file.path),['personal-todo-setup/SKILL.md','manage-personal-todo/SKILL.md']);
  assert.equal(verifySourceZip(sourceZip(files),new Map(files.map(file=>[file.path,file.data]))),2);
});
