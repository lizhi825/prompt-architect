# 参与贡献

欢迎提 Issue 和 Pull Request。这里说明项目结构与几处容易踩坑的地方。

## 本地开发

```bash
git clone https://github.com/lizhi825/prompt-architect.git
cd prompt-architect
npm install          # 国内建议：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
npm start            # 走 launch.js，自动清理 IDE 注入的 ELECTRON_RUN_AS_NODE / NODE_OPTIONS
npm run dev          # 额外打开 DevTools
```

想快速看界面又不想等 Electron 下载，直接用浏览器打开 `renderer/index.html`，会自动进入演示模式（内置 3 轮示例回复，无需 API Key）。

## 代码结构

| 文件 | 职责 |
|---|---|
| `main.js` | Electron 主进程：悬浮窗、全局热键、系统托盘、开机自启、剪贴板、DeepSeek 流式调用、ASR 转发、文件存盘 |
| `preload.js` | `contextIsolation` 下的安全桥接，只暴露白名单 IPC 方法 |
| `renderer/app.js` | 界面逻辑：流式渲染、`<slots>` / `<prompt-file>` 机读标记解析、选项点击、语音、导出；同时兼容 Electron 与纯浏览器两种宿主 |
| `system-prompt.js` | 拼装运行时 `system` 消息：核心提示词 + 附录 D 机读补丁 + 已收集槽位 |
| `system-prompt.source.md` | 提示词源文件，含 `SYSTEM PROMPT START/END` 标记与附录 D |
| `build/make-icon.js` | 纯 Node 生成 `icon.ico`，无第三方依赖 |

## 改提示词要注意

- 真正进 `system` 的只有 `<!-- SYSTEM PROMPT START -->` 到 `<!-- SYSTEM PROMPT END -->` 之间的内容，加上**附录 D**。附录 A/B/C 是给人和宿主代码看的工程说明，**不要**注入模型。
- 附录 D 定义了 `<slots>`（8 键单行 JSON）与 `<prompt-file>`（完整产物包裹）两个机读标记。改这两个标记的名字或结构，必须同步改 `renderer/app.js` 里的解析正则，否则客户端会解析失败。
- 悬浮窗一屏可见文本控制在 180 字以内，选项格式固定为 `1. 问题？ A … B … C … (跳过=A)`，避免渲染层解析不出来。
- 修改后请跑一遍 `node -e "const {buildSystem}=require('./system-prompt.js');console.log(buildSystem({}).length)"`，确认拼装结果未混入工程附录。

## 提交前自检

```bash
# 1. 语法
for f in main.js preload.js launch.js system-prompt.js renderer/app.js; do node --check "$f"; done

# 2. DOM 绑定（JS 引用的 id 必须都在 index.html 里存在）
node -e "const fs=require('fs');const h=fs.readFileSync('renderer/index.html','utf8');const j=fs.readFileSync('renderer/app.js','utf8');const ids=new Set([...h.matchAll(/id=\"([^\"]+)\"/g)].map(m=>m[1]));const u=new Set([...j.matchAll(/\\\$\('([^']+)'\)/g)].map(m=>m[1]));console.log('missing:',[...u].filter(x=>!ids.has(x)))"

# 3. 打包（国内走镜像）
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npm run dist
```

## 提交规范

- 一个 PR 只做一件事，描述里写清「改了什么 / 为什么 / 怎么验证」。
- 不要提交 `node_modules/`、`dist/`、任何 API Key 或本机配置文件（`.gitignore` 已覆盖）。
- 新增功能若涉及主进程 IPC，请同时更新 `preload.js` 白名单与 README 相应章节。

## 许可证

贡献即表示你同意以 [MIT License](LICENSE) 发布你的代码。
