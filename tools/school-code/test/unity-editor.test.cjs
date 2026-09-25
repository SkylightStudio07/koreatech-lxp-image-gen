const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {UnityEditorClient,editorPort}=require('../src/unity-editor.cjs');

test('Unity Editor client uses loopback bearer bridge and fixed actions',async()=>{
  const calls=[];const client=new UnityEditorClient({getToken:async()=> 'editor-token-12345678901234567890',getPort:()=>18777,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,game_objects:[]})};}});
  const result=await client.call('unity_find_gameobjects',{query:'Player'});assert.equal(result.ok,true);assert.equal(calls[0].url,'http://127.0.0.1:18777/mcp');assert.equal(calls[0].options.headers.Authorization,'Bearer editor-token-12345678901234567890');assert.match(calls[0].options.body,/"action":"unity_find_gameobjects"/);
  assert.equal(editorPort(18777),18777);assert.throws(()=>editorPort(80),/포트/);await assert.rejects(client.call('unknown_action'),/지원하지 않는/);
});

test('Unity Editor client reports bridge errors without exposing token',async()=>{
  const client=new UnityEditorClient({getToken:async()=> 'editor-token-12345678901234567890',getPort:()=>18777,fetchImpl:async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:'인증 실패'})})});
  await assert.rejects(client.call('unity_save_scene'),/인증 실패/);
});

test('bundled Unity bridge auto-starts and reads the per-user token file',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','unity-editor','SchoolCodeMcpBridge.cs'),'utf8');
  assert.match(source,/EditorApplication\.quitting \+= Stop;[\s\S]*Start\(\);/);
  assert.match(source,/if \(Application\.isBatchMode\)[\s\S]*bridge skipped in batch mode/);
  assert.match(source,/Environment\.SpecialFolder\.UserProfile/);
  assert.match(source,/unity-editor-token/);
  assert.match(source,/PortSearchCount\s*=\s*64/);
  assert.match(source,/unity-editor-ports/);
  assert.match(source,/SavePort\(projectRoot, port\)/);
  assert.match(source,/candidateListener\.Start\(\)/);
  for(const action of ['unity_capture_scene','unity_capture_game','unity_model_preview','unity_play','unity_pause','unity_stop','unity_get_console_logs','unity_project_status','unity_add_component','unity_remove_component','unity_duplicate_gameobject','unity_delete_gameobject','unity_move_gameobject','unity_instantiate_prefab','unity_assign_material','unity_get_animator_info','unity_set_animator_parameter'])assert.match(source,new RegExp('case "'+action+'"'));
});
