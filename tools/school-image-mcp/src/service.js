import fs from 'node:fs/promises';
import path from 'node:path';
import { BridgeError, checkStatus, safePath, home } from './common.js';
import { parseSSE } from './sse.js';
import { Transport } from './transport.js';

export class ImageService {
  constructor(transport = new Transport(), options = {}) {
    this.transport = transport;
    this.outputRoot = options.outputRoot || process.env.ALLOWED_OUTPUT_ROOT || path.join(home,'artifacts');
    this.referenceRoot = options.referenceRoot || process.env.ALLOWED_REFERENCE_ROOT || this.outputRoot;
    this.busy = false;
  }
  async json(route, options) {
    const r = await this.transport.request(route,options); checkStatus(r.status);
    try { return JSON.parse(r.text); } catch { throw new BridgeError('GENERATION_FAILED'); }
  }
  async listModels() {
    const data = await this.json('/models');
    return { models:(data.items || []).map(m=>({id:m.id,display_name:m.display_name,available:m.available,supports_vision:m.supports_vision,capabilities:m.capabilities})), default_selection:data.default_selection };
  }
  async quota() {
    const d = await this.json('/usage/remaining');
    const fields = ['daily_limit','monthly_limit','daily_used','monthly_used','daily_remaining','monthly_remaining','is_daily_exceeded','is_monthly_exceeded','course_pool_total','course_pool_used','course_pool_remaining'];
    return Object.fromEntries(fields.filter(k=>typeof d[k]==='number'||typeof d[k]==='boolean').map(k=>[k,d[k]]));
  }
  async outputPath(output, overwrite = false) {
    await fs.mkdir(this.outputRoot,{recursive:true});
    const dest = await safePath(output,this.outputRoot);
    if (!/\.png$/i.test(dest)) throw new BridgeError('INVALID_OUTPUT_PATH','Output must end in .png.');
    if (!overwrite) { try {await fs.access(dest); throw new BridgeError('OUTPUT_EXISTS','Choose a new filename or pass overwrite=true.');} catch(e) {if(e.code!=='ENOENT')throw e;} }
    return dest;
  }
  async download({file_id,output_path,overwrite=false}) {
    if (!/^[a-zA-Z0-9-]+$/.test(file_id)) throw new BridgeError('DOWNLOAD_FAILED');
    const dest = await this.outputPath(output_path,overwrite);
    const r = await this.transport.request(`/chat/uploads/${file_id}`,{binary:true});
    checkStatus(r.status,'DOWNLOAD_FAILED');
    const buffer = Buffer.from(r.base64||'','base64');
    if (buffer.length > 32*1024*1024 || !buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new BridgeError('DOWNLOAD_FAILED','The attachment is not a PNG image.');
    // Revalidate immediately before writing, and never truncate an existing file.
    await safePath(dest,this.outputRoot);
    if (overwrite) {
      // unlink + exclusive creation avoids following a swapped symlink/hardlink.
      await fs.unlink(dest).catch(e=>{if(e.code!=='ENOENT')throw e;});
    }
    let handle;
    try { handle = await fs.open(dest,'wx',0o600); await handle.writeFile(buffer); }
    catch(e) { throw new BridgeError(e.code==='EEXIST'?'OUTPUT_EXISTS':'DOWNLOAD_FAILED'); }
    finally {await handle?.close();}
    return {success:true,file_id,saved_path:dest,bytes:buffer.length};
  }
  async upload(input) {
    const p = await safePath(input,this.referenceRoot,{read:true});
    const bytes = await fs.readFile(p);
    if (bytes.length>20*1024*1024) throw new BridgeError('UPLOAD_FAILED','Reference image exceeds 20 MiB.');
    let type;
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type='image/png';
    else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255) type='image/jpeg';
    else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') type='image/webp';
    else throw new BridgeError('UPLOAD_FAILED','Reference must be PNG, JPEG, or WebP.');
    const r = await this.transport.request('/chat/upload',{method:'POST',upload:{filename:path.basename(p),type,base64:bytes.toString('base64')}});
    checkStatus(r.status,'UPLOAD_FAILED');
    let d;try{d=JSON.parse(r.text);}catch{throw new BridgeError('UPLOAD_FAILED');}
    if (!d.file_id) throw new BridgeError('UPLOAD_FAILED');
    return {file_id:d.file_id,filename:d.filename,file_type:d.file_type,file_size:d.file_size};
  }
  async recover(conversationId, messageId, previousIds = new Set()) {
    // The UI uses a separate messages endpoint; metadata alone need not contain messages.
    const conversation = await this.json(`/conversations/${conversationId}`);
    let messages = conversation.messages;
    if (!Array.isArray(messages)) {
      const data = await this.json(`/conversations/${conversationId}/messages`);
      messages = Array.isArray(data)?data:data.items;
    }
    const candidates = (messages||[]).filter(m=>m.role==='assistant' && (messageId?m.id===messageId:!previousIds.has(m.id)) && m.attachments?.some(a=>a.file_type==='image'));
    // Never silently use a stale image or an ambiguous concurrent assistant result.
    if (candidates.length !== 1) throw new BridgeError('NO_ATTACHMENT');
    return {...candidates[0],message_id:candidates[0].id,conversation_id:conversationId};
  }
  async generate({prompt,output_path,conversation_id,locale='ko',reference_images=[],overwrite=false}) {
    if(this.busy) throw new BridgeError('BRIDGE_BUSY');
    this.busy=true;
    try {
      await this.outputPath(output_path,overwrite);
      if (!prompt?.trim() || prompt.length>30000 || reference_images.length>4 || conversation_id&&!/^[a-zA-Z0-9-]+$/.test(conversation_id)) throw new BridgeError('INVALID_REQUEST');
      let previousIds = new Set();
      if(conversation_id) {const data=await this.json(`/conversations/${conversation_id}/messages`);previousIds=new Set((Array.isArray(data)?data:data.items||[]).map(m=>m.id));}
      const attachments=[];
      // Validate every reference before uploading any.
      for(const input of reference_images) await safePath(input,this.referenceRoot,{read:true});
      for(const input of reference_images) attachments.push(await this.upload(input));
      const body = {message:prompt,model_id:'gpt-5.6-sol',locale};
      if(conversation_id)body.conversation_id=conversation_id;
      if(attachments.length){body.file_ids=attachments.map(a=>a.file_id);body.file_attachments=attachments;}
      let r;
      try {r=await this.transport.request('/chat/completions',{method:'POST',body});}
      catch(e) {throw e;} // Never retry a possibly billed generation.
      checkStatus(r.status);
      const events=parseSSE(r.text||'');
      const error=events.find(e=>e.type==='error');
      if(error)throw new BridgeError((error.error_code||error.code)==='RATE_LIMIT_EXCEEDED'?'QUOTA_EXHAUSTED':'GENERATION_FAILED');
      const start=events.find(e=>e.type==='start');
      let done=events.findLast(e=>e.type==='done');
      const cid=done?.conversation_id||start?.conversation_id||conversation_id;
      const mid=done?.message_id||start?.message_id;
      if(!done?.attachments?.some(a=>a.file_type==='image')) {
        if(!cid)throw new BridgeError('NO_ATTACHMENT','No conversation ID was received; do not retry automatically.');
        done=await this.recover(cid,mid,previousIds);
      }
      const images=done.attachments.filter(a=>a.file_type==='image');
      const saved=await this.download({file_id:images[0].file_id,output_path,overwrite});
      return {...saved,conversation_id:cid,message_id:done.message_id||mid,filename:images[0].filename,model:done.model_id||events.findLast(e=>e.model_id)?.model_id,attachments:images.map(a=>({file_id:a.file_id,filename:a.filename}))};
    } finally {this.busy=false;}
  }
}
