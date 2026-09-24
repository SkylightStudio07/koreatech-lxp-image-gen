const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {z}=require('zod');
const {authorized,json,readJson}=require('./bridge.cjs');

const MUTATING_TOOLS=new Set(['propose_edit','run_shell','start_background_task','task_cancel','unity_build','unity_refresh_assets','unity_set_component','unity_create_gameobject','unity_save_scene']);

const toolDefinitions={
  workspace_info:{description:'Get the connected VS Code project name, available tools, instruction files and safety limits. Requires a connected worker.',schema:{}},
  list_files:{description:'List files inside the connected workspace (excludes secrets, Git metadata, dependencies).',schema:{path:z.string().default(''),limit:z.number().int().min(1).max(500).default(200)}},
  read_file:{description:'Read a UTF-8 text file in the workspace after user approval.',schema:{path:z.string().min(1),start_line:z.number().int().min(1).default(1),end_line:z.number().int().min(1).default(300)}},
  search_text:{description:'Search literal text in workspace text files, after user approval.',schema:{query:z.string().min(1).max(200),path:z.string().default(''),limit:z.number().int().min(1).max(100).default(50)}},
  read_asset_metadata:{description:'Read metadata and SHA-256 for a project asset without transferring its binary contents.',schema:{path:z.string().min(1)}},
  read_instructions:{description:'Read project instruction files such as AGENTS.md and CODEX.md after user approval.',schema:{}},
  read_skill:{description:'Read one project skill from .school-code/skills/<name>/SKILL.md or .agents/skills/<name>/SKILL.md after user approval. Project-local .school-code skills override .agents skills. Other directories are not searched.',schema:{name:z.string().min(1).max(64)}},
  run_shell:{description:'Run an arbitrary shell command with the connected project as its starting directory after explicit approval. The shell follows the current OS user permissions, so this is not an OS sandbox; sensitive environment variables are removed, output and runtime are bounded, and no command is run automatically without the session approval mode.',schema:{command:z.string().min(1).max(20000),cwd:z.string().max(1024).default(''),timeout_ms:z.number().int().min(1000).max(90000).default(30000),env:z.record(z.string().max(2000)).optional()}},
  start_background_task:{description:'Start a long-running arbitrary shell command with the connected project as its starting directory after explicit approval. The shell follows the current OS user permissions, so this is not an OS sandbox. Returns a task id; use task_status, task_output, or task_cancel to manage it. Runtime is limited to 30 minutes and the task is cancelled when the VS Code worker disconnects.',schema:{command:z.string().min(1).max(20000),cwd:z.string().max(1024).default(''),max_runtime_ms:z.number().int().min(1000).max(1800000).default(1800000),env:z.record(z.string().max(2000)).optional()}},
  task_status:{description:'Read the status of a background shell task created by this connected VS Code worker.',schema:{task_id:z.string().uuid()}},
  task_output:{description:'Read bounded stdout and stderr from a background shell task created by this connected VS Code worker.',schema:{task_id:z.string().uuid(),max_chars:z.number().int().min(1).max(2097152).default(200000)}},
  task_cancel:{description:'Cancel a running background shell task after explicit approval.',schema:{task_id:z.string().uuid()}},
  notion_search:{description:'Search pages shared with the configured Notion integration. Read-only; approval is required unless the session allows read tools automatically.',schema:{query:z.string().max(200).default(''),page_size:z.number().int().min(1).max(100).default(20),start_cursor:z.string().optional()}},
  notion_fetch_page:{description:'Fetch read-only metadata for a Notion page shared with the configured integration.',schema:{page_id:z.string().min(1)}},
  notion_list_children:{description:'List read-only text and child metadata for a Notion page or block.',schema:{block_id:z.string().min(1),page_size:z.number().int().min(1).max(100).default(50),start_cursor:z.string().optional()}},
  unity_project_info:{description:'Read Unity project version and package metadata without starting Unity.',schema:{}},
  unity_run_tests:{description:'Run allowlisted Unity EditMode or PlayMode tests in batch mode. No arbitrary shell command is exposed.',schema:{platform:z.enum(['editmode','playmode']).default('editmode')}},
  unity_build:{description:'Build an allowlisted Unity target to a relative path inside the connected project.',schema:{target:z.enum(['StandaloneWindows64','StandaloneLinux64','StandaloneOSX','WebGL']).default('StandaloneWindows64'),output_path:z.string().min(1)}},
  unity_refresh_assets:{description:'Start Unity in batch mode so it imports and refreshes project assets.',schema:{}},
  unity_open_scene:{description:'Open a project scene in the connected Unity Editor.',schema:{scene:z.string().min(1)}},
  unity_find_gameobjects:{description:'Find loaded Unity Editor game objects by name or hierarchy path.',schema:{query:z.string().max(200).default('')}},
  unity_get_component:{description:'Read a component summary from a loaded Unity Editor game object.',schema:{game_object_id:z.string().min(1),component_type:z.string().min(1).max(200)}},
  unity_set_component:{description:'Set an allowlisted serialized component property in the Unity Editor after approval.',schema:{game_object_id:z.string().min(1),component_type:z.string().min(1).max(200),property:z.string().min(1).max(200),value:z.string().max(10000)}},
  unity_create_gameobject:{description:'Create an empty Unity Editor game object after approval.',schema:{name:z.string().min(1).max(200),parent_id:z.string().optional()}},
  unity_save_scene:{description:'Save the currently open Unity Editor scene after approval.',schema:{}},
  propose_edit:{description:'Propose complete UTF-8 file contents. Shows a VS Code diff and requires explicit user approval before writing. Existing file edits require the SHA-256 from read_file.',schema:{path:z.string().min(1),content:z.string().max(200000),expected_sha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}},
};
function createRelay({mcpToken,workerToken,host='127.0.0.1',port=18880,timeoutMs=120000}={}){
  if(!mcpToken||!workerToken||mcpToken.length<32||workerToken.length<32||mcpToken===workerToken)throw Error('Set distinct MCP_TOKEN and WORKER_TOKEN (at least 32 characters).');
  const jobs=new Map();let poll,lastSeen=0,workerId=null;const sessions=new Set();
  const connected=()=>Date.now()-lastSeen<35000;
  function dispatch(){if(!poll)return;const j=[...jobs.values()].find(j=>!j.delivered);if(!j)return;j.delivered=true;clearTimeout(poll.timer);json(poll.res,200,{id:j.id,name:j.name,args:j.args,expiresAt:j.expiresAt});poll=null;}
  function enqueue(name,args,signal){if(!connected())return Promise.reject(Error('VS Code worker offline. Connect the extension first.'));if(jobs.size>=8)return Promise.reject(Error('Worker busy'));if(signal?.aborted)return Promise.reject(Error('Request cancelled'));
    return new Promise((resolve,reject)=>{const id=randomUUID();let settled=false;const cleanup=()=>{clearTimeout(timer);jobs.delete(id);signal?.removeEventListener('abort',abort);};const finish=(error,result)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(result);};const abort=()=>finish(Error('Request cancelled'));const timer=setTimeout(()=>finish(Error('Approval/tool timeout. No automatic retry.')),timeoutMs);jobs.set(id,{id,name,args,expiresAt:Date.now()+timeoutMs,resolve:r=>finish(null,r),reject:e=>finish(e),timer,delivered:false});signal?.addEventListener('abort',abort,{once:true});dispatch();});}
  function mcp(){const server=new McpServer({name:'koreatech-workspace',version:'0.4.0'});for(const [name,d]of Object.entries(toolDefinitions))server.registerTool(name,{description:d.description,inputSchema:d.schema,annotations:{readOnlyHint:!MUTATING_TOOLS.has(name),destructiveHint:MUTATING_TOOLS.has(name),openWorldHint:name.startsWith('notion_')}},async (args,extra)=>{try{return {content:[{type:'text',text:JSON.stringify(await enqueue(name,args,extra.signal))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});return server;}
  const server=http.createServer(async(req,res)=>{try{
    // Not a browser-facing endpoint. Prevent cross-origin web pages from submitting jobs.
    if(req.headers.origin)return json(res,403,{error:'Origin not allowed'});
    if(req.url==='/health'&&req.method==='GET')return json(res,200,{ok:true});
    if(req.url?.startsWith('/worker/')){
      if(!authorized(req,workerToken))return json(res,401,{error:'Unauthorized'});
      const id=req.headers['x-worker-id'];if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return json(res,400,{error:'Invalid worker ID'});
      if(workerId&&workerId!==id&&connected())return json(res,409,{error:'Another VS Code window is connected'});
      if(workerId&&workerId!==id){for(const job of jobs.values()){clearTimeout(job.timer);job.reject(Error('Worker changed'));}jobs.clear();}
      workerId=id;lastSeen=Date.now();
      if(req.url==='/worker/heartbeat'&&req.method==='GET')return json(res,200,{ok:true});
      if(req.url==='/worker/poll'&&req.method==='GET'){
        if(poll){clearTimeout(poll.timer);json(poll.res,200,{});}const p={res,timer:setTimeout(()=>{if(poll===p)poll=null;json(res,200,{});},20000)};poll=p;res.on('close',()=>{if(poll===p){clearTimeout(p.timer);poll=null;}});dispatch();return;
      }
      if(req.url==='/worker/status'&&req.method==='POST'){const data=await readJson(req,1000);return json(res,200,{active:jobs.has(data.id)});}
      if(req.url==='/worker/result'&&req.method==='POST'){const data=await readJson(req,1024*1024);const job=jobs.get(data.id);if(!job)return json(res,410,{error:'Job expired'});clearTimeout(job.timer);jobs.delete(data.id);data.error?job.reject(Error(String(data.error).slice(0,300))):job.resolve(data.result);return json(res,200,{ok:true});}
      if(req.url==='/worker/disconnect'&&req.method==='POST'){lastSeen=0;workerId=null;if(poll){clearTimeout(poll.timer);json(poll.res,200,{});poll=null;}for(const j of jobs.values())j.reject(Error('VS Code disconnected'));jobs.clear();return json(res,200,{ok:true});}
      return json(res,404,{});
    }
    if(req.url!=='/mcp')return json(res,404,{});
    if(!authorized(req,mcpToken))return json(res,401,{error:'Unauthorized'});
    if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Stateless Streamable HTTP: use POST'});}
    const body=await readJson(req,1024*1024);
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});const s=mcp();sessions.add(s);
    res.on('close',()=>{sessions.delete(s);transport.close().catch(()=>{});s.close().catch(()=>{});});
    await s.connect(transport);await transport.handleRequest(req,res,body);
  }catch{if(!res.headersSent)json(res,400,{error:'Invalid request'});else res.end();}});
  server.requestTimeout=150000;server.headersTimeout=15000;
  return {server,jobs,async listen(){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});return server.address();},async close(){if(poll){clearTimeout(poll.timer);json(poll.res,200,{});poll=null;}for(const j of jobs.values()){clearTimeout(j.timer);j.reject(Error('Relay closed'));}jobs.clear();for(const s of sessions)await s.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
if(require.main===module){const app=createRelay({mcpToken:process.env.MCP_TOKEN,workerToken:process.env.WORKER_TOKEN,host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||18880)});app.listen().then(a=>console.log(`School MCP relay listening on ${a.address}:${a.port}`));for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.close().then(()=>process.exit(0)));}
module.exports={createRelay,toolDefinitions};
