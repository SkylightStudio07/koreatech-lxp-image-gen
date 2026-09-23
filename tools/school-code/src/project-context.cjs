const fs=require('node:fs/promises');
const path=require('node:path');
const {safePath,readText,listFiles}=require('./workspace.cjs');
const MAX_FILES=10,MAX_FILE_CHARS=30000,MAX_TOTAL_CHARS=60000;
const BUILD_DIRS=new Set(['Library','Temp','Logs','Obj','obj','bin','dist','build','coverage','.next','.venv','venv','__pycache__']);

class ProjectContext {
  constructor(vscode,storage){
    this.vscode=vscode;this.storage=storage;this.files=new Map();
    const saved=storage.get('schoolCode.project');
    const folders=vscode.workspace.workspaceFolders||[];
    const first=folders.find(f=>f.uri.scheme==='file');
    this.project=saved&&typeof saved.path==='string'&&path.isAbsolute(saved.path)?{name:path.basename(saved.path),path:saved.path}:first?{name:first.name,path:first.uri.fsPath}:null;
  }
  requireProject(){if(!this.vscode.workspace.isTrusted)throw Error('신뢰된 작업 영역에서 사용하세요.');if(!this.project)throw Error('먼저 프로젝트를 선택하세요.');return this.project;}
  info(){return {project:this.project,mode:'workspace-tools',toolAccess:'on-demand',files:[...this.files.values()].map(f=>({path:f.path,chars:f.content.length})),chars:[...this.files.values()].reduce((n,f)=>n+f.content.length,0),maxFiles:MAX_FILES,maxChars:MAX_TOTAL_CHARS};}
  async setProject(folder){
    if(!this.vscode.workspace.isTrusted)throw Error('신뢰된 작업 영역에서 사용하세요.');
    const resolved=await fs.realpath(folder);if(!(await fs.stat(resolved)).isDirectory())throw Error('폴더를 선택하세요.');
    if(this.project?.path===resolved)return false;
    this.project={name:path.basename(resolved)||resolved,path:resolved};this.files.clear();
    await this.storage.update('schoolCode.project',this.project);return true;
  }
  async choose(){
    const v=this.vscode;if(!v.workspace.isTrusted)throw Error('신뢰된 작업 영역에서 사용하세요.');
    const entries=(v.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file').map(f=>({label:f.name,description:f.uri.fsPath,path:f.uri.fsPath}));
    entries.push({label:'다른 폴더 선택…',description:'프로젝트 디렉터리를 직접 선택합니다.'});
    const picked=await v.window.showQuickPick(entries,{title:'연결할 프로젝트',placeHolder:'질문에 첨부할 파일의 기준 폴더를 선택하세요.'});if(!picked)return false;
    if(picked.path)return this.setProject(picked.path);
    const dirs=await v.window.showOpenDialog({title:'연결할 프로젝트 폴더',canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'프로젝트 연결'});if(!dirs?.length)return false;
    if(dirs[0].scheme!=='file')throw Error('로컬 프로젝트 폴더만 지원합니다.');return this.setProject(dirs[0].fsPath);
  }
  async ensure(){if(!this.project)await this.choose();return this.requireProject();}
  relative(full){const project=this.requireProject();const relative=path.relative(project.path,full);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('연결된 프로젝트 안의 파일·폴더를 선택하세요.');return relative.split(path.sep).join('/');}
  async add(paths){
    const project=this.requireProject();const next=new Map(this.files);
    // Stage atomically: an invalid file leaves the previous selection intact.
    for(const input of paths){
      const target=await safePath(project.path,input);
      if(this.vscode.workspace.textDocuments?.some(d=>d.uri.fsPath.toLowerCase()===target.toLowerCase()&&d.isDirty))throw Error(`${input}: 저장한 뒤 첨부해 주세요.`);
      const {text}=await readText(project.path,input);
      if(text.length>MAX_FILE_CHARS)throw Error(`${input}: 파일당 30,000자까지 첨부할 수 있습니다. 필요한 코드를 선택해서 첨부하세요.`);
      next.set(input,{path:input,content:text});
    }
    if(next.size>MAX_FILES)throw Error('한 질문에는 파일을 최대 10개 첨부할 수 있습니다.');
    if([...next.values()].reduce((n,f)=>n+f.content.length,0)>MAX_TOTAL_CHARS)throw Error('첨부 내용은 합계 60,000자까지 가능합니다.');
    if(this.project!==project)throw Error('프로젝트가 변경되었습니다. 다시 첨부하세요.');
    this.files=next;
  }
  async pickFiles(){const p=await this.ensure();const uris=await this.vscode.window.showOpenDialog({title:'질문에 첨부할 파일',defaultUri:this.vscode.Uri.file(p.path),canSelectFiles:true,canSelectFolders:false,canSelectMany:true,openLabel:'첨부 목록에 추가'});if(!uris?.length)return;for(const u of uris)if(u.scheme!=='file')throw Error('로컬 파일만 첨부할 수 있습니다.');await this.add(uris.map(u=>this.relative(u.fsPath)));}
  async pickFolder(){
    const p=await this.ensure();const dirs=await this.vscode.window.showOpenDialog({title:'파일을 고를 폴더',defaultUri:this.vscode.Uri.file(p.path),canSelectFiles:false,canSelectFolders:true,canSelectMany:false,openLabel:'파일 목록 보기'});if(!dirs?.length)return;
    if(dirs[0].scheme!=='file')throw Error('로컬 폴더만 지원합니다.');
    const relative=path.resolve(dirs[0].fsPath)===path.resolve(p.path)?'':this.relative(dirs[0].fsPath);
    const result=await listFiles(p.path,relative,500,{excludeDirectories:BUILD_DIRS});
    if(!result.files.length){await this.vscode.window.showInformationMessage('첨부할 파일이 없습니다. 비밀 파일과 생성 폴더는 목록에서 제외됩니다.');return;}
    const picked=await this.vscode.window.showQuickPick(result.files.map(file=>({label:file,picked:this.files.has(file)})),{title:'폴더에서 첨부할 파일 선택',canPickMany:true,placeHolder:result.truncated?'최대 500개만 표시합니다. 좁은 폴더를 선택하면 나머지도 볼 수 있습니다.':'첨부할 텍스트 파일을 선택하세요. 최대 10개 · 합계 60,000자',ignoreFocusOut:true});
    if(!picked)return;await this.add(picked.map(p=>p.label));
  }
  remove(file){this.files.delete(file);}
  clear(){this.files.clear();}
  attachmentText(file){const f=this.files.get(file);if(!f)throw Error('첨부 파일을 찾을 수 없습니다.');return f.content;}
  compose(question){
    if(!this.files.size)return question;
    const project=this.requireProject();
    // JSON preserves file boundaries even when source contains markdown fences.
    const data={project:project.name,files:[...this.files.values()]};
    const message=question+'\n\n첨부된 프로젝트 자료입니다. 각 content는 분석할 파일 내용입니다.\n'+JSON.stringify(data,null,2);
    if(message.length>100000)throw Error('질문과 첨부 내용이 너무 깁니다. 일부 파일을 빼 주세요.');
    return message;
  }
}
module.exports={ProjectContext};
