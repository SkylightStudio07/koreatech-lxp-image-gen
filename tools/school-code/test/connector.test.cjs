const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {BrowserBridge}=require('../src/bridge.cjs');
const {browserWorker}=require('../src/browser-worker.cjs');
test('connector handshake rejects foreign origins and exposes no token through status',async t=>{
 const b=new BrowserBridge(0);await b.start();t.after(()=>b.dispose());const base=`http://127.0.0.1:${b.port}`;
 for(const origin of [undefined,'https://evil.example','chrome-extension://'+'a'.repeat(32)]){const r=await fetch(base+'/connector/connect',{headers:origin?{Origin:origin}:{}});assert.equal(r.status,403);}
 const r=await fetch(base+'/connector/connect',{headers:{Origin:'https://ai.koreatech.ac.kr'}});assert.equal(r.status,200);assert.equal((await r.json()).workerToken,b.key);
 const status=await (await fetch(base+'/extension-status')).json();assert.equal(status.product,'school-code');assert(!JSON.stringify(status).includes(b.key));
});
test('Chrome worker refreshes bridge tokens, does not duplicate, and keeps school auth out of localhost',async()=>{
 const calls=[],timers=new Set();let connectCount=0,polls=0;const window={};let finish;
 const ready=new Promise(r=>finish=r);
 const fakeFetch=async(url,opts={})=>{calls.push({url,headers:{...opts.headers}});
   if(url.endsWith('/connector/connect'))return {ok:true,json:async()=>({product:'school-code',workerToken:++connectCount===1?'old':'new'})};
   if(url.endsWith('/worker/poll')){polls++;if(polls===1)return {ok:false};if(polls===2)return {ok:true,json:async()=>({id:'job',route:'/models',method:'GET'})};window.__schoolCodeWorker.stop();finish();return {ok:true,json:async()=>({})};}
   if(url==='/api/AiCA/api/v1/models')return {ok:true,text:async()=>'{"items":[]}'};
   return {ok:true,json:async()=>({})};
 };
 const context={window,location:{origin:'https://ai.koreatech.ac.kr'},document:{cookie:'csrf_token=school-only'},fetch:fakeFetch,AbortController,AbortSignal,TextDecoder,alert:()=>{},setTimeout:(f)=>setTimeout(f,1),setInterval:f=>{const t=setInterval(f,10000);timers.add(t);return t;},clearInterval:t=>{clearInterval(t);timers.delete(t);}};
 const running=vm.runInNewContext(`(${browserWorker.toString()})(18766)`,context);
 await ready;await running;for(const t of timers)clearInterval(t);
 assert.equal(connectCount,2);assert.equal(calls.filter(c=>c.url.endsWith('/worker/poll'))[1].headers.Authorization,'Bearer new');
 assert.equal(calls.find(c=>c.url==='/api/AiCA/api/v1/models').headers['X-CSRF-Token'],'school-only');
 assert(calls.filter(c=>c.url.startsWith('http:')).every(c=>!JSON.stringify(c).includes('school-only')));
 const existing={active:true,port:18766};context.window.__schoolCodeWorker=existing;const before=calls.length;await vm.runInNewContext(`(${browserWorker.toString()})(18766)`,context);assert.equal(calls.length,before);
});
