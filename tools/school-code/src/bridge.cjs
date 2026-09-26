const http=require('node:http');
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const {ORIGIN,validRoute}=require('./protocol.cjs');
function authorized(req,key){const a=Buffer.from(req.headers.authorization||''),b=Buffer.from('Bearer '+key);return a.length===b.length&&timingSafeEqual(a,b);}
function json(res,status,data){if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}}
// Binary attachment previews are returned as Base64 JSON from the browser worker.
// Keep the limit bounded while allowing a 32 MiB image plus JSON/Base64 overhead.
async function readJson(req,max=48*1024*1024){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Error('Request too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
class BrowserBridge {
  constructor(port=18766){this.port=port;this.key=randomBytes(32).toString('hex');this.jobs=new Map();this.lastSeen=0;}
  get connected(){return Date.now()-this.lastSeen<35000;}
  async start(){this.server=http.createServer((req,res)=>this.handle(req,res).catch(()=>json(res,400,{error:'Bad request'})));this.server.requestTimeout=35*60*1000;this.server.headersTimeout=35*60*1000+5000;await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.port,'127.0.0.1',resolve);});this.port=this.server.address().port;}
  async handle(req,res){
    if(req.headers.host!==`127.0.0.1:${this.port}`)return json(res,403,{error:'Forbidden'});
    const site=req.headers.origin;
    if(req.url==='/extension-status'&&req.method==='GET'&&(!site||/^chrome-extension:\/\/[a-p]{32}$/.test(site))){if(site)res.setHeader('Access-Control-Allow-Origin',site);return json(res,200,{broker:true,product:'school-code',connected:this.connected,pending:this.jobs.size,port:this.port});}
    if(site!==ORIGIN)return json(res,403,{error:'Forbidden'});
    res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    if(req.url==='/connector/connect'&&req.method==='GET')return json(res,200,{workerToken:this.key,product:'school-code'});
    if(!authorized(req,this.key))return json(res,401,{error:'Unauthorized'});
    this.lastSeen=Date.now();
    if(req.url==='/worker/heartbeat'&&req.method==='GET')return json(res,200,{ok:true});
    if(req.url==='/worker/poll'&&req.method==='GET'){
      if(this.poll){clearTimeout(this.poll.timer);json(this.poll.res,200,{});}
      const poll={res,timer:setTimeout(()=>{if(this.poll===poll)this.poll=null;json(res,200,{});},20000)};this.poll=poll;
      res.on('close',()=>{if(this.poll===poll){clearTimeout(poll.timer);this.poll=null;}});this.dispatch();return;
    }
    if(req.method!=='POST')return json(res,404,{});
    const data=await readJson(req),job=this.jobs.get(data.id);
    if(req.url==='/worker/status')return json(res,200,{cancelled:!job});
    if(req.url!=='/worker/event')return json(res,404,{});
    if(job){
      try{if(data.error)job.finish(Error(String(data.error).slice(0,300)));else{if(typeof data.chunk==='string')job.onChunk?.(data.chunk);if(data.done)job.finish(null,data.result);}}catch(e){job.finish(e);}
    }
    json(res,200,{ok:true});
  }
  dispatch(){if(!this.poll)return;const job=[...this.jobs.values()].find(j=>!j.delivered);if(!job)return;job.delivered=true;clearTimeout(this.poll.timer);json(this.poll.res,200,job.payload);this.poll=null;}
  request(route,{method='GET',body,stream=false,binary=false,upload=false,onChunk,signal}={}){
    if(!validRoute(route,method))return Promise.reject(Error('허용되지 않은 경로'));
    if(!this.connected)return Promise.reject(Error('학교 브라우저를 연결하세요. 상단 브라우저 연결 버튼을 사용하세요.'));
    if(this.jobs.size>=4)return Promise.reject(Error('브라우저 요청이 처리 중입니다.'));
    if(signal?.aborted)return Promise.reject(Error('중단됨'));
    return new Promise((resolve,reject)=>{const id=randomUUID();const abort=()=>finish(Error('중단됨'));const timer=setTimeout(()=>finish(Error('학교 응답 시간 초과. 자동 재전송하지 않습니다.')),35*60*1000);
      const finish=(err,data)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.jobs.delete(id);err?reject(err):resolve(data);};
      this.jobs.set(id,{payload:{id,route,method,body,stream,binary,upload},onChunk,finish,delivered:false});signal?.addEventListener('abort',abort,{once:true});this.dispatch();
    });
  }
  dispose(){for(const j of this.jobs.values())j.finish(Error('연결 종료'));if(this.poll){clearTimeout(this.poll.timer);json(this.poll.res,200,{});this.poll=null;}this.server?.close();this.server?.closeAllConnections();}
}
module.exports={BrowserBridge,authorized,json,readJson};
