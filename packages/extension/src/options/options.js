import {
  DEFAULT_PREFS,
  getPrefs,
  getSettings,
  normalizeBackendUrl,
  savePrefs,
  saveSettings,
} from '../shared/settings.js';
import {
  applyTheme,
  getThemeMode,
  setThemeMode,
  watchTheme,
} from '../shared/theme.js';

const backendUrlInput = document.getElementById('backendUrl');
const tokenInput = document.getElementById('token');
const statusEl = document.getElementById('status');
const saveStateEl = document.getElementById('saveState');
const minSizeSelect = document.getElementById('minSize');
const formatSelect = document.getElementById('format');
const groupModeButtons = [...document.querySelectorAll('[data-group-mode]')];
const themeButtons = [...document.querySelectorAll('[data-theme-mode]')];

let themeMode = 'system';
let prefs = { ...DEFAULT_PREFS };
let saveTimer = null;
let saveStateTimer = null;

function setStatus(text, tone) {
  statusEl.textContent = text;
  statusEl.className = tone ? `status ${tone}` : 'status';
}

function flashSaved(text = '已保存') {
  saveStateEl.textContent = text;
  saveStateEl.classList.add('is-visible');
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    saveStateEl.classList.remove('is-visible');
  }, 1600);
}

function setPressed(buttons, attribute, activeValue) {
  for (const button of buttons) {
    button.setAttribute(
      'aria-checked',
      button.getAttribute(attribute) === activeValue ? 'true' : 'false',
    );
  }
}

function applyThemeMode() {
  applyTheme(document.documentElement, themeMode);
  setPressed(themeButtons, 'data-theme-mode', themeMode);
}

async function persistSettings() {
  const backendUrl = normalizeBackendUrl(backendUrlInput.value);
  const token = tokenInput.value.trim();
  backendUrlInput.value = backendUrl;
  tokenInput.value = token;
  try {
    await saveSettings({ backendUrl, token });
    flashSaved();
  } catch (error) {
    flashSaved('保存失败');
    console.error(error);
  }
}

async function persistPrefs() {
  prefs = {
    minSize: Number(minSizeSelect.value) || 0,
    format: formatSelect.value,
    groupMode: prefs.groupMode,
  };
  try {
    await savePrefs(prefs);
    flashSaved();
  } catch (error) {
    flashSaved('保存失败');
    console.error(error);
  }
}

function scheduleSettingsSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void persistSettings(), 450);
}

backendUrlInput.addEventListener('input', scheduleSettingsSave);
tokenInput.addEventListener('input', scheduleSettingsSave);
backendUrlInput.addEventListener('blur', () => {
  clearTimeout(saveTimer);
  backendUrlInput.value = normalizeBackendUrl(backendUrlInput.value);
  void persistSettings();
});

minSizeSelect.addEventListener('change', () => void persistPrefs());
formatSelect.addEventListener('change', () => void persistPrefs());

for (const button of groupModeButtons) {
  button.addEventListener('click', () => {
    prefs.groupMode = button.getAttribute('data-group-mode') === 'domain' ? 'domain' : 'title';
    setPressed(groupModeButtons, 'data-group-mode', prefs.groupMode);
    void persistPrefs();
  });
}

for (const button of themeButtons) {
  button.addEventListener('click', async () => {
    themeMode = button.getAttribute('data-theme-mode') || 'system';
    applyThemeMode();
    await setThemeMode(themeMode);
    flashSaved('已切换外观');
  });
}

document.getElementById('test').addEventListener('click', async () => {
  const backendUrl = normalizeBackendUrl(backendUrlInput.value);
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus('请先填写导入令牌', 'is-bad');
    return;
  }
  setStatus('正在连接…');
  try {
    const response = await fetch(`${backendUrl}/api/import/status`, {
      headers: { 'x-import-token': token },
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.success) {
      setStatus(`连接成功，存储目录：${payload.data.storageRoot}`, 'is-ok');
    } else {
      const message = payload?.error?.message || `HTTP ${response.status}`;
      setStatus(`连接失败：${message}`, 'is-bad');
    }
  } catch {
    setStatus('无法连接后端：请确认已启动 pnpm dev-mac，且地址正确', 'is-bad');
  }
});

async function load() {
  const [settings, storedPrefs, storedTheme] = await Promise.all([
    getSettings(),
    getPrefs(),
    getThemeMode(),
  ]);
  backendUrlInput.value = settings.backendUrl;
  tokenInput.value = settings.token;

  prefs = storedPrefs;
  minSizeSelect.value = String(prefs.minSize);
  formatSelect.value = prefs.format;
  setPressed(groupModeButtons, 'data-group-mode', prefs.groupMode);

  themeMode = storedTheme;
  applyThemeMode();
  watchTheme(async () => {
    const next = await getThemeMode();
    if (next === themeMode) return;
    themeMode = next;
    applyThemeMode();
  });
}

void load();
