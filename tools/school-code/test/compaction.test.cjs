const test=require('node:test');
const assert=require('node:assert/strict');
const {compactMessages,estimateMessages,buildSummary}=require('../src/compaction.cjs');

test('optional context compaction keeps recent turns and creates a bounded summary',()=>{
  const messages=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',text:`turn-${i} `+'x'.repeat(3000)}));
  assert(estimateMessages(messages)>16000);const result=compactMessages(messages,16000);assert(result);assert.equal(result.messages[0].role,'compaction');assert(result.removed>0);assert(result.messages.at(-1).text.includes('turn-11'));assert(result.summary.length<=18000);
});

test('short conversations are left untouched',()=>{
  const messages=[{role:'user',text:'짧은 질문'},{role:'assistant',text:'짧은 답변'}];assert.equal(compactMessages(messages,16000),null);assert.match(buildSummary(messages),/이전 대화 요약/);
});
