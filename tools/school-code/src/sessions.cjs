const {randomUUID}=require('node:crypto');

function normalize(input,now=Date.now()){
  const value=input&&typeof input==='object'?input:{};
  return {
    id:typeof value.id==='string'&&value.id?value.id:randomUUID(),
    title:typeof value.title==='string'&&value.title.trim()?value.title.trim().slice(0,80):'새 대화',
    conversationId:typeof value.conversationId==='string'?value.conversationId:null,
    messages:Array.isArray(value.messages)?value.messages.slice(-100):[],
    model:typeof value.model==='string'&&value.model?value.model:'gpt-6-astra',
    agent:typeof value.agent==='string'?value.agent:'',
    mode:['default','fast','deep','direct'].includes(value.mode)?value.mode:'default',
    approvalMode:['ask','read','full'].includes(value.approvalMode)?value.approvalMode:'ask',
    createdAt:Number.isFinite(value.createdAt)?value.createdAt:now,
    updatedAt:Number.isFinite(value.updatedAt)?value.updatedAt:now,
  };
}

class SessionStore{
  constructor(storage){
    this.storage=storage;
    const saved=storage.get('schoolCode.sessions');
    const legacy=storage.get('schoolCode.chat');
    const source=Array.isArray(saved)&&saved.length?saved:[normalize({...legacy,title:'기존 대화'})];
    this.sessions=source.map(s=>normalize(s));
    const active=storage.get('schoolCode.activeSession');
    this.activeId=this.sessions.some(s=>s.id===active)?active:this.sessions[0].id;
  }
  get active(){return this.sessions.find(s=>s.id===this.activeId)||this.sessions[0];}
  update(session,patch={}){const current=this.sessions.find(s=>s.id===session.id);if(!current)return;Object.assign(current,session,patch,{updatedAt:Date.now()});}
  create(title='새 대화'){const s=normalize({title});this.sessions.unshift(s);this.activeId=s.id;return s;}
  select(id){if(!this.sessions.some(s=>s.id===id))throw Error('대화를 찾을 수 없습니다.');this.activeId=id;return this.active;}
  rename(id,title){const s=this.sessions.find(x=>x.id===id);if(!s)throw Error('대화를 찾을 수 없습니다.');const clean=String(title||'').trim();if(!clean)throw Error('대화 이름을 입력하세요.');s.title=clean.slice(0,80);s.updatedAt=Date.now();return s;}
  remove(id){if(this.sessions.length<=1)throw Error('대화가 하나만 남아 있어 삭제할 수 없습니다.');const index=this.sessions.findIndex(s=>s.id===id);if(index<0)throw Error('대화를 찾을 수 없습니다.');this.sessions.splice(index,1);if(this.activeId===id)this.activeId=this.sessions[Math.max(0,index-1)].id;return this.active;}
  summaries(){return this.sessions.map(s=>({id:s.id,title:s.title,updatedAt:s.updatedAt,messageCount:s.messages.length,active:s.id===this.activeId}));}
  async save(){await this.storage.update('schoolCode.sessions',this.sessions.map(s=>({...s,messages:s.messages.slice(-100)})));await this.storage.update('schoolCode.activeSession',this.activeId);}
}
module.exports={SessionStore,normalize};
