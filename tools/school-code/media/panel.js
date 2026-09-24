const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
let busy = false;
let messages = [];
let models = [];
let agents = [];
let sessions = [];
let attachmentPreviews = new Map();

for (const type of ['projectChoose', 'attachFiles', 'attachFolder', 'attachmentsClear', 'connectorFolder', 'connect', 'refresh', 'mcpAdd', 'mcpSite', 'notionConfigure', 'notionDisconnect', 'unityConfigure', 'unityEditorConfigure', 'new', 'sessionNew', 'sessionRename', 'selection', 'relay', 'disconnectRelay', 'stop']) {
  $(type).addEventListener('click', () => vscode.postMessage({ type: type === 'new' ? 'sessionNew' : type }));
}

function mcpStatus(status) {
  return ({ connected: '연결됨', configured: '설정됨', 'not-connected': '연결 안 됨', 'not-configured': '미설정', disabled: '꺼짐' })[status] || status || '미설정';
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
    const desc = document.createElement('small'); desc.textContent = item.description;
    const status = document.createElement('span'); status.className = 'mcp-status'; status.textContent = mcpStatus(item.enabled === false ? 'disabled' : item.status);
    info.append(title, desc, status);
    const actions = document.createElement('div'); actions.className = 'mcp-actions';
    const configure = document.createElement('button'); configure.textContent = item.configured ? '설정' : '연결'; configure.title = item.description; configure.disabled = !!m.busy; configure.addEventListener('click', () => vscode.postMessage({ type: 'mcpConfigure', id: item.id }));
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
  if (!message || busy || !value) return;
  vscode.postMessage({ type: 'send', message, ...choices() });
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
  $('relayState').textContent = m.relay ? '외부 MCP 연결됨 · 도구별 승인' : '외부 MCP 연결 안 됨';
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
  heading.textContent = `생성 결과 ${attachments.length}개`;
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
      pending.textContent = `${a.filename || '이미지'} · 미리보기 불러오는 중`;
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
    $('mode').value = m.state.mode; $('approvalMode').value = m.state.approvalMode || 'ask'; $('contextCompaction').checked = m.state.contextCompaction === true; $('compactionThreshold').value = String(m.state.compactionThreshold || 60000); $('compactionThreshold').disabled = !$('contextCompaction').checked || busy; $('mode').disabled = !!m.state.agent || busy; $('approvalMode').disabled = busy; $('contextCompaction').disabled = busy; $('model').disabled = busy; $('agent').disabled = busy; $('send').disabled = busy; $('new').disabled = busy; $('sessionNew').disabled = busy; $('sessionRename').disabled = busy; $('stop').hidden = !busy; renderProject(m); render();
  }
  if (m.type === 'stream') { const last = messages.at(-1); if (last?.role === 'assistant') { last.text = m.text; last.status = m.status; render(); } }
  if (m.type === 'attachmentPreviews') { attachmentPreviews = new Map((m.previews || []).map(p => [p.file_id, p])); render(); }
  if (m.type === 'connection') connection(m);
  if (m.type === 'selection') { $('prompt').value += m.text; $('prompt').focus(); }
  if (m.type === 'accepted') $('prompt').value = '';
  if (m.type === 'notice') { $('notice').hidden = false; $('notice').textContent = m.text; }
});

vscode.postMessage({ type: 'ready' });
