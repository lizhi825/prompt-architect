# 提示词架构师 · Prompt Architect

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-lightgrey.svg)]()
[![Electron](https://img.shields.io/badge/Electron-33-47848f.svg)]()

一个常驻悬浮窗：你说出需求，它**不给你答案**，而是反问几个贴着项目的澄清问题，然后一键生成一份**别的 Agent 能直接执行**的完整提示词文件。

接入任意 OpenAI 兼容大模型 API（默认 DeepSeek），支持语音输入、悬浮窗、全局热键一键呼出、开机自启动。

> **English:** A floating desktop agent that never answers your question directly. Instead it asks a few project-specific clarifying questions, then generates a complete, self-contained prompt file that another LLM agent can execute as-is. Works with any OpenAI-compatible API (DeepSeek by default).

---

## 快速开始

```bash
cd prompt-architect
npm install       # 首次需要下载 Electron 二进制，约 100MB，请耐心
npm start
```

> 国内网络若卡在下载 Electron 二进制（常见于 `postinstall` 阶段），改用镜像重装：
> ```bash
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
> ```

`npm start` 实际执行 `launch.js`：它会先清除 `ELECTRON_RUN_AS_NODE`、`NODE_OPTIONS` 这类由 IDE / Agent 终端注入的变量，再拉起 Electron。若不经过它直接启动，报
`Cannot read properties of undefined (reading 'requestSingleInstanceLock')` 就是这两个变量导致的（Electron 被当成纯 Node 运行）。手动启动前清掉即可：

```bash
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS   # PowerShell: $env:ELECTRON_RUN_AS_NODE=$null; $env:NODE_OPTIONS=$null
```

启动后是一个无边框、始终置顶的小窗。按 **Alt+Space** 随时呼出/隐藏，窗口内 **Esc** 隐藏。

**不想等安装也能先看效果**：直接用浏览器打开 `renderer/index.html`。没有 Electron 宿主时会自动进入**演示模式**，内置 3 轮示例回复（两轮澄清 + 一份完整提示词），无需 API Key，可完整体验选项点击、状态行、导出。

首次使用点右上角齿轮 → 填 DeepSeek API Key → 保存。Key 只写在本机用户目录（`%APPDATA%/prompt-architect/config.json`），不上传。

`npm run dev` 会额外打开 DevTools。

---

## 安装包（Windows）

**从 [GitHub Releases](https://github.com/lizhi825/prompt-architect/releases) 下载 `PromptArchitect-Setup-1.0.1.exe`**，无需自己构建源码。

- 版本 `1.0.1`（新增开机自启动 / 系统托盘 / 可用的 ASR 语音服务）
- 大小 **79 MB**（81,979,573 字节）
- SHA256：`94916bce598072b2e878bcf69bbd23d2d9522f40d9361d1b7eab09e04f7d2e01`（下载后可自行校验）
- **用户级安装**：默认装到 `%LOCALAPPDATA%\Programs\PromptArchitect`，**不需要管理员权限**。
- 安装向导可选择目录，自动创建桌面快捷方式「提示词架构师」与开始菜单项。
- 装完首次运行点右上角齿轮填 DeepSeek API Key 即可，`Alt+Space` 呼出。
- 卸载：Windows「设置 → 应用 → 安装的应用」里找到 PromptArchitect，或运行安装目录中的卸载程序。

源码仓库不包含 `dist/`（安装包体积大，见 `.gitignore`）。要从源码自己构建：

```bash
npm install
npm run dist        # 产物输出到 dist/，含安装包与免安装绿色版 win-unpacked/
```

国内网络打包建议走镜像（避免从 GitHub 下载 Electron / NSIS 卡住）：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npm run dist
```

> 安装包未做代码签名，Windows SmartScreen 首次运行可能提示「未知发布者」，选「更多信息 → 仍要运行」即可。这是未购买代码签名证书的正常现象，不影响功能。

---

## 功能对照

| 需求 | 实现 |
|---|---|
| 接入 DeepSeek 类 API | `main.js` 内 `fetch` + SSE 流式解析，兼容任意 OpenAI 兼容端点；可切 `deepseek-reasoner` |
| 不给答案、只反问 | `system-prompt.source.md` 第一铁律 + S0–S5 工作流 + D1–D8 澄清清单 |
| 一键生成完备提示词 | 说「直接生成」或点 `/gen` 按钮，跳过剩余提问，缺失项标 `[待确认: 默认值]` |
| 生成提示词文件 | 产物卡片支持 复制 / 存 `.md` / 导出 `.json` / 导出 `.yaml`；`.json` 可直接作为下游 Agent 的 API 请求体 |
| 语音输入 | 桌面版改用 ASR 服务（内置硅基流动 / Groq / OpenAI / 本地预设，OpenAI 兼容 multipart 协议），见「语音方案」 |
| 悬浮窗 | `BrowserWindow`：`alwaysOnTop` + 无边框 + 圆角透明 + 可拖拽 + 可缩放 |
| 一键呼出 | `globalShortcut` 注册 `Alt+Space`（可改），唤起时自动把剪贴板内容填进输入框；托盘双击同效 |
| 开机自启动 | 设置里勾选后写入当前用户登录项（HKCU，无需管理员），带 `--hidden` 静默启动并驻留系统托盘，等热键呼出 |
| 会话不丢 | 槽位 `D1–D8` 由客户端维护，每轮拼进 system 尾部；热键隐藏不重置上下文 |

---

## 温度（temperature）是什么意思

设置里的「温度」是调用大模型时的**采样随机性**参数，取值通常 0–2（本软件限制 0–2，默认 **0.3**）：

- **越低（0–0.3）**：输出越确定、越保守、越可复现，几乎每次都走同一套结构和措辞。
- **越高（0.7–1.5）**：用词和思路更发散、更有创意，但也更容易跑偏、格式不稳。

它在这款软件里有**两处作用**，改设置会同时影响两处：

1. **架构师自己问你问题时**：`main.js` 把 `cfg.temperature` 传进 DeepSeek 请求。0.3 是为了让它稳定地按「反问 → 收集 D1–D8 → 输出 11 节文件」这套流程走，不会随机改格式或多嘴解题。
2. **生成的提示词文件里**：front matter 的 `temperature: 0.3` 是**给下游执行 Agent 的推荐参数**。导出 `.json` 时它会写进请求体，意思是「执行这份提示词时也建议用低温度，保证结构化产出稳定」。

调参建议：这类「生成结构化提示词 / 文件」的任务保持 **0.1–0.3**；想让澄清问题更灵活可试 0.5–0.7；不建议超过 1，否则 11 节结构和 `<slots>` / `<prompt-file>` 机读标记容易漏，软件会解析失败。另外 `deepseek-reasoner` 会忽略 temperature 参数，切到推理模型时这项不生效。

---

## 开机自启动与热键呼出

设置里勾选「开机自启动」→ 保存，软件会把自身写入当前用户的登录项（Windows 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，**用户级，不需要管理员权限**），启动时带 `--hidden`：

- 开机后**不弹窗**，只在系统托盘留一个图标，安静驻留；
- 按 **Alt+Space**（可改）呼出悬浮窗，再按一次隐藏；Esc 也可隐藏；
- 托盘**双击**等同热键；托盘右键菜单里有「显示 / 隐藏」「打开设置」「开机自启动」「退出」；
- 呼出时自动把剪贴板文本填进输入框，隐藏不丢会话（D1–D8 槽位保留在内存）。

托盘是热键冲突时的兜底：若 Alt+Space 被别的软件占用（注册失败会在界面提示），仍可从托盘打开窗口，并在设置里改成 `Ctrl+Shift+P` 之类的组合。彻底退出请用托盘右键「退出」或设置面板里的「退出应用」——右上角的「—」只是隐藏。

> 软件不会替你自动勾选这个开关，需要你在设置里自己打开；取消勾选会同步删除登录项。

---

## 语音方案（为什么原来点麦克风没反应）

**结论：Electron 桌面版里浏览器语音识别是废的，别选它。**

`webkitSpeechRecognition` 这个 API 在 Electron 的 Chromium 里虽然存在，但它依赖 Google 的云端语音服务，且需要浏览器二进制内置 Google API key。Electron 的开源构建不含这个 key，国内网络也访问不了该服务。实测在 v33.4.11 里调用 `start()` 后**既不返回 error、也不返回 result，永久挂起**——表现就是「点了麦克风一直转圈、什么都没发生」。

所以 1.0.1 起：桌面模式下点语音按钮会直接提示并打开设置面板，不再让你干等。

### 现在怎么用

设置 → 语音引擎选 **ASR 服务（推荐，国内可用）** → 选服务商预设 → 填 API Key → 保存。点麦克风开始录音，再点一次结束（最长 8 秒），识别结果自动填进输入框。

| 预设 | 端点 | 模型 | 说明 |
|---|---|---|---|
| 硅基流动 SenseVoice | `https://api.siliconflow.cn/v1/audio/transcriptions` | `FunAudioLLM/SenseVoiceSmall` | 国内直连，有免费额度，**首选** |
| Groq Whisper | `https://api.groq.com/openai/v1/audio/transcriptions` | `whisper-large-v3-turbo` | 需海外网络 |
| OpenAI Whisper | `https://api.openai.com/v1/audio/transcriptions` | `whisper-1` | 需海外网络 |
| 本地 / 自定义 | `http://127.0.0.1:9000/asr` | — | 极简二进制协议，见下 |

ASR Key 只存在本机配置文件，和 DeepSeek Key 分开。没有 ASR Key 也能正常打字使用，语音是可选增强。

### 协议细节

`provider=openai`（前三个预设）：主进程把录音转成 multipart/form-data 发给 OpenAI 兼容的 `/audio/transcriptions`：

```
POST  <端点>
Authorization: Bearer <ASR Key>        # 本地服务可省略
Content-Type: multipart/form-data

file:  audio.webm (录音，audio/webm;codecs=opus)
model: <模型名>

响应：{"text": "识别出的文字"}
```

`provider=raw`（本地 / 自定义）：保持极简协议，任何能收音频返文本的服务都能接：

```
POST  <端点>
Content-Type: audio/webm        # 实际 mime 由录音器决定，透传
Body: 原始音频二进制

响应（二选一）：{"text": "..."} 或纯文本
```

例如自建 faster-whisper 服务只需几行 Flask 代码即可满足该协议。选预设后仍可手动改端点，用来接任意 OpenAI 兼容 ASR。

> 若录音后提示「无法访问麦克风」，检查 Windows「设置 → 隐私和安全性 → 麦克风」是否允许桌面应用访问；软件已在主进程放行 media 权限。

---

## 提示词与软件的关系

软件运行时 `system message` 由两段拼成（`system-prompt.js`）：

1. `system-prompt.source.md` 中 `<!-- SYSTEM PROMPT START -->` 到 `<!-- SYSTEM PROMPT END -->` 之间的核心提示词；
2. 同文件 **附录 D · 软件宿主机读补丁**（`<slots>` 槽位回传、`<prompt-file>` 产物包裹、悬浮窗精简输出），供软件解析，**通用 API 调用不要注入这段**。

仓库自带 `system-prompt.source.md`，clone 下来即可独立运行，不依赖任何外部文件。`npm run sync:prompt` 仅供作者本机使用：若上级目录存在 `提示词架构师_SystemPrompt_v1.0.md` 则同步进项目，否则跳过。运行时查找顺序为：项目内副本 → 上级目录原文件 → 内置最小提示词。

### 机读协议（附录 D 摘要）

- 每轮回复末尾带 `<slots>{"D1":...}</slots>`：8 键齐全的单行 JSON，客户端 merge 后计算「已收集 n/8」。
- 产物轮用 `<prompt-file> … </prompt-file>` 包裹完整可落盘文件（YAML front matter + 11 节），客户端原样写盘并折叠成卡片。
- 悬浮窗每轮可见文本 ≤180 字，禁止 markdown 表格/代码块/粗体，选项格式 `1. 问题？ A … B … C … (跳过=A)`，可直接点选项填入答案。

---

## 导出格式

| 格式 | 内容 | 用途 |
|---|---|---|
| `.md` | 原样落盘的完整提示词文件 | 人读 / 拖给别的 Agent |
| `.json` | `{model, temperature, stream, messages:[system, user]}` | **直接作为下游 Agent 的 API 请求体**，`system` 为第 1–11 节正文 |
| `.yaml` | 顶层 meta + `prompt: \|` 块 | 配置化管理 / 版本 diff |

---

## 目录结构

```
prompt-architect/
├── launch.js                   # 启动包装器（清理 IDE 注入变量后拉起 Electron）
├── main.js                     # 悬浮窗 / 热键 / 托盘 / 开机自启 / 剪贴板 / DeepSeek 流式 / ASR / 存盘
├── preload.js                  # 安全桥接（contextIsolation）
├── system-prompt.js            # 组装 system message
├── system-prompt.source.md     # 提示词源（含附录 D 机读补丁）
├── build/
│   ├── make-icon.js            # 生成安装包图标（纯 Node，无依赖）
│   └── icon.ico
├── dist/                       # 本地打包产物（.gitignore 忽略，见 Releases）
│   ├── PromptArchitect-Setup-1.0.1.exe
│   └── win-unpacked/           # 免安装绿色版
├── renderer/
│   ├── index.html              # 界面（浏览器直接打开即演示模式）
│   ├── style.css
│   ├── app.js                  # 交互 / 解析 / 语音 / 导出 / 宿主适配
│   └── icon.ico                # 托盘图标（随 renderer 一起进 asar）
└── README.md
```

运行时零第三方依赖（只用到 Electron 自带能力）；构建期依赖 `electron` 与 `electron-builder`。

---

## 已知限制

- 已提供 Windows x64 NSIS 安装包；macOS / Linux 未打包，也未做自动更新。
- 安装包未做代码签名，首次运行会有 SmartScreen 提示（见「安装包」章节）。
- 语音需要你自己申请一个 ASR 服务的 Key（推荐硅基流动，有免费额度）；软件不内置离线语音模型。
- 悬浮窗关闭按钮是「隐藏」而非退出；彻底退出用托盘右键或设置面板里的「退出应用」。
- 单会话串行生成，生成中禁止重复发送（UI 已禁用按钮）。
- 会话槽位存于内存，重启软件会清空；如需跨重启持久化可在 `app.js` 里把 `S.slots` 写入 localStorage。

---

## 开源

本项目以 [MIT License](LICENSE) 开源，可自由使用、修改、商用。参与贡献请看 [CONTRIBUTING.md](CONTRIBUTING.md)，问题与建议请开 [Issue](https://github.com/lizhi825/prompt-architect/issues)。

> 提示词源文件 `system-prompt.source.md` 同样遵循 MIT，可直接取用其中 `SYSTEM PROMPT START/END` 之间的核心提示词接入你自己的 Agent——**不要**注入附录 D，那是本软件专用的机读协议。
