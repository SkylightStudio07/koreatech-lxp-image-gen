// Isolated localhost integration test. No school requests or account quota.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {home} from '../src/common.js';
const state=await fs.mkdtemp(path.join(os.tmpdir(),'school-bridge-test-'));
const port=28765,base=`http://127.0.0.1:${port}`,origin='https://ai.koreatech.ac.kr';
const child=spawn(process.execPath,[path.join(home,'src/broker.js')],{env:{...process.env,SCHOOL_AI_STATE_DIR:state,SCHOOL_AI_BRIDGE_PORT:String(port)},stdio:'ignore',windowsHide:true});
try {
  let connection;
  for(let i=0;i<50;i++){try{connection=JSON.parse(await fs.readFile(path.join(state,'connection.json'),'utf8'));break;}catch{await delay(100);}}
  assert.ok(connection,'Test broker did not start');
  assert.equal((await fetch(base+'/connect',{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(base+'/rpc',{method:'POST',body:'{}'})).status,403);
  const {workerToken}=await(await fetch(base+'/connect',{headers:{Origin:origin}})).json();
  const workerHeaders={Origin:origin,Authorization:`Bearer ${workerToken}`,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/heartbeat',{headers:workerHeaders})).status,200);
  const health=await fetch(base+'/health',{headers:{Authorization:`Bearer ${connection.clientToken}`}});
  assert.equal((await health.json()).connected,true);
  const poll=fetch(base+'/poll',{headers:workerHeaders});await delay(100);
  const rpc=fetch(base+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${connection.clientToken}`,'Content-Type':'application/json'},body:JSON.stringify({route:'/models',method:'GET'})});
  const job=await(await poll).json();assert.equal(job.route,'/models');
  await fetch(base+'/result',{method:'POST',headers:workerHeaders,body:JSON.stringify({id:job.id,result:{status:200,text:'{"items":[]}'}})});
  assert.equal((await(await rpc).json()).text,'{"items":[]}');
  const invalid=await fetch(base+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${connection.clientToken}`,'Content-Type':'application/json'},body:JSON.stringify({route:'/auth/logout',method:'POST'})});assert.equal(invalid.status,400);
  console.log('PASS: localhost RPC roundtrip, separate keys, origin rejection, authentication, endpoint allowlist');
}finally{child.kill();await delay(200);await fs.rm(state,{recursive:true,force:true});}
