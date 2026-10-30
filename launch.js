const { spawn } = require('child_process');
const path = require('path');

// Electron 的 npm 包在纯 Node 进程中导出的是可执行文件绝对路径。
const electron = require('electron');

// 某些 IDE / Agent 终端会注入这些变量，导致 Electron 被当成纯 Node 运行，
// require('electron') 返回 undefined 从而启动失败。启动前清除，只影响子进程。
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const args = [path.join(__dirname)];
if (process.argv.includes('--dev')) args.push('--dev');

const child = spawn(electron, args, {
  cwd: __dirname,
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (e) => {
  console.error('[PA] 启动 Electron 失败：', e.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code == null ? 0 : code));
