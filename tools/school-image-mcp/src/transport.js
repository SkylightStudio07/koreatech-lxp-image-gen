import { origin, apiPrefix, validRoute, BridgeError, loadConnection } from './common.js';

export class Transport {
  constructor() { this.mode = process.env.SCHOOL_AI_TRANSPORT || 'browser'; }
  async request(route, { method = 'GET', body, upload, binary = false } = {}) {
    if (!validRoute(route, method)) throw new BridgeError('INVALID_REQUEST');
    try {
      if (this.mode === 'browser') {
        const c = await loadConnection();
        const response = await fetch(`http://127.0.0.1:${c.port}/rpc`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${c.clientToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ route, method, body, upload, binary }), signal: AbortSignal.timeout(660000)
        });
        const result = await response.json();
        if (result.error) throw new BridgeError(result.error);
        return result;
      }
      if (process.env.SCHOOL_AI_BASE_URL && process.env.SCHOOL_AI_BASE_URL !== origin) throw new BridgeError('INVALID_REQUEST');
      if (!process.env.SCHOOL_AI_COOKIE) throw new BridgeError('AUTH_EXPIRED');
      const headers = { Cookie: process.env.SCHOOL_AI_COOKIE, 'X-CSRF-Token': process.env.SCHOOL_AI_CSRF_TOKEN || '', Origin: origin, 'X-Client-Env': 'production' };
      let payload;
      if (upload) { payload = new FormData(); payload.append('file', new Blob([Buffer.from(upload.base64, 'base64')], { type: upload.type }), upload.filename); }
      else if (body) { headers['Content-Type'] = 'application/json'; headers.Accept = 'text/event-stream'; payload = JSON.stringify(body); }
      const r = await fetch(origin + apiPrefix + route, { method, headers, body: payload, redirect: 'error', signal: AbortSignal.timeout(600000) });
      const result={status:r.status,contentType:r.headers.get('content-type')||''};
      if(binary)result.base64=Buffer.from(await r.arrayBuffer()).toString('base64');
      else {
        result.text=''; const decoder=new TextDecoder();
        try {for await(const chunk of r.body){result.text+=decoder.decode(chunk,{stream:true});if(result.text.length>16*1024*1024)throw new Error('oversize');}result.text+=decoder.decode();}
        catch {result.interrupted=true;}
      }
      return result;
    } catch (e) { if (e instanceof BridgeError) throw e; throw new BridgeError('NETWORK_ERROR'); }
  }
}
