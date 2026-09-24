const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {runShell,TaskManager}=require('../src/harness.cjs');

const nodeCommand=code=>`"${process.execPath}" -e "${code.replaceAll('"','\\"')}"`;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('shell harness runs inside the project and bounds output and timeout',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-harness-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'sub'));
  const result=await runShell(root,{command:nodeCommand("process.stdout.write('hello');process.stderr.write('warn')"),cwd:'sub'});
  assert.equal(result.exit_code,0);assert.equal(result.cwd,'sub');assert.match(result.stdout,/hello/);assert.match(result.stderr,/warn/);
  await assert.rejects(runShell(root,{command:'echo nope',cwd:'..'}),/차단된 경로|경로/);
  await assert.rejects(runShell(root,{command:'echo nope',env:{SCHOOL_CODE_TOKEN:'secret'}}),/민감하거나/);
  const timed=await runShell(root,{command:nodeCommand('setTimeout(()=>{},1500)'),timeout_ms:1000});assert.equal(timed.timed_out,true);
});

test('background tasks expose status, output and cancellation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-task-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const manager=new TaskManager({maxTasks:2});t.after(()=>manager.dispose());
  const task=await manager.start(root,{command:nodeCommand("setTimeout(()=>{console.log('done')},100)")});assert.match(task.id,/^[a-f0-9-]{36}$/);assert.equal(task.status,'running');
  for(let i=0;i<20;i++){if(manager.status(task.id,root).status!=='running')break;await wait(50);}
  const finished=manager.status(task.id,root);assert.equal(finished.status,'completed');assert.match(manager.output(task.id,root).stdout,/done/);
  const long=await manager.start(root,{command:nodeCommand('setTimeout(()=>{},1500)')});const cancelled=await manager.cancel(long.id,root);assert.equal(cancelled.status,'cancelled');
  await assert.rejects(Promise.resolve().then(()=>manager.status(task.id,'other-root')),/찾을 수 없습니다/);
});
