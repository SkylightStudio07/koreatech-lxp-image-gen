const vscode=require('vscode');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');
const {BrowserBridge}=require('./bridge.cjs');
const {chatBody,SSEParser}=require('./protocol.cjs');
const workspace=require('./workspace.cjs');
const {panelHtml}=require('./panel.cjs');
const {ProjectContext}=require('./project-context.cjs');
const {SessionStore}=require('./sessions.cjs');
const {NotionClient}=require('./notion.cjs');
const unity=require('./unity.cjs');
const {UnityEditorClient}=require('./unity-editor.cjs');
const skills=require('./skills.cjs');

function activate(context){
  const output=vscode.window.createOutputChannel('School Code');context.subscriptions.push(output);
  const port=vscode.workspace.getConfiguration('schoolCode').get('bridgePort',18766);
  const bridge=new BrowserBridge(port);let bridgeError='';const ready=bridge.start().catch(e=>{bridgeError=e.code==='EADDRINUSE'?'브리지 포트가 사용 중입니다. 다른 VS Code 창을 닫거나 bridgePort를 변경하세요.':e.message;output.appendLine(bridgeError);});context.subscriptions.push({dispose:()=>bridge.dispose()});
  let view,models=[],agents=[],controller,relayController,relayRoot,relaySession,relayConnected=false,projectBusy=false;
  const projectContext=new ProjectContext(vscode,context.workspaceState);
  const sessionStore=new SessionStore(context.workspaceState);let state=sessionStore.active;
  const notion=new NotionClient({getToken:()=>context.secrets.get('schoolCode.notion.integrationToken')});
  const unityEditor=new UnityEditorClient({getToken:()=>context.secrets.get('schoolCode.unity.editorToken'),getPort:()=>vscode.workspace.getConfiguration('schoolCode').get('unityEditorPort',18777)});
  const post=m=>view?.webview.postMessage(m);
  const save=async()=>{sessionStore.update(state);await sessionStore.save();};
  function snapshot(){post({type:'state',state,models,agents,sessions:sessionStore.summaries(),activeSessionId:sessionStore.activeId,connected:bridge.connected,error:bridgeError,relay:relayConnected,busy:!!controller,projectBusy,projectContext:projectContext.info()});}
  async function connectBrowser(){await ready;if(bridgeError)throw Error(bridgeError);await vscode.env.openExternal(vscode.Uri.parse('https://ai.koreatech.ac.kr/AiCA/chat'));vscode.window.showInformationMessage('School Code Connector가 설치되어 있으면 자동 연결됩니다. 최초 설치: 확장 폴더 열기 → Chrome 확장 프로그램에서 압축해제된 확장 로드.');}
  async function configureNotion(){
    const existing=await context.secrets.get('schoolCode.notion.integrationToken');
    const token=await vscode.window.showInputBox({title:'Notion 읽기 전용 연결 토큰',prompt:'Notion 설정에서 만든 Internal Integration Secret을 입력하세요. 토큰은 VS Code SecretStorage에만 저장됩니다.',password:true,ignoreFocusOut:true,value:existing||''});
    if(!token)return;
    if(token.trim().length<20)throw Error('Notion 토큰이 너무 짧습니다.');
    const previous=existing;await context.secrets.store('schoolCode.notion.integrationToken',token.trim());
    try{await notion.request('/users/me');vscode.window.showInformationMessage('Notion 읽기 전용 연결이 설정되었습니다.');}
    catch(e){if(previous)await context.secrets.store('schoolCode.notion.integrationToken',previous);else await context.secrets.delete('schoolCode.notion.integrationToken');throw e;}
  }
  async function disconnectNotion(){await context.secrets.delete('schoolCode.notion.integrationToken');vscode.window.showInformationMessage('Notion 연결 토큰을 삭제했습니다.');}
  async function configureUnity(){
    const config=vscode.workspace.getConfiguration('schoolCode');
    const current=config.get('unityExecutable','');
    const executable=await vscode.window.showInputBox({title:'Unity 실행 파일 경로',prompt:'Unity.exe 경로 또는 PATH에 등록된 Unity.exe를 입력하세요. 임의 셸 명령은 실행하지 않습니다.',value:current||'Unity.exe',ignoreFocusOut:true});
    if(!executable||typeof config.update!=='function')return;
    await config.update('unityExecutable',executable.trim(),vscode.ConfigurationTarget?.Global??true);
    vscode.window.showInformationMessage('Unity CLI 경로를 저장했습니다.');
  }
  async function configureUnityEditor(){
    const existing=await context.secrets.get('schoolCode.unity.editorToken');
    const token=await vscode.window.showInputBox({title:'Unity Editor MCP 브리지 토큰',prompt:'Unity Editor 메뉴 School Code → MCP Bridge → Copy Token의 값을 입력하세요. 토큰은 VS Code SecretStorage에만 저장됩니다.',password:true,ignoreFocusOut:true,value:existing||''});
    if(!token)return;
    if(token.trim().length<20)throw Error('Unity Editor 브리지 토큰이 너무 짧습니다.');
    await context.secrets.store('schoolCode.unity.editorToken',token.trim());
    try{await unityEditor.call('unity_find_gameobjects',{query:''});vscode.window.showInformationMessage('Unity Editor 브리지 연결이 확인되었습니다.');}
    catch(e){await context.secrets.delete('schoolCode.unity.editorToken');throw e;}
  }
  async function refresh(){await ready;if(bridgeError)throw Error(bridgeError);const r=await bridge.request('/models');models=r.items||[];snapshot();try{const own=await bridge.request('/agents?limit=50'),pub=await bridge.request('/agents/public?limit=50');agents=[...new Map([...(own.items||[]),...(pub.items||[])].map(a=>[a.id,{id:a.id,name:a.name}])).values()];}catch{post({type:'notice',text:'모델을 불러왔습니다. 에이전트 목록 조회는 실패했습니다.'});}snapshot();}
  async function send(data){if(controller)return;if(projectBusy)throw Error('파일 선택을 마친 뒤 전송하세요.');if(!vscode.workspace.isTrusted)throw Error('신뢰된 작업 영역에서 사용하세요.');if(!bridge.connected)throw Error('학교 브라우저 연결을 먼저 확인하세요.');
    const message=String(data.message||'');if(!message.trim())throw Error('질문을 입력하세요.');const composed=projectContext.compose(message);const body=chatBody({message:composed,model:data.model,agent:data.agent,mode:data.mode,conversationId:state.conversationId},models);
    const info=projectContext.info();
    state.model=data.model;state.agent=data.agent||'';state.mode=data.mode;if(state.title==='새 대화')state.title=message.replace(/\s+/g,' ').trim().slice(0,48)||'새 대화';state.messages.push({role:'user',text:message,project:info.files.length?info.project?.name:undefined,contextFiles:info.files});projectContext.clear();const answer={role:'assistant',text:'',status:'응답 중'};state.messages.push(answer);
    controller=new AbortController();post({type:'accepted'});snapshot();let done=false;
    const parser=new SSEParser(event=>{
      if(event.conversation_id)state.conversationId=event.conversation_id;
      if(event.type==='delta'||event.type==='token'){answer.text+=event.content??event.delta??'';post({type:'stream',text:answer.text,status:answer.status});}
      if(event.type==='waiting'||event.type==='image_generating'||event.type==='image_editing'){answer.status=event.reason||'학교 AI 처리 중';post({type:'stream',text:answer.text,status:answer.status});}
      if(event.type==='error')throw Error(String(event.content||event.error||'학교 응답 오류').slice(0,300));
      if(event.type==='done'){done=true;answer.status='완료';answer.model=event.model_id;answer.attachments=event.attachments;answer.finish_reason=event.finish_reason;if(!answer.text&&event.content)answer.text=event.content;}
    });
    try{await bridge.request('/chat/completions',{method:'POST',body,stream:true,onChunk:t=>parser.push(t),signal:controller.signal});parser.end();if(!done)throw Error('응답이 중간에 종료되었습니다. 재전송은 자동으로 하지 않습니다.');}
    catch(e){answer.status=e.message;}
    finally{controller=null;await save();snapshot();}
  }
  const previews=new Map();context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('school-code-preview',{provideTextDocumentContent:u=>previews.get(u.toString())||''}));
  async function projectAction(type,file){
    if(controller||projectBusy)throw Error('진행 중인 작업을 마친 뒤 프로젝트를 변경하세요.');
    projectBusy=true;snapshot();const previous=projectContext.project?.path;
    try{
      if(type==='projectChoose')await projectContext.choose();
      if(type==='attachFiles')await projectContext.pickFiles();
      if(type==='attachFolder')await projectContext.pickFolder();
      if(type==='attachmentRemove')projectContext.remove(file);
      if(type==='attachmentsClear')projectContext.clear();
      if(type==='attachmentPreview'){
        const content=projectContext.attachmentText(file),uri=vscode.Uri.parse(`school-code-preview:/attachment/${randomUUID()}/${encodeURIComponent(file)}`);
        previews.set(uri.toString(),content);if(previews.size>100)previews.delete(previews.keys().next().value);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri),{preview:true,viewColumn:vscode.ViewColumn?.Beside});
      }
    }finally{if(previous!==projectContext.project?.path&&relayController)await disconnectRelay();projectBusy=false;snapshot();}
  }
  async function approval(detail,{write=false}={}){
    if(state.approvalMode==='full'||(state.approvalMode==='read'&&!write))return true;
    return await vscode.window.showWarningMessage(detail,{modal:true},'승인')==='승인';
  }
  async function executeTool(job,isActive,ensureActive){
    if(!vscode.workspace.isTrusted||!relayRoot||!isActive())throw Error('작업 영역 연결이 종료되었습니다.');const root=relayRoot,args=job.args||{};
    const notionTool=job.name.startsWith('notion_');
    if(job.name==='workspace_info'){
      const instructions=await workspace.readInstructions(root);const projectSkills=await skills.listSkills(root);
      return {name:path.basename(root),tools:['list_files','read_file','search_text','read_asset_metadata','read_instructions','read_skill','notion_search','notion_fetch_page','notion_list_children','unity_project_info','unity_run_tests','unity_build','unity_refresh_assets','unity_open_scene','unity_find_gameobjects','unity_get_component','unity_set_component','unity_create_gameobject','unity_save_scene','propose_edit'],write_requires_approval:true,root_isolation:true,instruction_files:instructions.files.map(f=>f.path),skills:projectSkills,notion_configured:!!(await context.secrets.get('schoolCode.notion.integrationToken')),unity_executable_configured:!!vscode.workspace.getConfiguration('schoolCode').get('unityExecutable',''),unity_editor_configured:!!(await context.secrets.get('schoolCode.unity.editorToken')),limits:{read_file_max_lines:1001,read_file_max_bytes:16777216,asset_hash_max_bytes:268435456,edit_max_chars:200000}};
    }
    if(notionTool){
      if(!await approval(`학교 AI가 Notion 읽기 도구 ${job.name}을 요청했습니다. 공유된 페이지 내용이 학교 AI로 전달됩니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();
      if(job.name==='notion_search')return notion.search(args);
      if(job.name==='notion_fetch_page')return notion.fetchPage(args.page_id);
      if(job.name==='notion_list_children')return notion.listChildren(args);
    }
    const unityTool=['unity_project_info','unity_run_tests','unity_build','unity_refresh_assets'].includes(job.name);
    if(unityTool){
      const write=job.name==='unity_build'||job.name==='unity_refresh_assets';
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트에서 Unity 도구 ${job.name}을 실행하려 합니다.${write?' 프로젝트 파일이나 빌드 산출물이 바뀔 수 있습니다.':''}`,{write}))throw Error('사용자가 거절했습니다.');
      await ensureActive();
      const executable=vscode.workspace.getConfiguration('schoolCode').get('unityExecutable','Unity.exe')||'Unity.exe';
      let result;
      if(job.name==='unity_project_info')result=await unity.projectInfo(root);
      else if(job.name==='unity_run_tests')result=await unity.runTests({executable,root,platform:args.platform});
      else if(job.name==='unity_build')result=await unity.build({executable,root,target:args.target,outputPath:args.output_path});
      else if(job.name==='unity_refresh_assets')result=await unity.refreshAssets({executable,root});
      else throw Error('지원하지 않는 Unity 도구');
      if(result?.output)result.output=result.output.replaceAll(root,'<project>');
      return result;
    }
    const unityEditorTool=job.name.startsWith('unity_')&&['unity_open_scene','unity_find_gameobjects','unity_get_component','unity_set_component','unity_create_gameobject','unity_save_scene'].includes(job.name);
    if(unityEditorTool){
      const write=['unity_set_component','unity_create_gameobject','unity_save_scene'].includes(job.name);
      if(!await approval(`학교 AI가 연결된 Unity Editor에서 ${job.name}을 실행하려 합니다.${write?' 씬이나 오브젝트가 변경될 수 있습니다.':''}`,{write}))throw Error('사용자가 거절했습니다.');
      await ensureActive();return unityEditor.call(job.name,args);
    }
    if(job.name==='read_skill'){
      if(!await approval(`학교 AI가 프로젝트 Skill ${args.name}을 읽으려 합니다. .school-code/skills 안의 지침이 학교 AI로 전달됩니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();return skills.readSkill(root,args.name);
    }
    if(!['list_files','read_file','search_text','read_asset_metadata','read_instructions','propose_edit'].includes(job.name))throw Error('지원하지 않는 도구');
    if(job.name!=='propose_edit'){
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트에 ${job.name}을 요청했습니다.\n경로: ${args.path||'/'}${args.query?'\n검색어: '+args.query:''}\n결과는 등록한 중계 서버를 통해 학교 AI로 전달됩니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();
      if(job.name==='list_files')return workspace.listFiles(root,args.path||'',Math.min(500,args.limit||200));
      if(job.name==='read_file')return workspace.readLines(root,args);
      if(job.name==='search_text')return workspace.search(root,args);
      if(job.name==='read_asset_metadata')return workspace.readAssetMetadata(root,args.path);
      return workspace.readInstructions(root);
    }
    if(typeof args.content!=='string'||args.content.length>200000)throw Error('파일 내용은 200,000자 이하여야 합니다.');
    const target=await workspace.safePath(root,args.path,{create:true});let before=null;
    let exists=true;try{await fs.lstat(target);}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}if(exists)before=await workspace.readText(root,args.path);
    if(before&&args.expected_sha256!==before.hash)throw Error('read_file의 최신 sha256을 expected_sha256에 지정하세요.');
    const open=vscode.workspace.textDocuments.find(d=>d.uri.fsPath===target);if(open?.isDirty)throw Error('저장되지 않은 편집이 있습니다. 먼저 저장하세요.');
    const id=randomUUID(),left=vscode.Uri.parse(`school-code-preview:/${id}/before/${encodeURIComponent(args.path)}`),right=vscode.Uri.parse(`school-code-preview:/${id}/after/${encodeURIComponent(args.path)}`);
    previews.set(left.toString(),before?.text||'');previews.set(right.toString(),args.content);
    try{
      await vscode.commands.executeCommand('vscode.diff',left,right,`학교 AI 수정안: ${args.path}`);
      if(!await approval(`diff를 확인한 뒤 ${args.path} ${before?'수정':'생성'}을 승인하세요.`,{write:true}))throw Error('사용자가 수정을 거절했습니다.');
      await ensureActive();
      await workspace.safePath(root,args.path,{create:!before});
      if(before){const latest=await workspace.readText(root,args.path);if(latest.hash!==before.hash)throw Error('검토 중 파일이 변경되었습니다.');}
      if(vscode.workspace.textDocuments.find(d=>d.uri.fsPath===target)?.isDirty)throw Error('검토 중 편집기가 변경되었습니다.');
      await ensureActive();
      const edit=new vscode.WorkspaceEdit(),uri=vscode.Uri.file(target);
      if(!before)edit.createFile(uri,{overwrite:false});
      const doc=before?await vscode.workspace.openTextDocument(uri):null;
      edit.replace(uri,doc?new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)):new vscode.Range(0,0,0,0),args.content);
      if(!await vscode.workspace.applyEdit(edit))throw Error('수정 적용 실패');
      const changed=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(changed);if(!await changed.save())throw Error('편집기에 적용했으나 저장 실패');
      return {applied:true,path:args.path,sha256:workspace.sha(Buffer.from(args.content))};
    }finally{previews.delete(left.toString());previews.delete(right.toString());}
  }
  async function disconnectRelay(){relayController?.abort();relayController=null;relayRoot=null;relayConnected=false;if(relaySession){const {url,headers}=relaySession;relaySession=null;fetch(url+'/worker/disconnect',{method:'POST',headers,signal:AbortSignal.timeout(3000)}).catch(()=>{});}snapshot();}
  async function connectRelay(){
    if(relayController)return vscode.window.showInformationMessage('이미 연결 중입니다. 먼저 외부 MCP 연결을 해제하세요.');
    if(!vscode.workspace.isTrusted)throw Error('신뢰된 작업 영역이 필요합니다.');
    const project=await projectContext.ensure();snapshot();
    const raw=await vscode.window.showInputBox({title:'MCP 중계 서버 주소',value:vscode.workspace.getConfiguration('schoolCode').get('relayUrl',''),prompt:'HTTPS 주소 또는 로컬 테스트용 http://127.0.0.1:18880'});if(!raw)return;
    const u=new URL(raw);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('HTTPS 서버 기본 주소를 입력하세요.');const url=u.origin;
    const key='relay:'+url;let token=await context.secrets.get(key);
    token=await vscode.window.showInputBox({title:'중계 서버 WORKER_TOKEN',password:true,value:token||'',ignoreFocusOut:true});if(!token)return;if(token.length<32)throw Error('32자 이상 토큰이 필요합니다.');
    if(!await approval(`${project.name}을 ${url}에 연결합니다. 학교 AI가 파일 도구를 요청할 수 있으며, 읽기/검색/수정은 건별로 승인합니다.`))return;
    if(projectContext.project!==project)throw Error('프로젝트가 변경되었습니다. MCP를 다시 연결하세요.');
    await context.secrets.store(key,token);relayRoot=project.path;const ctl=relayController=new AbortController();const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Worker-Id':randomUUID()};relaySession={url,headers};
    const call=async(route,body,timeout=30000)=>{const r=await fetch(url+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(timeout)])});if(!r.ok)throw Error(`중계 HTTP ${r.status}`);return r.json();};
    let heartbeatBusy=false;const heartbeat=setInterval(async()=>{if(heartbeatBusy||ctl.signal.aborted)return;heartbeatBusy=true;try{await call('/worker/heartbeat');relayConnected=true;}catch{relayConnected=false;}finally{heartbeatBusy=false;snapshot();}},10000);
    (async()=>{try{await call('/worker/heartbeat');relayConnected=true;snapshot();while(!ctl.signal.aborted){try{const job=await call('/worker/poll');relayConnected=true;snapshot();if(!job.id)continue;let result,error;
      const deadline=Math.min(Date.now()+115000,Number(job.expiresAt)||0);let active=true;const check=()=>active&&!ctl.signal.aborted&&Date.now()<deadline;
      const ensureActive=async()=>{if(!check())throw Error('요청 만료 — 변경하지 않았습니다.');const remote=await call('/worker/status',{id:job.id});if(!remote.active||!check())throw Error('중계 요청 만료');};
      const expiry=setTimeout(()=>active=false,Math.max(0,deadline-Date.now()));
      try{result=await executeTool(job,check,ensureActive);if(!check())throw Error('요청 만료');}catch(e){error=e.message;}finally{clearTimeout(expiry);}
      await call('/worker/result',{id:job.id,result,error}).catch(e=>output.appendLine(e.message));
    }catch(e){relayConnected=false;snapshot();if(ctl.signal.aborted)break;output.appendLine(e.message);await new Promise(resolve=>{const onAbort=()=>{clearTimeout(t);resolve();};const t=setTimeout(()=>{ctl.signal.removeEventListener('abort',onAbort);resolve();},3000);ctl.signal.addEventListener('abort',onAbort,{once:true});});}}}catch(e){if(!ctl.signal.aborted){output.appendLine(e.message);post({type:'notice',text:e.message});}}finally{clearInterval(heartbeat);if(relayController===ctl){relayController=null;relayConnected=false;snapshot();}}})();
  }
  async function handle(m){try{
    if(m.type==='ready'){snapshot();return;}
    if(['projectChoose','attachFiles','attachFolder','attachmentPreview','attachmentRemove','attachmentsClear'].includes(m.type))return await projectAction(m.type,m.path);
    if(m.type==='connect')return await connectBrowser();
    if(m.type==='connectorFolder')return await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.joinPath(context.extensionUri,'chrome-extension','manifest.json'));
    if(m.type==='refresh')return await refresh();
    if(m.type==='send')return await send(m);
    if(m.type==='choices'&&!controller){state.model=String(m.model||'');state.agent=String(m.agent||'');state.mode=['default','fast','deep','direct'].includes(m.mode)?m.mode:'default';state.approvalMode=['ask','read','full'].includes(m.approvalMode)?m.approvalMode:'ask';await save();snapshot();return;}
    if(m.type==='stop'){controller?.abort();return;}
    if((m.type==='new'||m.type==='sessionNew')&&!controller){state=sessionStore.create();await sessionStore.save();snapshot();return;}
    if(m.type==='sessionSelect'&&!controller){await save();state=sessionStore.select(String(m.id||''));await sessionStore.save();snapshot();return;}
    if(m.type==='sessionRename'&&!controller){const title=m.title||await vscode.window.showInputBox({title:'대화 이름 변경',value:state.title,prompt:'대화 이름을 입력하세요.'});if(title){sessionStore.rename(state.id,title);await sessionStore.save();snapshot();}return;}
    if(m.type==='sessionDelete'&&!controller){const id=String(m.id||state.id);if(await vscode.window.showWarningMessage('이 대화와 저장된 메시지를 삭제할까요?',{modal:true},'삭제')!=='삭제')return;sessionStore.remove(id);await sessionStore.save();state=sessionStore.active;snapshot();return;}
    if(m.type==='selection'){
      const editor=vscode.window.activeTextEditor;if(!editor||editor.selection.isEmpty)throw Error('편집기에서 코드를 선택하세요.');const text=editor.document.getText(editor.selection);if(text.length>40000)throw Error('선택 코드는 40,000자 이하여야 합니다.');post({type:'selection',text:`\n\n파일: ${vscode.workspace.asRelativePath(editor.document.uri)}\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``});return;
    }
    if(m.type==='relay')return await connectRelay();
    if(m.type==='disconnectRelay')return await disconnectRelay();
  }catch(e){post({type:'notice',text:e.message});vscode.window.showErrorMessage('School Code: '+e.message);}}
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('schoolCode.chat',{resolveWebviewView(v){view=v;v.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};const nonce=randomBytes(16).toString('hex');v.webview.html=panelHtml(v.webview,context.extensionUri,nonce);v.webview.onDidReceiveMessage(handle,undefined,context.subscriptions);v.onDidDispose(()=>{view=null;});}},{webviewOptions:{retainContextWhenHidden:true}}));
  for(const [command,fn]of Object.entries({'schoolCode.open':()=>vscode.commands.executeCommand('schoolCode.chat.focus'),'schoolCode.connect':connectBrowser,'schoolCode.relay':connectRelay,'schoolCode.disconnectRelay':disconnectRelay,'schoolCode.notionConfigure':configureNotion,'schoolCode.notionDisconnect':disconnectNotion,'schoolCode.unityConfigure':configureUnity,'schoolCode.unityEditorConfigure':configureUnityEditor}))context.subscriptions.push(vscode.commands.registerCommand(command,()=>Promise.resolve(fn()).catch(e=>vscode.window.showErrorMessage(e.message))));
  const timer=setInterval(()=>post({type:'connection',connected:bridge.connected,relay:relayConnected,error:bridgeError}),3000);context.subscriptions.push({dispose(){clearInterval(timer);controller?.abort();disconnectRelay();}});
}
module.exports={activate};
