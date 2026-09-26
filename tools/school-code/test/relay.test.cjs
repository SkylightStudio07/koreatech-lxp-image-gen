const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {createRelay}=require('../src/relay.cjs');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
test('real MCP SDK initialize, list, read tool round trip, auth isolation and timeout',async t=>{
const mcpToken=randomBytes(32).toString('hex'),workerToken=randomBytes(32).toString('hex');const app=createRelay({mcpToken,workerToken,port:0,timeoutMs:400});const address=await app.listen(),base=`http://127.0.0.1:${address.port}`;t.after(()=>app.close());
const headers={Authorization:'Bearer '+workerToken,'X-Worker-Id':randomUUID(),'Content-Type':'application/json'};
assert.equal((await fetch(base+'/worker/heartbeat',{headers:{...headers,Authorization:'Bearer '+mcpToken}})).status,401);
assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+workerToken},body:'{}'})).status,401);
await fetch(base+'/worker/heartbeat',{headers});assert.equal((await fetch(base+'/worker/heartbeat',{headers:{...headers,'X-Worker-Id':randomUUID()}})).status,409);
const client=new Client({name:'test',version:'1'});t.after(()=>client.close());await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+mcpToken}}}));
const listed=await client.listTools();assert.equal(listed.tools.length,62);assert(listed.tools.some(x=>x.name==='create_directory'));assert(listed.tools.some(x=>x.name==='generate_image_asset'));assert(listed.tools.some(x=>x.name==='save_image_asset'));assert(listed.tools.some(x=>x.name==='read_image'));assert(listed.tools.some(x=>x.name==='path_info'));assert(listed.tools.some(x=>x.name==='git_info'));assert(listed.tools.some(x=>x.name==='git_status'));assert(listed.tools.some(x=>x.name==='git_diff'));assert(listed.tools.some(x=>x.name==='git_commit'));assert(listed.tools.some(x=>x.name==='git_push'));assert(listed.tools.some(x=>x.name==='propose_edit'));assert(listed.tools.some(x=>x.name==='read_asset_metadata'));assert(listed.tools.some(x=>x.name==='list_visual_assets'));assert(listed.tools.some(x=>x.name==='list_model_assets'));assert(listed.tools.some(x=>x.name==='read_model_metadata'));assert(listed.tools.some(x=>x.name==='read_instructions'));assert(listed.tools.some(x=>x.name==='read_skill'));assert(listed.tools.some(x=>x.name==='run_shell'));assert(listed.tools.some(x=>x.name==='start_background_task'));assert(listed.tools.some(x=>x.name==='task_status'));assert(listed.tools.some(x=>x.name==='notion_search'));assert(listed.tools.some(x=>x.name==='unity_build'));assert(listed.tools.some(x=>x.name==='unity_set_component'));assert(listed.tools.some(x=>x.name==='unity_capture_scene'));assert(listed.tools.some(x=>x.name==='unity_project_status'));assert(listed.tools.some(x=>x.name==='unity_instantiate_prefab'));
const called=client.callTool({name:'read_file',arguments:{path:'hello.txt'}});const job=await (await fetch(base+'/worker/poll',{headers})).json();assert.equal(job.name,'read_file');await fetch(base+'/worker/result',{method:'POST',headers,body:JSON.stringify({id:job.id,result:{content:'hello'}})});const result=await called;assert.equal(JSON.parse(result.content[0].text).content,'hello');
const captured=client.callTool({name:'unity_capture_scene',arguments:{}});const captureJob=await (await fetch(base+'/worker/poll',{headers})).json();assert.equal(captureJob.name,'unity_capture_scene');await fetch(base+'/worker/result',{method:'POST',headers,body:JSON.stringify({id:captureJob.id,result:{ok:true,mime:'image/png',image_base64:'iVBORw0KGgo='}})});const capturedResult=await captured;assert.equal(capturedResult.content[1].type,'image');assert.equal(capturedResult.content[1].mimeType,'image/png');
const timed=await client.callTool({name:'workspace_info',arguments:{}});assert(timed.isError);assert.match(timed.content[0].text,/timeout/);
const expired=await fetch(base+'/worker/result',{method:'POST',headers,body:JSON.stringify({id:'unknown',result:{}})});assert.equal(expired.status,410);
});
test('pairing issues per-user tokens and keeps workspace jobs isolated',async t=>{
  const app=createRelay({port:0,timeoutMs:250,pairingTtlMs:30000});const address=await app.listen();const base=`http://127.0.0.1:${address.port}`;t.after(()=>app.close());
  async function pair(username,workspace){
    const start=await fetch(base+'/auth/pair/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:workspace,workspaceName:workspace,deviceId:randomUUID()})});const pending=await start.json();
    const register=await fetch(base+'/auth/register',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:pending.code,username,password:'password123'})});assert.equal(register.status,303);
    const status=await (await fetch(`${base}/auth/pair/status?pair_id=${pending.pairId}&secret=${pending.pairSecret}`)).json();assert.equal(status.status,'approved');assert(status.workerToken&&status.mcpToken);
    const retry=await (await fetch(`${base}/auth/pair/status?pair_id=${pending.pairId}&secret=${pending.pairSecret}`)).json();assert.deepEqual({workerToken:retry.workerToken,mcpToken:retry.mcpToken},{workerToken:status.workerToken,mcpToken:status.mcpToken});
    return {...status,cookie:register.headers.get('set-cookie')};
  }
  const alice=await pair('alice','workspace-a'),bob=await pair('bob','workspace-b');
  const aliceWorker={Authorization:'Bearer '+alice.workerToken,'X-Worker-Id':randomUUID(),'Content-Type':'application/json'},bobWorker={Authorization:'Bearer '+bob.workerToken,'X-Worker-Id':randomUUID(),'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/worker/heartbeat',{headers:aliceWorker})).status,200);assert.equal((await fetch(base+'/worker/heartbeat',{headers:bobWorker})).status,200);
  const aliceClient=new Client({name:'alice',version:'1'}),bobClient=new Client({name:'bob',version:'1'});t.after(()=>aliceClient.close());t.after(()=>bobClient.close());
  await aliceClient.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+alice.mcpToken}}}));await bobClient.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+bob.mcpToken}}}));
  const aliceCall=aliceClient.callTool({name:'workspace_info',arguments:{}});const aliceJob=await (await fetch(base+'/worker/poll',{headers:aliceWorker})).json();assert.equal(aliceJob.name,'workspace_info');
  const bobStatus=await (await fetch(base+'/worker/status',{method:'POST',headers:bobWorker,body:JSON.stringify({id:aliceJob.id})})).json();assert.equal(bobStatus.active,false);
  await fetch(base+'/worker/result',{method:'POST',headers:aliceWorker,body:JSON.stringify({id:aliceJob.id,result:{name:'workspace-a'}})});assert.equal(JSON.parse((await aliceCall).content[0].text).name,'workspace-a');
  const bobCall=await bobClient.callTool({name:'workspace_info',arguments:{}});assert(bobCall.isError);assert.match(bobCall.content[0].text,/timeout/);
  assert.equal((await fetch(base+'/auth/tokens/revoke',{method:'POST',headers:{Cookie:alice.cookie}})).status,200);assert.equal((await fetch(base+'/worker/heartbeat',{headers:aliceWorker})).status,401);
});
