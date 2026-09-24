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

for (const type of ['projectChoose', 'attachFiles', 'attachFolder', 'attachmentsClear', 'connectorFolder', 'connect', 'refresh', 'mcpAdd', 'mcpSite', 'notionConfigure', 'notionDisconnect', 'unityConfigure', 'unityEditorConfigure', 'copyMcpAuth', 'relayRepair', 'new', 'sessionNew', 'sessionRename', 'selection', 'relay', 'disconnectRelay', 'stop']) {
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

function mcpStatus(status) {
  return ({ connected: '연결됨', configured: '설정됨', error: '오류', 'not-connected': '연결 안 됨', 'not-configured': '미설정', disabled: '꺼짐' })[status] || status || '미설정';
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
    const status = document.createElement('span'); status.className = 'mcp-status' + (item.status === 'error' ? ' error' : ''); status.textContent = mcpStatus(item.enabled === false ? 'disabled' : item.status);
    info.append(title, desc, status);
    const actions = document.createElement('div'); actions.className = 'mcp-actions';
    const configure = document.createElement('button'); configure.textContent = item.id === 'unity-cli' ? '경로 설정' : item.id === 'unity-editor' ? '자동 준비' : item.configured ? '설정' : '연결'; configure.title = item.description; configure.disabled = !!m.busy; configure.addEventListener('click', () => vscode.postMessage({ type: 'mcpConfigure', id: item.id }));
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

function send() {
  const message = $('prompt').value.trim(), value = $('model').value || $('agent').value;
  const uploads = draftUploads.filter(item => item.status === 'ready' && item.file_id).map(item => ({ file_id: item.file_id, filename: item.filename, file_type: item.file_type, file_size: item.file_size || item.size }));
  if (draftUploads.some(item => item.status === 'uploading')) { localNotice('파일 업로드가 끝날 때까지 잠시 기다려 주세요.'); return; }
  if (draftUploads.some(item => item.status === 'failed')) { localNotice('업로드에 실패한 첨부 파일을 빼거나 다시 추가해 주세요.'); return; }
  if ((!message && !uploads.length) || busy || !value) return;
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
  const sessionConnection = $('sessionConnection');
  if (sessionConnection) sessionConnection.textContent = m.error || (m.connected ? '학교 브라우저 연결됨' : '브라우저 연결 대기');
  const sessionConnect = $('sessionConnect');
  if (sessionConnect) sessionConnect.textContent = m.connected ? '설정' : '연결';
  $('relayState').textContent = m.relay ? '학교 Workspace 연결됨 · 도구별 승인' : m.relayError ? `학교 Workspace 오류 · ${m.relayError}` : '학교 Workspace 연결 안 됨';
  const tool = $('toolState');
  if (!tool || !m.projectContext) return;
  const project = m.projectContext.project, agent = m.state?.agent;
  tool.classList.toggle('offline', !project || !m.relay);
  tool.textContent = !project ? '프로젝트를 선택하세요' : m.relay ? (agent ? 'MCP 프로젝트 도구 사용 가능 · ' + (m.agents?.find(a => a.id === agent)?.name || '에이전트') : 'MCP 연결됨 · MCP 에이전트를 선택하세요') : 'MCP 중계 연결 필요';
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
    } else {
      const p = document.createElement('div'); p.className = 'prose'; p.textContent = chunk; container.append(p);
    }
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
    if (m.status) { const status = document.createElement('small'); status.className = 'message-status'; status.textContent = m.status + (m.model ? ' · ' + m.model : ''); article.append(status); }
    if (m.attachments?.length) renderAttachments(article, m.attachments);
    main.append(article);
  }
  main.scrollTop = main.scrollHeight;
}

window.addEventListener('message', ({ data: m }) => {
  if (m.type === 'state') {
    models = m.models || []; agents = m.agents || []; messages = m.state.messages || []; busy = m.busy; connection(m); renderSessions(m); renderMcp(m);
    $('model').replaceChildren(); $('agent').replaceChildren();
    const modelPlaceholder = document.createElement('option'); modelPlaceholder.value = ''; modelPlaceholder.textContent = '모델을 선택하세요'; $('model').append(modelPlaceholder);
    for (const x of models.filter(x => x.available !== false)) { const option = document.createElement('option'); option.value = x.id; option.textContent = x.display_name || x.name || x.id; $('model').append(option); }
    const agentPlaceholder = document.createElement('option'); agentPlaceholder.value = ''; agentPlaceholder.textContent = '에이전트를 선택하세요'; $('agent').append(agentPlaceholder);
    for (const x of agents) { const option = document.createElement('option'); option.value = x.id; option.textContent = x.name || x.id; $('agent').append(option); }
    $('model').value = m.state.model || ''; $('agent').value = m.state.agent || '';
    $('mode').value = m.state.mode; $('approvalMode').value = m.state.approvalMode || 'ask'; $('contextCompaction').checked = m.state.contextCompaction === true; $('compactionThreshold').value = String(m.state.compactionThreshold || 60000); $('compactionThreshold').disabled = !$('contextCompaction').checked || busy; $('mode').disabled = !!m.state.agent || busy; $('approvalMode').disabled = busy; $('contextCompaction').disabled = busy; $('model').disabled = busy; $('agent').disabled = busy; $('send').disabled = busy; $('new').disabled = busy; $('sessionNew').disabled = busy; $('sessionRename').disabled = busy; $('stop').hidden = !busy; uploadDropzone.classList.toggle('disabled', busy); uploadDropzone.setAttribute('aria-disabled', busy ? 'true' : 'false'); renderDraftUploads(); renderProject(m); render();
  }
  if (m.type === 'stream') { const last = messages.at(-1); if (last?.role === 'assistant') { last.text = m.text; last.status = m.status; render(); } }
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
