(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copyBrowser(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
        return;
      }
    } catch (_) {}
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }

  function download(content, name) {
    var b = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // ASR 服务商预设：provider=openai 走 OpenAI 兼容 /audio/transcriptions；raw 走极简二进制协议
  var ASR_PRESETS = {
    siliconflow: { provider: 'openai', endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions', model: 'FunAudioLLM/SenseVoiceSmall' },
    groq: { provider: 'openai', endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo' },
    openai: { provider: 'openai', endpoint: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1' },
    raw: { provider: 'raw', endpoint: 'http://127.0.0.1:9000/asr', model: '' }
  };

  var DEFAULTS = {
    apiKey: '', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat',
    temperature: 0.3, hotkey: 'Alt+Space', autoLaunch: false,
    asr: {
      engine: 'browser', preset: 'siliconflow', provider: 'openai',
      endpoint: ASR_PRESETS.siliconflow.endpoint, apiKey: '',
      model: ASR_PRESETS.siliconflow.model, language: 'zh-CN'
    }
  };

  // ---------------- 演示模式（浏览器直接打开时） ----------------
  var REPLY_1 = [
    '1. 数据从哪来？ A 企微群csv  B 飞书群  C 数据库/API  D 其他 (跳过=A)',
    '2. 给谁看、多细？ A 老板:TOP10+趋势  B 主管:+未解决清单  C 产品:+需求归类 (跳过=A)',
    '3. 输出成啥？ A md文件  B 在线文档  C 邮件正文 (跳过=A)',
    '[轮次 1/3 | 已收集 2/8 | /gen 直接生成]',
    '<slots>{"D1":"每周汇总客服群高频问题给管理层","D2":null,"D3":null,"D4":"企业微信客服群","D5":null,"D6":null,"D7":null,"D8":null}</slots>'
  ].join('\n');

  var REPLY_2 = [
    '4. 有敏感信息吗？ A 手机号需脱敏  B 无敏感信息  C 有订单号/地址 (跳过=A)',
    '5. 某天没数据咋办？ A 跳过并标注  B 中断告警  C 用上周补 (跳过=A)',
    '[轮次 2/3 | 已收集 6/8 | /gen 直接生成]',
    '<slots>{"D1":"每周汇总客服群高频问题给管理层","D2":"在线文档,≤1页","D3":"管理层","D4":"企业微信客服群","D5":"每日导出CSV,日均1000条","D6":"手机号脱敏","D7":"[默认值] 克制、结论先行","D8":null}</slots>'
  ].join('\n');

  var REPLY_FILE = [
    '<prompt-file>',
    '---',
    'meta:',
    '  id: PA-DEMO-0001',
    '  version: 1.0',
    '  title: 客服群高频问题周报生成器',
    '  source: 客服群每日消息量大，需每周自动汇总高频问题供管理层查看',
    '  confidence: high',
    '  downstream: 周报整理 Agent',
    '  recommended_model: deepseek-chat',
    '  temperature: 0.3',
    '  generated_by: PromptArchitect/1.0',
    '---',
    '',
    '# 1. 角色',
    '你是客服数据分析员，只做归纳与呈现，不做业务决策、不提改进建议。',
    '',
    '# 2. 目标与成功标准',
    '产出《客服周报 YYYY-WW》，管理层 2 分钟读完即可回答：问得最多的 10 件事、哪几件在变多、有无新问题。',
    '',
    '# 3. 背景与上下文',
    '公司客服通过企业微信群承接咨询，日均消息 800–1500 条。管理层只关心问题分布与趋势。',
    '',
    '# 4. 输入材料',
    '7 个 CSV（周一至周日各一个），字段：时间, 群名, 发送人, 内容。发送人视为敏感信息。',
    '',
    '# 5. 任务步骤',
    '1. 读取 7 个 CSV，任一失败记入 failed_days 并继续。',
    '2. 清洗：删除空行、纯标点、[图片]、长度小于 4 字的寒暄。',
    '3. 脱敏：正则 1[3-9]\\d{9} 中间四位替换为 ****；丢弃发送人字段。',
    '4. 同一发送人 5 分钟窗口内消息合并为一条。',
    '5. 归类，最多 12 类；「其他」占比超 20% 则重新划分。',
    '6. 统计本周条数、占比、环比；取 TOP 10，标出上升与新增项。',
    '7. 每类写一句 25 字内客户原话摘要，须来自真实消息。',
    '8. 输出第 7 节格式，执行第 9 节自检。',
    '',
    '# 6. 约束与红线',
    '必须：正文 ≤700 字；占比合计 100.0%±0.1%；每条摘要可在输入中找到原文。',
    '禁止：输出姓名/昵称/完整手机号；编造数据或趋势；提改进建议；输出过程与代码；写入外部系统。',
    '',
    '# 7. 输出格式',
    '客服周报 YYYY-WW / 统计区间 / 一句话结论(≤45字) / 高频问题 TOP10 表格 / 本周新增与恶化 / 数据说明。',
    '',
    '# 8. 参考示例',
    '客服周报 2026-W44 ｜ 有效消息 4821 条 ｜ 覆盖 7/7 天。一句话结论：退款到账时效连续两周居首且环比上升 34%。',
    '',
    '# 9. 验收标准',
    '是/否：TOP10 恰好 10 行；占比合计 99.9–100.1%；正文 ≤700 字；无未脱敏手机号；无建议类词汇；无分析过程。',
    '',
    '# 10. 边界与异常处理',
    '单日 CSV 失败：跳过并在数据说明标注；连续 ≥3 天失败：返回「数据不足，无法生成周报」并转人工；有效消息 <200 条：正常输出并注明样本偏低。任何异常不得编造数据补齐。',
    '',
    '# 11. 待确认项',
    'D7 文风：默认克制、结论先行；若偏好口语需调整第 7 节一句话结论语气，不影响统计逻辑。',
    '</prompt-file>',
    '已生成 PA-DEMO-0001.md（7/8 完备 · 1 项待确认）｜回 A 修改 / B 复制 / C 新需求',
    '<slots>{"D1":"每周汇总客服群高频问题给管理层","D2":"在线文档,≤1页","D3":"管理层","D4":"企业微信客服群","D5":"每日导出CSV,日均1000条","D6":"手机号脱敏","D7":"[默认值] 克制、结论先行","D8":"无上周数据则环比写—"}</slots>'
  ].join('\n');

  function makeMockApi() {
    var L = { chunk: [], done: [], error: [], wake: [], toast: [] };
    function emit(name, a) { (L[name] || []).forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); }
    var config = JSON.parse(JSON.stringify(DEFAULTS));
    return {
      isElectron: false,
      getConfig: function () { return Promise.resolve(config); },
      setConfig: function (p) { config = Object.assign({}, config, p); return Promise.resolve(config); },
      readClipboard: function () { return Promise.resolve(''); },
      writeClipboard: function (t) { copyBrowser(t); return Promise.resolve(true); },
      saveFile: function (o) { download(o.content, o.defaultName); return Promise.resolve({ ok: true, path: o.defaultName }); },
      abort: function () { return Promise.resolve(true); },
      transcribe: function () { return Promise.reject(new Error('演示模式不支持自定义 ASR')); },
      hide: function () { emit('toast', '演示模式：隐藏窗口由 Electron 提供'); return Promise.resolve(true); },
      quit: function () { return Promise.resolve(true); },
      chat: function (payload) {
        var text = String(payload.userText || '');
        var asks = (payload.history || []).filter(function (h) { return h.role === 'assistant'; }).length;
        var force = /\/gen|一键生成|直接生成|不用问|不用问了/.test(text);
        var reply = (force || asks >= 2) ? REPLY_FILE : (asks === 0 ? REPLY_1 : REPLY_2);
        var i = 0;
        function step() {
          if (i >= reply.length) { emit('done'); return; }
          var n = Math.min(8 + Math.floor(Math.random() * 12), reply.length - i);
          emit('chunk', reply.slice(i, i + n)); i += n;
          setTimeout(step, 10);
        }
        setTimeout(step, 240);
        return Promise.resolve({ ok: true });
      },
      onChunk: function (cb) { L.chunk.push(cb); },
      onDone: function (cb) { L.done.push(cb); },
      onError: function (cb) { L.error.push(cb); },
      onWake: function (cb) { L.wake.push(cb); },
      onToast: function (cb) { L.toast.push(cb); },
      onOpenSettings: function () {},
      onAutoLaunch: function () {}
    };
  }

  var PA = (window.pa && window.pa.isElectron) ? window.pa : makeMockApi();
  var IS_ELECTRON = !!(window.pa && window.pa.isElectron);

  // ---------------- 状态 ----------------
  var S = {
    config: JSON.parse(JSON.stringify(DEFAULTS)),
    history: [], slots: {}, round: 0, lastFile: null,
    streaming: false, buffer: '', typingEl: null,
    pendingWake: false, pendingClip: ''
  };

  // ---------------- 工具 ----------------
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function fileName(ext) {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return 'PA-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '-prompt.' + ext;
  }

  function splitGenerated(content) {
    var m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: content.trim() };
    var allow = { id: 1, version: 1, title: 1, source: 1, confidence: 1, downstream: 1, recommended_model: 1, temperature: 1, generated_by: 1 };
    var meta = {};
    m[1].split('\n').forEach(function (l) {
      var mm = l.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (mm && allow[mm[1]]) meta[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, '');
    });
    return { meta: meta, body: m[2].trim() };
  }

  function toJson(content) {
    var r = splitGenerated(content);
    return JSON.stringify({
      model: r.meta.recommended_model || 'deepseek-chat',
      temperature: Number(r.meta.temperature || 0.3),
      stream: true,
      messages: [{ role: 'system', content: r.body }, { role: 'user', content: '' }]
    }, null, 2);
  }

  function toYaml(content) {
    var r = splitGenerated(content);
    var keys = ['id', 'version', 'title', 'confidence', 'downstream', 'recommended_model', 'temperature', 'generated_by'];
    var lines = keys.filter(function (k) { return r.meta[k] !== undefined; })
      .map(function (k) { return k + ': ' + JSON.stringify(String(r.meta[k])); });
    lines.push('prompt: |');
    r.body.split('\n').forEach(function (l) { lines.push('  ' + l); });
    return lines.join('\n') + '\n';
  }

  function parseSlots(raw) {
    var all = raw.match(/<slots>[\s\S]*?<\/slots>/g);
    if (!all || !all.length) return {};
    try {
      return JSON.parse(all[all.length - 1].replace(/^<slots>/, '').replace(/<\/slots>$/, '').trim());
    } catch (_) { return {}; }
  }
  function extractFile(raw) {
    var m = raw.match(/<prompt-file>([\s\S]*?)<\/prompt-file>/);
    return m ? m[1].trim() : null;
  }
  function stripMachine(raw) {
    return raw.replace(/<slots>[\s\S]*?<\/slots>/g, '').replace(/<prompt-file>[\s\S]*?<\/prompt-file>/g, '').trim();
  }

  // ---------------- 渲染 ----------------
  function scrollBottom() { var m = $('messages'); m.scrollTop = m.scrollHeight; }

  function newBubble(role) {
    var w = document.createElement('div'); w.className = 'msg ' + role;
    var b = document.createElement('div'); b.className = 'bubble';
    w.appendChild(b); $('messages').appendChild(w);
    var welcome = $('welcome'); if (welcome) welcome.remove();
    scrollBottom();
    return b;
  }

  function appendUser(text) {
    var b = newBubble('user'); b.textContent = text;
    S.history.push({ role: 'user', content: text });
    scrollBottom();
  }

  function renderAgentText(text) {
    var box = document.createElement('div');
    text.split('\n').forEach(function (line) {
      if (!line.trim()) return;
      var m = line.match(/^(\s*)(\d+)\.\s*(.*)$/);
      if (m && /\s[A-D]\s/.test(' ' + m[3])) {
        var num = m[2], rest = m[3];
        var idx = rest.search(/\s[A-D]\s/);
        var q = rest.slice(0, idx + 1).trim();
        var optStr = rest.slice(idx + 1);
        var row = document.createElement('div'); row.className = 'qline';
        var head = document.createElement('span');
        head.innerHTML = '<span class="qnum">' + esc(num) + '.</span> ' + esc(q);
        row.appendChild(head);
        var opts = document.createElement('span'); opts.className = 'opts';
        var re = /([A-D])\s+([\s\S]*?)(?=\s+[A-D]\s|$)/g, x;
        while ((x = re.exec(optStr)) !== null) {
          var label = x[2].trim().replace(/\s*\(跳过[^)]*\)\s*$/, '').slice(0, 20);
          var btn = document.createElement('button');
          btn.className = 'opt'; btn.textContent = x[1] + ' ' + label;
          (function (n, k) {
            btn.onclick = function () { appendToInput(n + k + ' '); };
          })(num, x[1]);
          opts.appendChild(btn);
        }
        row.appendChild(opts); box.appendChild(row);
      } else {
        var d = document.createElement('div'); d.textContent = line; box.appendChild(d);
      }
    });
    if (!box.childNodes.length) box.textContent = text;
    return box;
  }

  function appendToInput(s) {
    var el = $('input');
    el.value = (el.value ? el.value.replace(/\s*$/, '') + ' ' : '') + s;
    autoGrow(); el.focus();
  }

  function appendFileCard(container, content) {
    var meta = splitGenerated(content).meta;
    var card = document.createElement('div'); card.className = 'filecard';
    var head = document.createElement('div'); head.className = 'filecard-head';
    head.innerHTML = '<span>完备提示词 · ' + esc(meta.title || meta.id || '已生成') + '</span><span>11 节</span>';
    var body = document.createElement('div'); body.className = 'filecard-body';
    body.textContent = content.length > 700 ? content.slice(0, 700) + '\n…（展开请导出文件）' : content;
    var acts = document.createElement('div'); acts.className = 'filecard-actions';
    [['复制', 'copy'], ['存 .md', 'md'], ['导出 .json', 'json'], ['导出 .yaml', 'yaml']].forEach(function (it) {
      var b = document.createElement('button'); b.className = 'mini-btn'; b.textContent = it[0];
      b.onclick = function () { doExport(it[1]); };
      acts.appendChild(b);
    });
    card.appendChild(head); card.appendChild(body); card.appendChild(acts);
    container.appendChild(card);
  }

  function updateStatus() {
    var n = Object.keys(S.slots).filter(function (k) {
      var v = S.slots[k]; return v !== null && v !== undefined && v !== '';
    }).length;
    var t;
    if (S.streaming) t = '正在生成…';
    else if (S.round === 0 && n === 0) t = '已就绪 · 说出需求';
    else t = '轮次 ' + S.round + '/3 · 已收集 ' + n + '/8 · /gen 一键生成';
    $('status-text').textContent = t;
  }

  // ---------------- 流式与解析 ----------------
  function onChunk(d) {
    S.buffer += d;
    if (!S.typingEl) { S.typingEl = newBubble('agent'); S.typingEl.classList.add('typing'); }
    S.typingEl.textContent = S.buffer.length > 500 ? '…' + S.buffer.slice(-500) : S.buffer;
    scrollBottom();
  }

  function onDone() { finalize(S.buffer); }

  function finalize(raw) {
    S.streaming = false; setBusy(false);
    Object.assign(S.slots, parseSlots(raw));
    var file = extractFile(raw);
    var visible = stripMachine(raw).replace(/\[轮次[^\]]*\]/g, '').trim();
    var b = S.typingEl || newBubble('agent');
    b.classList.remove('typing'); b.innerHTML = '';

    if (file) {
      S.lastFile = file;
      appendFileCard(b, file);
      if (visible) { var d = document.createElement('div'); d.textContent = visible; d.style.marginTop = '7px'; b.appendChild(d); }
      S.history.push({ role: 'assistant', content: visible + '\n[已生成完备提示词文件]' });
      toast('提示词已生成，可复制或导出');
    } else {
      b.appendChild(renderAgentText(visible || '（无输出）'));
      S.history.push({ role: 'assistant', content: visible });
      S.round = Math.min(3, S.round + 1);
    }
    S.typingEl = null; S.buffer = '';
    updateStatus(); scrollBottom();
  }

  function onError(msg) {
    S.streaming = false; setBusy(false);
    if (S.typingEl) { S.typingEl.classList.remove('typing'); S.typingEl.textContent = '出错了：' + msg; }
    else { newBubble('agent').textContent = '出错了：' + msg; }
    S.typingEl = null; S.buffer = '';
    updateStatus(); toast(msg.slice(0, 80));
  }

  function setBusy(b) {
    $('btn-send').disabled = b;
    $('btn-gen').disabled = b;
  }

  // ---------------- 发送 ----------------
  function autoGrow() {
    var el = $('input'); el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }

  function localCommand(text) {
    if (/^\/help/.test(text)) {
      newBubble('agent').textContent = '命令：/gen 一键生成 · /skip 跳过 · /export md|json|yaml 导出 · /preview 预览 · /refine 意见 迭代 · /reset 重来 · /help 本说明';
      return true;
    }
    if (/^\/reset/.test(text)) { doReset(); return true; }
    if (/^\/export/.test(text)) {
      var m = text.match(/\/export\s+(md|json|yaml)/i);
      doExport(m ? m[1].toLowerCase() : 'md'); return true;
    }
    return false;
  }

  function send(text, opts) {
    opts = opts || {};
    text = String(text || '').trim();
    if (!text) return;
    if (S.streaming) { toast('正在生成，请稍候'); return; }
    if (localCommand(text)) return;
    var historySnapshot = S.history.slice();
    appendUser(text);
    $('input').value = ''; autoGrow();
    S.streaming = true; S.buffer = ''; setBusy(true); updateStatus();
    PA.chat({
      userText: text,
      inputMode: opts.voice ? 'voice' : 'text',
      slots: S.slots,
      history: historySnapshot,
      wake: S.pendingWake,
      clipboardText: S.pendingClip
    }).catch(function (e) { onError(String((e && e.message) || e)); });
    S.pendingWake = false; S.pendingClip = '';
  }

  function doReset() {
    S.history = []; S.slots = {}; S.round = 0; S.lastFile = null;
    S.streaming = false; S.buffer = ''; S.typingEl = null;
    $('messages').innerHTML =
      '<div class="welcome" id="welcome"><div class="welcome-title">说出你要做的事</div>' +
      '<div class="welcome-desc">我不直接给答案。我会反问几个项目相关的问题，然后生成一份<strong>别的 Agent 能直接执行</strong>的完整提示词文件。</div>' +
      '<button class="welcome-eg" data-eg="把客服群消息自动汇总成周报">试试：把客服群消息自动汇总成周报</button>' +
      '<button class="welcome-eg" data-eg="给我们的项目写一份 README">试试：给我们的项目写一份 README</button></div>';
    bindWelcome(); setBusy(false); updateStatus(); toast('已重置会话');
  }

  async function doExport(ext) {
    if (!S.lastFile) { toast('还没有生成产物'); return; }
    var content = S.lastFile, name = fileName(ext);
    if (ext === 'json') content = toJson(S.lastFile);
    else if (ext === 'yaml') content = toYaml(S.lastFile);
    else if (ext === 'copy') {
      if (IS_ELECTRON) await PA.writeClipboard(S.lastFile); else copyBrowser(S.lastFile);
      toast('已复制完整提示词到剪贴板'); return;
    }
    if (IS_ELECTRON) {
      var r = await PA.saveFile({ content: content, defaultName: name });
      if (r.ok) toast('已保存 ' + String(r.path).split(/[\\/]/).pop());
    } else {
      download(content, name); toast('已下载 ' + name);
    }
  }

  // ---------------- 语音 ----------------
  var voice = null;
  function setVoiceUI(on) { $('btn-voice').classList.toggle('recording', !!on); }
  function openSettingsPanel() { $('settings').classList.add('open'); }

  async function toggleVoice() {
    if (voice) { voice.stop(); voice = null; setVoiceUI(false); return; }

    // Electron 桌面版没有 Google 语音服务：webkitSpeechRecognition.start() 会永久挂起，
    // 所以直接给出可操作的引导，不再让用户面对"点了没反应"。
    if (S.config.asr.engine !== 'custom') {
      if (IS_ELECTRON) {
        toast('桌面版浏览器语音不可用，请在设置里选 ASR 服务商');
        openSettingsPanel();
        return;
      }
      var SR0 = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR0) { toast('当前浏览器不支持语音识别'); return; }
      var r0 = new SR0(); r0.lang = 'zh-CN'; r0.interimResults = true; r0.continuous = false;
      r0.onresult = function (e) {
        var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        $('input').value = t; autoGrow();
      };
      r0.onerror = function (e) { toast('语音失败：' + e.error); voice = null; setVoiceUI(false); };
      r0.onend = function () { voice = null; setVoiceUI(false); };
      try { r0.start(); } catch (e) { toast('无法启动语音：' + e.message); return; }
      voice = { stop: function () { try { r0.stop(); } catch (_) {} } };
      setVoiceUI(true); toast('正在聆听…点按钮结束');
      return;
    }

    // 自定义 ASR 服务：录音 → 主进程转写
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var mimeType = '';
      if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      }
      var rec = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        voice = null; setVoiceUI(false);
        if (!chunks.length) { toast('没录到声音，请检查麦克风权限'); return; }
        try {
          var blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
          var base64 = await blobToBase64(blob);
          toast('识别中…');
          var text = await PA.transcribe({ base64: base64, mime: blob.type });
          if (text) { $('input').value = text; autoGrow(); $('input').focus(); toast('识别完成'); }
          else toast('未识别到内容');
        } catch (e) { toast('识别失败：' + ((e && e.message) || e)); }
      };
      rec.start();
      voice = { stop: function () { try { rec.stop(); } catch (_) {} } };
      setVoiceUI(true); toast('录音中…点按钮结束（最长 8 秒）');
      setTimeout(function () { if (voice && rec.state === 'recording') { try { rec.stop(); } catch (_) {} } }, 8000);
    } catch (e) { toast('无法访问麦克风：' + ((e && e.message) || e)); }
  }

  // ---------------- 设置 ----------------
  function syncAsrFields() {
    var engine = $('cfg-asr-engine').value;
    var p = ASR_PRESETS[$('cfg-asr-preset').value] || ASR_PRESETS.siliconflow;
    $('asr-custom-fields').hidden = engine !== 'custom';
    $('asr-browser-note').hidden = engine === 'custom';
    $('field-asr-model').hidden = p.provider !== 'openai';
    $('field-asr-key').hidden = p.provider !== 'openai';
  }

  function applyPreset() {
    var p = ASR_PRESETS[$('cfg-asr-preset').value] || ASR_PRESETS.siliconflow;
    $('cfg-asr-endpoint').value = p.endpoint;
    $('cfg-asr-model').value = p.model;
    syncAsrFields();
  }

  async function loadSettings() {
    var c = await PA.getConfig();
    S.config = Object.assign({}, DEFAULTS, c, { asr: Object.assign({}, DEFAULTS.asr, c.asr || {}) });
    $('cfg-key').value = S.config.apiKey || '';
    $('cfg-base').value = S.config.baseURL || '';
    $('cfg-model').value = S.config.model || '';
    $('cfg-temp').value = S.config.temperature;
    $('cfg-hotkey').value = S.config.hotkey || 'Alt+Space';
    $('cfg-autolaunch').checked = !!S.config.autoLaunch;
    $('cfg-asr-engine').value = S.config.asr.engine || 'browser';
    $('cfg-asr-preset').value = S.config.asr.preset || 'siliconflow';
    $('cfg-asr-endpoint').value = S.config.asr.endpoint || '';
    $('cfg-asr-model').value = S.config.asr.model || '';
    $('cfg-asr-key').value = S.config.asr.apiKey || '';
    syncAsrFields();
    $('hotkey-hint').textContent = (S.config.hotkey || 'Alt+Space') + ' 呼出';
    $('mode-note').textContent = IS_ELECTRON
      ? '当前：桌面模式。开机自启后静默驻留托盘，用热键呼出；语音需在上方选 ASR 服务商并填 Key。'
      : '当前：浏览器演示模式（内置示例回复，无需 API Key）。在软件目录执行 npm start 可启动真实桌面版。';
  }

  async function saveSettings() {
    var preset = $('cfg-asr-preset').value;
    var p = ASR_PRESETS[preset] || ASR_PRESETS.siliconflow;
    var tv = Number($('cfg-temp').value);
    if (isNaN(tv)) tv = 0.3;
    var patch = {
      apiKey: $('cfg-key').value.trim(),
      baseURL: $('cfg-base').value.trim() || DEFAULTS.baseURL,
      model: $('cfg-model').value.trim() || DEFAULTS.model,
      temperature: Math.min(2, Math.max(0, tv)),
      hotkey: $('cfg-hotkey').value.trim() || 'Alt+Space',
      autoLaunch: $('cfg-autolaunch').checked,
      asr: {
        engine: $('cfg-asr-engine').value,
        preset: preset,
        provider: p.provider,
        endpoint: $('cfg-asr-endpoint').value.trim() || p.endpoint,
        model: p.provider === 'openai' ? ($('cfg-asr-model').value.trim() || p.model) : '',
        apiKey: $('cfg-asr-key').value.trim(),
        language: 'zh-CN'
      }
    };
    var saved = await PA.setConfig(patch);
    S.config = Object.assign({}, S.config, patch, { asr: patch.asr });
    if (saved && typeof saved.autoLaunch === 'boolean') {
      S.config.autoLaunch = saved.autoLaunch;
      $('cfg-autolaunch').checked = saved.autoLaunch;
    }
    $('hotkey-hint').textContent = patch.hotkey + ' 呼出';
    toast('设置已保存');
  }

  function bindWelcome() {
    Array.prototype.forEach.call(document.querySelectorAll('.welcome-eg'), function (b) {
      b.onclick = function () { $('input').value = b.dataset.eg; autoGrow(); $('input').focus(); };
    });
  }

  // ---------------- 初始化 ----------------
  PA.onChunk(onChunk);
  PA.onDone(onDone);
  PA.onError(onError);
  PA.onToast(toast);
  PA.onWake(function (p) {
    if (p && p.clipboard && p.clipboard.trim()) {
      $('input').value = p.clipboard.trim().slice(0, 1500); autoGrow(); $('input').focus();
      S.pendingClip = p.clipboard.trim().slice(0, 800);
      toast('已填入剪贴板内容，可直接发送');
    } else toast('已唤起');
    S.pendingWake = true; updateStatus();
  });
  PA.onOpenSettings(openSettingsPanel);
  PA.onAutoLaunch(function (v) {
    S.config.autoLaunch = !!v;
    $('cfg-autolaunch').checked = !!v;
  });

  $('btn-send').onclick = function () { send($('input').value); };
  $('btn-gen').onclick = function () { send('/gen'); };
  $('btn-reset').onclick = doReset;
  $('btn-copy-last').onclick = function () { doExport('copy'); };
  $('btn-voice').onclick = toggleVoice;
  $('btn-hide').onclick = function () { PA.hide(); };
  $('btn-settings').onclick = openSettingsPanel;
  $('btn-settings-close').onclick = function () { $('settings').classList.remove('open'); };
  $('btn-save').onclick = saveSettings;
  $('btn-quit').onclick = function () { PA.quit(); };
  $('cfg-asr-engine').onchange = syncAsrFields;
  $('cfg-asr-preset').onchange = applyPreset;
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(this.value); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('settings').classList.contains('open')) $('settings').classList.remove('open');
      else PA.hide();
    }
  });

  bindWelcome();
  loadSettings();
  updateStatus();
})();
