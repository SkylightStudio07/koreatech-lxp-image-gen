void (async function browserWorker(port = 18765) {
  if (location.origin !== 'https://ai.koreatech.ac.kr') throw new Error('Open the school chat first.');
  const previous = window.__schoolImageWorker;
  if (previous?.active && previous.port === port) return;
  if (previous?.active) previous.active = false;
  const state = window.__schoolImageWorker = {
    active: true,
    connected: false,
    completed: previous?.completed || 0,
    lastError: null,
    lastSeen: null,
    port
  };
  const workerId = crypto.randomUUID();
  const base = `http://127.0.0.1:${port}`;
  let retryMs = 1000;
  while (state.active) {
    let heartbeat;
    try {
      const connected = await fetch(base + '/connect', { signal: AbortSignal.timeout(10000) });
      if (!connected.ok) throw new Error('BRIDGE_DISCONNECTED');
      const { workerToken } = await connected.json();
      const headers = { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json', 'X-Worker-Id': workerId };
      state.connected = true;
      state.lastError = null;
      state.lastSeen = Date.now();
      retryMs = 1000;
      heartbeat = setInterval(async () => {
        try {
          const r = await fetch(base + '/heartbeat', { headers, signal: AbortSignal.timeout(5000) });
          if (!r.ok) throw new Error('BRIDGE_DISCONNECTED');
          state.connected = true;
          state.lastError = null;
          state.lastSeen = Date.now();
        } catch {
          state.connected = false;
          state.lastError = 'BRIDGE_DISCONNECTED';
        }
      }, 10000);

      while (state.active) {
        const polled = await fetch(base + '/poll', { headers, signal: AbortSignal.timeout(30000) });
        if (!polled.ok) throw new Error('BRIDGE_DISCONNECTED');
        state.connected = true;
        state.lastError = null;
        state.lastSeen = Date.now();
        const job = await polled.json();
        if (!job.id) continue;
        let result;
        try {
          const { route, method, body, upload, binary } = job;
          const valid = method === 'GET' && (/^\/(models|usage\/remaining)$/.test(route) || /^\/conversations\/[a-zA-Z0-9-]+(?:\/messages)?$/.test(route) || /^\/chat\/uploads\/[a-zA-Z0-9-]+$/.test(route)) || method === 'POST' && ['/chat/upload','/chat/completions'].includes(route);
          if (!valid) throw new Error('INVALID_REQUEST');
          const h = { 'X-Client-Env': 'production' };
          const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='));
          if (csrf) h['X-CSRF-Token'] = csrf.slice(11);
          let payload;
          if (upload) {
            const bytes = Uint8Array.from(atob(upload.base64), c => c.charCodeAt(0));
            payload = new FormData(); payload.append('file', new Blob([bytes], { type: upload.type }), upload.filename);
          } else if (body) { h['Content-Type'] = 'application/json'; h.Accept = 'text/event-stream'; payload = JSON.stringify(body); }
          const r = await fetch('/api/AiCA/api/v1' + route, { method, headers: h, body: payload, credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(600000) });
          result = { status: r.status, contentType: r.headers.get('content-type') || '' };
          if (binary) {
            const bytes = new Uint8Array(await r.arrayBuffer());
            if (bytes.length > 32 * 1024 * 1024) throw new Error('DOWNLOAD_FAILED');
            let str = ''; for (let i=0;i<bytes.length;i+=8192) str += String.fromCharCode(...bytes.subarray(i,i+8192));
            result.base64 = btoa(str);
          } else {
            result.text=''; const reader=r.body.getReader(),decoder=new TextDecoder();
            try {while(true){const chunk=await reader.read();if(chunk.done)break;result.text+=decoder.decode(chunk.value,{stream:true});if(result.text.length>16*1024*1024){await reader.cancel();throw new Error('oversize');}}result.text+=decoder.decode();}
            catch {result.interrupted=true;}
          }
        } catch { result = { error: 'NETWORK_ERROR' }; }
        await fetch(base + '/result', { method: 'POST', headers, body: JSON.stringify({ id: job.id, result }), signal: AbortSignal.timeout(30000) });
        state.completed++;
      }
    } catch {
      state.connected = false;
      state.lastError = 'BRIDGE_DISCONNECTED';
      await new Promise(resolve => setTimeout(resolve, retryMs));
      retryMs = Math.min(retryMs * 2, 15000);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }
  state.active = false;
  state.connected = false;
})(window.__schoolImageConnectorPort || 18765);
