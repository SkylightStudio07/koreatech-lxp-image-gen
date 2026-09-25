const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const DENIED=/^(\.git|\.svn|\.hg|\.codex|\.agents|\.ssh|\.aws|\.azure|\.config|\.npmrc|\.netrc|\.pypirc|\.git-credentials|id_rsa|id_ed25519|node_modules|\.local|\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
function relativeInside(root,target){const r=path.relative(root,target);return r!== '..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);}
async function safePath(root,input,{directory=false,create=false}={}){
  if(typeof input!=='string'||input.length>1024||/[\x00-\x1f:]/.test(input)||path.isAbsolute(input)||input.startsWith('\\'))throw Error('상대 경로만 허용됩니다.');
  const parts=input.split(/[\\/]/).filter(Boolean);if(parts.some(p=>p==='..'||p==='.'||DENIED.test(p)||/[. ]$/.test(p)))throw Error('차단된 경로입니다.');
  root=await fs.realpath(root);let target=root;
  for(let i=0;i<parts.length;i++){target=path.join(target,parts[i]);let s;try{s=await fs.lstat(target);}catch(e){if(e.code==='ENOENT'&&create&&i===parts.length-1)return target;throw Error('경로를 찾을 수 없습니다.');}
    if(s.isSymbolicLink()||(!s.isDirectory()&&s.nlink>1)||!relativeInside(root,await fs.realpath(target)))throw Error('링크 경로는 허용되지 않습니다.');
    if(i<parts.length-1&&!s.isDirectory())throw Error('디렉터리가 아닙니다.');
    if(i===parts.length-1&&(directory?!s.isDirectory():!s.isFile()))throw Error('파일 형식이 맞지 않습니다.');
  }
  if(!parts.length&&!directory)throw Error('파일 경로를 지정하세요.');return target;
}
async function createDirectory(root,input){
  if(typeof input!=='string'||!input.trim())throw Error('폴더 경로를 지정하세요.');
  if(input.length>1024||/[\x00-\x1f:]/.test(input)||path.isAbsolute(input)||input.startsWith('\\'))throw Error('상대 경로만 허용됩니다.');
  const parts=input.split(/[\\/]/).filter(Boolean);
  if(!parts.length||parts.some(p=>p==='..'||p==='.'||p.startsWith('.')||DENIED.test(p)||/[. ]$/.test(p)))throw Error('차단된 경로입니다.');
  root=await fs.realpath(root);let current=root,created=false;
  for(const part of parts){
    const next=path.join(current,part);let stat;
    try{stat=await fs.lstat(next);}catch(e){
      if(e.code!=='ENOENT')throw e;
      await fs.mkdir(next);created=true;current=next;continue;
    }
    if(stat.isSymbolicLink()||!stat.isDirectory()||!relativeInside(root,await fs.realpath(next)))throw Error('링크 경로 또는 파일은 폴더로 사용할 수 없습니다.');
    current=next;
  }
  return {path:input.replace(/\\/g,'/'),created};
}
const sha=s=>createHash('sha256').update(s).digest('hex');
const MAX_TEXT_BYTES=16*1024*1024;
async function readText(root,input){const p=await safePath(root,input);const s=await fs.stat(p);if(s.size>MAX_TEXT_BYTES)throw Error('텍스트 파일은 16 MiB 이하만 읽을 수 있습니다. 필요한 줄 범위를 좁혀 주세요.');const b=await fs.readFile(p);if(b.includes(0))throw Error('바이너리 파일은 지원하지 않습니다.');return {text:new TextDecoder('utf-8',{fatal:true}).decode(b),hash:sha(b)};}
const MIME={
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.fbx':'application/octet-stream','.obj':'model/obj',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.wav':'audio/wav','.mp3':'audio/mpeg',
  '.mp4':'video/mp4','.dll':'application/octet-stream','.exe':'application/octet-stream',
  '.zip':'application/zip','.pdf':'application/pdf','.json':'application/json','.yaml':'text/yaml','.yml':'text/yaml',
};
async function fileHash(file){return await new Promise((resolve,reject)=>{const h=createHash('sha256'),stream=require('node:fs').createReadStream(file);stream.on('data',chunk=>h.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(h.digest('hex')));});}
async function readAssetMetadata(root,input){
  const file=await safePath(root,input),s=await fs.stat(file),ext=path.extname(file).toLowerCase();
  const handle=await fs.open(file,'r'),sample=Buffer.alloc(4096);let bytesRead=0;try{({bytesRead}=await handle.read(sample,0,sample.length,0));}finally{await handle.close();}
  const binary=sample.subarray(0,bytesRead).includes(0);
  const hash=s.size<=256*1024*1024?await fileHash(file):null;
  return {path:input,size:s.size,extension:ext||null,mime:MIME[ext]||'application/octet-stream',is_text:!binary,modified_at:s.mtime.toISOString(),sha256:hash,hash_skipped:hash===null?'file_over_256MiB':undefined};
}
const INSTRUCTION_FILES=['AGENTS.md','AGENTS.override.md','CODEX.md','CLAUDE.md','PROJECT.md','.github/copilot-instructions.md'];
async function readInstructions(root){
  const files=[];let total=0;
  for(const candidate of INSTRUCTION_FILES){
    try{const r=await readText(root,candidate);const remaining=120000-total;if(remaining<=0)break;const content=r.text.slice(0,remaining);files.push({path:candidate,content,sha256:r.hash,truncated:content.length<r.text.length});total+=content.length;}catch{}
  }
  return {files,total_chars:total};
}
async function listFiles(root,input='',limit=200,{excludeDirectories=new Set()}={}){const start=await safePath(root,input,{directory:true});const out=[];let visited=0;async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(['EACCES','EPERM','ENOENT'].includes(e.code))return;throw e;}for(const e of entries){if(out.length>=limit||++visited>5000)return;if(DENIED.test(e.name)||e.isSymbolicLink()||e.isDirectory()&&excludeDirectories.has(e.name))continue;const p=path.join(dir,e.name),rel=path.relative(root,p).split(path.sep).join('/');if(e.isDirectory())await walk(p);else if(e.isFile())out.push(rel);}}await walk(start);return {files:out.sort(),truncated:out.length>=limit||visited>5000};}
async function readLines(root,args){const r=await readText(root,args.path);const lines=r.text.split(/\r?\n/),start=args.start_line||1,end=args.end_line||300;if(end<start||end-start>1000)throw Error('한 번에 최대 1001줄을 읽을 수 있습니다.');return {path:args.path,sha256:r.hash,total_lines:lines.length,start_line:start,content:lines.slice(start-1,end).join('\n')};}
async function search(root,args){if(typeof args.query!=='string'||!args.query||args.query.length>200)throw Error('검색어 오류');const listed=await listFiles(root,args.path||'',500);const matches=[];for(const file of listed.files){let r;try{r=await readText(root,file);}catch{continue;}let n=0;for(const line of r.text.split(/\r?\n/)){n++;if(line.includes(args.query)){matches.push({path:file,line:n,text:line.slice(0,500)});if(matches.length>=(args.limit||50))return {matches,truncated:true};}}}return {matches,truncated:listed.truncated};}
module.exports={safePath,createDirectory,readText,readLines,listFiles,search,readAssetMetadata,readInstructions,sha};
