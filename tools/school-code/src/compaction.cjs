const DEFAULT_THRESHOLD=60000;
const MIN_THRESHOLD=16000;
const MAX_THRESHOLD=90000;
const KEEP_MESSAGES=8;
const MAX_SUMMARY_CHARS=18000;

function threshold(value){
  const n=Number(value);return Number.isFinite(n)?Math.min(MAX_THRESHOLD,Math.max(MIN_THRESHOLD,Math.trunc(n))):DEFAULT_THRESHOLD;
}
function textOf(message){
  if(!message||typeof message!=='object')return '';
  const role=message.role==='user'?'사용자':message.role==='compaction'?'압축 기록':'학교 AI';
  const text=typeof message.text==='string'?message.text:'';
  const context=Array.isArray(message.contextFiles)&&message.contextFiles.length?` (참조 파일: ${message.contextFiles.map(x=>x?.path).filter(Boolean).join(', ')})`:'';
  return `${role}${context}: ${text}`.replace(/\s+/g,' ').trim();
}
function estimateMessages(messages){return (Array.isArray(messages)?messages:[]).reduce((total,message)=>total+textOf(message).length+4,0);}
function buildSummary(messages){
  const lines=['[이전 대화 요약]','이 요약은 컨텍스트 압축으로 새 대화에 전달된 작업 기록입니다. 사실과 사용자의 요구를 우선하고, 모르는 내용은 추측하지 마세요.'];
  for(const message of Array.isArray(messages)?messages:[]){const line=textOf(message);if(!line)continue;const room=MAX_SUMMARY_CHARS-lines.join('\n').length-1;if(room<=0)break;lines.push(line.slice(0,Math.min(1600,room)));}
  lines.push('[이전 대화 요약 끝]');return lines.join('\n');
}
function compactMessages(messages,limit=DEFAULT_THRESHOLD){
  const input=Array.isArray(messages)?messages:[],max=threshold(limit);if(estimateMessages(input)<=max||input.length<=KEEP_MESSAGES)return null;
  let keepCount=Math.min(KEEP_MESSAGES,input.length-1),recent=input.slice(-keepCount),older=input.slice(0,-keepCount);
  while(keepCount>1&&estimateMessages(recent)>Math.floor(max*0.45)){keepCount--;recent=input.slice(-keepCount);older=input.slice(0,-keepCount);}
  const summary=buildSummary(older);return {summary,messages:[{role:'compaction',text:summary,status:'컨텍스트 압축됨'},...recent],removed:older.length,chars_before:estimateMessages(input),chars_after:estimateMessages(recent)+summary.length};
}
module.exports={DEFAULT_THRESHOLD,MIN_THRESHOLD,MAX_THRESHOLD,KEEP_MESSAGES,MAX_SUMMARY_CHARS,threshold,textOf,estimateMessages,buildSummary,compactMessages};
