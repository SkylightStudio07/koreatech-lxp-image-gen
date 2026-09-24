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
const listed=await client.listTools();assert.equal(listed.tools.length,26);assert(listed.tools.some(x=>x.name==='propose_edit'));assert(listed.tools.some(x=>x.name==='read_asset_metadata'));assert(listed.tools.some(x=>x.name==='read_instructions'));assert(listed.tools.some(x=>x.name==='read_skill'));assert(listed.tools.some(x=>x.name==='run_shell'));assert(listed.tools.some(x=>x.name==='start_background_task'));assert(listed.tools.some(x=>x.name==='task_status'));assert(listed.tools.some(x=>x.name==='notion_search'));assert(listed.tools.some(x=>x.name==='unity_build'));assert(listed.tools.some(x=>x.name==='unity_set_component'));
const called=client.callTool({name:'read_file',arguments:{path:'hello.txt'}});const job=await (await fetch(base+'/worker/poll',{headers})).json();assert.equal(job.name,'read_file');await fetch(base+'/worker/result',{method:'POST',headers,body:JSON.stringify({id:job.id,result:{content:'hello'}})});const result=await called;assert.equal(JSON.parse(result.content[0].text).content,'hello');
const timed=await client.callTool({name:'workspace_info',arguments:{}});assert(timed.isError);assert.match(timed.content[0].text,/timeout/);
const expired=await fetch(base+'/worker/result',{method:'POST',headers,body:JSON.stringify({id:'unknown',result:{}})});assert.equal(expired.status,410);
});
