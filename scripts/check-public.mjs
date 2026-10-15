import {execFileSync} from 'node:child_process';
import {readFileSync, lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rootFiles=new Set(['.gitignore','.gitattributes','.dev.vars.example','LICENSE','README.md','README.zh-CN.md','SECURITY.md','PRIVACY.md','CHANGELOG.md','package.json','package-lock.json','tsconfig.json','tsconfig.test.json','wrangler.jsonc']);
export function allowedPath(path) {
  return rootFiles.has(path) || /^(?:src\/[^/]+\.ts|scripts\/[^/]+\.mjs|tests\/(?:worker\/)?[^/]+\.test\.mjs|\.github\/workflows\/[^/]+\.ya?ml)$/.test(path);
}

// Rules intentionally return only a rule name, never the matched value.
export function inspectPublicFile(path,text) {
  const findings=[];
  const fail=rule=>findings.push({path,rule});
  if(!allowedPath(path)) fail('file-not-in-public-allowlist');
  const patterns=[
    ['private-key',/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----/],
    ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
    ['google-api-key',/\bAIza[A-Za-z0-9_-]{30,}\b/],
    ['jwt',/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}\b/],
    ['personal-account-email',/[A-Za-z0-9._%+-]+@(?:outlook|hotmail|live|gmail|qq|163)\.[A-Za-z.]+/i],
    ['local-user-path',/\b[A-Z]:[\\/](?:Users|OneDrive|Downloads)[\\/]/i],
    ['account-or-session-guid',/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i],
    ['private-conversation-link',/chatgpt\.com\/(?:c|g\/[^/]+\/c)\/[0-9a-f-]{20,}/i],
    ['cloudflare-account-link',/dash\.cloudflare\.com\/[0-9a-f]{32}\b/i],
  ];
  for(const [rule,pattern] of patterns) if(pattern.test(text)) fail(rule);
  const secretAssignments=/(?:^|\n)\s*(?:MS_CLIENT_SECRET|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|GH_TOKEN|AZURE_CLIENT_SECRET)\s*(?:=\s*["']?([^\s"'#,}]+)|:\s*["']([^"'\r\n]+)["'])/g;
  for(const match of text.matchAll(secretAssignments)) {
    if(!/^(?:replace[-_]|your[-_]|example|test[-_]|dummy|\$|<)/i.test(match[1]||match[2])) fail('non-placeholder-secret-assignment');
  }
  for(const match of text.matchAll(/https?:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev\b/gi)) {
    if(!/\.(?:your-subdomain|your-name|example)\.workers\.dev$/i.test(match[0])) fail('personal-worker-url');
  }
  if(path==='wrangler.jsonc') {
    try {
      const config=JSON.parse(text);
      if(config.account_id || config.vars || config.env || config.routes || config.route) fail('personal-deployment-config');
      if(config.kv_namespaces?.length!==1 || config.kv_namespaces[0].id!=='REPLACE_WITH_KV_NAMESPACE_ID') fail('non-placeholder-kv-id');
    } catch {fail('invalid-public-worker-config');}
  }
  return findings;
}

export function git(args,options={}) {
  return execFileSync('git',args,{maxBuffer:8*1024*1024,...options});
}
export function publicEntries(ref) {
  if(!ref) return git(['ls-files','-z']).toString('utf8').split('\0').filter(Boolean).map(path=>({path,data:readFileSync(path),mode:lstatSync(path).isSymbolicLink()?'120000':'100644'}));
  return git(['ls-tree','-r','-z',ref]).toString('utf8').split('\0').filter(Boolean).map(line=>{
    const tab=line.indexOf('\t'),[mode,type,sha]=line.slice(0,tab).split(' '),path=line.slice(tab+1);
    return {path,mode,data:type==='blob'?git(['cat-file','blob',sha]):Buffer.alloc(0)};
  });
}
export function checkPublic(entries) {
  if(!entries.length) throw new Error('No tracked public files; stage the intended source files first.');
  const findings=entries.flatMap(entry=>[
    ...(entry.mode==='100644'||entry.mode==='100755'?[]:[{path:entry.path,rule:'link-or-submodule-not-allowed'}]),
    ...inspectPublicFile(entry.path,entry.data.toString('utf8')),
  ]);
  if(findings.length) {
    for(const finding of findings) console.error(`${finding.path}: ${finding.rule}`);
    throw new Error(`Public release blocked by ${findings.length} finding(s). Matched contents are not printed.`);
  }
  return entries.length;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(`Public privacy check passed: ${checkPublic(publicEntries(process.argv[2]))} tracked files.`);}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
