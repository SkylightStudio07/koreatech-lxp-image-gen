const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const files=require('../src/workspace.cjs');
const git=require('../src/git.cjs');

function run(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});}

test('missing workspace paths are normal structured results',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-code-path-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  assert.deepEqual(await files.pathInfo(root,'GameStructure'),{path:'GameStructure',exists:false,code:'PATH_NOT_FOUND',message:'경로를 찾을 수 없습니다.'});
  assert.deepEqual(await files.listFiles(root,'GameStructure'),{path:'GameStructure',exists:false,code:'PATH_NOT_FOUND',files:[],truncated:false});
  assert.deepEqual(await files.search(root,{path:'GameStructure',query:'player'}),{path:'GameStructure',exists:false,code:'PATH_NOT_FOUND',matches:[],truncated:false});
});

test('git cli reports repository state, diff and branches without shell interpolation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-code-git-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const empty=await git.repositoryInfo(root);assert.equal(empty.repository,false);assert.equal(empty.code,'NOT_A_REPOSITORY');
  run(root,['init','-q']);run(root,['config','user.email','school-code@example.invalid']);run(root,['config','user.name','School Code']);
  await fs.writeFile(path.join(root,'README.md'),'hello\n');
  assert.equal((await git.stage(root,{paths:['README.md']})).repository,true);
  assert.equal((await git.commit(root,{message:'initial'})).repository,true);
  const info=await git.repositoryInfo(root);assert.equal(info.repository,true);assert(info.branch);
  await fs.writeFile(path.join(root,'README.md'),'changed\n');
  const state=await git.status(root);assert.equal(state.clean,false);assert.equal(state.entries[0].path,'README.md');
  assert.match((await git.diff(root)).diff,/changed/);
  assert.equal((await git.createBranch(root,{name:'feature/player'})).repository,true);
  assert((await git.branches(root)).branches.some(item=>item.current&&item.name==='feature/player'));
});

test('git cli hides and refuses sensitive paths',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-code-git-secret-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  run(root,['init','-q']);run(root,['config','user.email','school-code@example.invalid']);run(root,['config','user.name','School Code']);
  await fs.writeFile(path.join(root,'.env'),'TOKEN=secret\n');
  const state=await git.status(root);assert.equal(state.entries.length,0);assert.equal(state.sensitive_count,1);
  await assert.rejects(()=>git.stage(root,{paths:['.env']}),error=>error.code==='SENSITIVE_PATH');
});
