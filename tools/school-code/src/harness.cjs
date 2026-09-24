const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {safePath}=require('./workspace.cjs');

const MAX_COMMAND_CHARS=20000;
const MAX_ENV_ENTRIES=64;
const MAX_ENV_VALUE_CHARS=2000;
const MAX_OUTPUT_CHARS=2*1024*1024;
const MAX_SYNC_TIMEOUT_MS=90000;
const MAX_BACKGROUND_RUNTIME_MS=30*60*1000;
const SECRET_ENV=/token|secret|password|passwd|api[_-]?key|cookie|credential|authorization|private[_-]?key/i;
const ENV_KEY=/^[A-Za-z_][A-Za-z0-9_]*$/;

function validateCommand(command){
  if(typeof command!=='string'||!command.trim())throw Error('실행할 셸 명령을 입력하세요.');
  if(command.length>MAX_COMMAND_CHARS)throw Error(`셸 명령은 ${MAX_COMMAND_CHARS.toLocaleString()}자 이하만 허용됩니다.`);
  return command;
}
function boundedNumber(value,fallback,min,max){
  const n=Number(value);
  if(!Number.isFinite(n))return fallback;
  return Math.min(max,Math.max(min,Math.trunc(n)));
}
function safeEnvironment(extra={}){
  const env={};
  for(const [key,value] of Object.entries(process.env)){
    if(!ENV_KEY.test(key)||SECRET_ENV.test(key)||typeof value!=='string')continue;
    env[key]=value;
  }
  if(extra&&typeof extra==='object'&&!Array.isArray(extra)){
    const entries=Object.entries(extra);if(entries.length>MAX_ENV_ENTRIES)throw Error(`환경 변수는 ${MAX_ENV_ENTRIES}개 이하만 지정할 수 있습니다.`);
    for(const [key,value] of entries){
      if(!ENV_KEY.test(key)||SECRET_ENV.test(key))throw Error(`민감하거나 올바르지 않은 환경 변수 이름입니다: ${key}`);
      if(typeof value!=='string'||value.length>MAX_ENV_VALUE_CHARS)throw Error(`환경 변수 ${key}의 값이 너무 깁니다.`);
      env[key]=value;
    }
  }
  return env;
}
function appendOutput(current,chunk){
  const text=String(chunk||'');if(!text)return current;
  const next=current+text;if(next.length<=MAX_OUTPUT_CHARS)return next;
  return next.slice(0,MAX_OUTPUT_CHARS)+'\n[출력 제한으로 잘림]';
}
async function resolveCwd(root,input=''){
  if(input!==''&&typeof input!=='string')throw Error('작업 디렉터리는 상대 경로 문자열이어야 합니다.');
  const cwd=await safePath(root,input||'',{directory:true});
  return await fs.realpath(cwd);
}
function terminate(child){
  if(!child||child.killed)return;
  if(process.platform==='win32'&&child.pid){
    const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.on('error',()=>{});killer.on('close',()=>{try{child.kill();}catch{}});try{child.kill();}catch{}
  }else{try{child.kill('SIGTERM');}catch{}}
}
function spawnShell(command,{cwd,env,timeoutMs,onOutput}={}){
  const started=Date.now();
  const child=spawn(command,{cwd,env,shell:true,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false,settled=false;
  const add=(kind,data)=>{const text=String(data);if(kind==='stdout')stdout=appendOutput(stdout,text);else stderr=appendOutput(stderr,text);onOutput?.({kind,text});};
  child.stdout.on('data',d=>add('stdout',d));child.stderr.on('data',d=>add('stderr',d));
  let forceTimer=null,settle;
  const timer=setTimeout(()=>{timedOut=true;terminate(child);forceTimer=setTimeout(()=>{if(settled)return;settled=true;settle({exit_code:null,signal:'SIGTERM',timed_out:true,duration_ms:Date.now()-started,stdout,stderr});},1000);},timeoutMs);
  const promise=new Promise((resolve,reject)=>{
    settle=resolve;
    child.once('error',e=>{if(settled)return;settled=true;clearTimeout(timer);if(forceTimer)clearTimeout(forceTimer);reject(e);});
    child.once('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);if(forceTimer)clearTimeout(forceTimer);resolve({exit_code:typeof code==='number'?code:null,signal:signal||null,timed_out:timedOut,duration_ms:Date.now()-started,stdout,stderr});});
  });
  return {child,promise,terminate:()=>terminate(child)};
}
async function runShell(root,{command,cwd='',timeout_ms=120000,env}={}){
  validateCommand(command);const dir=await resolveCwd(root,cwd);const timeoutMs=boundedNumber(timeout_ms,30000,1000,MAX_SYNC_TIMEOUT_MS);
  const run=spawnShell(command,{cwd:dir,env:safeEnvironment(env),timeoutMs});
  const result=await run.promise;return {...result,cwd:path.relative(root,dir).split(path.sep).join('/')||'.',command:command.trim()};
}

class TaskManager{
  constructor({maxTasks=8}={}){this.maxTasks=maxTasks;this.tasks=new Map();}
  async start(root,{command,cwd='',max_runtime_ms=MAX_BACKGROUND_RUNTIME_MS,env}={}){
    validateCommand(command);if([...this.tasks.values()].filter(t=>t.status==='running').length>=this.maxTasks)throw Error('동시에 실행할 수 있는 백그라운드 작업 수를 초과했습니다.');
    const dir=await resolveCwd(root,cwd);const maxRuntime=boundedNumber(max_runtime_ms,MAX_BACKGROUND_RUNTIME_MS,1000,MAX_BACKGROUND_RUNTIME_MS);const id=randomUUID();
    const task={id,root,cwd:path.relative(root,dir).split(path.sep).join('/')||'.',command:command.trim(),status:'running',started_at:new Date().toISOString(),started_ms:Date.now(),stdout:'',stderr:'',exit_code:null,signal:null,timed_out:false};
    const run=spawnShell(task.command,{cwd:dir,env:safeEnvironment(env),timeoutMs:maxRuntime,onOutput:({kind,text})=>{task[kind]=appendOutput(task[kind],text);}});task.process=run;this.tasks.set(id,task);
    run.promise.then(result=>{Object.assign(task,result);task.status=task.cancel_requested?'cancelled':result.timed_out?'timeout':result.exit_code===0?'completed':'failed';task.finished_at=new Date().toISOString();delete task.process;this.trim();}).catch(error=>{task.status=task.cancel_requested?'cancelled':'failed';task.error=String(error.message||error).slice(0,300);task.finished_at=new Date().toISOString();delete task.process;this.trim();});
    return this.public(task);
  }
  get(id,root){const task=this.tasks.get(String(id||''));if(!task||task.root!==root)throw Error('작업을 찾을 수 없습니다.');return task;}
  public(task){const out={id:task.id,status:task.status,command:task.command,cwd:task.cwd,started_at:task.started_at,finished_at:task.finished_at,exit_code:task.exit_code,signal:task.signal,timed_out:task.timed_out};if(task.error)out.error=task.error;return out;}
  status(id,root){const task=this.get(id,root);return {...this.public(task),stdout_chars:task.stdout.length,stderr_chars:task.stderr.length};}
  output(id,root,max_chars=200000){const task=this.get(id,root);const max=boundedNumber(max_chars,200000,1,MAX_OUTPUT_CHARS);return {...this.public(task),stdout:task.stdout.slice(-max),stderr:task.stderr.slice(-max)};}
  async cancel(id,root){const task=this.get(id,root);if(task.status!=='running')return this.public(task);task.cancel_requested=true;task.status='cancelling';task.process.terminate();await Promise.race([task.process.promise,new Promise(resolve=>setTimeout(resolve,10000))]);if(task.status==='cancelling'){task.status='cancelled';task.finished_at=new Date().toISOString();}return this.public(task);}
  async cancelRoot(root){const running=[...this.tasks.values()].filter(t=>t.root===root&&t.status==='running');for(const task of running){try{await this.cancel(task.id,root);}catch{}}}
  async dispose(){const running=[...this.tasks.values()].filter(t=>t.status==='running');for(const task of running){try{await this.cancel(task.id,task.root);}catch{}}this.tasks.clear();}
  trim(){const completed=[...this.tasks.values()].filter(t=>t.status!=='running'&&t.status!=='cancelling').sort((a,b)=>(a.finished_at||'').localeCompare(b.finished_at||''));while(completed.length>40)this.tasks.delete(completed.shift().id);}
}

module.exports={MAX_COMMAND_CHARS,MAX_OUTPUT_CHARS,MAX_SYNC_TIMEOUT_MS,MAX_BACKGROUND_RUNTIME_MS,safeEnvironment,resolveCwd,runShell,TaskManager};
