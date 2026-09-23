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
  const extensionStatus=await fetch(base+'/extension-status',{headers:{Origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}});
  assert.equal(extensionStatus.status,200);
  assert.equal((await extensionStatus.json()).broker,true);
  assert.equal((await fetch(base+'/rpc',{method:'POST',body:'{}'})).status,403);
  const {workerToken}=await(await fetch(base+'/connect',{headers:{Origin:origin}})).json();
  const workerHeaders={Origin:origin,Authorization:`Bearer ${workerToken}`,'Content-Type':'application/json','X-Worker-Id':'11111111-1111-4111-8111-111111111111'};
  assert.equal((await fetch(base+'/heartbeat',{headers:workerHeaders})).status,200);
  const health=await fetch(base+'/health',{headers:{Authorization:`Bearer ${connection.clientToken}`}});
  assert.equal((await health.json()).connected,true);
  const poll=fetch(base+'/poll',{headers:workerHeaders});await delay(100);
  const rpc=fetch(base+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${connection.clientToken}`,'Content-Type':'application/json'},body:JSON.stringify({route:'/models',method:'GET'})});
  const job=await(await poll).json();assert.equal(job.route,'/models');
  await fetch(base+'/result',{method:'POST',headers:workerHeaders,body:JSON.stringify({id:job.id,result:{status:200,text:'{"items":[]}'}})});
  assert.equal((await(await rpc).json()).text,'{"items":[]}');
  const secondHeaders={...workerHeaders,'X-Worker-Id':'22222222-2222-4222-8222-222222222222'};
  const polls=[fetch(base+'/poll',{headers:workerHeaders}),fetch(base+'/poll',{headers:secondHeaders})];await delay(100);
  const calls=[
    fetch(base+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${connection.clientToken}`,'Content-Type':'application/json'},body:JSON.stringify({route:'/models',method:'GET'})}),
    fetch(base+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${connection.clientToken}`,'Content-Type':'application/json'},body:JSON.stringify({route:'/usage/remaining',method:'GET'})})
  ];
  const assigned=await Promise.all(polls.map(async item=>(await item).json()));
  assert.deepEqual(new Set(assigned.map(item=>item.route)),new Set(['/models','/usage/remaining']));
  await Promise.all(assigned.map((item,index)=>fetch(base+'/result',{method:'POST',headers:index===0?workerHeaders:secondHeaders,body:JSON.stringify({id:item.id,result:{status:200,text:'{}'}})})));
  assert.deepEqual(await Promise.all(calls.map(async item=>(await item).status)),[200,200]);
  const invalid=await fetch(base+'/rpc',{method:'POST',headers:{Authorization:`Bearer ${connection.clientToken}`,'Content-Type':'application/json'},body:JSON.stringify({route:'/auth/logout',method:'POST'})});assert.equal(invalid.status,400);
  console.log('PASS: localhost RPC roundtrip, separate keys, origin rejection, authentication, endpoint allowlist');
}finally{child.kill();await delay(200);await fs.rm(state,{recursive:true,force:true});}
