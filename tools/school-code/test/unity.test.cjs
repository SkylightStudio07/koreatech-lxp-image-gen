const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {EventEmitter}=require('node:events');
const {projectInfo,relativeOutput,runTests,build}=require('../src/unity.cjs');

function fakeSpawn(calls,{code=0,output='Unity finished'}={}){
  return (executable,args,options)=>{
    calls.push({executable,args,options});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
    queueMicrotask(()=>{child.stdout.emit('data',output);child.emit('close',code,null);});return child;
  };
}

test('Unity project metadata and CLI allowlist',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-unity-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'ProjectSettings'));await fs.mkdir(path.join(root,'Assets'));await fs.mkdir(path.join(root,'Packages'));
  await fs.writeFile(path.join(root,'ProjectSettings','ProjectVersion.txt'),'m_EditorVersion: 2022.3.10f1\n');await fs.writeFile(path.join(root,'Packages','manifest.json'),'{"dependencies":{"com.unity.test-framework":"1.0"}}');
  const info=await projectInfo(root);assert.equal(info.unity_version,'2022.3.10f1');assert.equal(info.is_unity_project,true);assert.equal(info.package_count,1);
  const calls=[];const tests=await runTests({executable:'Unity.exe',root,platform:'editmode',spawnImpl:fakeSpawn(calls)});assert.equal(tests.ok,true);assert.equal(calls[0].args[0],'-batchmode');assert(calls[0].args.includes('-runTests'));assert(calls[0].args.includes('editmode'));assert.equal(calls[0].options.shell,false);
  const built=await build({executable:'Unity.exe',root,target:'StandaloneWindows64',outputPath:'Builds/Game.exe',spawnImpl:fakeSpawn(calls)});assert.equal(built.target,'StandaloneWindows64');assert(calls.at(-1).args.includes('-buildWindows64Player'));assert.equal(built.output_path,'Builds/Game.exe');
});

test('Unity tools reject unsupported platforms and paths outside project',async()=>{
  assert.throws(()=>relativeOutput('C:\\project','..\\outside.exe'),/올바르지 않습니다|프로젝트 안/);
  await assert.rejects(runTests({executable:'Unity.exe',root:'C:\\project',platform:'unknown',spawnImpl:fakeSpawn([])}),/editmode 또는 playmode/);
  await assert.rejects(build({executable:'Unity.exe',root:'C:\\project',target:'Android',outputPath:'Builds\\game.apk',spawnImpl:fakeSpawn([])}),/지원하지 않는 Unity 빌드/);
});
