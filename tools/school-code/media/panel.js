const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
let busy = false;
let messages = [];
let models = [];
let agents = [];
let sessions = [];
let attachmentPreviews = new Map();
let draftUploads = [];
const MAX_UPLOADS = 5;
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const MAX_UPLOAD_TOTAL = 64 * 1024 * 1024;

for (const type of ['projectChoose', 'attachFiles', 'attachFolder', 'attachmentsClear', 'connectorFolder', 'connect', 'refresh', 'mcpAdd', 'mcpSite', 'notionConfigure', 'notionDisconnect', 'unityConfigure', 'unityEditorConfigure', 'copyMcpAuth', 'relayRepair', 'new', 'sessionNew', 'sessionRename', 'goalSet', 'goalClear', 'selection', 'relay', 'disconnectRelay', 'stop']) {
  $(type).addEventListener('click', () => vscode.postMessage({ type: type === 'new' ? 'sessionNew' : type }));
}

function setScreen(screen) {
  const settings = screen === 'settings';
  $('settingsView').hidden = !settings;
  $('sessionView').hidden = settings;
  $('settingsTab').classList.toggle('active', settings);
  $('sessionTab').classList.toggle('active', !settings);
  document.body.classList.toggle('settings-mode', settings);
  document.body.classList.toggle('session-mode', !settings);
}
setScreen('session');
$('sessionTab').addEventListener('click', () => setScreen('session'));
$('settingsTab').addEventListener('click', () => setScreen('settings'));
$('sessionConnect').addEventListener('click', () => { if ($('dot').classList.contains('online')) setScreen('settings'); else vscode.postMessage({ type: 'connect' }); });

function makeClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatBytes(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function localNotice(text) { $('notice').hidden = false; $('notice').textContent = text; }

async function fileBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}

function renderDraftUploads() {
  const list = $('draftUploads');
  if (!list) return;
  list.replaceChildren();
  list.hidden = !draftUploads.length;
  for (const item of draftUploads) {
    const row = document.createElement('div'); row.className = `draft-upload ${item.status || ''}`;
    if (item.file?.type?.startsWith('image/')) {
      const thumb = document.createElement('img'); thumb.className = 'draft-upload-thumb'; thumb.alt = ''; thumb.src = item.previewUrl || (item.previewUrl = URL.createObjectURL(item.file)); row.append(thumb);
    }
    const info = document.createElement('span'); info.className = 'draft-upload-info';
    const name = document.createElement('strong'); name.textContent = item.filename; name.title = item.filename;
    const status = document.createElement('small'); status.textContent = item.status === 'uploading' ? '업로드 중…' : item.status === 'failed' ? item.error : `첨부됨 · ${formatBytes(item.size)}`;
    info.append(name, status);
    const remove = document.createElement('button'); remove.className = 'draft-upload-remove'; remove.textContent = '×'; remove.title = '첨부 빼기'; remove.disabled = busy && item.status !== 'uploading';
    remove.addEventListener('click', () => { vscode.postMessage({ type: 'uploadRemove', clientId: item.clientId, file_id: item.file_id }); draftUploads = draftUploads.filter(x => x.clientId !== item.clientId); if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); renderDraftUploads(); });
    row.append(info, remove); list.append(row);
  }
}

async function addUploadFiles(files) {
  const incoming = [...files].filter(Boolean);
  if (!incoming.length || busy) return;
  if (draftUploads.length + incoming.length > MAX_UPLOADS) { localNotice(`채팅 첨부는 최대 ${MAX_UPLOADS}개까지 가능합니다.`); return; }
  const currentTotal = draftUploads.reduce((total, item) => total + item.size, 0);
  let added = 0;
  for (const file of incoming) {
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) { localNotice(`${file.name || '파일'}: 32 MiB 이하 파일만 첨부할 수 있습니다.`); continue; }
    if (currentTotal + added + file.size > MAX_UPLOAD_TOTAL) { localNotice('한 번에 첨부하는 파일은 합계 64 MiB 이하만 가능합니다.'); break; }
    const item = { clientId: makeClientId(), file, filename: file.name || 'pasted-file', mime: file.type || 'application/octet-stream', size: file.size, status: 'uploading' };
    draftUploads.push(item); added += file.size;
    try { item.base64 = await fileBase64(file); vscode.postMessage({ type: 'uploadAdd', clientId: item.clientId, filename: item.filename, mime: item.mime, base64: item.base64 }); }
    catch (e) { item.status = 'failed'; item.error = '파일을 읽지 못했습니다.'; }
  }
  renderDraftUploads();
}

const uploadDropzone = $('uploadDropzone'), uploadPicker = $('uploadPicker'), composer = document.querySelector('.composer');
uploadDropzone.addEventListener('click', () => uploadPicker.click());
uploadDropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); uploadPicker.click(); } });
uploadPicker.addEventListener('change', e => { void addUploadFiles(e.target.files); e.target.value = ''; });
for (const target of [uploadDropzone, composer]) {
  target.addEventListener('dragover', e => { e.preventDefault(); uploadDropzone.classList.add('drag-over'); });
  target.addEventListener('dragleave', e => { if (!target.contains(e.relatedTarget)) uploadDropzone.classList.remove('drag-over'); });
  target.addEventListener('drop', e => { e.preventDefault(); uploadDropzone.classList.remove('drag-over'); void addUploadFiles(e.dataTransfer.files); });
}
$("prompt").addEventListener('paste', e => {
  const direct = [...(e.clipboardData?.files || [])];
  const fromItems = [...(e.clipboardData?.items || [])].map(item => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
  const files = [...new Map([...direct, ...fromItems].map(file => [`${file.name}:${file.size}:${file.lastModified}`, file])).values()].filter(file => file.type || file.size);
  if (files.length) { e.preventDefault(); void addUploadFiles(files); }
});

function softenWheelScroll(element) {
  if (!element) return;
  element.addEventListener('wheel', e => {
    if (e.ctrlKey || e.shiftKey || !e.deltaY) return;
    const nested = e.target.closest?.('pre, #attachmentList');
    if (nested && nested.scrollHeight > nested.clientHeight) return;
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientHeight : 1;
    const delta = Math.max(-120, Math.min(120, e.deltaY * unit * 0.55));
    if (!delta) return;
    e.preventDefault();
    element.scrollTop += delta;
  }, { passive: false });
}
softenWheelScroll($('messages'));
softenWheelScroll($('settingsView'));

function mcpStatus(status) {
  return ({ connected: '연결됨', pending: '승인 대기 중', configured: '설정됨', error: '오류', 'not-connected': '연결 안 됨', 'not-configured': '미설정', disabled: '꺼짐' })[status] || status || '미설정';
}

function renderMcp(m) {
  const list = $('mcpList');
  if (!list) return;
  list.replaceChildren();
  const catalog = m.mcpCatalog || [];
  if (!catalog.length) { const empty = document.createElement('p'); empty.className = 'mcp-empty'; empty.textContent = '등록된 MCP가 없습니다.'; list.append(empty); return; }
  for (const item of catalog) {
    const row = document.createElement('div'); row.className = 'mcp-row' + (item.enabled === false ? ' disabled' : '');
    const info = document.createElement('div'); info.className = 'mcp-info';
    const title = document.createElement('strong'); title.textContent = item.name;
    const desc = document.createElement('small'); desc.textContent = item.error ? `${item.description} · ${item.error}` : item.description;
    const status = document.createElement('span'); status.className = 'mcp-status' + (item.status === 'error' ? ' error' : '') + (item.status === 'pending' ? ' pending' : ''); status.textContent = mcpStatus(item.enabled === false ? 'disabled' : item.status);
    info.append(title, desc, status);
    const actions = document.createElement('div'); actions.className = 'mcp-actions';
    const configure = document.createElement('button'); configure.textContent = item.id === 'unity-cli' || item.id === 'git-cli' ? '경로 설정' : item.id === 'unity-editor' ? '자동 준비' : item.configured ? '설정' : '연결'; configure.title = item.description; configure.disabled = !!m.busy || (item.id === 'school-workspace' && !!m.relayBusy); configure.addEventListener('click', () => vscode.postMessage({ type: 'mcpConfigure', id: item.id }));
    actions.append(configure);
    if (item.configured) {
      const toggle = document.createElement('button'); toggle.textContent = item.enabled === false ? '켜기' : '끄기'; toggle.disabled = !!m.busy; toggle.addEventListener('click', () => vscode.postMessage({ type: 'mcpToggle', id: item.id, enabled: item.enabled === false })); actions.append(toggle);
      const remove = document.createElement('button'); remove.textContent = '해제'; remove.disabled = !!m.busy; remove.addEventListener('click', () => vscode.postMessage({ type: 'mcpRemove', id: item.id })); actions.append(remove);
    }
    row.append(info, actions); list.append(row);
  }
}

function renderSessions(m) {
  sessions = m.sessions || [];
  const list = $('sessionList');
  if (!list) return;
  list.replaceChildren();
  for (const s of sessions) {
    const row = document.createElement('div');
    row.className = 'session-row' + (s.active ? ' active' : '');
    const button = document.createElement('button');
    button.className = 'session-item';
    button.textContent = s.title;
    button.title = `${s.messageCount}개 메시지`;
    button.disabled = !!m.busy;
    button.addEventListener('click', () => vscode.postMessage({ type: 'sessionSelect', id: s.id }));
    const remove = document.createElement('button');
    remove.className = 'session-remove';
    remove.textContent = '×';
    remove.title = '대화 삭제';
    remove.disabled = !!m.busy || sessions.length < 2;
    remove.addEventListener('click', e => { e.stopPropagation(); vscode.postMessage({ type: 'sessionDelete', id: s.id }); });
    row.append(button, remove);
    list.append(row);
  }
}

function renderProject(m) {
  const c = m.projectContext || {}, p = c.project, files = c.files || [], locked = !!(m.busy || m.projectBusy);
  $('projectName').textContent = p?.name || '프로젝트를 선택하세요';
  $('projectPath').textContent = p?.path || '열린 폴더 또는 다른 디렉터리를 연결할 수 있습니다.';
  $('projectPath').title = p?.path || '';
  $('projectChoose').textContent = p ? '변경' : '프로젝트 선택';
  for (const id of ['projectChoose', 'attachFiles', 'attachFolder', 'attachmentsClear']) $(id).disabled = locked;
  $('send').disabled = locked;
  $('attachmentSection').hidden = !files.length;
  $('attachmentSummary').textContent = `${files.length}개 파일 · ${(c.chars || 0).toLocaleString()}자`;
  $('attachmentList').replaceChildren();
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'attachment';
    const preview = document.createElement('button'), remove = document.createElement('button');
    preview.className = 'attachment-name';
    preview.textContent = f.path;
    preview.title = `${f.chars.toLocaleString()}자 · 첨부 내용 보기`;
    preview.disabled = locked;
    preview.addEventListener('click', () => vscode.postMessage({ type: 'attachmentPreview', path: f.path }));
    remove.textContent = '×';
    remove.setAttribute('aria-label', f.path + ' 첨부 빼기');
    remove.disabled = locked;
    remove.addEventListener('click', () => vscode.postMessage({ type: 'attachmentRemove', path: f.path }));
    row.append(preview, remove);
    $('attachmentList').append(row);
  }
}

function choices() {
  return { model: $('model').value, agent: $('agent').value, mode: $('mode').value, approvalMode: $('approvalMode').value, contextCompaction: $('contextCompaction').checked, compactionThreshold: Number($('compactionThreshold').value) };
}

function renderGoal(goal, busyState = false) {
  const bar = $('goalBar'), text = $('goalText'), clear = $('goalClear');
  if (!bar || !text) return;
  const active = !!goal?.text;
  bar.classList.toggle('completed', goal?.status === 'completed');
  text.textContent = active ? goal.text + (goal.status === 'completed' ? ' · 완료' : '') : '설정되지 않음';
  text.title = active ? goal.text : '';
  if (clear) clear.disabled = busyState || !active;
  $('goalSet').disabled = busyState;
}

function send() {
  const message = $('prompt').value.trim(), value = $('model').value || $('agent').value;
  const localCommand = /^\/goal(?:\s|$)/i.test(message);
  const uploads = draftUploads.filter(item => item.status === 'ready' && item.file_id).map(item => ({ file_id: item.file_id, filename: item.filename, file_type: item.file_type, file_size: item.file_size || item.size }));
  if (draftUploads.some(item => item.status === 'uploading')) { localNotice('파일 업로드가 끝날 때까지 잠시 기다려 주세요.'); return; }
  if (draftUploads.some(item => item.status === 'failed')) { localNotice('업로드에 실패한 첨부 파일을 빼거나 다시 추가해 주세요.'); return; }
  if ((!message && !uploads.length) || busy || (!value && !localCommand)) return;
  vscode.postMessage({ type: 'send', message, uploads, ...choices() });
}

$('send').addEventListener('click', send);
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
function selectionChanged(kind) {
  if (kind === 'model' && $('model').value) $('agent').value = '';
  if (kind === 'agent' && $('agent').value) { $('model').value = ''; $('mode').value = 'default'; }
  $('mode').disabled = !!$('agent').value;
  vscode.postMessage({ type: 'choices', ...choices() });
}
$('model').addEventListener('change', () => selectionChanged('model'));
$('agent').addEventListener('change', () => selectionChanged('agent'));
$('mode').addEventListener('change', () => vscode.postMessage({ type: 'choices', ...choices() }));
$('approvalMode').addEventListener('change', () => vscode.postMessage({ type: 'choices', ...choices() }));
$('contextCompaction').addEventListener('change', () => { $('compactionThreshold').disabled = !$('contextCompaction').checked; vscode.postMessage({ type: 'choices', ...choices() }); });
$('compactionThreshold').addEventListener('change', () => vscode.postMessage({ type: 'choices', ...choices() }));

function connection(m) {
  $('dot').className = m.connected ? 'online' : '';
  $('connection').textContent = m.error || (m.connected ? '학교 브라우저 연결됨' : '브라우저 연결 대기');
  const browserConnect = $('connect');
  if (browserConnect) { browserConnect.disabled = !!m.browserBusy; browserConnect.textContent = m.browserBusy ? '연결 여는 중…' : '브라우저 연결'; }
  const relayButton = $('relay');
  if (relayButton) { relayButton.disabled = !!m.relayBusy; relayButton.textContent = m.relayBusy ? 'Workspace 연결 중…' : 'Workspace 연결 / 재연결'; }
  const relayRepair = $('relayRepair');
  if (relayRepair) relayRepair.disabled = !!m.relayBusy;
  const sessionConnection = $('sessionConnection');
  if (sessionConnection) sessionConnection.textContent = m.error || (m.connected ? '학교 브라우저 연결됨' : '브라우저 연결 대기');
  const sessionConnect = $('sessionConnect');
  if (sessionConnect) sessionConnect.textContent = m.connected ? '설정' : '연결';
  $('relayState').textContent = m.relay ? '학교 Workspace 연결됨 · 도구별 승인' : m.relayPending ? `브라우저 승인 대기 중${m.relayPairCode ? ` · 코드 ${m.relayPairCode}` : ''}` : m.relayError ? `학교 Workspace 오류 · ${m.relayError}` : '학교 Workspace 연결 안 됨';
  const tool = $('toolState');
  if (!tool || !m.projectContext) return;
  const project = m.projectContext.project, agent = m.state?.agent;
  tool.classList.toggle('offline', !project || !m.relay);
  tool.textContent = !project ? '프로젝트를 선택하세요' : m.relay ? (agent ? 'MCP 프로젝트 도구 사용 가능 · ' + (m.agents?.find(a => a.id === agent)?.name || '에이전트') : 'MCP 연결됨 · MCP 에이전트를 선택하세요') : 'MCP 중계 연결 필요';
}

function renderInline(container, text) {
  const pattern = /(\*\*|__)(.+?)\1|~~(.+?)~~|(`[^`\n]+`)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(\*|_)([^*_\n]+)\7/g;
  let last = 0, match;
  while ((match = pattern.exec(String(text || '')))) {
    if (match.index > last) container.append(document.createTextNode(String(text).slice(last, match.index)));
    if (match[2] !== undefined) { const el = document.createElement('strong'); el.textContent = match[2]; container.append(el); }
    else if (match[3] !== undefined) { const el = document.createElement('del'); el.textContent = match[3]; container.append(el); }
    else if (match[4] !== undefined) { const el = document.createElement('code'); el.className = 'md-code'; el.textContent = match[4].slice(1, -1); container.append(el); }
    else if (match[5] !== undefined) { const el = document.createElement('a'); el.href = match[6]; el.target = '_blank'; el.rel = 'noopener noreferrer'; el.textContent = match[5]; container.append(el); }
    else { const el = document.createElement('em'); el.textContent = match[8]; container.append(el); }
    last = match.index + match[0].length;
  }
  if (last < String(text || '').length) container.append(document.createTextNode(String(text).slice(last)));
}

function renderMarkdownBlocks(container, text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const isSpecial = line => /^\s{0,3}#{1,6}\s+/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || /^\s*>/.test(line) || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const heading = lines[i].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { const el = document.createElement(`h${heading[1].length}`); renderInline(el, heading[2]); container.append(el); i++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])) { container.append(document.createElement('hr')); i++; continue; }
    const firstUnordered = lines[i].match(/^\s*[-*+]\s+(.+)$/), firstOrdered = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
    if (firstUnordered || firstOrdered) {
      const list = document.createElement(firstUnordered ? 'ul' : 'ol');
      while (i < lines.length) {
        const item = lines[i].match(firstUnordered ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        const li = document.createElement('li'); renderInline(li, item[1]); list.append(li); i++;
      }
      container.append(list); continue;
    }
    if (/^\s*>/.test(lines[i])) {
      const quote = document.createElement('blockquote');
      while (i < lines.length && /^\s*>/.test(lines[i])) { const line = lines[i].replace(/^\s*>\s?/, ''); renderInline(quote, line); if (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) quote.append(document.createElement('br')); i++; }
      container.append(quote); continue;
    }
    const paragraph = document.createElement('p');
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) { renderInline(paragraph, lines[i]); if (i + 1 < lines.length && lines[i + 1].trim() && !isSpecial(lines[i + 1])) paragraph.append(document.createElement('br')); i++; }
    if (paragraph.childNodes.length) container.append(paragraph);
  }
}

function renderText(container, text) {
  const chunks = String(text || '').split(/(```[^\n]*\n[\s\S]*?```)/g);
  for (const chunk of chunks) {
    if (chunk.startsWith('```')) {
      const first = chunk.indexOf('\n'), code = chunk.slice(first + 1, -3), wrap = document.createElement('div'), label = document.createElement('div'), pre = document.createElement('pre'), button = document.createElement('button');
      const language = chunk.slice(3, first).trim().toLowerCase();
      label.className = 'code-label';
      label.textContent = language || 'code';
      button.textContent = '코드 복사';
      button.addEventListener('click', () => navigator.clipboard.writeText(code).catch(() => {}));
      label.append(button);
      if (language === 'svg' && /^\s*<svg(?:\s|>)/i.test(code) && code.length <= 2 * 1024 * 1024 && !/<script\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']https?:/i.test(code)) {
        const bytes = new TextEncoder().encode(code); let raw = '';
        for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const figure = document.createElement('figure'), img = document.createElement('img');
        figure.className = 'inline-svg-preview'; img.src = 'data:image/svg+xml;base64,' + btoa(raw); img.alt = 'SVG 생성 결과'; figure.append(img); wrap.append(figure);
      }
      pre.textContent = code; wrap.append(label, pre); container.append(wrap);
    } else { const prose = document.createElement('div'); prose.className = 'prose'; renderMarkdownBlocks(prose, chunk); container.append(prose); }
  }
}

function renderAttachments(container, attachments) {
  const section = document.createElement('section');
  section.className = 'message-attachments';
  const heading = document.createElement('small');
  heading.className = 'attachment-heading';
  heading.textContent = `첨부 파일 ${attachments.length}개`;
  section.append(heading);
  for (const a of attachments) {
    const preview = attachmentPreviews.get(a.file_id), figure = document.createElement('figure');
    figure.className = 'message-attachment';
    if (preview) {
      const img = document.createElement('img');
      img.src = preview.dataUrl;
      img.alt = a.filename || '생성 이미지';
      img.loading = 'lazy';
      img.title = a.filename || '생성 이미지';
      figure.append(img);
      const caption = document.createElement('figcaption');
      caption.textContent = a.filename || '생성 이미지';
      figure.append(caption);
    } else {
      const pending = document.createElement('div');
      pending.className = 'attachment-pending';
      pending.textContent = `${a.filename || '파일'} · ${String(a.file_type || '').toLowerCase() === 'image' ? '미리보기 불러오는 중' : '첨부됨'}`;
      figure.append(pending);
    }
    section.append(figure);
  }
  container.append(section);
}

function render() {
  const main = $('messages');
  const previousScrollTop = main.scrollTop;
  const wasNearBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 64;
  main.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('section'), title = document.createElement('h2'), p = document.createElement('p');
    empty.className = 'empty'; title.textContent = '학교 AI와 함께 코딩하세요'; p.textContent = 'Astra · Fable · 학교 에이전트\n브라우저를 연결하고 모델을 불러오면 시작할 수 있어요.'; empty.append(title, p); main.append(empty);
  }
  for (const m of messages) {
    const article = document.createElement('article'); article.className = m.role;
    const title = document.createElement('div'); title.className = 'message-role'; title.textContent = m.role === 'user' ? '나' : m.role === 'compaction' ? '컨텍스트 압축' : '학교 AI';
    const content = document.createElement('div'); content.className = 'content'; renderText(content, m.text); article.append(title, content);
    if (m.contextFiles?.length) { const info = document.createElement('small'); info.className = 'message-context'; info.textContent = (m.project || '프로젝트') + ' · ' + m.contextFiles.map(f => f.path).join(', '); article.append(info); }
    const pending = m.role === 'assistant' && busy && m === messages.at(-1);
    if (m.status || pending) {
      const status = document.createElement('small'); status.className = 'message-status' + (pending ? ' pending' : '');
      if (pending) { const spinner = document.createElement('span'); spinner.className = 'status-spinner'; spinner.setAttribute('aria-hidden', 'true'); status.append(spinner, document.createTextNode('답변 생성 중…')); }
      else status.textContent = m.status + (m.model ? ' · ' + m.model : '');
      article.append(status);
    }
    if (m.steps?.length) {
      const timeline = document.createElement('ol'); timeline.className = 'message-steps';
      for (const step of m.steps) {
        const item = document.createElement('li');
        const label = step.label || step.type || '워크플로우 단계';
        item.textContent = `${label} · ${step.status || '진행'}`;
        if (step.detail) item.title = step.detail;
        if (step.type === 'node_error') item.className = 'error';
        timeline.append(item);
      }
      article.append(timeline);
    }
    if (m.attachments?.length) renderAttachments(article, m.attachments);
    main.append(article);
  }
  main.scrollTop = wasNearBottom ? main.scrollHeight : previousScrollTop;
}

window.addEventListener('message', ({ data: m }) => {
  if (m.type === 'state') {
    models = m.models || []; agents = m.agents || []; messages = m.state.messages || []; busy = m.busy; connection(m); renderSessions(m); renderMcp(m); renderGoal(m.state.goal, busy);
    $('model').replaceChildren(); $('agent').replaceChildren();
    const modelPlaceholder = document.createElement('option'); modelPlaceholder.value = ''; modelPlaceholder.textContent = '모델을 선택하세요'; $('model').append(modelPlaceholder);
    for (const x of models.filter(x => x.available !== false)) { const option = document.createElement('option'); option.value = x.id; option.textContent = x.display_name || x.name || x.id; $('model').append(option); }
    const agentPlaceholder = document.createElement('option'); agentPlaceholder.value = ''; agentPlaceholder.textContent = '에이전트를 선택하세요'; $('agent').append(agentPlaceholder);
    for (const x of agents) { const option = document.createElement('option'); option.value = x.id; option.textContent = (x.name || x.id) + (x.has_workflow ? ' · 워크플로우' : ''); $('agent').append(option); }
    $('model').value = m.state.model || ''; $('agent').value = m.state.agent || '';
    const hint = $('routingHint');
    if (hint) hint.textContent = m.state.agent ? '에이전트가 응답 모델과 도구를 결정합니다. 모델 선택은 보존되며 에이전트 해제 시 사용됩니다.' : m.state.model ? '선택한 모델로 직접 응답합니다.' : '모델과 에이전트를 각각 선택할 수 있습니다.';
    $('mode').value = m.state.mode; $('approvalMode').value = m.state.approvalMode || 'ask'; $('contextCompaction').checked = m.state.contextCompaction === true; $('compactionThreshold').value = String(m.state.compactionThreshold || 60000); $('compactionThreshold').disabled = !$('contextCompaction').checked || busy; $('mode').disabled = !!m.state.agent || busy; $('approvalMode').disabled = busy; $('contextCompaction').disabled = busy; $('model').disabled = busy; $('agent').disabled = busy; $('send').disabled = busy; $('new').disabled = busy; $('sessionNew').disabled = busy; $('sessionRename').disabled = busy; $('stop').hidden = !busy; uploadDropzone.classList.toggle('disabled', busy); uploadDropzone.setAttribute('aria-disabled', busy ? 'true' : 'false'); renderDraftUploads(); renderProject(m); render();
  }
  if (m.type === 'stream') { const last = messages.at(-1); if (last?.role === 'assistant') { last.text = m.text; last.status = m.status; last.steps = m.steps || last.steps; render(); } }
  if (m.type === 'attachmentPreviews') { attachmentPreviews = new Map((m.previews || []).map(p => [p.file_id, p])); render(); }
  if (m.type === 'connection') connection(m);
  if (m.type === 'selection') { $('prompt').value += m.text; $('prompt').focus(); }
  if (m.type === 'accepted') { $('prompt').value = ''; for (const item of draftUploads) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); draftUploads = []; renderDraftUploads(); }
  if (m.type === 'uploadStarted') { const item = draftUploads.find(x => x.clientId === m.clientId); if (item) { item.status = 'uploading'; renderDraftUploads(); } }
  if (m.type === 'uploadAdded') { const item = draftUploads.find(x => x.clientId === m.clientId); if (item) { Object.assign(item, m.attachment, { status: 'ready' }); renderDraftUploads(); } }
  if (m.type === 'uploadFailed') { const item = draftUploads.find(x => x.clientId === m.clientId); if (item) { item.status = 'failed'; item.error = m.error || '업로드 실패'; renderDraftUploads(); } }
  if (m.type === 'uploadRemoved') { const item = draftUploads.find(x => x.clientId === m.clientId); if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); draftUploads = draftUploads.filter(x => x.clientId !== m.clientId); renderDraftUploads(); }
  if (m.type === 'notice') { $('notice').hidden = false; $('notice').textContent = m.text; }
});

vscode.postMessage({ type: 'ready' });
