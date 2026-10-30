const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pa', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  saveFile: (opt) => ipcRenderer.invoke('file:save', opt),
  chat: (payload) => ipcRenderer.invoke('llm:chat', payload),
  abort: () => ipcRenderer.invoke('llm:abort'),
  transcribe: (opt) => ipcRenderer.invoke('asr:transcribe', opt),
  hide: () => ipcRenderer.invoke('window:hide'),
  quit: () => ipcRenderer.invoke('window:quit'),
  onChunk: (cb) => ipcRenderer.on('llm:chunk', (_e, d) => cb(d)),
  onDone: (cb) => ipcRenderer.on('llm:done', () => cb()),
  onError: (cb) => ipcRenderer.on('llm:error', (_e, m) => cb(m)),
  onWake: (cb) => ipcRenderer.on('wake', (_e, p) => cb(p)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, m) => cb(m)),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
  onAutoLaunch: (cb) => ipcRenderer.on('autolaunch', (_e, v) => cb(v)),
  isElectron: true,
});
