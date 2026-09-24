const ORIGIN = 'https://ai.koreatech.ac.kr';
function validRoute(route, method) {
  return method === 'GET' && (/^\/(models|usage\/remaining|agents\?limit=50|agents\/public\?limit=50)$/.test(route) || /^\/conversations\/[a-zA-Z0-9-]+\/messages$/.test(route) || /^\/chat\/uploads\/[a-zA-Z0-9-]+$/.test(route)) || method === 'POST' && (route === '/chat/completions' || route === '/chat/upload');
}
function cleanFileAttachments(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) throw Error('첨부 파일은 최대 5개까지 사용할 수 있습니다.');
  return value.map(a => {
    if (!a || typeof a !== 'object' || !/^[a-zA-Z0-9-]{1,200}$/.test(String(a.file_id || ''))) throw Error('첨부 파일 ID가 올바르지 않습니다.');
    const item = {file_id: String(a.file_id)};
    if (typeof a.filename === 'string' && a.filename.trim()) item.filename = a.filename.trim().slice(0, 240);
    if (typeof a.file_type === 'string' && a.file_type.trim()) item.file_type = a.file_type.trim().slice(0, 80);
    if (a.file_size !== undefined) {
      if (!Number.isFinite(a.file_size) || a.file_size < 0 || a.file_size > 32 * 1024 * 1024) throw Error('첨부 파일 크기가 올바르지 않습니다.');
      item.file_size = Math.floor(a.file_size);
    }
    return item;
  });
}
function chatBody({message,model,agent,mode='default',conversationId,fileIds,fileAttachments},models=[]) {
  if (typeof message !== 'string' || !message.trim() || message.length>100000) throw Error('메시지는 1~100,000자여야 합니다.');
  if (!['default','fast','deep','direct'].includes(mode)) throw Error('잘못된 응답 모드입니다.');
  const selected = models.find(m=>m.id===model);
  if (!agent && (!selected || selected.available===false)) throw Error('사용 가능한 모델을 선택하세요.');
  if (agent && !/^[\w-]{1,100}$/.test(agent)) throw Error('잘못된 에이전트 ID입니다.');
  if (agent && mode!=='default') throw Error('에이전트는 기본 응답 모드를 사용하세요.');
  if (mode==='deep' && !(selected.high_quality || selected.capabilities?.high_quality)) throw Error('깊은 응답은 고급 모델에서만 지원합니다.');
  const b={message,locale:'ko'};
  if(agent)b.agent_id=agent; else b.model_id=model;
  if(conversationId){if(!/^[\w-]{1,100}$/.test(conversationId))throw Error('잘못된 대화 ID입니다.');b.conversation_id=conversationId;}
  if(mode!=='default')b[mode]=true;
  const attachments=cleanFileAttachments(fileAttachments);
  const ids=Array.isArray(fileIds)?fileIds.map(String):[];
  if(ids.length>5||ids.some(id=>!/^[a-zA-Z0-9-]{1,200}$/.test(id)))throw Error('첨부 파일 ID가 올바르지 않습니다.');
  if(ids.length!==attachments.length||ids.some((id,index)=>id!==attachments[index].file_id))throw Error('첨부 파일 정보가 일치하지 않습니다.');
  if(ids.length){b.file_ids=ids;b.file_attachments=attachments;}
  return b;
}
class SSEParser {
  constructor(onEvent){this.buffer='';this.onEvent=onEvent;}
  push(text){this.buffer+=text; if(this.buffer.length>2*1024*1024)throw Error('SSE event too large'); let match; while((match=/\r?\n\r?\n/.exec(this.buffer))){const block=this.buffer.slice(0,match.index);this.buffer=this.buffer.slice(match.index+match[0].length);this.block(block);}}
  block(block){let name='message';const data=[];for(const line of block.split(/\r?\n/)){if(line.startsWith('event:'))name=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}if(!data.length)return;const raw=data.join('\n');if(raw==='[DONE]')return;let event;try{event=JSON.parse(raw);}catch{throw Error('잘못된 SSE 응답입니다.');}this.onEvent({...event,type:event.type||name});}
  end(){if(this.buffer.trim())this.block(this.buffer);this.buffer='';}
}
module.exports={ORIGIN,validRoute,chatBody,SSEParser,cleanFileAttachments};
