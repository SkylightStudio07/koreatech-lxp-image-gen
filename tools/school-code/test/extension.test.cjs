// Exercises the real extension coordinator using a VS Code API double.
// Native extension-host activation is a separate check; this is not claimed as a UI test.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module'),{randomBytes}=require('node:crypto');
const {BrowserBridge}=require('../src/bridge.cjs');
const {createRelay}=require('../src/relay.cjs');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {sha}=require('../src/workspace.cjs');
const dispose=()=>({dispose(){}});
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Test condition timed out');}
test('extension: chat stream, conversation continuation, approved edits, refusal and stale hash',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-ext-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'hello.txt'),'hello');
  const mcpToken=randomBytes(32).toString('hex'),workerToken=randomBytes(32).toString('hex'),relay=createRelay({mcpToken,workerToken,port:0});const address=await relay.listen(),url=`http://127.0.0.1:${address.port}`;t.after(()=>relay.close());
  const commands=new Map(),posts=[],errors=[],inputs=[url,workerToken],ctx={subscriptions:[],extensionUri:'extension',workspaceState:{get:(k,f)=>f,update:async()=>{}},secrets:{get:async()=>null,store:async()=>{}}};let provider,handler,bridge,approved=true,approvalHook=null;
  const uri=p=>({fsPath:p,scheme:'file',toString:()=>p});
  class Edit{constructor(){this.edits=[];}createFile(u,o){this.edits.push({kind:'create',uri:u,options:o});}replace(u,r,content){this.edits.push({kind:'replace',uri:u,content});}}
  const vscode={Uri:{parse:uri,file:uri,joinPath:(base,...p)=>uri([base,...p].join('/'))},Range:class{},WorkspaceEdit:Edit,
    env:{clipboard:{writeText:async()=>{}},openExternal:async()=>true},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),showInformationMessage:async()=>{},showErrorMessage:e=>errors.push(e),showWarningMessage:async()=>{if(approvalHook)await approvalHook();return approved?'승인':undefined;},showInputBox:async()=>inputs.shift(),showTextDocument:async()=>{},registerWebviewViewProvider:(id,p)=>{provider=p;return dispose();}},
    workspace:{isTrusted:true,workspaceFolders:[{name:'fixture',uri:uri(root)}],textDocuments:[],getConfiguration:()=>({get:(key,f)=>key==='bridgePort'?0:f}),registerTextDocumentContentProvider:()=>dispose(),
      openTextDocument:async u=>({uri:u,getText:()=>'',positionAt:i=>i,save:async()=>true}),
      applyEdit:async edit=>{for(const e of edit.edits){if(e.kind==='create')await fs.writeFile(e.uri.fsPath,'',{flag:'wx'});else await fs.writeFile(e.uri.fsPath,e.content);}return true;}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return dispose();},executeCommand:async()=>{}}
  };
  const requireLocal=createRequire(path.resolve(__dirname,'../src/extension.cjs'));
  const module={exports:{}};vm.runInNewContext(await fs.readFile(path.resolve(__dirname,'../src/extension.cjs'),'utf8'),{module,exports:module.exports,require:id=>id==='vscode'?vscode:id==='./panel.cjs'?{panelHtml:()=>'<html></html>'}:id==='./bridge.cjs'?{BrowserBridge:class extends BrowserBridge{constructor(port){super(port);bridge=this;}}}:requireLocal(id),Buffer,URL,fetch,AbortController,AbortSignal,setInterval,clearInterval,setTimeout,clearTimeout,console});
  module.exports.activate(ctx);t.after(()=>ctx.subscriptions.forEach(s=>s.dispose()));await until(()=>bridge.server?.listening);
  provider.resolveWebviewView({webview:{options:{},postMessage:m=>posts.push(structuredClone(m)),onDidReceiveMessage:fn=>{handler=fn;return dispose();}},onDidDispose:()=>dispose()});
  const base=`http://127.0.0.1:${bridge.port}`,headers={Origin:'https://ai.koreatech.ac.kr',Authorization:'Bearer '+bridge.key,'Content-Type':'application/json'};
  await fetch(base+'/worker/heartbeat',{headers});
  async function nextJob(){return (await fetch(base+'/worker/poll',{headers})).json();}
  async function event(data){await fetch(base+'/worker/event',{method:'POST',headers,body:JSON.stringify(data)});}
  const refreshing=handler({type:'refresh'});
  for(const result of [{items:[{id:'gpt-6-astra',available:true,high_quality:true}]},{items:[]},{items:[]}]){const job=await nextJob();await event({id:job.id,result,done:true});}await refreshing;
  vscode.window.showOpenDialog=async()=>[uri(path.join(root,'hello.txt'))];
  await handler({type:'attachFiles'});assert.equal(posts.filter(p=>p.type==='state').at(-1).projectContext.files[0].path,'hello.txt');
  const sending=handler({type:'send',message:'hello',model:'gpt-6-astra',mode:'direct'});const job=await nextJob();assert.equal(job.body.direct,true);assert.equal(job.body.conversation_id,undefined);assert(job.body.message.includes('hello.txt'));assert(!job.body.message.includes(root));assert.equal(posts.filter(p=>p.type==='state').at(-1).projectContext.files.length,0);
  await event({id:job.id,chunk:'data: {"type":"start","conversation_id":"test-conversation"}\n\ndata: {"type":"delta","content":"안녕"}\n\ndata: {"type":"done","model_id":"gpt-6-astra"}\n\n'});await event({id:job.id,done:true});await sending;let state=posts.filter(p=>p.type==='state').at(-1);assert.equal(state.state.messages.at(-1).text,'안녕');assert.equal(state.state.conversationId,'test-conversation');
  const second=handler({type:'send',message:'continue',model:'gpt-6-astra',mode:'default'});const j2=await nextJob();assert.equal(j2.body.conversation_id,'test-conversation');await handler({type:'stop'});await second;state=posts.filter(p=>p.type==='state').at(-1);assert.equal(state.busy,false);assert.match(state.state.messages.at(-1).status,/중단/);
  await commands.get('schoolCode.relay')();await until(()=>posts.some(p=>p.type==='state'&&p.relay));
  const client=new Client({name:'extension-test',version:'1'});t.after(()=>client.close());await client.connect(new StreamableHTTPClientTransport(new URL(url+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+mcpToken}}}));
  const info=await client.callTool({name:'workspace_info',arguments:{}});const infoData=JSON.parse(info.content[0].text);assert.deepEqual(infoData.tools,['list_files','read_file','search_text','read_asset_metadata','read_instructions','propose_edit']);assert.equal(infoData.root_isolation,true);
  await fs.writeFile(path.join(root,'asset.bin'),Buffer.from([0,1,2]));const asset=await client.callTool({name:'read_asset_metadata',arguments:{path:'asset.bin'}});const assetData=JSON.parse(asset.content[0].text);assert.equal(assetData.is_text,false);assert.equal(assetData.size,3);
  const read=await client.callTool({name:'read_file',arguments:{path:'hello.txt'}});assert.equal(JSON.parse(read.content[0].text).sha256,sha('hello'));
  const edit=await client.callTool({name:'propose_edit',arguments:{path:'hello.txt',content:'updated',expected_sha256:sha('hello')}});assert(!edit.isError,edit.content[0].text);assert.equal(await fs.readFile(path.join(root,'hello.txt'),'utf8'),'updated');
  const stale=await client.callTool({name:'propose_edit',arguments:{path:'hello.txt',content:'bad',expected_sha256:sha('hello')}});assert(stale.isError);assert.equal(await fs.readFile(path.join(root,'hello.txt'),'utf8'),'updated');
  approved=false;const denied=await client.callTool({name:'read_file',arguments:{path:'hello.txt'}});assert(denied.isError);assert.match(denied.content[0].text,/거절/);approved=true;
  approvalHook=async()=>{await fs.writeFile(path.join(root,'hello.txt'),'user edit during preview');approvalHook=null;};const raced=await client.callTool({name:'propose_edit',arguments:{path:'hello.txt',content:'wrong overwrite',expected_sha256:sha('updated')}});assert(raced.isError);assert.equal(await fs.readFile(path.join(root,'hello.txt'),'utf8'),'user edit during preview');
  const created=await client.callTool({name:'propose_edit',arguments:{path:'new.txt',content:'new content'}});assert(!created.isError,created.content[0].text);assert.equal(await fs.readFile(path.join(root,'new.txt'),'utf8'),'new content');
  await commands.get('schoolCode.disconnectRelay')();assert.deepEqual(errors,[]);
});
