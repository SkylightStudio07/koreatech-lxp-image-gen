const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn:defaultSpawn}=require('node:child_process');

const UNITY_TARGETS={
  StandaloneWindows64:{flag:'-buildWindows64Player',extension:'.exe'},
  StandaloneLinux64:{flag:'-buildLinux64Player',extension:''},
  StandaloneOSX:{flag:'-buildOSXUniversalPlayer',extension:'.app'},
  WebGL:{flag:'-buildWebGLPlayer',extension:''},
};
const TEST_PLATFORMS=new Set(['editmode','playmode']);
const MAX_OUTPUT=200000;

function relativeInside(root,target){const r=path.relative(root,target);return r!== '..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);}
function relativeOutput(root,input){
  if(typeof input!=='string'||!input.trim()||path.isAbsolute(input)||input.startsWith('\\'))throw Error('Unity 출력 경로는 프로젝트 안의 상대 경로여야 합니다.');
  const parts=input.split(/[\\/]/).filter(Boolean);if(!parts.length||parts.some(p=>p==='.'||p==='..'||/[\x00-\x1f:]/.test(p)||/[. ]$/.test(p)))throw Error('Unity 출력 경로가 올바르지 않습니다.');
  const full=path.resolve(root,input);if(!relativeInside(root,full))throw Error('Unity 출력 경로는 프로젝트 안에 있어야 합니다.');return {relative:parts.join('/'),full};
}

async function projectInfo(root){
  const projectSettings=path.join(root,'ProjectSettings','ProjectVersion.txt');
  let version='';try{const text=await fs.readFile(projectSettings,'utf8');version=text.match(/^m_EditorVersion:\s*(.+)$/m)?.[1]?.trim()||'';}catch{}
  let packageCount=0;try{const manifest=JSON.parse(await fs.readFile(path.join(root,'Packages','manifest.json'),'utf8'));packageCount=Object.keys(manifest.dependencies||{}).length;}catch{}
  let assets=false;try{assets=(await fs.stat(path.join(root,'Assets'))).isDirectory();}catch{}
  return {name:path.basename(root),root,unity_version:version||null,is_unity_project:!!version&&assets,assets_directory:assets,package_count:packageCount};
}

function runUnity({executable='Unity.exe',root,args=[],timeoutMs=15*60*1000,spawnImpl=defaultSpawn}={}){
  if(typeof executable!=='string'||!executable.trim())return Promise.reject(Error('Unity 실행 파일 경로가 설정되지 않았습니다.'));
  return new Promise((resolve,reject)=>{
    let child;try{child=spawnImpl(executable,args,{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}catch(e){reject(e);return;}
    let output='',truncated=false,settled=false;
    const append=chunk=>{if(settled)return;const text=String(chunk);if(output.length<MAX_OUTPUT)output+=text.slice(0,MAX_OUTPUT-output.length);if(text.length>MAX_OUTPUT-output.length)truncated=true;};
    child.stdout?.on('data',append);child.stderr?.on('data',append);
    const timer=setTimeout(()=>{if(settled)return;settled=true;try{child.kill('SIGTERM');}catch{}reject(Error('Unity CLI 실행 시간이 초과되었습니다.'));},timeoutMs);
    child.once('error',e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e);});
    child.once('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({ok:code===0,code,signal,output:output.trim(),truncated});});
  });
}

async function runTests({executable,root,platform='editmode',timeoutMs,spawnImpl}={}){
  if(!TEST_PLATFORMS.has(platform))throw Error('Unity 테스트 플랫폼은 editmode 또는 playmode여야 합니다.');
  return runUnity({executable,root,timeoutMs,spawnImpl,args:['-batchmode','-quit','-nographics','-projectPath',root,'-runTests','-testPlatform',platform]});
}

async function refreshAssets({executable,root,timeoutMs,spawnImpl}={}){
  return runUnity({executable,root,timeoutMs,spawnImpl,args:['-batchmode','-quit','-nographics','-projectPath',root]});
}

async function build({executable,root,target='StandaloneWindows64',outputPath,timeoutMs,spawnImpl}={}){
  const config=UNITY_TARGETS[target];if(!config)throw Error(`지원하지 않는 Unity 빌드 대상입니다: ${target}`);
  if(!outputPath)throw Error('Unity 빌드 출력 경로가 필요합니다.');
  const output=relativeOutput(root,outputPath);await fs.mkdir(path.dirname(output.full),{recursive:true});
  const result=await runUnity({executable,root,timeoutMs,spawnImpl,args:['-batchmode','-quit','-nographics','-projectPath',root,'-buildTarget',target,config.flag,output.full]});
  return {...result,target,output_path:output.relative};
}

async function createTestResultsPath(){return path.join(await fs.mkdtemp(path.join(os.tmpdir(),'school-code-unity-')),'test-results.xml');}

module.exports={UNITY_TARGETS,TEST_PLATFORMS,MAX_OUTPUT,relativeOutput,projectInfo,runUnity,runTests,refreshAssets,build,createTestResultsPath};
