import { getSettings, normalizeBackendUrl, saveSettings } from '../shared/settings.js';

const backendUrlInput = document.getElementById('backendUrl');
const tokenInput = document.getElementById('token');
const statusEl = document.getElementById('status');

async function load() {
  const settings = await getSettings();
  backendUrlInput.value = settings.backendUrl;
  tokenInput.value = settings.token;
}

function setStatus(text, tone) {
  statusEl.textContent = text;
  statusEl.className = tone ?? '';
}

document.getElementById('save').addEventListener('click', async () => {
  await saveSettings({
    backendUrl: backendUrlInput.value,
    token: tokenInput.value,
  });
  backendUrlInput.value = normalizeBackendUrl(backendUrlInput.value);
  setStatus('已保存', 'ok');
});

document.getElementById('test').addEventListener('click', async () => {
  const backendUrl = normalizeBackendUrl(backendUrlInput.value);
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus('请先填写导入令牌', 'bad');
    return;
  }
  setStatus('正在连接…');
  try {
    const response = await fetch(`${backendUrl}/api/import/status`, {
      headers: { 'x-import-token': token },
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.success) {
      setStatus(`连接成功，存储目录：${payload.data.storageRoot}`, 'ok');
    } else {
      const message = payload?.error?.message || `HTTP ${response.status}`;
      setStatus(`连接失败：${message}`, 'bad');
    }
  } catch {
    setStatus('无法连接后端：请确认已启动 pnpm dev-mac，且地址正确', 'bad');
  }
});

void load();
