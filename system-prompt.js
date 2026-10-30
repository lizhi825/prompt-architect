const fs = require('fs');
const path = require('path');

const START = '<!-- SYSTEM PROMPT START — 复制本行以下全部内容 -->';
const END = '<!-- SYSTEM PROMPT END';
const PATCH_HEAD = '# 附录 D · 软件宿主机读补丁（仅桌面软件注入）';

const FALLBACK = [
  '# 角色',
  '你是「提示词架构师」，需求翻译官 + 提示词编译器。永不直接回答用户的问题，只产出可被其他 Agent 直接执行的结构化提示词。',
  '# 工作流',
  'S1 意图解析 → S2 对照 D1–D8 缺口分析 → S3 澄清提问（每轮 2–4 题、A/B/C 选项、总轮次 ≤3）→ S4 编译 11 节提示词 → S5 自检导出。',
  'D1 目标 / D2 交付物 / D3 受众 / D4 背景 / D5 输入 / D6 约束 / D7 风格 / D8 边界验收。',
  '用户说「直接生成 / /gen」时跳过提问，缺失项标 [待确认: 默认值]。',
  '# 输出',
  '澄清轮：编号问题 + A/B/C 选项 + 状态行 + <slots>{"D1":...}</slots>（8 键齐全，单行合法 JSON）。',
  '产物轮：<prompt-file> 包裹完整文件（YAML front matter + 11 节：角色/目标/背景/输入/任务步骤/约束/输出格式/参考示例/验收标准/边界异常/待确认项）+ 回执行 + <slots>。',
  '悬浮窗宽 420px，每轮可见文本 ≤180 字，禁止 markdown 表格、代码块、粗体。',
].join('\n');

function readSource() {
  const candidates = [
    path.join(__dirname, 'system-prompt.source.md'),
    path.join(__dirname, '..', '提示词架构师_SystemPrompt_v1.0.md'),
  ];
  for (const p of candidates) {
    try { return fs.readFileSync(p, 'utf8'); } catch (_) {}
  }
  return null;
}

function buildSystem(slots) {
  const raw = readSource();
  let core = FALLBACK;
  let patch = '';
  if (raw && raw.includes(START) && raw.includes(END)) {
    core = raw.split(START)[1].split(END)[0].trim();
    if (raw.includes(PATCH_HEAD)) patch = PATCH_HEAD + raw.split(PATCH_HEAD)[1];
  }
  const filled = {};
  for (const k of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) {
    filled[k] = slots && slots[k] ? slots[k] : null;
  }
  return [
    core,
    patch,
    '# 当前会话槽位（客户端维护，勿重复提问已明确项）',
    JSON.stringify(filled),
  ].filter(Boolean).join('\n\n');
}

module.exports = { buildSystem };
