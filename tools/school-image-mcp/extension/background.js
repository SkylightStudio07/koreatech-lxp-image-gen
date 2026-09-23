const CHAT_URL = 'https://ai.koreatech.ac.kr/AiCA/chat';
const DEFAULT_PORT = 18765;

function isSchoolChat(url) {
  return typeof url === 'string' && /^https:\/\/ai\.koreatech\.ac\.kr\/AiCA\/chat(?:\/|$)/.test(url);
}

async function getPort() {
  const { bridgePort } = await chrome.storage.local.get('bridgePort');
  return Number.isInteger(bridgePort) && bridgePort >= 1024 && bridgePort <= 65535
    ? bridgePort
    : DEFAULT_PORT;
}

async function injectWorker(tabId, url) {
  if (!isSchoolChat(url)) return false;
  const port = await getPort();
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: configuredPort => { window.__schoolImageConnectorPort = configuredPort; },
      args: [port]
    });
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['worker-main.js'] });
    return true;
  } catch {
    return false;
  }
}

async function schoolTabs() {
  return chrome.tabs.query({ url: 'https://ai.koreatech.ac.kr/AiCA/chat*' });
}

async function workerState(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const state = window.__schoolImageWorker;
        if (!state) return null;
        return {
          active: Boolean(state.active),
          connected: Boolean(state.connected),
          completed: Number(state.completed || 0),
          lastError: state.lastError || null,
          lastSeen: state.lastSeen || null,
          port: state.port || null
        };
      }
    });
    return result || null;
  } catch {
    return null;
  }
}

async function bridgeStatus(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/extension-status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) throw new Error('OFFLINE');
    return await response.json();
  } catch {
    return { broker: false, connected: false, pending: 0, port };
  }
}

async function getStatus() {
  const port = await getPort();
  const tabs = await schoolTabs();
  const tab = tabs.find(item => item.active) || tabs[0];
  const [bridge, worker] = await Promise.all([
    bridgeStatus(port),
    tab?.id === undefined ? null : workerState(tab.id)
  ]);
  return {
    port,
    bridge,
    tab: tab ? { id: tab.id, active: Boolean(tab.active), url: tab.url } : null,
    worker
  };
}

async function updateBadge() {
  const status = await getStatus();
  let text = '—';
  let color = '#64748b';
  let title = '학교 채팅 탭을 열어 주세요';
  if (!status.bridge.broker) {
    text = '!'; color = '#dc2626'; title = '로컬 브리지가 꺼져 있습니다';
  } else if (status.worker?.connected && status.bridge.connected) {
    text = 'ON'; color = '#16a34a'; title = '학교 이미지 MCP 연결됨';
  } else if (status.tab) {
    text = '…'; color = '#d97706'; title = '학교 탭에 연결하는 중입니다';
  }
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
  return status;
}

async function reconnectAll() {
  const tabs = await schoolTabs();
  await Promise.all(tabs.map(tab => tab.id === undefined ? false : injectWorker(tab.id, tab.url)));
  await new Promise(resolve => setTimeout(resolve, 400));
  return updateBadge();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !isSchoolChat(tab.url)) return;
  injectWorker(tabId, tab.url).then(updateBadge);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isSchoolChat(tab.url)) await injectWorker(tabId, tab.url);
  } finally {
    await updateBadge();
  }
});

chrome.tabs.onRemoved.addListener(() => updateBadge());
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'refresh-status') updateBadge(); });
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-status', { periodInMinutes: 0.5 });
  reconnectAll();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('refresh-status', { periodInMinutes: 0.5 });
  reconnectAll();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'get-status') return getStatus();
    if (message?.type === 'reconnect') return reconnectAll();
    if (message?.type === 'open-chat') {
      const [tab] = await schoolTabs();
      if (tab?.id !== undefined) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
        await injectWorker(tab.id, tab.url);
      } else {
        await chrome.tabs.create({ url: CHAT_URL });
      }
      return { ok: true };
    }
    if (message?.type === 'set-port') {
      const port = Number(message.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
      await chrome.storage.local.set({ bridgePort: port });
      return reconnectAll();
    }
    return { error: 'UNKNOWN_MESSAGE' };
  })().then(sendResponse).catch(error => sendResponse({ error: error.message || 'FAILED' }));
  return true;
});

updateBadge();
