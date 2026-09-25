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
const VISUAL_EXTENSIONS=new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.ico']);
const MAX_IMAGE_BYTES=16*1024*1024;
const VISUAL_EXCLUDED_DIRECTORIES=new Set(['Library','Temp','Logs','Obj','Build','Builds','BuildCache','MemoryCaptures','UserSettings','node_modules','dist','out','bin']);
async function fileHash(file){return await new Promise((resolve,reject)=>{const h=createHash('sha256'),stream=require('node:fs').createReadStream(file);stream.on('data',chunk=>h.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(h.digest('hex')));});}
function uint24(buffer,offset){return buffer[offset]|(buffer[offset+1]<<8)|(buffer[offset+2]<<16);}
function parsePng(buffer){if(buffer.length<26||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG 헤더를 읽을 수 없습니다.');const colorType=buffer[25];let hasAlpha=colorType===4||colorType===6;let offset=8;while(offset+12<=buffer.length){const length=buffer.readUInt32BE(offset);if(length>buffer.length-offset-12)break;const type=buffer.subarray(offset+4,offset+8).toString('ascii');if(type==='tRNS'){hasAlpha=true;break;}offset+=12+length;}return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20),has_alpha:hasAlpha};}
function parseGif(buffer){if(buffer.length<10||!['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii')))throw Error('GIF 헤더를 읽을 수 없습니다.');let hasAlpha=false;for(let i=13;i+3<buffer.length;i++){if(buffer[i]===0x21&&buffer[i+1]===0xf9&&buffer[i+2]>=4){hasAlpha=Boolean(buffer[i+3]&1);break;}}return {width:buffer.readUInt16LE(6),height:buffer.readUInt16LE(8),has_alpha:hasAlpha};}
function parseJpeg(buffer){if(buffer.length<4||buffer[0]!==0xff||buffer[1]!==0xd8)throw Error('JPEG 헤더를 읽을 수 없습니다.');let i=2;while(i+9<buffer.length){if(buffer[i]!==0xff){i++;continue;}while(buffer[i]===0xff)i++;const marker=buffer[i++];if(marker===0xd8||marker===0xd9||marker===0x01)continue;if(i+1>=buffer.length)break;const length=buffer.readUInt16BE(i);if(length<2||i+length>buffer.length)break;if(![0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){i+=length;continue;}if(length<7)break;return {width:buffer.readUInt16BE(i+5),height:buffer.readUInt16BE(i+3),has_alpha:false};}throw Error('JPEG 크기를 찾을 수 없습니다.');}
function parseWebp(buffer){if(buffer.length<30||buffer.subarray(0,4).toString('ascii')!=='RIFF'||buffer.subarray(8,12).toString('ascii')!=='WEBP')throw Error('WebP 헤더를 읽을 수 없습니다.');const chunk=buffer.subarray(12,16).toString('ascii');if(chunk==='VP8X')return {width:1+uint24(buffer,24),height:1+uint24(buffer,27),has_alpha:Boolean(buffer[20]&0x10)};if(chunk==='VP8 '){const start=20;const p=buffer.indexOf(Buffer.from([0x9d,0x01,0x2a]),start);if(p>=0&&p+7<buffer.length)return {width:buffer.readUInt16LE(p+3)&0x3fff,height:buffer.readUInt16LE(p+5)&0x3fff,has_alpha:false};}if(chunk==='VP8L'&&buffer.length>=25){const b=buffer.slice(21);if(b[0]===0x2f)return {width:1+((b[1]|b[2]<<8|b[3]<<16)&0x3fff),height:1+(((b[3]>>6)|(b[4]<<2)|(b[5]<<10))&0x3fff),has_alpha:true};}throw Error('지원하는 WebP 헤더가 아닙니다.');}
function parseSvg(buffer){const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(/<\s*script\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:)|url\s*\(\s*(?:https?:|\/\/|data:)/i.test(text))throw Error('외부 리소스나 스크립트가 있는 SVG는 읽지 않습니다.');const root=text.match(/<svg\b[^>]*>/i)?.[0]||'';const number=v=>{const n=Number.parseFloat(v);return Number.isFinite(n)&&n>=0?Math.round(n):null;};let width=number(root.match(/\bwidth\s*=\s*["']([^"']+)/i)?.[1]),height=number(root.match(/\bheight\s*=\s*["']([^"']+)/i)?.[1]);const viewBox=root.match(/\bviewBox\s*=\s*["']\s*[-+\d.]+\s+[-+\d.]+\s+([-+\d.]+)\s+([-+\d.]+)/i);if((width===null||height===null)&&viewBox){width=width===null?number(viewBox[1]):width;height=height===null?number(viewBox[2]):height;}return {width,height,has_alpha:true};}
function parseImageHeader(buffer,ext){if(ext==='.png')return parsePng(buffer);if(ext==='.jpg'||ext==='.jpeg')return parseJpeg(buffer);if(ext==='.gif')return parseGif(buffer);if(ext==='.webp')return parseWebp(buffer);if(ext==='.svg')return parseSvg(buffer);if(ext==='.ico'){if(buffer.length<8||buffer.readUInt16LE(0)!==0||buffer.readUInt16LE(2)!==1)throw Error('ICO 헤더를 읽을 수 없습니다.');const width=buffer[6]||256,height=buffer[7]||256;return {width,height,has_alpha:null};}throw Error('지원하지 않는 이미지 형식입니다.');}
function imageExtension(input){const ext=path.extname(input).toLowerCase();return VISUAL_EXTENSIONS.has(ext)?ext:null;}
function parseUnityTextureMeta(text){const get=(key,kind='number')=>{const match=text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`,'m'));if(!match)return undefined;const value=match[1].trim();if(kind==='boolean')return value==='1'||value.toLowerCase()==='true';const n=Number(value);return Number.isFinite(n)?n:value;};const result={};for(const [key,target,kind] of [['textureType','textureType'],['spriteMode','spriteMode'],['pixelsPerUnit','pixelsPerUnit'],['filterMode','filterMode'],['wrapMode','wrapMode'],['maxTextureSize','maxTextureSize'],['textureCompression','compression'],['compressionQuality','compressionQuality'],['isReadable','isReadable','boolean'],['alphaIsTransparency','alphaIsTransparency','boolean']]){const value=get(key,kind);if(value!==undefined)result[target]=value;}return Object.keys(result).length?result:null;}
async function unityTextureMeta(root,input){try{const r=await readText(root,`${input}.meta`);return parseUnityTextureMeta(r.text);}catch{return null;}}
async function readAssetMetadata(root,input){
  const file=await safePath(root,input),s=await fs.stat(file),ext=path.extname(file).toLowerCase();
  const handle=await fs.open(file,'r'),sample=Buffer.alloc(4096);let bytesRead=0;try{({bytesRead}=await handle.read(sample,0,sample.length,0));}finally{await handle.close();}
  const binary=sample.subarray(0,bytesRead).includes(0);
  const hash=s.size<=256*1024*1024?await fileHash(file):null;
  return {path:input,size:s.size,extension:ext||null,mime:MIME[ext]||'application/octet-stream',is_text:!binary,modified_at:s.mtime.toISOString(),sha256:hash,hash_skipped:hash===null?'file_over_256MiB':undefined};
}
async function readImage(root,input){const ext=imageExtension(input);if(!ext)throw Error('지원하는 이미지 형식은 PNG, JPEG, GIF, WebP, SVG, ICO입니다.');const file=await safePath(root,input),stat=await fs.stat(file);if(stat.size<=0)throw Error('빈 이미지 파일은 읽을 수 없습니다.');if(stat.size>MAX_IMAGE_BYTES)throw Error(`이미지는 ${MAX_IMAGE_BYTES/(1024*1024)} MiB 이하만 읽을 수 있습니다.`);const buffer=await fs.readFile(file);const header=parseImageHeader(buffer,ext),hash=sha(buffer);return {path:input.replace(/\\/g,'/'),size:buffer.length,extension:ext,mime:MIME[ext],sha256:hash,modified_at:stat.mtime.toISOString(),width:header.width,height:header.height,has_alpha:header.has_alpha,unity_texture:await unityTextureMeta(root,input),data:buffer.toString('base64')};}
async function listVisualAssets(root,input='',limit=200){if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('시각 에셋 목록은 1~500개까지 요청할 수 있습니다.');const start=await safePath(root,input,{directory:true});const out=[];let visited=0;async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(['EACCES','EPERM','ENOENT'].includes(e.code))return;throw e;}for(const e of entries){if(out.length>=limit||++visited>10000)return;if(DENIED.test(e.name)||e.isSymbolicLink()||(e.isDirectory()&&(VISUAL_EXCLUDED_DIRECTORIES.has(e.name)||e.name.startsWith('.'))))continue;const p=path.join(dir,e.name),rel=path.relative(root,p).split(path.sep).join('/');if(e.isDirectory())await walk(p);else if(e.isFile()&&imageExtension(e.name)){try{const item=await readImage(root,rel);delete item.data;item.unity_meta=Boolean(item.unity_texture);out.push(item);}catch{/* Ignore malformed or oversized images in an inventory. */}}}}await walk(start);return {assets:out.sort((a,b)=>a.path.localeCompare(b.path)),truncated:out.length>=limit||visited>10000};}
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
module.exports={safePath,createDirectory,readText,readLines,listFiles,search,readAssetMetadata,readInstructions,readImage,listVisualAssets,parseImageHeader,parseUnityTextureMeta,MAX_IMAGE_BYTES,sha};
