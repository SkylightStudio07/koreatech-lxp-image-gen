const byId = id => document.getElementById(id);

function mark(id, state) { byId(id).className = `dot ${state}`; }

function render(status) {
  if (!status || status.error) {
    mark('summaryDot', 'bad');
    byId('summaryTitle').textContent = '상태를 읽지 못했습니다';
    byId('summaryText').textContent = '확장 프로그램을 새로고침해 주세요.';
    return;
  }
  const broker = Boolean(status.bridge?.broker);
  const tab = Boolean(status.tab);
  const worker = Boolean(status.worker?.connected && status.bridge?.connected);
  byId('port').value = status.port;
  mark('bridgeDot', broker ? 'ok' : 'bad');
  byId('bridgeValue').textContent = broker ? `실행 중 · ${status.port}` : '꺼짐';
  mark('tabDot', tab ? 'ok' : 'warn');
  byId('tabValue').textContent = tab ? '열림' : '없음';
  mark('workerDot', worker ? 'ok' : (tab && broker ? 'warn' : 'bad'));
  byId('workerValue').textContent = worker ? `연결됨 · ${status.worker.completed}건` : '연결 안 됨';
  if (broker && tab && worker) {
    mark('summaryDot', 'ok');
    byId('summaryTitle').textContent = '사용할 준비가 됐어요';
    byId('summaryText').textContent = 'Claude Code에서 바로 이미지를 요청할 수 있습니다.';
  } else if (!broker) {
    mark('summaryDot', 'bad');
    byId('summaryTitle').textContent = '브리지를 먼저 실행해 주세요';
    byId('summaryText').textContent = 'start-school-image.bat을 실행하면 자동으로 연결됩니다.';
  } else if (!tab) {
    mark('summaryDot', 'warn');
    byId('summaryTitle').textContent = '학교 채팅 탭이 필요해요';
    byId('summaryText').textContent = '아래 버튼으로 채팅을 열고 로그인해 주세요.';
  } else {
    mark('summaryDot', 'warn');
    byId('summaryTitle').textContent = '자동 연결 중이에요';
    byId('summaryText').textContent = '잠시 기다리거나 지금 다시 연결을 눌러 주세요.';
  }
}

const message = payload => chrome.runtime.sendMessage(payload);
const refresh = async () => render(await message({ type: 'get-status' }));
async function busy(button, task) { button.disabled = true; try { await task(); } finally { button.disabled = false; } }

byId('openChat').addEventListener('click', event => busy(event.currentTarget, async () => {
  await message({ type: 'open-chat' }); setTimeout(refresh, 700);
}));
byId('reconnect').addEventListener('click', event => busy(event.currentTarget, async () => {
  render(await message({ type: 'reconnect' }));
}));
byId('savePort').addEventListener('click', event => busy(event.currentTarget, async () => {
  render(await message({ type: 'set-port', port: Number(byId('port').value) }));
}));

refresh();
