import {loadConnection,safeError} from '../src/common.js';
try {
  const c=await loadConnection();
  const r=await fetch(`http://127.0.0.1:${c.port}/health`,{headers:{Authorization:`Bearer ${c.clientToken}`},signal:AbortSignal.timeout(3000)});
  if(!r.ok)throw new Error('Broker failed');
  console.log(JSON.stringify({broker:true,...await r.json()}));
}catch(e){console.log(JSON.stringify({broker:false,...safeError(e)}));process.exitCode=1;}
