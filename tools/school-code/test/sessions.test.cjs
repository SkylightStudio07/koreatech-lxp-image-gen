const test=require('node:test'),assert=require('node:assert/strict');
const {SessionStore}=require('../src/sessions.cjs');
test('session store migrates legacy chat and keeps conversations isolated',async()=>{
  const data=new Map([['schoolCode.chat',{conversationId:'legacy',messages:[{role:'user',text:'old'}],model:'gpt-5.6-sol',agent:'agent-old',mode:'default'}]]);
  const storage={get:(k,d)=>data.has(k)?data.get(k):d,update:async(k,v)=>data.set(k,v)};const store=new SessionStore(storage);const old=store.active;assert.equal(old.conversationId,'legacy');assert.equal(old.messages.length,1);
  const fresh=store.create('새 프로젝트');assert.notEqual(fresh.id,old.id);assert.equal(store.active.id,fresh.id);fresh.messages.push({role:'user',text:'new'});await store.save();assert.equal(data.get('schoolCode.sessions').length,2);
  store.select(old.id);assert.equal(store.active.messages[0].text,'old');store.rename(old.id,'이전 세션');assert.equal(store.active.title,'이전 세션');store.remove(fresh.id);assert.equal(store.sessions.length,1);
});
