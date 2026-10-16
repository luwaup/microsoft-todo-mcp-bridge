import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPublic,git,publicEntries} from './check-public.mjs';

const sha256=data=>createHash('sha256').update(data).digest('hex');
const crc32=data=>{
  let crc=0xffffffff;
  for(const byte of data) {crc^=byte;for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
};

// Small, stored (uncompressed) source ZIPs avoid a packaging dependency. Only
// caller-provided Git source bytes are included; filesystem directories are not.
export function sourceZip(files) {
  const chunks=[],central=[];let offset=0,centralLength=0;
  for(const file of files) {
    const name=Buffer.from(file.path),data=file.data,crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    chunks.push(local,name,data);
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(33,14);
    record.writeUInt32LE(crc,16);record.writeUInt32LE(data.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
    central.push(record,name);centralLength+=record.length+name.length;offset+=local.length+name.length+data.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralLength,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,...central,end]);
}

export function verifySourceZip(zip,expected) {
  const end=zip.length-22;
  if(end<0 || zip.readUInt32LE(end)!==0x06054b50 || zip.readUInt16LE(end+20)!==0) throw new Error('Invalid ZIP trailer');
  const count=zip.readUInt16LE(end+10),centralOffset=zip.readUInt32LE(end+16),centralLength=zip.readUInt32LE(end+12);
  if(count!==expected.size || centralOffset+centralLength!==end) throw new Error('ZIP inventory mismatch');
  let cursor=centralOffset;const seen=new Set();
  for(let item=0;item<count;item++) {
    if(zip.readUInt32LE(cursor)!==0x02014b50) throw new Error('Invalid ZIP directory');
    const nameLength=zip.readUInt16LE(cursor+28),extraLength=zip.readUInt16LE(cursor+30),commentLength=zip.readUInt16LE(cursor+32);
    const name=zip.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    if(seen.has(name)||!expected.has(name)) throw new Error('Unexpected or duplicate ZIP entry');
    seen.add(name);
    const localOffset=zip.readUInt32LE(cursor+42),length=zip.readUInt32LE(cursor+24);
    if(zip.readUInt32LE(localOffset)!==0x04034b50 || zip.readUInt16LE(localOffset+8)!==0) throw new Error('Invalid stored ZIP entry');
    const localNameLength=zip.readUInt16LE(localOffset+26),localExtraLength=zip.readUInt16LE(localOffset+28);
    const localName=zip.subarray(localOffset+30,localOffset+30+localNameLength).toString('utf8');
    if(localName!==name || zip.readUInt32LE(localOffset+18)!==length || zip.readUInt32LE(localOffset+22)!==length) throw new Error('ZIP headers disagree');
    const start=localOffset+30+localNameLength+localExtraLength,data=zip.subarray(start,start+length);
    if(start+length>centralOffset || crc32(data)!==zip.readUInt32LE(cursor+16) || sha256(data)!==sha256(expected.get(name))) throw new Error('ZIP content verification failed');
    cursor+=46+nameLength+extraLength+commentLength;
  }
  if(cursor!==end) throw new Error('ZIP directory length mismatch');
  return count;
}

export function standaloneSkillFiles(entries) {
  const prefix='plugins/personal-todo/skills/';
  return entries.filter(entry=>entry.path.startsWith(prefix)).map(entry=>({path:entry.path.slice(prefix.length),data:entry.data}));
}

export function packRelease(ref='HEAD') {
  if(!/^(?:HEAD|v\d+\.\d+\.\d+|[a-f0-9]{40})$/.test(ref)) throw new Error('Use HEAD, a release tag, or a full commit SHA.');
  if(git(['status','--porcelain']).length) throw new Error('Release packaging requires a clean Git checkout.');
  const entries=publicEntries(ref);checkPublic(entries);
  const version=JSON.parse(entries.find(entry=>entry.path==='package.json').data.toString()).version;
  if(ref.startsWith('v') && ref!==`v${version}`) throw new Error('Tag and package version differ.');
  const commit=git(['rev-parse',`${ref}^{commit}`]).toString().trim(),prefix=`microsoft-todo-mcp-bridge-v${version}/`;
  const files=entries.map(entry=>({path:prefix+entry.path,data:entry.data}));
  files.push({path:prefix+'SOURCE_COMMIT',data:Buffer.from(commit+'\n')});
  const manifest=files.map(file=>`${sha256(file.data)}  ${file.path.slice(prefix.length)}`).join('\n')+'\n';
  files.push({path:prefix+'MANIFEST.sha256',data:Buffer.from(manifest)});
  mkdirSync('artifacts',{recursive:true});
  const output=`artifacts/microsoft-todo-mcp-bridge-v${version}.zip`;
  writeFileSync(output,sourceZip(files));
  const count=verifySourceZip(readFileSync(output),new Map(files.map(file=>[file.path,file.data])));
  writeFileSync(output+'.sha256',`${sha256(readFileSync(output))}  ${output.split('/').at(-1)}\n`);
  console.log(`Verified ${count} ZIP entries against commit ${commit}.`);
  console.log(output);
  const pluginEntries=entries.filter(entry=>entry.path.startsWith('plugins/personal-todo/')).map(entry=>({path:entry.path.slice('plugins/personal-todo/'.length),data:entry.data}));
  if(pluginEntries.length) {
    pluginEntries.push({path:'LICENSE',data:entries.find(entry=>entry.path==='LICENSE').data});
    pluginEntries.push({path:'SOURCE_COMMIT',data:Buffer.from(commit+'\n')});
    pluginEntries.push({path:'MANIFEST.sha256',data:Buffer.from(pluginEntries.map(file=>`${sha256(file.data)}  ${file.path}`).join('\n')+'\n')});
    const pluginOutput=`artifacts/personal-todo-plugin-v${version}.zip`;
    writeFileSync(pluginOutput,sourceZip(pluginEntries));
    const pluginCount=verifySourceZip(readFileSync(pluginOutput),new Map(pluginEntries.map(file=>[file.path,file.data])));
    writeFileSync(pluginOutput+'.sha256',`${sha256(readFileSync(pluginOutput))}  ${pluginOutput.split('/').at(-1)}\n`);
    console.log(`Verified ${pluginCount} plugin ZIP entries against the same commit.`);
    console.log(pluginOutput);
  }
  const skills=standaloneSkillFiles(entries);
  if(skills.length) {
    skills.push({path:'LICENSE',data:entries.find(entry=>entry.path==='LICENSE').data});
    skills.push({path:'SOURCE_COMMIT',data:Buffer.from(commit+'\n')});
    skills.push({path:'MANIFEST.sha256',data:Buffer.from(skills.map(file=>`${sha256(file.data)}  ${file.path}`).join('\n')+'\n')});
    const skillsOutput=`artifacts/personal-todo-skills-v${version}.zip`;
    writeFileSync(skillsOutput,sourceZip(skills));
    const skillsCount=verifySourceZip(readFileSync(skillsOutput),new Map(skills.map(file=>[file.path,file.data])));
    writeFileSync(skillsOutput+'.sha256',`${sha256(readFileSync(skillsOutput))}  ${skillsOutput.split('/').at(-1)}\n`);
    console.log(`Verified ${skillsCount} standalone skills ZIP entries against the same commit.`);
    console.log(skillsOutput);
  }
  return output;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {packRelease(process.argv[2]);} catch(error) {console.error(error.message);process.exitCode=1;}
}
