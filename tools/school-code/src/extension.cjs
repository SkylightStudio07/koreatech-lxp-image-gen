const vscode=require('vscode');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {createHash,randomBytes,randomUUID}=require('node:crypto');
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
const {runShell,TaskManager}=require('./harness.cjs');
const {compactMessages,estimateMessages,threshold:compactThreshold}=require('./compaction.cjs');
const {McpRegistry}=require('./mcp-registry.cjs');
const DEFAULT_RELAY_URL='https://bcsd-nai.mywire.org:3010';
const STARTER_INSTRUCTIONS=`# Project Instructions

This file was created automatically when School Code connected this project.

- Inspect the project structure and existing documentation before making changes.
- Prefer small, reviewable changes and explain what was changed and how it was checked.
- Use the project's existing scripts, conventions, and dependencies where possible.
- Ask before destructive, broad, or irreversible operations.
- Keep secrets, credentials, generated output, and unrelated files out of changes.
- For Unity projects, preserve the project's Unity version and validate changes with the configured Unity tools.
`;

function activate(context){
  const output=vscode.window.createOutputChannel('School Code');context.subscriptions.push(output);
  const port=vscode.workspace.getConfiguration('schoolCode').get('bridgePort',18766);
  const bridge=new BrowserBridge(port);let bridgeError='';const ready=bridge.start().catch(e=>{bridgeError=e.code==='EADDRINUSE'?'브리지 포트가 사용 중입니다. 다른 VS Code 창을 닫거나 bridgePort를 변경하세요.':e.message;output.appendLine(bridgeError);});context.subscriptions.push({dispose:()=>bridge.dispose()});
  let view,models=[],agents=[],controller,relayController,relayRoot,relaySession,relayConnected=false,relayError='',relayPending=false,relayPairCode='',relayPairPromise=null,relayPairAbort=null,relayConnectPromise=null,browserConnectBusy=false,unityEditorConnected=false,projectBusy=false;
  const imagePreviews=new Map(),imageLoads=new Map(),imageCache=new Map();
  const uploadCache=new Map(),uploadControllers=new Map();
  const MAX_UPLOADS=5,MAX_UPLOAD_BYTES=32*1024*1024,MAX_UPLOAD_BASE64=45*1024*1024;
  const projectContext=new ProjectContext(vscode,context.workspaceState);
  const sessionStore=new SessionStore(context.workspaceState);let state=sessionStore.active;
  const mcpRegistry=new McpRegistry(context.workspaceState);
  const notion=new NotionClient({getToken:()=>context.secrets.get('schoolCode.notion.integrationToken'),getPublicLinks:()=>context.globalState?.get?.('schoolCode.notion.publicLinks',[])||[]});
  async function unityEditorPort(){
    const project=projectContext.project?.path||vscode.workspace.workspaceFolders?.find(f=>f.uri.scheme==='file')?.uri.fsPath;
    if(project){
      const normalized=path.resolve(project).replace(/\\/g,'/').toLowerCase();
      const digest=createHash('sha256').update(normalized).digest('hex');
      try{
        const value=(await fs.readFile(path.join(os.homedir(),'.school-code','unity-editor-ports',`${digest}.port`),'utf8')).trim();
        const port=Number(value);if(Number.isInteger(port)&&port>=1024&&port<=65535)return port;
      }catch{/* Unity may not have started or written its project port yet. */}
    }
    return vscode.workspace.getConfiguration('schoolCode').get('unityEditorPort',18777);
  }
  const unityEditor=new UnityEditorClient({getToken:()=>context.secrets.get('schoolCode.unity.editorToken'),getPort:unityEditorPort});
  const taskManager=new TaskManager();
  const post=m=>view?.webview.postMessage(m);
  const save=async()=>{sessionStore.update(state);await sessionStore.save();};
  function unityExecutable(){
    const saved=context.globalState?.get?.('schoolCode.unityExecutable');
    if(typeof saved==='string'&&saved.trim())return saved.trim();
    return vscode.workspace.getConfiguration('schoolCode').get('unityExecutable','Unity.exe')||'Unity.exe';
  }
  function unityPathConfigured(){
    const saved=context.globalState?.get?.('schoolCode.unityExecutable');
    if(typeof saved==='string'&&saved.trim())return true;
    const value=vscode.workspace.getConfiguration('schoolCode').get('unityExecutable','');
    return !!value&&value!=='Unity.exe';
  }
  function mcpSnapshot(){
    const notionConfigured=!!mcpRegistry.get('notion');
    const unityEditorConfigured=!!mcpRegistry.get('unity-editor');
    return mcpRegistry.list().map(item=>{
      let configured=item.configured,status=item.configured?'configured':'not-configured';
      if(item.id==='school-workspace'){configured=configured||relayConnected||relayPending;status=relayConnected?'connected':relayPending?'pending':relayError?'error':configured?'configured':'not-connected';}
      if(item.id==='notion'){configured=notionConfigured;status=configured?'configured':'not-configured';}
      if(item.id==='unity-cli'){configured=unityPathConfigured()||!!mcpRegistry.get('unity-cli');status=configured?'configured':'not-configured';}
      if(item.id==='unity-editor'){configured=unityEditorConfigured;status=unityEditorConnected?'connected':configured?'configured':'not-configured';}
      return {...item,configured,status,error:item.id==='school-workspace'?relayError:''};
    });
  }
  function snapshot(){post({type:'state',state,models,agents,sessions:sessionStore.summaries(),activeSessionId:sessionStore.activeId,connected:bridge.connected,error:bridgeError,relay:relayConnected,relayPending,relayPairCode,relayError,relayBusy:!!relayConnectPromise||!!relayPairPromise||relayPending,browserBusy:browserConnectBusy,busy:!!controller,projectBusy,mcpCatalog:mcpSnapshot(),projectContext:projectContext.info()});}
  function cleanAttachments(value){
    const list=Array.isArray(value)?value:[];
    return list.map(a=>{
      if(!a||typeof a!=='object'||!/^[a-zA-Z0-9-]{1,200}$/.test(String(a.file_id||'')))return null;
      const item={file_id:String(a.file_id)};
      if(typeof a.filename==='string'&&a.filename.trim())item.filename=a.filename.trim().slice(0,240);
      if(typeof a.file_type==='string')item.file_type=a.file_type.slice(0,80);
      if(Number.isFinite(a.file_size)&&a.file_size>=0)item.file_size=a.file_size;
      return item;
    }).filter(Boolean);
  }
  function uploadSize(base64){
    const padding=base64.endsWith('==')?2:base64.endsWith('=')?1:0;
    return Math.floor(base64.length*3/4)-padding;
  }
  function safeUploadName(value){
    const name=String(value||'upload.bin').replace(/[\\/\u0000-\u001f]/g,'_').trim().slice(0,240);
    return name||'upload.bin';
  }
  function uploadType(filename,mime){
    const normalized=String(mime||'').toLowerCase();
    if(normalized.startsWith('image/'))return 'image';
    const ext=String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if(['png','jpg','jpeg','webp','gif','svg','avif','bmp','ico','tif','tiff'].includes(ext))return 'image';
    return normalized.slice(0,80)||'file';
  }
  async function uploadReference(data){
    const clientId=String(data.clientId||'');if(!/^[a-zA-Z0-9_-]{1,120}$/.test(clientId))throw Error('첨부 파일 식별자가 올바르지 않습니다.');
    if(uploadControllers.has(clientId))return;
    const base64=String(data.base64||'');if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||base64.length>MAX_UPLOAD_BASE64)throw Error('첨부 파일 데이터가 올바르지 않습니다.');
    const size=uploadSize(base64);if(size<=0||size>MAX_UPLOAD_BYTES)throw Error('첨부 파일은 32 MiB 이하만 지원합니다.');
    if(uploadCache.size>=20)uploadCache.delete(uploadCache.keys().next().value);
    const filename=safeUploadName(data.filename),mime=String(data.mime||'application/octet-stream').slice(0,120)||'application/octet-stream';
    const controller=new AbortController();uploadControllers.set(clientId,controller);post({type:'uploadStarted',clientId});
    try{
      if(!bridge.connected)throw Error('학교 브라우저 연결을 먼저 확인하세요.');
      const result=await bridge.request('/chat/upload',{method:'POST',body:{filename,mime,base64},upload:true,signal:controller.signal});
      const raw=result?.file||result?.data||result;
      const fileId=String(raw?.file_id||'');if(!/^[a-zA-Z0-9-]{1,200}$/.test(fileId))throw Error('학교 업로드 응답에 파일 ID가 없습니다.');
      const returnedSize=Number(raw?.file_size);if(Number.isFinite(returnedSize)&&(returnedSize<0||returnedSize>MAX_UPLOAD_BYTES))throw Error('학교 업로드 파일 크기가 제한을 초과했습니다.');
      const attachment={file_id:fileId,filename:safeUploadName(raw?.filename||filename),file_type:String(raw?.file_type||uploadType(filename,mime)).slice(0,80),file_size:Number.isFinite(returnedSize)&&returnedSize>0?Math.floor(returnedSize):size};
      uploadCache.set(fileId,attachment);while(uploadCache.size>20)uploadCache.delete(uploadCache.keys().next().value);
      post({type:'uploadAdded',clientId,attachment});
    }catch(e){post({type:'uploadFailed',clientId,error:String(e.message||'파일 업로드에 실패했습니다.').slice(0,240)});throw e;}
    finally{uploadControllers.delete(clientId);}
  }
  function removeUpload(data){
    const clientId=String(data.clientId||'');if(uploadControllers.has(clientId))uploadControllers.get(clientId).abort();
    const fileId=String(data.file_id||'');if(fileId)uploadCache.delete(fileId);post({type:'uploadRemoved',clientId,file_id:fileId});
  }
  function isImageAttachment(a){
    const type=String(a.file_type||'').toLowerCase(),name=String(a.filename||'').toLowerCase();
    return type==='image'||type.startsWith('image/')||/\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|tiff?)$/.test(name);
  }
  function previewMime(a,result){
    const fromResponse=String(result?.contentType||'').split(';',1)[0].toLowerCase();
    const allowed=/^image\/(png|jpe?g|webp|gif|svg\+xml|avif|bmp|x-icon|tiff)$/.test(fromResponse);
    if(allowed)return fromResponse==='image/jpg'?'image/jpeg':fromResponse;
    const ext=String(a.filename||'').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',tif:'image/tiff',tiff:'image/tiff'})[ext]||null;
  }
  function postImagePreviews(){post({type:'attachmentPreviews',previews:[...imagePreviews.values()]});}
  async function loadImageAttachment(input){
    const a=cleanAttachments([input])[0];if(!a||!isImageAttachment(a))return null;
    if(imagePreviews.has(a.file_id))return imagePreviews.get(a.file_id);
    if(imageLoads.has(a.file_id))return imageLoads.get(a.file_id);
    const task=(async()=>{
      const result=await bridge.request(`/chat/uploads/${encodeURIComponent(a.file_id)}`,{binary:true});
      const base64=String(result?.base64||'');
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||base64.length>45*1024*1024)throw Error('이미지 미리보기 응답이 올바르지 않습니다.');
      const size=Number(result?.size)||Math.floor(base64.length*3/4);
      if(size<=0||size>32*1024*1024)throw Error('이미지 미리보기 크기가 제한을 초과했습니다.');
      const mime=previewMime(a,result);if(!mime)throw Error('지원하지 않는 이미지 형식입니다.');
      const preview={file_id:a.file_id,filename:a.filename||`image-${a.file_id}`,mime,dataUrl:`data:${mime};base64,${base64}`,size};
      imagePreviews.set(a.file_id,preview);while(imagePreviews.size>20)imagePreviews.delete(imagePreviews.keys().next().value);return preview;
    })();
    imageLoads.set(a.file_id,task);try{return await task;}finally{imageLoads.delete(a.file_id);}
  }
  async function preloadAttachments(value){
    const list=cleanAttachments(value).filter(isImageAttachment);if(!list.length)return;
    await Promise.allSettled(list.map(loadImageAttachment));postImagePreviews();
  }
  async function hydrateAttachments(session){
    const found=new Map();for(const message of session?.messages||[])for(const a of cleanAttachments(message.attachments).filter(isImageAttachment))found.set(a.file_id,a);
    await preloadAttachments([...found.values()].slice(-20));
  }
  async function connectBrowser(){
    if(browserConnectBusy){post({type:'notice',text:'브라우저 연결을 이미 여는 중입니다. 같은 버튼을 다시 누르지 않아도 됩니다.'});return;}
    browserConnectBusy=true;snapshot();
    try{await ready;if(bridgeError)throw Error(bridgeError);await vscode.env.openExternal(vscode.Uri.parse('https://ai.koreatech.ac.kr/AiCA/chat'));vscode.window.showInformationMessage('School Code Connector가 설치되어 있으면 자동 연결됩니다. 최초 설치: 확장 폴더 열기 → Chrome 확장 프로그램에서 압축해제된 확장 로드.');}
    finally{setTimeout(()=>{browserConnectBusy=false;snapshot();},2000);}
  }
  async function configureNotion(){
    const existing=await context.secrets.get('schoolCode.notion.integrationToken');
    const existingLinks=context.globalState?.get?.('schoolCode.notion.publicLinks',[])||[];
    const current=existing||existingLinks[0]||'';
    const value=await vscode.window.showInputBox({title:'Notion 읽기 전용 연결',prompt:'Notion Integration Secret 또는 공개 페이지 링크를 입력하세요. 공개 링크는 쉼표로 여러 개 등록할 수 있습니다.',password:true,ignoreFocusOut:true,value:current});
    if(!value)return;
    const input=value.trim();
    if(/^https?:\/\//i.test(input)){
      const links=input.split(/[\s,;]+/).filter(Boolean);if(!links.length)throw Error('공개 Notion 링크가 필요합니다.');
      const normalized=[];for(const link of links)normalized.push(await notion.validatePublicLink(link));
      await context.globalState?.update?.('schoolCode.notion.publicLinks',[...new Set(normalized)]);
      mcpRegistry.upsert({id:'notion',catalogId:'notion',name:'Notion',description:'등록한 공개 Notion 페이지를 검색·읽기 전용으로 가져옵니다.',kind:'integration',enabled:true,capabilities:['search','read']});await mcpRegistry.save();vscode.window.showInformationMessage(`Notion 공개 링크 ${normalized.length}개가 연결되었습니다.`);snapshot();return;
    }
    if(input.length<20)throw Error('Notion 토큰이 너무 짧습니다.');
    const previous=existing;await context.secrets.store('schoolCode.notion.integrationToken',input);
    try{await notion.request('/users/me');mcpRegistry.upsert({id:'notion',catalogId:'notion',name:'Notion',description:'공유한 Notion 페이지를 읽기 전용으로 검색합니다.',kind:'integration',enabled:true,capabilities:['search','read']});await mcpRegistry.save();vscode.window.showInformationMessage('Notion Integration 연결이 설정되었습니다.');snapshot();}
    catch(e){if(previous)await context.secrets.store('schoolCode.notion.integrationToken',previous);else await context.secrets.delete('schoolCode.notion.integrationToken');throw e;}
  }
  async function disconnectNotion(){await context.secrets.delete('schoolCode.notion.integrationToken');await context.globalState?.update?.('schoolCode.notion.publicLinks',[]);mcpRegistry.remove('notion');await mcpRegistry.save();vscode.window.showInformationMessage('Notion 연결 정보와 공개 링크를 삭제했습니다.');snapshot();}
  async function configureUnity(){
    const current=unityExecutable();
    const executable=await vscode.window.showInputBox({title:'Unity 실행 파일 경로',prompt:'Unity.exe 경로 또는 PATH에 등록된 Unity.exe를 입력하세요. 셸 도구는 별도 승인 후 프로젝트 안에서만 실행됩니다.',value:current||'Unity.exe',ignoreFocusOut:true});
    if(!executable)return;
    await context.globalState?.update?.('schoolCode.unityExecutable',executable.trim());mcpRegistry.upsert({id:'unity-cli',catalogId:'unity-cli',name:'Unity CLI',description:'연결된 Unity 프로젝트에서 테스트·빌드를 실행합니다.',kind:'local',enabled:true,capabilities:['unity','build']});await mcpRegistry.save();snapshot();
    vscode.window.showInformationMessage('Unity CLI 경로를 저장했습니다.');
  }
  async function writeUnityEditorToken(token){
    const directory=path.join(os.homedir(),'.school-code');
    await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'unity-editor-token'),token,{encoding:'utf8',mode:0o600});
  }
  async function installUnityEditorBridge(project){
    const info=await unity.projectInfo(project.path);
    if(!info.is_unity_project)throw Error('연결된 프로젝트가 Unity 프로젝트가 아닙니다. ProjectSettings/ProjectVersion.txt와 Assets 폴더를 확인하세요.');
    const source=vscode.Uri.joinPath(context.extensionUri,'unity-editor','SchoolCodeMcpBridge.cs').fsPath;
    const target=path.join(project.path,'Assets','Editor','SchoolCodeMcpBridge.cs');
    const bundled=await fs.readFile(source,'utf8');
    let existing='';try{existing=await fs.readFile(target,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(existing&&existing!==bundled&&await vscode.window.showWarningMessage('기존 SchoolCodeMcpBridge.cs를 확장에 포함된 최신 브리지로 바꿀까요?',{modal:true},'교체')!=='교체')throw Error('Unity Editor 브리지 설치를 취소했습니다.');
    await fs.mkdir(path.dirname(target),{recursive:true});
    // Touch the file even when the contents are current so an already open
    // Editor reloads the bridge and picks up a newly provisioned token.
    await fs.writeFile(target,bundled,'utf8');
    return target;
  }
  async function launchUnityEditor(project){
    const executable=unityExecutable();
    await new Promise((resolve,reject)=>{
      let settled=false;
      const child=spawn(executable,['-projectPath',project.path],{cwd:project.path,detached:true,stdio:'ignore',windowsHide:true});
      child.once('spawn',()=>{if(settled)return;settled=true;child.unref();resolve();});
      child.once('error',error=>{if(settled)return;settled=true;reject(error);});
    });
  }
  async function waitForUnityEditor(timeoutMs=45000){
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      try{await unityEditor.call('unity_find_gameobjects',{query:''});return true;}catch{}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    return false;
  }
  async function configureUnityEditor(){
    const project=await projectContext.ensure();
    if(!await approval(`${project.name}의 Assets/Editor에 School Code 브리지를 설치하고 Unity Editor를 실행할까요? 브리지 파일은 프로젝트에 추가되고 로컬 토큰은 VS Code SecretStorage와 사용자 폴더에 저장됩니다.`,{write:true}))return;
    await installUnityEditorBridge(project);
    const key='schoolCode.unity.editorToken';
    let token=await context.secrets.get(key);
    if(!token){token=randomUUID().replaceAll('-','');await context.secrets.store(key,token);}
    await writeUnityEditorToken(token);
    let launched=false;
    try{await unityEditor.call('unity_find_gameobjects',{query:''});unityEditorConnected=true;}
    catch{
      try{await launchUnityEditor(project);launched=true;}catch(e){output.appendLine(`Unity Editor 실행 실패: ${e.message}`);}
      unityEditorConnected=await waitForUnityEditor();
    }
    mcpRegistry.upsert({id:'unity-editor',catalogId:'unity-editor',name:'Unity Editor MCP',description:'실행 중인 Unity Editor의 씬과 게임 오브젝트를 제어합니다.',kind:'local-mcp',enabled:true,capabilities:['unity','scene']});await mcpRegistry.save();snapshot();
    if(unityEditorConnected)vscode.window.showInformationMessage('Unity Editor MCP 자동 연결이 완료되었습니다.');
    else if(launched)vscode.window.showInformationMessage('Unity Editor를 실행했습니다. Unity 로그인과 프로젝트 로딩이 끝나면 MCP 카탈로그의 Unity Editor MCP를 다시 눌러 연결을 확인하세요.');
    else vscode.window.showWarningMessage('브리지는 설치했지만 Unity Editor가 아직 응답하지 않습니다. Unity 로그인 후 프로젝트를 열고 다시 연결하세요.');
  }
  function safeRemoteUrl(raw){
    let u;try{u=new URL(String(raw||''));}catch{throw Error('MCP 주소가 올바른 URL이 아닙니다.');}
    const local=u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);
    if(u.protocol!=='https:'&&!local)throw Error('원격 MCP는 HTTPS 주소를 사용하세요. 로컬 테스트만 localhost HTTP를 허용합니다.');
    if(u.username||u.password||u.search||u.hash)throw Error('MCP 주소에 사용자명·비밀번호·쿼리·해시를 넣을 수 없습니다.');
    return u.origin+(u.pathname==='/'?'':u.pathname.replace(/\/$/,''));
  }
  async function configureRemoteMcp(id,seed={}){
    const item=McpRegistry.catalogItem(id)||seed;
    const current=mcpRegistry.get(id);
    const raw=await vscode.window.showInputBox({title:`${item.name||'MCP'} 주소`,prompt:item.auth==='oauth-or-bearer'?'Figma 공식 MCP는 이 주소를 사용합니다. OAuth를 지원하는 학교 MCP 등록 화면에서 인증하세요.':'MCP 서버의 HTTPS 주소를 입력하세요. 예: https://example.com/mcp',value:current?.url||item.defaultUrl||'',ignoreFocusOut:true});
    if(!raw)return;
    const url=safeRemoteUrl(raw);
    const secretKey=`schoolCode.mcp.token.${id}`;
    const previous=await context.secrets.get(secretKey);
    const token=await vscode.window.showInputBox({title:`${item.name||'MCP'} 토큰`,prompt:item.auth==='oauth-or-bearer'?'Bearer 토큰 방식의 서버라면 입력하세요. Figma OAuth를 사용할 때는 비워 두고 학교 MCP 등록 화면에서 로그인합니다. 토큰은 VS Code SecretStorage에만 저장됩니다.':'Bearer 토큰이 있다면 입력하세요. 토큰은 VS Code SecretStorage에만 저장됩니다. 토큰 없이 공개 서버를 사용할 수도 있습니다.',password:true,value:previous||'',ignoreFocusOut:true});
    if(token===undefined)return;
    if(token.trim()&&token.trim().length<16)throw Error('MCP 토큰은 16자 이상이어야 합니다.');
    if(token.trim())await context.secrets.store(secretKey,token.trim());else await context.secrets.delete(secretKey);
    mcpRegistry.upsert({...item,...seed,id,catalogId:item.catalogId||item.id||id,url,enabled:true});await mcpRegistry.save();
    vscode.window.showInformationMessage(`${item.name||'MCP'} 연결 정보를 저장했습니다. 학교 에이전트에서 이 MCP를 사용하려면 학교 MCP 카탈로그에서도 활성화하세요.`);snapshot();
  }
  async function configureMcp(id){
    const item=McpRegistry.catalogItem(id)||mcpRegistry.get(id);
    if(!item)throw Error('MCP 카탈로그 항목을 찾을 수 없습니다.');
    if(id==='school-workspace')return connectRelay();
    if(id==='notion')return configureNotion();
    if(id==='unity-cli')return configureUnity();
    if(id==='unity-editor')return configureUnityEditor();
    return configureRemoteMcp(id,item);
  }
  async function chooseMcp(){
    const entries=[...mcpRegistry.list().map(item=>({label:`${item.configured?'✓ ':'○ '}${item.name}`,description:item.description,detail:item.status, id:item.id})),{label:'＋ 사용자 지정 MCP 추가',description:'카탈로그에 없는 HTTPS MCP 서버를 추가합니다.',id:'custom'}];
    const picked=await vscode.window.showQuickPick(entries,{title:'MCP 카탈로그',placeHolder:'연결하거나 관리할 MCP를 선택하세요.',ignoreFocusOut:true});
    if(!picked)return;
    if(picked.id==='custom'){
      const name=await vscode.window.showInputBox({title:'사용자 지정 MCP 이름',value:'사용자 지정 MCP',ignoreFocusOut:true});if(!name)return;
      return configureRemoteMcp(`custom-${randomUUID().slice(0,8)}`,{id:'custom',name,description:'사용자가 추가한 MCP 서버',kind:'remote-mcp',capabilities:[]});
    }
    return configureMcp(picked.id);
  }
  async function openMcpCatalogSite(){
    const config=vscode.workspace.getConfiguration('schoolCode');
    let raw=config.get('mcpCatalogUrl','');
    if(!raw){
      raw=await vscode.window.showInputBox({title:'MCP 카탈로그 사이트',prompt:'원클릭 MCP 설치를 제공하는 HTTPS 사이트 주소를 입력하세요. 주소는 설정에 저장됩니다.',placeHolder:'https://example.com/mcp/catalog',ignoreFocusOut:true});
      if(!raw)return;
      const normalized=safeRemoteUrl(raw);if(typeof config.update==='function')await config.update('mcpCatalogUrl',normalized,vscode.ConfigurationTarget?.Global??true);raw=normalized;
    } else raw=safeRemoteUrl(raw);
    await vscode.env.openExternal(vscode.Uri.parse(raw));
  }
  async function toggleMcp(id,enabled){mcpRegistry.setEnabled(id,enabled);await mcpRegistry.save();snapshot();}
  async function removeMcp(id){
    const item=mcpRegistry.get(id);if(!item)return;
    if(item.catalogId==='school-workspace')return disconnectRelay();
    if(item.catalogId==='notion')return disconnectNotion();
    if(item.catalogId==='unity-editor'){await context.secrets.delete('schoolCode.unity.editorToken');unityEditorConnected=false;mcpRegistry.remove(item.id);await mcpRegistry.save();snapshot();return;}
    if(item.catalogId==='unity-cli'){
      await context.globalState?.update?.('schoolCode.unityExecutable',undefined);
      mcpRegistry.remove(item.id);await mcpRegistry.save();snapshot();return;
    }
    if(await vscode.window.showWarningMessage(`${item.name} 연결 정보를 삭제할까요?`,{modal:true},'삭제')!=='삭제')return;
    await context.secrets.delete(`schoolCode.mcp.token.${item.id}`);mcpRegistry.remove(item.id);await mcpRegistry.save();snapshot();
  }
  async function hydrateMcpRegistry(){
    let changed=false;
    const notionLinks=context.globalState?.get?.('schoolCode.notion.publicLinks',[])||[];
    if((await context.secrets.get('schoolCode.notion.integrationToken')||notionLinks.length)&&!mcpRegistry.get('notion')){mcpRegistry.upsert({id:'notion',catalogId:'notion',name:'Notion',description:notionLinks.length?'등록한 공개 Notion 페이지를 검색·읽기 전용으로 가져옵니다.':'공유한 Notion 페이지를 읽기 전용으로 검색합니다.',kind:'integration',enabled:true,capabilities:['search','read']});changed=true;}
    if(await context.secrets.get('schoolCode.unity.editorToken')&&!mcpRegistry.get('unity-editor')){mcpRegistry.upsert({id:'unity-editor',catalogId:'unity-editor',name:'Unity Editor MCP',description:'실행 중인 Unity Editor의 씬과 게임 오브젝트를 제어합니다.',kind:'local-mcp',enabled:true,capabilities:['unity','scene']});changed=true;}
    if(unityPathConfigured()&&!mcpRegistry.get('unity-cli')){mcpRegistry.upsert({id:'unity-cli',catalogId:'unity-cli',name:'Unity CLI',description:'연결된 Unity 프로젝트에서 테스트·빌드를 실행합니다.',kind:'local',enabled:true,capabilities:['unity','build']});changed=true;}
    if(changed){await mcpRegistry.save();snapshot();}
  }
  function configuredRelayUrl(){
    const config=vscode.workspace.getConfiguration('schoolCode');
    return context.globalState?.get?.('schoolCode.relayUrl')||config.get('relayUrl',DEFAULT_RELAY_URL)||DEFAULT_RELAY_URL;
  }
  async function chooseRelayUrl(){
    const config=vscode.workspace.getConfiguration('schoolCode');
    const saved=configuredRelayUrl();
    if(typeof vscode.window.showQuickPick!=='function')return vscode.window.showInputBox({title:'MCP 중계 서버 주소',value:saved,prompt:'기본값은 bcsd-nai입니다. HTTPS 주소 또는 로컬 테스트용 http://127.0.0.1:18880'});
    const options=[{label:'bcsd-nai (기본 서버)',description:DEFAULT_RELAY_URL,value:DEFAULT_RELAY_URL}];
    if(saved&&saved!==DEFAULT_RELAY_URL)options.push({label:'현재 사용자 지정 서버',description:saved,value:saved});
    options.push({label:'사용자 지정 주소 입력…',description:'다른 HTTPS 서버 또는 로컬 테스트 주소',value:''});
    const selected=await vscode.window.showQuickPick(options,{title:'MCP 중계 서버 선택',placeHolder:'연결할 중계 서버를 선택하세요.',ignoreFocusOut:true});
    if(!selected)return null;
    if(selected.value)return selected.value;
    const custom=await vscode.window.showInputBox({title:'사용자 지정 MCP 중계 서버 주소',value:saved===DEFAULT_RELAY_URL?'':saved,prompt:'예: https://example.com:3010 또는 http://127.0.0.1:18880',ignoreFocusOut:true});
    if(!custom)return null;
    try{const normalized=new URL(custom).origin;await context.globalState?.update?.('schoolCode.relayUrl',normalized);try{if(typeof config.update==='function')await config.update('relayUrl',normalized,vscode.ConfigurationTarget?.Global??true);}catch{/* Older installations may not have the setting registered. */}return normalized;}catch{throw Error('사용자 지정 중계 주소가 올바르지 않습니다.');}
  }
  function normalizeAgent(agent){
    if(!agent||typeof agent!=='object')return null;
    const id=String(agent.id||agent.agent_id||'');if(!/^[\w-]{1,100}$/.test(id))return null;
    const workflow=agent.has_workflow===true||agent.is_workflow===true||agent.type==='workflow'||agent.kind==='workflow'||typeof agent.workflow_id==='string'||(agent.workflow&&typeof agent.workflow==='object');
    return {id,name:String(agent.name||agent.display_name||id).slice(0,200),description:typeof agent.description==='string'?agent.description.slice(0,500):'',has_workflow:workflow||agent.has_workflow===false};
  }
  function agentUsesWorkflow(agent){return agent?.has_workflow===true||agent?.is_workflow===true||agent?.type==='workflow'||agent?.kind==='workflow'||typeof agent.workflow_id==='string'||(agent.workflow&&typeof agent.workflow==='object');}
  async function resolveAgent(id){
    const current=agents.find(item=>item.id===id);if(!current)return null;
    if(current.has_workflow!==undefined)return current;
    try{const detail=normalizeAgent(await bridge.request(`/agents/${encodeURIComponent(id)}`));if(detail){const merged={...current,...detail};agents=agents.map(item=>item.id===id?merged:item);return merged;}}catch{/* Listing metadata is enough for the regular chat fallback. */}
    return current;
  }
  async function refresh(){await ready;if(bridgeError)throw Error(bridgeError);const r=await bridge.request('/models');models=r.items||[];snapshot();try{const own=await bridge.request('/agents?limit=50'),pub=await bridge.request('/agents/public?limit=50'),merged=new Map();for(const item of [...(own.items||[]),...(pub.items||[])]){const agent=normalizeAgent(item);if(!agent)continue;const previous=merged.get(agent.id);merged.set(agent.id,previous?{...previous,...agent,has_workflow:previous.has_workflow===true||agent.has_workflow===true?true:agent.has_workflow??previous.has_workflow}:agent);}agents=[...merged.values()];}catch{post({type:'notice',text:'모델을 불러왔습니다. 에이전트 목록 조회는 실패했습니다.'});}snapshot();}
  function workflowHistory(){
    const previous=state.messages.slice(0,Math.max(0,state.messages.length-2)).filter(item=>item.role==='user'||item.role==='assistant'&&item.text).slice(-10);
    if(!previous.length)return '';
    return previous.map(item=>`${item.role==='user'?'사용자':'학교 AI'}:\n${String(item.text||'').slice(-12000)}`).join('\n\n');
  }
  function goalPrompt(){
    if(!state.goal?.text||state.goal.status==='completed')return '';
    return `\n\n[현재 작업 목표]\n${state.goal.text}\n이 목표를 기준으로 현재 요청을 처리하고, 목표 달성에 필요한 다음 작업과 검증 결과를 함께 제시하세요.`;
  }
  async function setGoal(text){
    const clean=String(text||'').trim().slice(0,1000);
    if(!clean)throw Error('작업 목표를 입력하세요.');
    const now=Date.now();
    state.goal={text:clean,status:'active',createdAt:state.goal?.createdAt||now,updatedAt:now};
    await save();snapshot();post({type:'notice',text:`작업 목표를 설정했습니다: ${clean}`});
  }
  async function clearGoal(){
    state.goal=null;await save();snapshot();post({type:'notice',text:'작업 목표를 지웠습니다.'});
  }
  async function goalCommand(raw){
    const command=String(raw||'').replace(/^\/goal\b/i,'').trim();
    const lower=command.toLowerCase();
    if(lower==='status'||lower==='상태'){
      const text=state.goal?.text?(state.goal.status==='completed'?`완료된 목표: ${state.goal.text}`:`현재 목표: ${state.goal.text}`):'설정된 작업 목표가 없습니다.';
      post({type:'notice',text});post({type:'accepted'});return;
    }
    if(lower==='done'||lower==='완료'){
      if(!state.goal?.text)throw Error('완료 처리할 작업 목표가 없습니다.');
      state.goal={...state.goal,status:'completed',updatedAt:Date.now()};await save();snapshot();post({type:'notice',text:`작업 목표를 완료 처리했습니다: ${state.goal.text}`});post({type:'accepted'});return;
    }
    if(lower==='clear'||lower==='지우기'||lower==='삭제'){await clearGoal();post({type:'accepted'});return;}
    if(!command){
      const value=await vscode.window.showInputBox({title:'작업 목표 설정',prompt:'이번 작업에서 끝내고 싶은 결과를 입력하세요. (최대 1,000자)',value:state.goal?.text||'',ignoreFocusOut:true});
      if(value===undefined)return;await setGoal(value);post({type:'accepted'});return;
    }
    await setGoal(command);post({type:'accepted'});
  }
  function workflowEventText(event){
    if(!event||typeof event!=='object')return '';
    const read=value=>{
      if(typeof value==='string')return value;
      if(Array.isArray(value)){for(const item of value){const text=read(item);if(text)return text;}return '';}
      if(!value||typeof value!=='object')return '';
      for(const key of ['content','text','delta','delta_text','token','output','output_text','generated_text','final','final_output','final_text','final_answer','answer','response','message','result','result_text','value','parts','choices','body','data','raw']){const text=read(value[key]);if(text)return text;}
      return '';
    };
    for(const key of ['content','delta','delta_text','text','token','output','output_text','generated_text','final','final_output','final_text','final_answer','answer','response','message','result','result_text','value','parts','choices','body','data','raw']){const text=read(event[key]);if(text)return text;}
    return '';
  }
  function workflowNodeLabel(event){
    const value=event?.node_name||event?.node_id||event?.node||event?.step||event?.name||'';
    return typeof value==='string'&&value.trim()?value.trim().slice(0,120):'워크플로우 단계';
  }
  async function sendWorkflow(agent,composed,answer,compacted,summaryPrefix,attachments=[]){
    const history=workflowHistory();
    const inputText=history?`[이전 대화]\n${history}\n\n[현재 프로젝트와 요청]\n${composed}`:composed;
    const body={input_text:inputText,stream:true};
    if(attachments.length){body.file_ids=attachments.map(item=>item.file_id);body.file_attachments=attachments;}
    const steps=[];let done=false,lastNodeText='';
    const parser=new SSEParser(event=>{
      const type=String(event.type||'').toLowerCase();
      const eventKeys=Object.keys(event||{}).filter(key=>key!=='data').sort().join(',');
      output.appendLine(`[workflow] event=${type||'unknown'} keys=${eventKeys||'(none)'}`);
      if(event.conversation_id&&/^[\w-]{1,100}$/.test(String(event.conversation_id)))state.conversationId=String(event.conversation_id);
      if(type==='run_start'){answer.status='워크플로우 시작';steps.push({type,status:'워크플로우 시작'});post({type:'stream',text:answer.text,status:answer.status,steps});return;}
      if(type==='token'){const text=workflowEventText(event);if(text)answer.text+=text;answer.status='LLM 실행 중';post({type:'stream',text:answer.text,status:answer.status,steps});return;}
      if(type==='node_output'){
        const text=workflowEventText(event);if(text)lastNodeText=text;
        const label=workflowNodeLabel(event);steps.push({type:'node_output',label,status:'단계 완료'});answer.status=/(mcp|tool)/i.test(label)?'MCP 도구 실행 중':'단계 완료';post({type:'stream',text:answer.text,status:answer.status,steps});return;
      }
      if(type==='node_error'){const detail=workflowEventText(event)||'워크플로우 단계에서 오류가 발생했습니다.';steps.push({type:'node_error',label:workflowNodeLabel(event),status:'오류',detail});throw Error(detail.slice(0,300));}
      if(type==='run_error'){throw Error((workflowEventText(event)||'워크플로우 실행에 실패했습니다.').slice(0,300));}
      if(type==='run_end'){
        const text=workflowEventText(event);output.appendLine(`[workflow] run_end text_length=${text.length} accumulated_length=${answer.text.length} node_output_length=${lastNodeText.length}`);if(!answer.text)answer.text=text||lastNodeText||'워크플로우는 완료됐지만 최종 답변 텍스트를 받지 못했습니다. 단계 결과를 확인하거나 같은 요청을 다시 실행해 주세요.';
        answer.status='완료';answer.model=event.model_id||event.model;answer.finish_reason=event.finish_reason;answer.runId=event.run_id||event.runId;answer.attachments=cleanAttachments(event.attachments);done=true;steps.push({type:'run_end',status:'완료'});post({type:'stream',text:answer.text,status:answer.status,steps});
      }
    });
    try{await bridge.request(`/agents/${encodeURIComponent(agent.id)}/workflow/run`,{method:'POST',body,onChunk:t=>parser.push(t),stream:true,signal:controller.signal});parser.end();if(!done)throw Error('워크플로우 응답이 중간에 종료되었습니다. 재전송은 자동으로 하지 않습니다.');answer.steps=steps;if(compacted||summaryPrefix)state.contextSummary='';await preloadAttachments(answer.attachments);}
    catch(e){answer.status=e.message;answer.steps=steps;throw e;}
  }
  async function send(data){const rawMessage=String(data.message||'').trim();if(/^\/goal(?:\s|$)/i.test(rawMessage))return goalCommand(rawMessage);if(controller)return;if(projectBusy)throw Error('파일 선택을 마친 뒤 전송하세요.');if(!vscode.workspace.isTrusted)throw Error('신뢰된 작업 영역에서 사용하세요.');if(!bridge.connected)throw Error('학교 브라우저 연결을 먼저 확인하세요.');
    const requested=cleanAttachments(data.uploads).slice(0,MAX_UPLOADS),uploaded=[];const seen=new Set();
    for(const item of requested){if(seen.has(item.file_id))throw Error('같은 첨부 파일을 두 번 보낼 수 없습니다.');seen.add(item.file_id);const cached=uploadCache.get(item.file_id);if(!cached)throw Error('첨부 파일 업로드가 끝나지 않았거나 만료되었습니다. 다시 첨부하세요.');uploaded.push(cached);}
    let message=String(data.message||'');if(!message.trim()&&uploaded.length)message='첨부한 파일을 확인하고 필요한 내용을 설명해 주세요.';if(!message.trim())throw Error('질문을 입력하거나 파일을 첨부하세요.');
    let compacted=null;
    if(state.contextCompaction&&!state.contextSummary){const limit=compactThreshold(state.compactionThreshold);if(estimateMessages([...state.messages,{role:'user',text:message}])>limit)compacted=compactMessages(state.messages,Math.max(16000,limit-message.length));if(compacted){state.messages=compacted.messages;state.contextSummary=compacted.summary;state.conversationId=null;post({type:'notice',text:`컨텍스트를 압축했습니다. 이전 메시지 ${compacted.removed}개를 요약하고 새 대화 맥락으로 이어갑니다.`});await save();snapshot();}}
    const summaryPrefix=state.contextSummary?`${state.contextSummary}\n\n[현재 요청]\n`:'';const composed=projectContext.compose(summaryPrefix+goalPrompt()+message);const selectedAgent=data.agent?await resolveAgent(String(data.agent)):null;const workflow=Boolean(selectedAgent&&agentUsesWorkflow(selectedAgent));const body=workflow?null:chatBody({message:composed,model:data.model,agent:data.agent,mode:data.mode,conversationId:state.conversationId,fileIds:uploaded.map(a=>a.file_id),fileAttachments:uploaded},models);
    const info=projectContext.info();
    state.model=data.model;state.agent=data.agent||'';state.mode=data.mode;if(state.title==='새 대화')state.title=message.replace(/\s+/g,' ').trim().slice(0,48)||'새 대화';state.messages.push({role:'user',text:message,attachments:uploaded,project:info.files.length?info.project?.name:undefined,contextFiles:info.files});projectContext.clear();const answer={role:'assistant',text:'',status:'응답 중'};state.messages.push(answer);
    controller=new AbortController();post({type:'accepted'});snapshot();void preloadAttachments(uploaded);let done=false;
    const parser=new SSEParser(event=>{
      if(event.conversation_id)state.conversationId=event.conversation_id;
      if(event.type==='delta'||event.type==='token'){answer.text+=event.content??event.delta??'';post({type:'stream',text:answer.text,status:answer.status});}
      if(event.type==='waiting'||event.type==='image_generating'||event.type==='image_editing'){answer.status=event.reason||'학교 AI 처리 중';post({type:'stream',text:answer.text,status:answer.status});}
      if(event.type==='error')throw Error(String(event.content||event.error||'학교 응답 오류').slice(0,300));
      if(event.type==='done'){done=true;answer.status='완료';answer.model=event.model_id;answer.attachments=cleanAttachments(event.attachments);answer.finish_reason=event.finish_reason;if(!answer.text&&event.content)answer.text=event.content;if(compacted||summaryPrefix)state.contextSummary='';}
    });
    try{if(workflow){await sendWorkflow(selectedAgent,composed,answer,compacted,summaryPrefix,uploaded);}else{await bridge.request('/chat/completions',{method:'POST',body,stream:true,onChunk:t=>parser.push(t),signal:controller.signal});parser.end();if(!done)throw Error('응답이 중간에 종료되었습니다. 재전송은 자동으로 하지 않습니다.');await preloadAttachments(answer.attachments);}}
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
    }finally{if(previous!==projectContext.project?.path){imageCache.clear();if(relayController)await disconnectRelay();}projectBusy=false;snapshot();}
  }
  async function approval(detail,{write=false}={}){
    if(state.approvalMode==='full'||(state.approvalMode==='read'&&!write))return true;
    return await vscode.window.showWarningMessage(detail,{modal:true},'승인')==='승인';
  }
  async function applyFileProposal(root,args,ensureActive,detail='학교 AI가 파일 수정을 제안했습니다.'){
    if(typeof args.content!=='string'||args.content.length>200000)throw Error('파일 내용은 200,000자 이하여야 합니다.');
    const relative=String(args.path||'');
    const target=await workspace.safePath(root,relative,{create:true});let before=null;
    let exists=true;try{await fs.lstat(target);}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}if(exists)before=await workspace.readText(root,relative);
    if(before&&args.expected_sha256!==before.hash)throw Error('read_file의 최신 sha256을 expected_sha256에 지정하세요.');
    const open=vscode.workspace.textDocuments.find(d=>d.uri.fsPath===target);if(open?.isDirty)throw Error('저장되지 않은 편집이 있습니다. 먼저 저장하세요.');
    const id=randomUUID(),left=vscode.Uri.parse(`school-code-preview:/${id}/before/${encodeURIComponent(relative)}`),right=vscode.Uri.parse(`school-code-preview:/${id}/after/${encodeURIComponent(relative)}`);
    previews.set(left.toString(),before?.text||'');previews.set(right.toString(),args.content);
    try{
      await vscode.commands.executeCommand('vscode.diff',left,right,`학교 AI 수정안: ${relative}`);
      if(!await approval(`${detail}\ndiff를 확인한 뒤 ${relative} ${before?'수정':'생성'}을 승인하세요.`,{write:true}))throw Error('사용자가 수정을 거절했습니다.');
      await ensureActive();
      await workspace.safePath(root,relative,{create:!before});
      if(before){const latest=await workspace.readText(root,relative);if(latest.hash!==before.hash)throw Error('검토 중 파일이 변경되었습니다.');}
      if(vscode.workspace.textDocuments.find(d=>d.uri.fsPath===target)?.isDirty)throw Error('검토 중 편집기가 변경되었습니다.');
      await ensureActive();
      const edit=new vscode.WorkspaceEdit(),uri=vscode.Uri.file(target);
      if(!before)edit.createFile(uri,{overwrite:false});
      const doc=before?await vscode.workspace.openTextDocument(uri):null;
      edit.replace(uri,doc?new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)):new vscode.Range(0,0,0,0),args.content);
      if(!await vscode.workspace.applyEdit(edit))throw Error('수정 적용 실패');
      const changed=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(changed);if(!await changed.save())throw Error('편집기에 적용했으나 저장 실패');
      return {applied:true,path:relative,sha256:workspace.sha(Buffer.from(args.content))};
    }finally{previews.delete(left.toString());previews.delete(right.toString());}
  }
  async function ensureStarterInstructions(root,ensureActive){
    const existing=await workspace.readInstructions(root);if(existing.files.length)return {attempted:false,created:false};
    try{
      // The starter is a small, local harness file. Create it automatically on
      // first workspace discovery so every later tool call has stable guidance.
      // Existing instruction files are never overwritten, and the request is
      // still checked for expiry before touching the project.
      await ensureActive();
      const target=await workspace.safePath(root,'AGENTS.md',{create:true});
      await fs.writeFile(target,STARTER_INSTRUCTIONS,{encoding:'utf8',flag:'wx'});
      return {attempted:true,created:true,path:'AGENTS.md',automatic:true};
    }catch(e){
      if(e.code==='EEXIST')return {attempted:true,created:false,automatic:true};
      return {attempted:true,created:false,automatic:true,error:String(e.message||e).slice(0,240)};
    }
  }
  async function executeTool(job,isActive,ensureActive){
    if(!vscode.workspace.isTrusted||!relayRoot||!isActive())throw Error('작업 영역 연결이 종료되었습니다.');
    const workspaceConnection=mcpRegistry.get('school-workspace');if(workspaceConnection?.enabled===false)throw Error('학교 Workspace MCP가 꺼져 있습니다. 패널에서 다시 켜세요.');
    const root=relayRoot,args=job.args||{};
    const notionTool=job.name.startsWith('notion_');
    if(job.name==='workspace_info'){
      const setup=await ensureStarterInstructions(root,ensureActive);const instructions=await workspace.readInstructions(root);const projectSkills=await skills.listSkills(root);
       const notionLinks=context.globalState?.get?.('schoolCode.notion.publicLinks',[])||[];
       return {name:path.basename(root),tools:['create_directory','list_files','read_file','search_text','read_asset_metadata','list_visual_assets','read_image','list_model_assets','read_model_metadata','read_instructions','read_skill','run_shell','start_background_task','task_status','task_output','task_cancel','notion_search','notion_fetch_page','notion_list_children','unity_project_info','unity_run_tests','unity_build','unity_refresh_assets','unity_open_scene','unity_find_gameobjects','unity_get_component','unity_set_component','unity_create_gameobject','unity_save_scene','unity_capture_scene','unity_capture_game','unity_model_preview','unity_play','unity_pause','unity_stop','unity_get_console_logs','unity_project_status','unity_add_component','unity_remove_component','unity_duplicate_gameobject','unity_delete_gameobject','unity_move_gameobject','unity_instantiate_prefab','unity_assign_material','unity_get_animator_info','unity_set_animator_parameter','propose_edit'],write_requires_approval:true,root_isolation:true,instruction_files:instructions.files.map(f=>f.path),instructions_missing:instructions.files.length===0,recommended_instruction_file:instructions.files.length===0?'AGENTS.md':undefined,instructions_setup:setup,skills:projectSkills,mcp_connections:mcpSnapshot(),notion_configured:!!(await context.secrets.get('schoolCode.notion.integrationToken'))||notionLinks.length>0,notion_public_links:notionLinks,unity_executable_configured:unityPathConfigured(),unity_editor_configured:!!(await context.secrets.get('schoolCode.unity.editorToken')),limits:{read_file_max_lines:1001,read_file_max_bytes:16777216,asset_hash_max_bytes:268435456,image_max_bytes:workspace.MAX_IMAGE_BYTES,image_max_count_per_request:1,image_cache_entries:8,model_metadata_max_bytes:workspace.MAX_MODEL_METADATA_BYTES,edit_max_chars:200000,shell_command_max_chars:20000,background_task_max_runtime_ms:1800000,shell_output_max_chars:2097152}};
    }
    if(notionTool){
      if(mcpRegistry.get('notion')?.enabled===false)throw Error('Notion MCP가 꺼져 있습니다.');
      if(!await approval(`학교 AI가 Notion 읽기 도구 ${job.name}을 요청했습니다. 공유된 페이지 내용이 학교 AI로 전달됩니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();
      if(job.name==='notion_search')return notion.search(args);
      if(job.name==='notion_fetch_page')return notion.fetchPage(args.page_id);
      if(job.name==='notion_list_children')return notion.listChildren(args);
    }
    if(job.name==='run_shell'){
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트에서 셸 명령을 실행하려 합니다.\n명령: ${String(args.command||'').slice(0,500)}\n작업 디렉터리: ${args.cwd||'.'}\n현재 Windows 사용자 권한으로 실행되며 프로젝트 밖에도 영향을 줄 수 있습니다.`,{write:true}))throw Error('사용자가 거절했습니다.');
      await ensureActive();const result=await runShell(root,args);if(result.stdout)result.stdout=result.stdout.replaceAll(root,'<project>');if(result.stderr)result.stderr=result.stderr.replaceAll(root,'<project>');return result;
    }
    if(job.name==='start_background_task'){
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트에서 백그라운드 셸 작업을 시작하려 합니다.\n명령: ${String(args.command||'').slice(0,500)}\n작업 디렉터리: ${args.cwd||'.'}\n현재 Windows 사용자 권한으로 실행되며 최대 실행 시간은 ${Math.round((Number(args.max_runtime_ms)||1800000)/60000)}분입니다.`,{write:true}))throw Error('사용자가 거절했습니다.');
      await ensureActive();return taskManager.start(root,args);
    }
    if(job.name==='task_status'||job.name==='task_output'){
      if(!await approval(`학교 AI가 백그라운드 셸 작업 ${args.task_id}의 상태/출력을 읽으려 합니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();return job.name==='task_status'?taskManager.status(args.task_id,root):taskManager.output(args.task_id,root,args.max_chars);
    }
    if(job.name==='task_cancel'){
      if(!await approval(`학교 AI가 백그라운드 셸 작업 ${args.task_id}를 취소하려 합니다.`,{write:true}))throw Error('사용자가 거절했습니다.');
      await ensureActive();return taskManager.cancel(args.task_id,root);
    }
    if(job.name==='create_directory'){
      const relative=String(args.path||'');
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트 안에 폴더를 생성하려 합니다.\n경로: ${relative}\n프로젝트 밖의 경로와 숨김·비밀 폴더는 허용되지 않습니다.`,{write:true}))throw Error('사용자가 거절했습니다.');
      await ensureActive();return workspace.createDirectory(root,relative);
    }
    const unityTool=['unity_project_info','unity_run_tests','unity_build','unity_refresh_assets'].includes(job.name);
    if(unityTool){
      if(mcpRegistry.get('unity-cli')?.enabled===false)throw Error('Unity CLI MCP가 꺼져 있습니다.');
      const write=job.name==='unity_build'||job.name==='unity_refresh_assets';
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트에서 Unity 도구 ${job.name}을 실행하려 합니다.${write?' 프로젝트 파일이나 빌드 산출물이 바뀔 수 있습니다.':''}`,{write}))throw Error('사용자가 거절했습니다.');
      await ensureActive();
      const executable=unityExecutable();
      let result;
      if(job.name==='unity_project_info')result=await unity.projectInfo(root);
      else if(job.name==='unity_run_tests')result=await unity.runTests({executable,root,platform:args.platform});
      else if(job.name==='unity_build')result=await unity.build({executable,root,target:args.target,outputPath:args.output_path});
      else if(job.name==='unity_refresh_assets')result=await unity.refreshAssets({executable,root});
      else throw Error('지원하지 않는 Unity 도구');
      if(result?.output)result.output=result.output.replaceAll(root,'<project>');
      return result;
    }
    const unityEditorTools=['unity_open_scene','unity_find_gameobjects','unity_get_component','unity_set_component','unity_create_gameobject','unity_save_scene','unity_capture_scene','unity_capture_game','unity_model_preview','unity_play','unity_pause','unity_stop','unity_get_console_logs','unity_project_status','unity_add_component','unity_remove_component','unity_duplicate_gameobject','unity_delete_gameobject','unity_move_gameobject','unity_instantiate_prefab','unity_assign_material','unity_get_animator_info','unity_set_animator_parameter'];
    const unityEditorTool=job.name.startsWith('unity_')&&unityEditorTools.includes(job.name);
    if(unityEditorTool){
      if(mcpRegistry.get('unity-editor')?.enabled===false)throw Error('Unity Editor MCP가 꺼져 있습니다.');
      const write=['unity_set_component','unity_create_gameobject','unity_save_scene','unity_play','unity_pause','unity_stop','unity_add_component','unity_remove_component','unity_duplicate_gameobject','unity_delete_gameobject','unity_move_gameobject','unity_instantiate_prefab','unity_assign_material','unity_set_animator_parameter'].includes(job.name)||(job.name==='unity_get_console_logs'&&args.clear===true);
      if(!await approval(`학교 AI가 연결된 Unity Editor에서 ${job.name}을 실행하려 합니다.${write?' 씬이나 오브젝트가 변경될 수 있습니다.':''}`,{write}))throw Error('사용자가 거절했습니다.');
      await ensureActive();const result=await unityEditor.call(job.name,args);unityEditorConnected=true;return result;
    }
    if(job.name==='read_skill'){
      if(!await approval(`학교 AI가 프로젝트 Skill ${args.name}을 읽으려 합니다. 프로젝트의 .school-code/skills 또는 .agents/skills 안의 지침이 학교 AI로 전달됩니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();return skills.readSkill(root,args.name);
    }
    if(!['list_files','read_file','search_text','read_asset_metadata','list_visual_assets','read_image','list_model_assets','read_model_metadata','read_instructions','propose_edit'].includes(job.name))throw Error('지원하지 않는 도구');
    if(job.name!=='propose_edit'){
      if(!await approval(`학교 AI가 ${path.basename(root)} 프로젝트에 ${job.name}을 요청했습니다.\n경로: ${args.path||'/'}${args.query?'\n검색어: '+args.query:''}\n결과는 등록한 중계 서버를 통해 학교 AI로 전달됩니다.`))throw Error('사용자가 거절했습니다.');
      await ensureActive();
      if(job.name==='list_files')return workspace.listFiles(root,args.path||'',Math.min(500,args.limit||200));
      if(job.name==='read_file')return workspace.readLines(root,args);
      if(job.name==='search_text')return workspace.search(root,args);
      if(job.name==='read_asset_metadata')return workspace.readAssetMetadata(root,args.path);
      if(job.name==='list_visual_assets')return workspace.listVisualAssets(root,args.path||'',Math.min(500,args.limit||200));
      if(job.name==='read_image'){
        const image=await workspace.readImage(root,args.path),cached=imageCache.get(image.path);
        if(cached&&cached.sha256===image.sha256){image.data=cached.data;image.cache_hit=true;}else{imageCache.set(image.path,image);while(imageCache.size>8)imageCache.delete(imageCache.keys().next().value);}
        return image;
      }
      if(job.name==='list_model_assets')return workspace.listModelAssets(root,args.path||'',Math.min(500,args.limit||200));
      if(job.name==='read_model_metadata')return workspace.readModelMetadata(root,args.path);
      return workspace.readInstructions(root);
    }
    return applyFileProposal(root,args,ensureActive);
  }
  function relayPairKeys(url,project){const workspaceId=createHash('sha256').update(project.path).digest('hex').slice(0,32);return {workspaceId,workerKey:`relay:${url}:pair:${workspaceId}`,mcpKey:`relay:${url}:pair:${workspaceId}:mcp`};}
  async function pairRelay(url,project,{force=false}={}){
    if(relayPairPromise)return relayPairPromise;
    const pairAbort=new AbortController();relayPairAbort=pairAbort;
    const run=(async()=>{
    const {workspaceId,workerKey,mcpKey}=relayPairKeys(url,project),savedWorker=await context.secrets.get(workerKey),savedMcp=await context.secrets.get(mcpKey);
    if(savedWorker&&!force)return {workerToken:savedWorker,mcpToken:savedMcp||''};
    relayPending=true;relayPairCode='';relayError='';snapshot();
    output.appendLine(`Workspace 페어링 시작: ${url} · ${project.name}`);post({type:'notice',text:'브라우저에서 BCSD 계정 승인을 기다리는 중입니다.'});
    const response=await fetch(url+'/auth/pair/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId,workspaceName:project.name,deviceId:randomUUID()}),redirect:'error',signal:AbortSignal.any([pairAbort.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error(`페어링 시작 실패 (HTTP ${response.status})`);const pair=await response.json();
    if(!pair.pairId||!pair.pairSecret||!pair.approvalUrl)throw Error('중계 서버가 올바른 페어링 정보를 반환하지 않았습니다.');
    relayPairCode=pair.code;relayPending=true;output.appendLine(`페어링 코드가 발급되었습니다: ${pair.code}. 브라우저 승인 대기 중 (10분 제한)`);snapshot();
    if(vscode.env?.openExternal&&vscode.Uri?.parse)await vscode.env.openExternal(vscode.Uri.parse(pair.approvalUrl));
    try{if(vscode.env?.clipboard?.writeText)await vscode.env.clipboard.writeText(pair.code);}catch{/* Clipboard access is optional. */}
    void vscode.window.showInformationMessage(`브라우저에서 BCSD 계정으로 로그인하고 연결을 승인하세요. 코드 ${pair.code}를 클립보드에도 복사했습니다.`);
    const deadline=Date.now()+10*60*1000;
    let lastStatus='';
    while(Date.now()<deadline){
      if(pairAbort.signal.aborted)throw Error('Workspace 페어링을 취소했습니다.');
      const statusResponse=await fetch(`${url}/auth/pair/status?pair_id=${encodeURIComponent(pair.pairId)}&secret=${encodeURIComponent(pair.pairSecret)}`,{redirect:'error',signal:AbortSignal.any([pairAbort.signal,AbortSignal.timeout(15000)])});
      if(!statusResponse.ok)throw Error(`페어링 상태 확인 실패 (HTTP ${statusResponse.status})`);const status=await statusResponse.json();
      if(status.status!==lastStatus){lastStatus=status.status;output.appendLine(`페어링 상태: ${status.status}`);}
      if(status.status==='approved'){if(!status.workerToken)throw Error('서버는 연결을 승인했지만 Bearer 토큰을 전달하지 않았습니다. Workspace 연결 해제 후 토큰 재발급으로 다시 시도하세요.');await context.secrets.store(workerKey,status.workerToken);if(status.mcpToken)await context.secrets.store(mcpKey,status.mcpToken);output.appendLine('개인 Workspace·MCP Bearer 토큰을 SecretStorage에 저장했습니다.');return {workerToken:status.workerToken,mcpToken:status.mcpToken||''};}
      if(status.status==='expired'||status.status==='invalid')throw Error('페어링 코드가 만료되었습니다. 다시 연결하세요.');
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw Error('페어링 승인 시간이 만료되었습니다. 다시 연결하세요.');
    })();
    relayPairPromise=run;
    try{return await run;}finally{if(relayPairPromise===run)relayPairPromise=null;relayPairAbort=null;relayPending=false;relayPairCode='';snapshot();}
  }
  async function copyMcpAuth(){
    const project=await projectContext.ensure(),raw=await chooseRelayUrl();if(!raw)return;const u=new URL(raw),{mcpKey}=relayPairKeys(u.origin,project),token=await context.secrets.get(mcpKey);if(!token)throw Error('먼저 BCSD 계정으로 Workspace를 연결하세요.');
    const value=JSON.stringify({type:'bearer',token});if(!vscode.env?.clipboard?.writeText)throw Error('VS Code 클립보드를 사용할 수 없습니다.');await vscode.env.clipboard.writeText(value);await vscode.window.showInformationMessage('학교 MCP 인증 JSON을 클립보드에 복사했습니다. 학교 리소스 → MCP에 붙여 넣으세요.');
  }
  async function disconnectRelay(){const previousRoot=relayRoot;relayController?.abort();relayController=null;relayPairAbort?.abort();relayPairAbort=null;if(previousRoot)await taskManager.cancelRoot(previousRoot);relayRoot=null;relayConnected=false;relayPending=false;relayPairCode='';relayError='';if(relaySession){const {url,headers}=relaySession;relaySession=null;fetch(url+'/worker/disconnect',{method:'POST',headers,signal:AbortSignal.timeout(3000)}).catch(()=>{});}snapshot();}
  async function connectRelayImpl({forcePair=false,auto=false}={}){
    if(relayPairPromise){
      output.appendLine(`이미 페어링 승인 대기 중입니다${relayPairCode?` (코드 ${relayPairCode})`:''}. 기존 요청을 계속 확인합니다.`);
      post({type:'notice',text:`이미 브라우저 승인 대기 중입니다${relayPairCode?` · 코드 ${relayPairCode}`:''}. 새 연결을 만들지 않고 기존 요청을 계속 확인합니다.`});
      return relayPairPromise;
    }
    if(relayController){
      if(auto||relayConnected)return vscode.window.showInformationMessage('이미 연결되어 있습니다.');
      output.appendLine('기존에 실패한 Workspace 연결을 정리하고 다시 시도합니다.');
      await disconnectRelay();
    }
    if(!vscode.workspace.isTrusted)throw Error('신뢰된 작업 영역이 필요합니다.');
    const project=await projectContext.ensure();relayError='';snapshot();
    const raw=auto?configuredRelayUrl():await chooseRelayUrl();if(!raw)return;
    const u=new URL(raw);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('HTTPS 서버 기본 주소를 입력하세요.');const url=u.origin;
    const key='relay:'+url;let token=await context.secrets.get(key),mcpToken=await context.secrets.get(`${key}:mcp`);let pairMode=typeof vscode.window.showQuickPick==='function';
    if(auto){if(!token||token.length<32)return;pairMode=false;}
    else if(!forcePair&&token&&token.length>=32){pairMode=false;}
    else if(pairMode){const selected=await vscode.window.showQuickPick([{label:'BCSD 계정으로 브라우저 승인',description:'로그인 후 개인 토큰을 자동 발급합니다.',value:'pair'},{label:'수동 WORKER_TOKEN 입력',description:'기존 공용 토큰 호환 모드',value:'manual'}],{title:'Workspace MCP 인증 방식',placeHolder:'권장: BCSD 계정으로 브라우저 승인',ignoreFocusOut:true});if(!selected)return;pairMode=selected.value==='pair';}
    if(!auto&&!await approval(`${project.name}을 ${url}에 연결합니다. 학교 AI가 파일 도구를 요청할 수 있으며, 읽기/검색/수정은 건별로 승인합니다.`))return;
    if(pairMode){const credentials=await pairRelay(url,project,{force:forcePair});token=credentials.workerToken;mcpToken=credentials.mcpToken;}else if(!token){token=await vscode.window.showInputBox({title:'중계 서버 WORKER_TOKEN',password:true,value:'',ignoreFocusOut:true});if(!token)return;if(token.length<32)throw Error('32자 이상 토큰이 필요합니다.');}
    if(projectContext.project!==project)throw Error('프로젝트가 변경되었습니다. MCP를 다시 연결하세요.');
    await context.secrets.store(key,token);relayRoot=project.path;const ctl=relayController=new AbortController();const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Worker-Id':randomUUID()};relaySession={url,headers};
    const call=async(route,body,timeout=30000)=>{const r=await fetch(url+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(timeout)])});if(!r.ok)throw Error(`중계 HTTP ${r.status}`);return r.json();};
     let heartbeatBusy=false;const heartbeat=setInterval(async()=>{if(heartbeatBusy||ctl.signal.aborted)return;heartbeatBusy=true;try{await call('/worker/heartbeat');relayConnected=true;relayError='';}catch(e){relayConnected=false;relayError=String(e.message||'중계 서버에 연결할 수 없습니다.').slice(0,200);}finally{heartbeatBusy=false;snapshot();}},10000);
     (async()=>{try{await call('/worker/heartbeat');relayConnected=true;relayError='';mcpRegistry.upsert({id:'school-workspace',catalogId:'school-workspace',name:'학교 Workspace',description:'현재 프로젝트 Workspace Relay',kind:'relay',url,enabled:true,capabilities:['workspace','shell','unity']});await mcpRegistry.save();snapshot();while(!ctl.signal.aborted){try{const job=await call('/worker/poll');relayConnected=true;relayError='';snapshot();if(!job.id)continue;let result,error;
      const deadline=Math.min(Date.now()+115000,Number(job.expiresAt)||0);let active=true;const check=()=>active&&!ctl.signal.aborted&&Date.now()<deadline;
      const ensureActive=async()=>{if(!check())throw Error('요청 만료 — 변경하지 않았습니다.');const remote=await call('/worker/status',{id:job.id});if(!remote.active||!check())throw Error('중계 요청 만료');};
      const expiry=setTimeout(()=>active=false,Math.max(0,deadline-Date.now()));
      try{result=await executeTool(job,check,ensureActive);if(!check())throw Error('요청 만료');}catch(e){error=e.message;}finally{clearTimeout(expiry);}
      await call('/worker/result',{id:job.id,result,error}).catch(e=>output.appendLine(e.message));
     }catch(e){relayConnected=false;relayError=String(e.message||'중계 서버에 연결할 수 없습니다.').slice(0,200);snapshot();if(ctl.signal.aborted)break;output.appendLine(e.message);await new Promise(resolve=>{const onAbort=()=>{clearTimeout(t);resolve();};const t=setTimeout(()=>{ctl.signal.removeEventListener('abort',onAbort);resolve();},3000);ctl.signal.addEventListener('abort',onAbort,{once:true});});}}}catch(e){if(!ctl.signal.aborted){relayConnected=false;relayError=String(e.message||'중계 서버에 연결할 수 없습니다.').slice(0,200);output.appendLine(e.message);post({type:'notice',text:e.message});snapshot();}}finally{clearInterval(heartbeat);if(relayController===ctl){relayController=null;relayConnected=false;snapshot();}}})();
  }
  async function connectRelay(options={}){
    if(relayConnectPromise){
      output.appendLine('Workspace 연결이 이미 진행 중입니다. 기존 요청을 계속 사용합니다.');
      post({type:'notice',text:'Workspace 연결이 이미 진행 중입니다. 새 탭이나 새 코드를 만들지 않고 기존 요청을 계속 확인합니다.'});
      return relayConnectPromise;
    }
    const run=connectRelayImpl(options);relayConnectPromise=run;snapshot();
    try{return await run;}finally{if(relayConnectPromise===run)relayConnectPromise=null;snapshot();}
  }
  async function handle(m){try{
    if(m.type==='ready'){snapshot();postImagePreviews();void hydrateAttachments(state);return;}
    if(m.type==='uploadAdd')return await uploadReference(m);
    if(m.type==='uploadRemove'){removeUpload(m);return;}
    if(['projectChoose','attachFiles','attachFolder','attachmentPreview','attachmentRemove','attachmentsClear'].includes(m.type))return await projectAction(m.type,m.path);
    if(m.type==='connect')return await connectBrowser();
    if(m.type==='connectorFolder')return await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.joinPath(context.extensionUri,'chrome-extension','manifest.json'));
    if(m.type==='refresh')return await refresh();
    if(m.type==='mcpAdd'||m.type==='mcpCatalog')return await chooseMcp();
    if(m.type==='mcpSite')return await openMcpCatalogSite();
    if(m.type==='mcpConfigure')return await configureMcp(String(m.id||''));
    if(m.type==='mcpToggle')return await toggleMcp(String(m.id||''),m.enabled===true);
    if(m.type==='mcpRemove')return await removeMcp(String(m.id||''));
    if(m.type==='notionConfigure')return await configureNotion();
    if(m.type==='notionDisconnect')return await disconnectNotion();
    if(m.type==='unityConfigure')return await configureUnity();
    if(m.type==='unityEditorConfigure')return await configureUnityEditor();
    if(m.type==='goalSet'){
      const value=await vscode.window.showInputBox({title:'작업 목표 설정',prompt:'이번 작업에서 끝내고 싶은 결과를 입력하세요. (최대 1,000자)',value:state.goal?.text||'',ignoreFocusOut:true});
      if(value!==undefined)await setGoal(value);return;
    }
    if(m.type==='goalClear')return await clearGoal();
    if(m.type==='send')return await send(m);
    if(m.type==='choices'&&!controller){state.model=String(m.model||'');state.agent=String(m.agent||'');state.mode=['default','fast','deep','direct'].includes(m.mode)?m.mode:'default';state.approvalMode=['ask','read','full'].includes(m.approvalMode)?m.approvalMode:'ask';state.contextCompaction=m.contextCompaction===true;state.compactionThreshold=compactThreshold(m.compactionThreshold);await save();snapshot();return;}
    if(m.type==='stop'){controller?.abort();return;}
    if((m.type==='new'||m.type==='sessionNew')&&!controller){state=sessionStore.create();await sessionStore.save();snapshot();return;}
    if(m.type==='sessionSelect'&&!controller){await save();state=sessionStore.select(String(m.id||''));await sessionStore.save();snapshot();return;}
    if(m.type==='sessionRename'&&!controller){const title=m.title||await vscode.window.showInputBox({title:'대화 이름 변경',value:state.title,prompt:'대화 이름을 입력하세요.'});if(title){sessionStore.rename(state.id,title);await sessionStore.save();snapshot();}return;}
    if(m.type==='sessionDelete'&&!controller){const id=String(m.id||state.id);if(await vscode.window.showWarningMessage('이 대화와 저장된 메시지를 삭제할까요?',{modal:true},'삭제')!=='삭제')return;sessionStore.remove(id);await sessionStore.save();state=sessionStore.active;snapshot();return;}
    if(m.type==='selection'){
      const editor=vscode.window.activeTextEditor;if(!editor||editor.selection.isEmpty)throw Error('편집기에서 코드를 선택하세요.');const text=editor.document.getText(editor.selection);if(text.length>40000)throw Error('선택 코드는 40,000자 이하여야 합니다.');post({type:'selection',text:`\n\n파일: ${vscode.workspace.asRelativePath(editor.document.uri)}\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``});return;
    }
    if(m.type==='relay')return await connectRelay();
    if(m.type==='relayRepair')return await connectRelay({forcePair:true});
    if(m.type==='copyMcpAuth')return await copyMcpAuth();
    if(m.type==='disconnectRelay')return await disconnectRelay();
  }catch(e){const message=String(e?.message||e||'알 수 없는 오류').slice(0,300);output.appendLine(`오류: ${message}`);if(m?.type==='relay'||m?.type==='relayRepair'){relayConnected=false;relayError=message;snapshot();}post({type:'notice',text:message});vscode.window.showErrorMessage('School Code: '+message);}}
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('schoolCode.chat',{resolveWebviewView(v){view=v;v.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};const nonce=randomBytes(16).toString('hex');v.webview.html=panelHtml(v.webview,context.extensionUri,nonce);v.webview.onDidReceiveMessage(handle,undefined,context.subscriptions);v.onDidDispose(()=>{view=null;});}},{webviewOptions:{retainContextWhenHidden:true}}));
  for(const [command,fn]of Object.entries({'schoolCode.open':()=>vscode.commands.executeCommand('schoolCode.chat.focus'),'schoolCode.connect':connectBrowser,'schoolCode.relay':connectRelay,'schoolCode.repairRelay':()=>connectRelay({forcePair:true}),'schoolCode.copyMcpAuth':copyMcpAuth,'schoolCode.disconnectRelay':disconnectRelay,'schoolCode.mcpCatalog':chooseMcp,'schoolCode.mcpAdd':chooseMcp,'schoolCode.openMcpCatalog':openMcpCatalogSite,'schoolCode.notionConfigure':configureNotion,'schoolCode.notionDisconnect':disconnectNotion,'schoolCode.unityConfigure':configureUnity,'schoolCode.unityEditorConfigure':configureUnityEditor}))context.subscriptions.push(vscode.commands.registerCommand(command,()=>Promise.resolve(fn()).catch(e=>vscode.window.showErrorMessage(e.message))));
  const timer=setInterval(()=>post({type:'connection',connected:bridge.connected,relay:relayConnected,error:bridgeError}),3000);context.subscriptions.push({dispose(){clearInterval(timer);controller?.abort();for(const c of uploadControllers.values())c.abort();uploadControllers.clear();void disconnectRelay();void taskManager.dispose();}});
  async function autoReconnectRelay(){
    if(!vscode.workspace.isTrusted||!vscode.workspace.workspaceFolders?.length)return;
    try{await connectRelay({auto:true});}
    catch(e){relayError=String(e.message||'저장된 Workspace 연결을 복원하지 못했습니다.').slice(0,200);output.appendLine(`자동 재연결 실패: ${relayError}`);snapshot();}
  }
  void hydrateMcpRegistry();
  void autoReconnectRelay();
}
module.exports={activate};
