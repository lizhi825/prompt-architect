const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, dialog, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV = process.argv.includes('--dev');
// 开机自启时由登录项传入 --hidden：静默驻留托盘，不弹窗，只等热键呼出
const START_HIDDEN = process.argv.includes('--hidden');
const D_KEYS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

const DEFAULT_CONFIG = {
  apiKey: '',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.3,
  hotkey: 'Alt+Space',
  autoLaunch: false,
  asr: {
    engine: 'browser',
    provider: 'openai',
    preset: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    apiKey: '',
    model: 'FunAudioLLM/SenseVoiceSmall',
    language: 'zh-CN',
  },
};

let win = null;
let tray = null;
let currentAbort = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw, asr: { ...DEFAULT_CONFIG.asr, ...(raw.asr || {}) } };
  } catch (_) {
    return { ...DEFAULT_CONFIG, asr: { ...DEFAULT_CONFIG.asr } };
  }
}
function saveConfig(patch) {
  const prev = loadConfig();
  const next = { ...prev, ...patch };
  if (patch.asr) next.asr = { ...prev.asr, ...patch.asr };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

const { buildSystem } = require('./system-prompt');

// ---------------- 开机自启动（Windows 写 HKCU Run，用户级，无需管理员） ----------------
function setAutoLaunch(on) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!on,
      path: process.execPath,
      args: on ? ['--hidden'] : [],
    });
    return true;
  } catch (e) {
    console.log('[PA] setLoginItemSettings failed:', e.message);
    return false;
  }
}
function getAutoLaunch() {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch (_) { return false; }
}

// ---------------- 窗口与托盘 ----------------
function showWindow(withClip) {
  if (!win) return;
  win.show();
  win.focus();
  let clip = '';
  if (withClip) {
    try { clip = clipboard.readText() || ''; } catch (_) {}
  }
  win.webContents.send('wake', { clipboard: clip.slice(0, 3000) });
}
function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else showWindow(true);
}
function openSettings() {
  showWindow(false);
  if (win) win.webContents.send('open-settings');
}

function createWindow() {
  win = new BrowserWindow({
    width: 448,
    height: 360,
    minWidth: 380,
    minHeight: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    console.log('[PA] renderer loaded');
    // 页面已加载完毕再注册热键，失败提示才能被渲染层收到
    setTimeout(registerHotkey, 200);
    win.webContents.send('autolaunch', getAutoLaunch());
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[PA] renderer gone:', d && d.reason));
  win.once('ready-to-show', () => {
    if (!START_HIDDEN) { win.show(); win.focus(); }
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });
  win.on('closed', () => { win = null; });
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const key = loadConfig().hotkey || 'Alt+Space';
  try {
    const ok = globalShortcut.register(key, toggleWindow);
    if (!ok && win) win.webContents.send('toast', `热键 ${key} 注册失败，可能已被占用`);
  } catch (e) {
    if (win) win.webContents.send('toast', `热键无效：${e.message}`);
  }
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'icon.ico'));
    if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico'));
    if (img.isEmpty()) img = nativeImage.createEmpty();
    tray = new Tray(img);
    tray.setToolTip('提示词架构师 · ' + (loadConfig().hotkey || 'Alt+Space') + ' 呼出');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示 / 隐藏  (' + (loadConfig().hotkey || 'Alt+Space') + ')', click: toggleWindow },
      { label: '打开设置', click: openSettings },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: getAutoLaunch(),
        click: (item) => {
          const ok = setAutoLaunch(item.checked);
          saveConfig({ autoLaunch: item.checked });
          if (win) win.webContents.send('autolaunch', getAutoLaunch());
          if (!ok && win) win.webContents.send('toast', '开机自启动设置失败');
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]));
    tray.on('double-click', toggleWindow);
  } catch (e) {
    console.log('[PA] tray failed:', e.message);
  }
}

async function streamChat(cfg, messages, sender, signal) {
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: Number(cfg.temperature),
      max_tokens: 2400,
      stream: true,
    }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${t.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const data = s.slice(5).trim();
      if (data === '[DONE]') { sender.send('llm:done'); return; }
      try {
        const j = JSON.parse(data);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) sender.send('llm:chunk', delta);
      } catch (_) { /* 忽略心跳与非 JSON 行 */ }
    }
  }
  sender.send('llm:done');
}

function setupIPC() {
  ipcMain.handle('config:get', () => ({ ...loadConfig(), autoLaunch: getAutoLaunch() }));
  ipcMain.handle('config:set', (_e, patch) => {
    const next = saveConfig(patch);
    if (patch.hotkey) registerHotkey();
    if (typeof patch.autoLaunch === 'boolean') setAutoLaunch(patch.autoLaunch);
    return { ...next, autoLaunch: getAutoLaunch() };
  });
  ipcMain.handle('clipboard:read', () => { try { return clipboard.readText() || ''; } catch (_) { return ''; } });
  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(text); return true; });
  ipcMain.handle('window:hide', () => { if (win) win.hide(); return true; });
  ipcMain.handle('window:quit', () => { app.quit(); return true; });

  ipcMain.handle('file:save', async (_e, { content, defaultName }) => {
    const r = await dialog.showSaveDialog(win, {
      title: '保存提示词文件',
      defaultPath: defaultName || 'PA-prompt.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'YAML', extensions: ['yaml', 'yml'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, content, 'utf8');
    return { ok: true, path: r.filePath };
  });

  ipcMain.handle('llm:abort', () => { if (currentAbort) currentAbort.abort(); return true; });

  ipcMain.handle('llm:chat', async (event, payload) => {
    const cfg = loadConfig();
    const sender = event.sender;
    if (!cfg.apiKey) {
      const msg = '未配置 API Key，请在设置里填写 DeepSeek Key';
      sender.send('llm:error', msg);
      return { ok: false, error: msg };
    }
    const slots = {};
    for (const k of D_KEYS) slots[k] = (payload.slots && payload.slots[k]) || null;
    const sys = buildSystem(slots);
    const markers = [`[input_mode: ${payload.inputMode || 'text'}]`];
    if (payload.wake) markers.push('[wake: hotkey]');
    if (payload.clipboardText) markers.push(`[clipboard: ${String(payload.clipboardText).slice(0, 800)}]`);
    markers.push(payload.userText || '');

    const messages = [
      { role: 'system', content: sys },
      ...(payload.history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: markers.join('\n') },
    ];

    currentAbort = new AbortController();
    const timer = setTimeout(() => { if (currentAbort) currentAbort.abort(); }, 120000);
    try {
      await streamChat(cfg, messages, sender, currentAbort.signal);
      return { ok: true };
    } catch (err) {
      const msg = String((err && err.message) || err);
      sender.send('llm:error', msg);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timer);
      currentAbort = null;
    }
  });

  // 语音转写：provider=openai 走 OpenAI 兼容 /audio/transcriptions（multipart）；
  // provider=raw 走极简协议（POST 原始音频二进制，返回 {"text":...} 或纯文本）。
  ipcMain.handle('asr:transcribe', async (_e, { base64, mime }) => {
    const cfg = loadConfig();
    const asr = cfg.asr || {};
    if (!asr.endpoint) throw new Error('未配置 ASR 端点，请在设置里选择服务商');
    const body = Buffer.from(base64 || '', 'base64');
    if (!body.length) throw new Error('没有录到音频，请检查麦克风权限');
    const mimeType = mime || 'audio/webm';
    const ext = /ogg/i.test(mimeType) ? 'ogg' : /wav/i.test(mimeType) ? 'wav'
      : /mp4|m4a/i.test(mimeType) ? 'm4a' : 'webm';
    let res;
    if (asr.provider === 'openai') {
      const form = new FormData();
      form.append('file', new Blob([body], { type: mimeType }), 'audio.' + ext);
      form.append('model', asr.model || 'whisper-1');
      const headers = {};
      if (asr.apiKey) headers.Authorization = 'Bearer ' + asr.apiKey;
      res = await fetch(asr.endpoint, {
        method: 'POST', headers, body: form,
        signal: AbortSignal.timeout(60000),
      });
    } else {
      res = await fetch(asr.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body,
        signal: AbortSignal.timeout(30000),
      });
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`ASR HTTP ${res.status} ${t.slice(0, 200)}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const j = await res.json();
      return String(j.text || j.result || j.transcript || (j.data && j.data.text) || '');
    }
    return (await res.text()).trim();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow(true));
  app.whenReady().then(() => {
    // 允许 renderer 使用麦克风（Electron 默认可能拦截 media 权限）
    try {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === 'media' || permission === 'audioCapture' || permission === 'microphone');
      });
    } catch (_) {}
    setupIPC();
    createWindow();
    createTray();
    // 配置里勾了自启但注册表还没写（例如旧版升级），这里补一次
    if (loadConfig().autoLaunch && !getAutoLaunch()) setAutoLaunch(true);
    // 自动化冒烟测试钩子：设置 PA_SMOKE_QUIT_MS 后自动退出，正常用户不受影响
    const smokeMs = Number(process.env.PA_SMOKE_QUIT_MS || 0);
    if (smokeMs > 0) setTimeout(() => app.quit(), smokeMs);
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {});
}
