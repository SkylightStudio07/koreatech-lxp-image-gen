// Bundled into the Chrome connector. Authentication never leaves the school origin.
async function browserWorker(port,key) {
  if(location.origin!=='https://ai.koreatech.ac.kr'){alert('학교 AI에 로그인한 탭에서 실행하세요.');return;}
  if(window.__schoolCodeWorker?.active&&window.__schoolCodeWorker.port===port)return;
  window.__schoolCodeWorker?.stop();
  let active=true, current, polling;
  const base=`http://127.0.0.1:${port}`,headers={'Authorization':`Bearer ${key}`,'Content-Type':'application/json'};
  const state=window.__schoolCodeWorker={active:true,port,completed:0,connected:false,stop(){active=false;current?.abort();polling?.abort();clearInterval(heartbeat);state.connected=false;state.active=false;}};
  async function local(route,body,signal){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:signal||AbortSignal.timeout(15000)});if(!r.ok)throw Error('연결 실패');return r.json();}
  const heartbeat=setInterval(()=>local('/worker/heartbeat').then(()=>state.connected=true).catch(()=>state.connected=false),10000);
  while(active){try{
    if(!key){const r=await fetch(base+'/connector/connect',{signal:AbortSignal.timeout(5000),cache:'no-store'});if(!r.ok)throw Error('연결 실패');const c=await r.json();if(c.product!=='school-code'||typeof c.workerToken!=='string')throw Error('잘못된 브리지');key=c.workerToken;headers.Authorization=`Bearer ${key}`;}
    polling=new AbortController();const job=await local('/worker/poll',null,polling.signal);state.connected=true;if(!job.id)continue;
    current=new AbortController();let cancelBusy=false;
    const timer=setInterval(async()=>{if(cancelBusy)return;cancelBusy=true;try{const s=await local('/worker/status',{id:job.id});if(s.cancelled)current.abort();}catch{}finally{cancelBusy=false;}},1000);
    try{
      const valid=job.method==='GET'&&(/^\/(models|usage\/remaining|agents\?limit=50|agents\/public\?limit=50)$/.test(job.route)||/^\/conversations\/[a-zA-Z0-9-]+\/messages$/.test(job.route)||/^\/chat\/uploads\/[a-zA-Z0-9-]+$/.test(job.route))||job.method==='POST'&&(job.route==='/chat/completions'||job.route==='/chat/upload');
      if(!valid)throw Error('허용되지 않은 경로');
      const h={'X-Client-Env':'production'};const csrf=document.cookie.split('; ').find(c=>c.startsWith('csrf_token='));if(csrf)h['X-CSRF-Token']=csrf.slice(11);
      let requestBody;
      if(job.upload){
        if(job.route!=='/chat/upload'||job.method!=='POST'||!job.body||typeof job.body.base64!=='string')throw Error('업로드 요청이 올바르지 않습니다.');
        const encoded=job.body.base64;if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length>45*1024*1024)throw Error('업로드 데이터가 제한을 초과했습니다.');
        const raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        if(bytes.length===0||bytes.length>32*1024*1024)throw Error('업로드 파일은 32 MiB 이하만 지원합니다.');
        const form=new FormData();const filename=String(job.body.filename||'upload.bin').replace(/[\\/\u0000-\u001f]/g,'_').slice(0,240)||'upload.bin';const mime=String(job.body.mime||'application/octet-stream').slice(0,120)||'application/octet-stream';
        form.append('file',new Blob([bytes],{type:mime}),filename);requestBody=form;
      } else if(job.body){h['Content-Type']='application/json';h.Accept='text/event-stream';requestBody=JSON.stringify(job.body);}
      const r=await fetch('/api/AiCA/api/v1'+job.route,{method:job.method,credentials:'include',redirect:'error',headers:h,body:requestBody,signal:AbortSignal.any([current.signal,AbortSignal.timeout(600000)])});
      if(!r.ok){await local('/worker/event',{id:job.id,error:`HTTP ${r.status}${r.status===401?' — 학교 탭에서 다시 로그인하세요.':''}`});continue;}
      if(job.stream){const reader=r.body.getReader(),decoder=new TextDecoder();let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>8*1024*1024){await reader.cancel();throw Error('응답 크기 초과');}await local('/worker/event',{id:job.id,chunk:decoder.decode(value,{stream:true})});}const tail=decoder.decode();if(tail)await local('/worker/event',{id:job.id,chunk:tail});await local('/worker/event',{id:job.id,done:true});}
      else if(job.binary){const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>32*1024*1024)throw Error('응답 크기 초과');let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));await local('/worker/event',{id:job.id,result:{base64:btoa(raw),contentType:r.headers.get('content-type')||'',size:bytes.length},done:true});}
      else {const text=await r.text();if(text.length>4*1024*1024)throw Error('응답 크기 초과');await local('/worker/event',{id:job.id,result:JSON.parse(text),done:true});}
    }catch(e){await local('/worker/event',{id:job.id,error:e.name==='AbortError'?'중단됨':'학교 요청 실패 (로그인/네트워크를 확인하세요)'}).catch(()=>{});}finally{clearInterval(timer);current=null;state.completed++;}
  }catch{key=null;state.connected=false;if(active)await new Promise(r=>setTimeout(r,2000));}}
}
module.exports={browserWorker};
