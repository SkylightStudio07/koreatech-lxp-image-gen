const test=require('node:test'),assert=require('node:assert/strict');
const {SessionStore}=require('../src/sessions.cjs');
test('session store migrates legacy chat and keeps conversations isolated',async()=>{
  const data=new Map([['schoolCode.chat',{conversationId:'legacy',messages:[{role:'user',text:'old'}],model:'gpt-5.6-sol',agent:'agent-old',mode:'default'}]]);
  const storage={get:(k,d)=>data.has(k)?data.get(k):d,update:async(k,v)=>data.set(k,v)};const store=new SessionStore(storage);const old=store.active;assert.equal(old.conversationId,'legacy');assert.equal(old.messages.length,1);
  const fresh=store.create('새 프로젝트');assert.notEqual(fresh.id,old.id);assert.equal(store.active.id,fresh.id);fresh.messages.push({role:'user',text:'new'});await store.save();assert.equal(data.get('schoolCode.sessions').length,2);
  store.select(old.id);assert.equal(store.active.messages[0].text,'old');store.rename(old.id,'이전 세션');assert.equal(store.active.title,'이전 세션');store.remove(fresh.id);assert.equal(store.sessions.length,1);
});

test('session goals are normalized and stay isolated per session',async()=>{
  const data=new Map([['schoolCode.sessions',[{id:'one',title:'첫 작업',goal:{text:'  버그 수정  ',status:'active',createdAt:10,updatedAt:10}} ,{id:'two',title:'둘째 작업'}]],['schoolCode.activeSession','one']]);
  const storage={get:(k,d)=>data.has(k)?data.get(k):d,update:async(k,v)=>data.set(k,v)};
  const store=new SessionStore(storage);
  assert.deepEqual(store.active.goal,{text:'버그 수정',status:'active',createdAt:10,updatedAt:10});
  store.create('새 세션');assert.equal(store.active.goal,null);
  store.select('one');store.active.goal={text:'완료할 목표',status:'completed',createdAt:20,updatedAt:30};await store.save();
  const saved=data.get('schoolCode.sessions').find(item=>item.id==='one');assert.equal(saved.goal.status,'completed');assert.equal(data.get('schoolCode.sessions').find(item=>item.id==='two').goal,null);
});

test('sessions support plans, duplication and portable export',()=>{
  const storage={get:()=>undefined,update:async()=>{}};const store=new SessionStore(storage);store.setPlan(store.active.id,['조사','검증']);const copy=store.duplicate(store.active.id);assert.equal(copy.plan.length,2);assert.equal(copy.conversationId,null);assert.equal(store.export(copy.id).title,copy.title);const imported=store.import({title:'외부 세션',messages:[{role:'user',text:'hello'}]});assert.equal(imported.length,1);assert.equal(store.active.title,'외부 세션');
});
