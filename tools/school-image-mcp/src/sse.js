// Handles named events, JSON type fields, CRLF, multiline data, UTF-8 chunking,
// and a final unterminated event. Never returns/logs arbitrary server error text.
export function parseSSE(text) {
  const events = [];
  let event = 'message', data = [];
  function flush() {
    if (data.length) {
      const raw = data.join('\n');
      if (raw !== '[DONE]') {
        try { const value = JSON.parse(raw); events.push({ ...value, type: value.type || event }); } catch { /* fallback can recover */ }
      }
    }
    event = 'message'; data = [];
  }
  for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (!line) { flush(); continue; }
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  flush(); return events;
}
