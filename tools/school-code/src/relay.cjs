const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {z}=require('zod');
const {authorized,json,readJson}=require('./bridge.cjs');

const toolDefinitions={
  workspace_info:{description:'Get the connected VS Code project name, available tools, instruction files and safety limits. Requires a connected worker.',schema:{}},
  list_files:{description:'List files inside the connected workspace (excludes secrets, Git metadata, dependencies).',schema:{path:z.string().default(''),limit:z.number().int().min(1).max(500).default(200)}},
  read_file:{description:'Read a UTF-8 text file in the workspace after user approval.',schema:{path:z.string().min(1),start_line:z.number().int().min(1).default(1),end_line:z.number().int().min(1).default(300)}},
  search_text:{description:'Search literal text in workspace text files, after user approval.',schema:{query:z.string().min(1).max(200),path:z.string().default(''),limit:z.number().int().min(1).max(100).default(50)}},
  read_asset_metadata:{description:'Read metadata and SHA-256 for a project asset without transferring its binary contents.',schema:{path:z.string().min(1)}},
  read_instructions:{description:'Read project instruction files such as AGENTS.md and CODEX.md after user approval.',schema:{}},
  propose_edit:{description:'Propose complete UTF-8 file contents. Shows a VS Code diff and requires explicit user approval before writing. Existing file edits require the SHA-256 from read_file.',schema:{path:z.string().min(1),content:z.string().max(200000),expected_sha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}},
};
function createRelay({mcpToken,workerToken,host='127.0.0.1',port=18880,timeoutMs=120000}={}){
  if(!mcpToken||!workerToken||mcpToken.length<32||workerToken.length<32||mcpToken===workerToken)throw Error('Set distinct MCP_TOKEN and WORKER_TOKEN (at least 32 characters).');
  const jobs=new Map();let poll,lastSeen=0,workerId=null;const sessions=new Set();
  const connected=()=>Date.now()-lastSeen<35000;
  function dispatch(){if(!poll)return;const j=[...jobs.values()].find(j=>!j.delivered);if(!j)return;j.delivered=true;clearTimeout(poll.timer);json(poll.res,200,{id:j.id,name:j.name,args:j.args,expiresAt:j.expiresAt});poll=null;}
  function enqueue(name,args,signal){if(!connected())return Promise.reject(Error('VS Code worker offline. Connect the extension first.'));if(jobs.size>=8)return Promise.reject(Error('Worker busy'));if(signal?.aborted)return Promise.reject(Error('Request cancelled'));
    return new Promise((resolve,reject)=>{const id=randomUUID();let settled=false;const cleanup=()=>{clearTimeout(timer);jobs.delete(id);signal?.removeEventListener('abort',abort);};const finish=(error,result)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(result);};const abort=()=>finish(Error('Request cancelled'));const timer=setTimeout(()=>finish(Error('Approval/tool timeout. No automatic retry.')),timeoutMs);jobs.set(id,{id,name,args,expiresAt:Date.now()+timeoutMs,resolve:r=>finish(null,r),reject:e=>finish(e),timer,delivered:false});signal?.addEventListener('abort',abort,{once:true});dispatch();});}
  function mcp(){const server=new McpServer({name:'koreatech-workspace',version:'0.2.0'});for(const [name,d]of Object.entries(toolDefinitions))server.registerTool(name,{description:d.description,inputSchema:d.schema,annotations:{readOnlyHint:name!=='propose_edit',destructiveHint:name==='propose_edit',openWorldHint:false}},async (args,extra)=>{try{return {content:[{type:'text',text:JSON.stringify(await enqueue(name,args,extra.signal))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});return server;}
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
