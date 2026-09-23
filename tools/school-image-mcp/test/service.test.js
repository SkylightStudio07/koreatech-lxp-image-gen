import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSSE } from '../src/sse.js';
import { ImageService } from '../src/service.js';
import { safePath,safeError,BridgeError } from '../src/common.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=','base64');
test('SSE supports named events, CRLF, multiline JSON and missing final newline',()=>{
  const events=parseSSE(': heartbeat\r\nevent: start\r\ndata: {"conversation_id":"c"}\r\n\r\nevent: done\ndata: {"attachments":\ndata: [{"file_id":"f"}]}');
  assert.equal(events[0].type,'start');assert.equal(events[1].attachments[0].file_id,'f');
  assert.deepEqual(parseSSE('data: junk\n\ndata: [DONE]\n\n'),[]);
});
test('paths reject traversal, outside root, ADS and symlinks; writes reject overwrite',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-mcp-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const p of ['../outside.png',path.join(root,'..','outside.png'),'x.png:secret']) await assert.rejects(safePath(p,root));
  const transport={request:async()=>({status:200,base64:png.toString('base64')})};
  const svc=new ImageService(transport,{outputRoot:root});await svc.download({file_id:'f',output_path:'a.png'});
  await assert.rejects(svc.download({file_id:'f',output_path:'a.png'}),{code:'OUTPUT_EXISTS'});
  await svc.download({file_id:'f',output_path:'a.png',overwrite:true});
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'school-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.symlink(outside,path.join(root,'link'),'junction');await assert.rejects(safePath('link/x.png',root),{code:'INVALID_OUTPUT_PATH'});
});
test('fresh generation omits conversation ID and sends observed upload schema',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-gen-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'ref.png'),png);
  const calls=[]; const transport={request:async(route,options)=>{calls.push({route,options});
    if(route==='/chat/upload')return {status:200,text:JSON.stringify({file_id:'ref-id',filename:'ref.png',file_type:'image',file_size:png.length})};
    if(route==='/chat/completions')return {status:200,text:'data: {"type":"start","conversation_id":"new-c","message_id":"new-m","model_id":"gpt-image-2"}\n\ndata: {"type":"done","attachments":[{"file_id":"out","file_type":"image"}]}\n\n'};
    return {status:200,base64:png.toString('base64')};}};
  const svc=new ImageService(transport,{outputRoot:root}); const result=await svc.generate({prompt:'create blue icon',reference_images:['ref.png'],output_path:'out.png'});
  const body=calls.find(c=>c.route==='/chat/completions').options.body;
  assert.equal('conversation_id' in body,false);assert.deepEqual(body.file_ids,['ref-id']);assert.equal(body.file_attachments[0].file_type,'image');assert.equal(result.model,'gpt-image-2');
});
test('incomplete stream recovers matching message and refuses stale or ambiguous images',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-fallback-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const old={id:'old',role:'assistant',attachments:[{file_id:'old-image',file_type:'image'}]};
  const fresh={id:'new',role:'assistant',model_id:'gpt-image-2',attachments:[{file_id:'new-image',file_type:'image'}]};
  let messages=[old,fresh];
  const svc=new ImageService({request:async(route)=>{
    if(route==='/chat/completions')return {status:200,text:'data: {"type":"start","conversation_id":"c","message_id":"new"}\n\ndata: malformed'};
    if(route.endsWith('/messages'))return {status:200,text:JSON.stringify(messages)};
    if(route.startsWith('/conversations/'))return {status:200,text:'{}'};
    assert.equal(route,'/chat/uploads/new-image');return {status:200,base64:png.toString('base64')};
  }},{outputRoot:root});
  assert.equal((await svc.generate({prompt:'create',output_path:'fallback.png'})).file_id,'new-image');
  messages=[old];await assert.rejects(svc.recover('c','new'),{code:'NO_ATTACHMENT'});
  messages=[old,fresh];await assert.rejects(svc.recover('c',null),{code:'NO_ATTACHMENT'});
  assert.equal((await svc.recover('c',null,new Set(['old']))).message_id,'new');
});
test('errors never expose remote authentication details; HTTP errors classify',async()=>{
  assert.equal(JSON.stringify(safeError(new Error('Cookie=SECRET'))).includes('SECRET'),false);
  for(const [status,code] of [[401,'AUTH_EXPIRED'],[403,'CSRF_INVALID'],[429,'QUOTA_EXHAUSTED']]) {
    const svc=new ImageService({request:async()=>({status,text:'secret'})});
    await assert.rejects(svc.quota(),{code});
  }
});
