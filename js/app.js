/**
 * 应用装配层：把 UI、编辑器、存储、运行引擎接起来。
 * 只做"胶水"，具体能力都在别的模块里。
 */

import { CodeEditor } from './editor.js';
import {
  loadState, saveState, makeFile, uniqueName, sanitizeName, languageOf,
  serializeBackup, parseBackup, TEMPLATE_CPP, TEMPLATE_C,
} from './storage.js';
import { runLocal, runOnline } from './runner.js';
import { precheck, detectUnsupported } from './errors.js';
import { expandStructs, usesStruct } from './struct-compat.js';
import { rewriteScanf } from './scanf-compat.js';
import { encodeTextLiterals, decodeText } from './text-compat.js';
import { EXAMPLES } from './examples.js';

const $ = (id) => document.getElementById(id);

const state = loadState(window.localStorage);
const ui = {
  fileName: $('fileName'),
  tabStrip: $('tabStrip'),
  gutter: $('gutter'),
  highlight: $('highlight'),
  bands: $('bands'),
  code: $('code'),
  paneMsg: $('paneMsg'),
  paneOut: $('paneOut'),
  paneIn: $('paneIn'),
  panel: $('panel'),
  stPos: $('stPos'),
  stLang: $('stLang'),
  stEnc: $('stEnc'),
  stEngine: $('stEngine'),
  stTime: $('stTime'),
  drawer: $('drawer'),
  drawerMask: $('drawerMask'),
  fileList: $('fileList'),
  menu: $('menu'),
  menuMask: $('menuMask'),
  examples: $('examples'),
  exMask: $('exMask'),
  exampleList: $('exampleList'),
  help: $('help'),
  helpMask: $('helpMask'),
  toast: $('toast'),
  importFile: $('importFile'),
  restoreFile: $('restoreFile'),
  kbdBar: $('kbdBar'),
};

let dirtyFiles = new Set();
let running = false;
let saveTimer = 0;

/* ============================ 基础工具 ============================ */

function activeFile() {
  return state.files.find((f) => f.id === state.activeId) || state.files[0];
}

function persist() {
  if (!saveState(window.localStorage, state)) toast('保存失败：浏览器存储可能已满');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 700);
}

let toastTimer = 0;
function toast(msg, ms = 2200) {
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
}

function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================ 编辑器 ============================ */

const editor = new CodeEditor({
  textarea: ui.code,
  highlightEl: ui.highlight.firstElementChild ? ui.highlight : ui.highlight,
  gutterEl: ui.gutter,
  bandsEl: ui.bands,
  onChange: (value) => {
    const f = activeFile();
    if (!f) return;
    if (f.content !== value) {
      f.content = value;
      f.updatedAt = Date.now();
      dirtyFiles.add(f.id);
      renderTabs();
      updateStatus();
      scheduleSave();
    }
  },
  onCursor: ({ line, col }) => {
    ui.stPos.textContent = '行 ' + line + ', 列 ' + col;
    renderBandsOnly();
  },
});

function renderBandsOnly() {
  // 当前行高亮跟随光标（editor 内部会重画，这里只做轻量刷新）
  editor._renderBands();
}

/* ============================ 标签页 ============================ */

function renderTabs() {
  ui.tabStrip.innerHTML = '';
  for (const f of state.files) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (f.id === state.activeId ? ' active' : '') + (dirtyFiles.has(f.id) ? ' dirty' : '');
    tab.innerHTML = '<span class="dot"></span><span class="tname"></span>';
    tab.querySelector('.tname').textContent = f.name;
    tab.addEventListener('click', () => switchFile(f.id));
    ui.tabStrip.appendChild(tab);
  }
  ui.fileName.textContent = activeFile() ? activeFile().name : '';
  updateStatus();
}

function switchFile(id) {
  if (running) { toast('程序正在运行，稍等一下'); return; }
  state.activeId = id;
  const f = activeFile();
  if (!f) return;
  editor.setValue(f.content);
  editor.markError(null);
  renderTabs();
  persist();
}

function updateStatus() {
  const f = activeFile();
  ui.stLang.textContent = f ? (languageOf(f.name) === 'c' ? 'C' : 'C++') : 'C++';
  ui.stEnc.textContent = 'UTF-8';
  ui.stEngine.textContent = state.settings.engine === 'online' ? '联网 g++' : '本地引擎';
}

/* ============================ 文件操作 ============================ */

function newFile() {
  const name = prompt('新文件名（.c 或 .cpp）', 'main.cpp');
  if (name === null) return;
  const finalName = uniqueName(state.files, sanitizeName(name));
  const content = languageOf(finalName) === 'c' ? TEMPLATE_C : TEMPLATE_CPP;
  const f = makeFile(finalName, content);
  state.files.push(f);
  switchFile(f.id);
  toast('已新建 ' + finalName);
}

function deleteFile(id) {
  if (state.files.length <= 1) { toast('至少要留一个文件'); return; }
  const f = state.files.find((x) => x.id === id);
  if (!f) return;
  if (!confirm('删除 ' + f.name + '？删掉就找不回来了。')) return;
  state.files = state.files.filter((x) => x.id !== id);
  if (state.activeId === id) state.activeId = state.files[0].id;
  switchFile(state.activeId);
  renderDrawer();
  persist();
}

function renameFile() {
  const f = activeFile();
  if (!f) return;
  const name = prompt('改文件名', f.name);
  if (name === null) return;
  f.name = uniqueName(state.files.filter((x) => x.id !== f.id), sanitizeName(name));
  f.updatedAt = Date.now();
  renderTabs();
  renderDrawer();
  persist();
}

function saveCurrent() {
  const f = activeFile();
  if (!f) return;
  download(f.name, f.content);
  dirtyFiles.delete(f.id);
  renderTabs();
  toast('已下载 ' + f.name + ' 到「文件」App');
}

function importFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let pending = files.length;
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const name = uniqueName(state.files, sanitizeName(file.name));
      const f = makeFile(name, String(reader.result || ''));
      state.files.push(f);
      state.activeId = f.id;
      if (--pending === 0) { switchFile(state.activeId); renderDrawer(); persist(); toast('已导入 ' + files.length + ' 个文件'); }
    };
    reader.onerror = () => { if (--pending === 0) toast('有文件读取失败'); };
    reader.readAsText(file, 'utf-8');
  });
}

/* ============================ 输出面板 ============================ */

function showTab(name) {
  document.querySelectorAll('.ptab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  for (const key of ['msg', 'out', 'in']) {
    const pane = $('pane' + key[0].toUpperCase() + key.slice(1));
    if (pane) pane.classList.toggle('show', key === name);
  }
  ui.panel.classList.remove('collapsed');
}

function clearOutput() {
  ui.paneOut.textContent = '';
  ui.paneMsg.innerHTML = '';
  ui.stTime.textContent = '';
}

function msgCard({ kind = 'err', head, raw, hint, line, action }) {
  const card = document.createElement('div');
  card.className = 'msg ' + kind;
  const h = document.createElement('div');
  h.className = 'head';
  h.textContent = head;
  card.appendChild(h);
  if (raw) {
    const r = document.createElement('div');
    r.className = 'raw';
    r.textContent = raw;
    card.appendChild(r);
  }
  if (hint) {
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = '👉 ' + hint;
    card.appendChild(p);
  }
  if (line) {
    card.addEventListener('click', () => editor.gotoLine(line));
    card.title = '点击跳到第 ' + line + ' 行';
  }
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'tbtn';
    btn.style.marginTop = '6px';
    btn.textContent = action.label;
    btn.addEventListener('click', (e) => { e.stopPropagation(); action.run(); });
    card.appendChild(btn);
  }
  ui.paneMsg.appendChild(card);
  return card;
}

/* ============================ 运行 ============================ */

function switchToOnline(silent) {
  if (!silent) {
    const ok = confirm(
      '联网模式 = 真正的 gcc / g++（GCC 14，和电脑上的 Dev-C++ 同一编译器家族）。\n\n' +
      '✅ 支持：struct、class、std::string、vector、sort、malloc…… 本地引擎跑不了的它都能跑。\n' +
      '✅ 报错也和 Dev-C++ 几乎一样，还能直接看到运行结果。\n\n' +
      '代价：\n· 必须联网\n· 代码会发送到 godbolt.org（公共编译器服务）\n· 公共服务有频率限制\n\n确定切换吗？'
    );
    if (!ok) return;
  }
  state.settings.engine = 'online';
  persist();
  updateStatus();
  if (!silent) {
    showTab('msg');
    ui.paneMsg.innerHTML = '';
    msgCard({
      kind: 'ok',
      head: '✓ 已切换到联网真实 g++（GCC 14）',
      hint: '现在点「▶ 运行」就会用真编译器编译并执行。没网时可以随时切回本地引擎。',
    });
  }
}

async function doRun() {
  if (running) return;
  const f = activeFile();
  if (!f) return;

  const code = f.content;
  const stdin = ui.paneIn.value;

  // 1) 结构预检（一次列出多个低级错误）
  ui.paneMsg.innerHTML = '';
  showTab('msg');
  const issues = precheck(code);
  if (issues.length) {
    for (const it of issues) msgCard({ kind: 'err', head: '第 ' + it.line + ' 行：结构有问题', hint: it.message, line: it.line });
    ui.stTime.textContent = '未运行';
    return;
  }

  // 2) 本地引擎兼容层：结构体展开 + scanf 改写
  let codeToRun = code;
  let compatNote = '';
  let structHandled = false;
  let textMap = null;

  if (state.settings.engine === 'local') {
    if (usesStruct(code)) {
      const st = expandStructs(code);
      if (!st.ok) {
        msgCard({
          kind: 'err',
          head: '这段代码超出离线兼容层的能力',
          hint: (st.reason || '不支持的结构体写法') + (st.detail ? '：' + st.detail : '') +
                '。用联网真实 g++ 可以直接跑（GCC 14，支持完整 struct/class/STL）。',
          action: { label: '切换并重新运行', run: () => { switchToOnline(true); doRun(); } },
        });
        ui.stTime.textContent = '未运行';
        return;
      }
      if (st.structs.length) {
        codeToRun = st.code;
        structHandled = true;
        compatNote += '结构体已展开成按字段命名的变量/数组；';
      }
    }

    const sf = rewriteScanf(codeToRun);
    if (sf.transformed) {
      codeToRun = sf.code;
      compatNote += 'scanf 已改写成安全的读入方式（' + sf.transformed + ' 处）；';
    }

    const enc = encodeTextLiterals(codeToRun);
    if (enc.replaced) {
      codeToRun = enc.code;
      textMap = enc.map;
      compatNote += '中文提示已转义（运行后会自动还原）；';
    }
  }

  // 3) 还是不支持的东西（class / STL / malloc…）就提示切在线
  const unsupported = detectUnsupported(code).filter(
    (u) => !(structHandled && u.what.startsWith('结构体'))
  );
  if (unsupported.length && state.settings.engine === 'local') {
    msgCard({
      kind: 'warn',
      head: '这段代码本地引擎跑不了',
      hint: '检测到：' + unsupported.map((u) => u.what).join('、') + '。切到联网真实 g++ 就能跑（GCC 14，和 Dev-C++ 同一编译器）。',
      action: { label: '切换并重新运行', run: () => { switchToOnline(true); doRun(); } },
    });
  }

  // 3) 执行
  running = true;
  ui.paneOut.textContent = '';
  showTab('out');
  ui.stTime.textContent = '运行中…';
  document.body.classList.add('running');

  const t0 = performance.now();
  let result;
  try {
    result = state.settings.engine === 'online'
      ? await runOnline(codeToRun, stdin, { url: state.settings.onlineUrl || undefined, language: languageOf(f.name) })
      : await runLocal(codeToRun, stdin, {
        onOutput: textMap ? undefined : (chunk) => { ui.paneOut.textContent += chunk; },
      });
  } catch (e) {
    result = { ok: false, out: '', err: { raw: String(e && e.message || e), line: null, hint: '内部错误，请刷新页面重试。' }, ms: 0, engine: 'local' };
  } finally {
    running = false;
    document.body.classList.remove('running');
  }

  if (result.out && !ui.paneOut.textContent) ui.paneOut.textContent = result.out;

  // 还原中文占位符
  if (textMap) {
    ui.paneOut.textContent = decodeText(ui.paneOut.textContent, textMap);
    if (result.err && result.err.raw) result.err.raw = decodeText(result.err.raw, textMap);
  }

  const ms = Math.round(result.ms || (performance.now() - t0));
  ui.stTime.textContent = ms + ' ms';

  if (compatNote) {
    msgCard({
      kind: 'ok',
      head: '✓ 已用离线兼容层自动改写',
      hint: compatNote + '这些只影响运行，你的源代码没有被修改。改写后行号可能和原文差几行。',
    });
  }

  if (result.err) {
    editor.markError(result.err.line || null);
    msgCard({
      kind: 'err',
      head: result.err.line ? '第 ' + result.err.line + ' 行出错了' : '程序出错了',
      hint: result.err.hint || '',
      raw: result.err.raw,
      line: result.err.line || null,
    });
    if (state.settings.engine === 'local') {
      msgCard({
        kind: 'warn',
        head: '本地引擎的报错不如 gcc 精确',
        hint: '如果看不懂这条错误，或者代码用了结构体/STL，用真实 g++ 编译一次会更清楚。',
        action: { label: '用联网 g++ 再跑一次', run: () => { switchToOnline(); doRun(); } },
      });
    }
    showTab('out');
  } else {
    editor.markError(null);
    const card = msgCard({ kind: 'ok', head: '运行结束' });
    card.querySelector('.head').innerHTML = '<span class="ok-text">✓ 运行结束</span>';
    if (typeof result.exitCode === 'number') {
      const d = document.createElement('div');
      d.className = 'raw';
      d.textContent = '退出码 ' + result.exitCode + ' · 用时 ' + ms + ' ms · ' + (result.engine === 'online' ? '联网 g++' : '本地引擎');
      card.appendChild(d);
    }
    ui.paneOut.textContent += '\n';
  }
  renderTabs();
  persist();
}

function checkOnly() {
  const f = activeFile();
  if (!f) return;
  ui.paneMsg.innerHTML = '';
  showTab('msg');
  const issues = precheck(f.content);
  const unsupported = detectUnsupported(f.content);
  if (!issues.length) msgCard({ kind: 'ok', head: '✓ 结构检查通过（括号、注释、main 都正常）' });
  for (const it of issues) msgCard({ kind: 'err', head: '第 ' + it.line + ' 行', hint: it.message, line: it.line });
  for (const u of unsupported) msgCard({ kind: 'warn', head: '本地引擎不支持', hint: u.what + '：可以切换到联网真实 g++。', action: { label: '切换引擎', run: switchToOnline } });
  ui.stTime.textContent = '检查完成';
}

/* ============================ 抽屉 / 菜单 / 弹层 ============================ */

function renderDrawer() {
  ui.fileList.innerHTML = '';
  for (const f of state.files) {
    const row = document.createElement('div');
    row.className = 'file-item' + (f.id === state.activeId ? ' active' : '');
    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = f.name;
    const del = document.createElement('button');
    del.className = 'fdel';
    del.textContent = '✕';
    del.title = '删除';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteFile(f.id); });
    row.appendChild(name);
    row.appendChild(del);
    row.addEventListener('click', () => { switchFile(f.id); closeDrawer(); });
    ui.fileList.appendChild(row);
  }
}

function closeDrawer() { ui.drawer.hidden = true; ui.drawerMask.hidden = true; }
function openDrawer() { renderDrawer(); ui.drawer.hidden = false; ui.drawerMask.hidden = false; }

function closeMenu() { ui.menu.hidden = true; ui.menuMask.hidden = true; }
function openMenu() { ui.menu.hidden = false; ui.menuMask.hidden = false; }

function renderExamples() {
  ui.exampleList.innerHTML = '';
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'ex-item';
    b.innerHTML = '<span class="t"></span><span class="tag"></span>';
    b.querySelector('.t').textContent = ex.title;
    b.querySelector('.tag').textContent = ex.tag;
    b.addEventListener('click', () => {
      const f = makeFile(uniqueName(state.files, ex.name), ex.code);
      state.files.push(f);
      state.activeId = f.id;
      ui.paneIn.value = ex.stdin || '';
      state.settings.stdin = ex.stdin || '';
      switchFile(f.id);
      renderDrawer();
      closeExamples();
      persist();
      toast('已打开例题：' + ex.title);
    });
    ui.exampleList.appendChild(b);
  }
}
function openExamples() { renderExamples(); ui.examples.hidden = false; ui.exMask.hidden = false; }
function closeExamples() { ui.examples.hidden = true; ui.exMask.hidden = true; }

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  state.settings.theme = t;
  persist();
}

function setFont(delta) {
  const next = Math.min(24, Math.max(12, state.settings.fontSize + delta));
  state.settings.fontSize = next;
  document.documentElement.style.setProperty('--fs', next + 'px');
  editor.render();
  persist();
}

/* ============================ 事件绑定 ============================ */

function handleAction(act) {
  switch (act) {
    case 'new': newFile(); break;
    case 'open': ui.importFile.click(); break;
    case 'save': saveCurrent(); break;
    case 'check': checkOnly(); break;
    case 'run': doRun(); break;
    case 'files': openDrawer(); break;
    case 'examples': closeMenu(); openExamples(); break;
    case 'fontUp': setFont(1); break;
    case 'fontDown': setFont(-1); break;
    case 'undo': editor.undo(); break;
    case 'redo': editor.redo(); break;
    case 'panel': ui.panel.classList.toggle('collapsed'); break;
    case 'clear': clearOutput(); break;
    case 'theme': setTheme(state.settings.theme === 'dark' ? 'classic' : 'dark'); closeMenu(); break;
    case 'engine':
      if (state.settings.engine === 'online') {
        state.settings.engine = 'local';
        persist(); updateStatus();
        toast('已切回本地引擎（离线可用）');
      } else {
        switchToOnline();
      }
      closeMenu();
      break;
    case 'rename': renameFile(); closeMenu(); break;
    case 'exportZip':
      download('devcpp-backup-' + new Date().toISOString().slice(0, 10) + '.json', serializeBackup(state), 'application/json');
      closeMenu();
      toast('备份已导出');
      break;
    case 'import': ui.importFile.click(); break;
    case 'restore': ui.restoreFile.click(); closeMenu(); break;
    case 'help': closeMenu(); ui.help.hidden = false; ui.helpMask.hidden = false; break;
    case 'about':
      closeMenu();
      alert('随身 Dev-C++（网页版）\n\n离线运行引擎：JSCPP · MIT License\n网址：https://github.com/felixhao28/JSCPP\n\n这是一个纯前端学习工具，代码只保存在你的设备上。');
      break;
    default: break;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el) { e.preventDefault(); handleAction(el.dataset.act); return; }
  const ins = e.target.closest('[data-ins]');
  if (ins) { e.preventDefault(); editor.insert(ins.dataset.ins); }
});

document.addEventListener('pocket-run', () => doRun());

ui.menuMask.addEventListener('click', closeMenu);
$('menuBtn').addEventListener('click', openMenu);
ui.drawerMask.addEventListener('click', closeDrawer);
$('drawerClose').addEventListener('click', closeDrawer);
ui.exMask.addEventListener('click', closeExamples);
$('exClose').addEventListener('click', closeExamples);
ui.helpMask.addEventListener('click', () => { ui.help.hidden = true; ui.helpMask.hidden = true; });
$('helpClose').addEventListener('click', () => { ui.help.hidden = true; ui.helpMask.hidden = true; });

document.querySelectorAll('.ptab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

ui.importFile.addEventListener('change', () => { importFiles(ui.importFile.files); ui.importFile.value = ''; });
ui.restoreFile.addEventListener('change', () => {
  const file = ui.restoreFile.files && ui.restoreFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const restored = parseBackup(String(reader.result || ''));
      if (!confirm('导入备份会覆盖当前所有文件（' + state.files.length + ' 个），继续吗？')) return;
      state.files = restored.files;
      state.activeId = restored.activeId;
      switchFile(state.activeId);
      renderDrawer(); persist();
      toast('备份已恢复');
    } catch (err) {
      toast('备份文件读不了：' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
  ui.restoreFile.value = '';
});

ui.paneIn.addEventListener('input', () => { state.settings.stdin = ui.paneIn.value; scheduleSave(); });

// 快捷键：⌘S 保存、⌘N 新建、⌘P 面板
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); saveCurrent(); }
  else if (k === 'n') { e.preventDefault(); newFile(); }
  else if (k === 'p') { e.preventDefault(); ui.panel.classList.toggle('collapsed'); }
  else if (k === 'k') { e.preventDefault(); openMenu(); }
});

/* 软键盘弹出时，把 App 高度锁在可视区，避免工具栏被顶飞 */
if (window.visualViewport) {
  const syncViewport = () => {
    document.documentElement.style.setProperty('--app-h', window.visualViewport.height + 'px');
  };
  window.visualViewport.addEventListener('resize', syncViewport);
  window.visualViewport.addEventListener('scroll', syncViewport);
  syncViewport();
}

/* ============================ 启动 ============================ */

function boot() {
  document.documentElement.style.setProperty('--fs', state.settings.fontSize + 'px');
  const themeParam = new URLSearchParams(location.search).get('theme');
  document.documentElement.dataset.theme = (themeParam === 'dark' || themeParam === 'classic') ? themeParam : (state.settings.theme || 'classic');
  ui.paneIn.value = state.settings.stdin || '';

  const f = activeFile();
  editor.ta.value = f.content;
  editor.prevValue = f.content;
  editor._renderNow();
  editor.emitCursor();

  renderTabs();
  renderDrawer();
  updateStatus();

  // 关页/切后台时立即存盘
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
  window.addEventListener('pagehide', persist);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

/* 自检钩子：地址栏加 ?selftest=1，用于无头浏览器验证 */
if (new URLSearchParams(location.search).has('selftest')) {
  (async () => {
    const results = [];
    const push = (name, ok, info = '') => results.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' :: ' + info : ''));
    try {
      push('JSCPP loaded', !!(window.JSCPP && window.JSCPP.run));
      let out = '';
      const rc = window.JSCPP.run('#include <stdio.h>\nint main(){printf("%d",1+2);return 0;}', '', {
        stdio: { write: (s) => { out += s; return s.length; } }, maxTimeout: 2000,
      });
      push('engine printf', out === '3' && rc === 0, 'out=' + JSON.stringify(out) + ' rc=' + rc);
      push('highlight', ui.highlight.innerHTML.includes('tok-kw'));
      push('editor value', editor.value === activeFile().content);
      push('precheck clean', precheck(editor.value).length === 0);
      push('precheck detects', precheck('int main(){ if(1){ } ').length > 0);

      const runner = await import('./runner.js');
      const r1 = await runner.runLocal('#include <stdio.h>\nint main(){int a,b;scanf("%d%d",&a,&b);printf("%d",a+b);return 0;}', '1 2');
      push('run + scanf', r1.ok && r1.out === '3', JSON.stringify({ ok: r1.ok, out: r1.out }));
      const r2 = await runner.runLocal('int main(){ int a = 1 return 0; }', '');
      push('syntax error has line', !!r2.err && !!r2.err.line, JSON.stringify(r2.err && r2.err.raw).slice(0, 80));
      const r3 = await runner.runLocal('int main(){ int a[2]; a[5] = 1; return 0; }', '');
      push('bounds caught', !r3.ok, r3.err ? String(r3.err.raw).slice(0, 60) : 'no error');
      const r5 = await runner.runLocal('#include <iostream>\nusing namespace std;\nint main(){int a; cin>>a; cout<<a*2<<endl; return 0;}', '21');
      push('c++ cin/cout', r5.ok && r5.out.trim() === '42', JSON.stringify(r5.out));
      push('examples count', EXAMPLES.length >= 10, String(EXAMPLES.length));

      // 端到端：走一遍真实 UI 的"运行"路径
      const f = activeFile();
      f.content = '#include <stdio.h>\nint main(){int a,b;scanf("%d%d",&a,&b);printf("%d",a+b);return 0;}';
      editor.ta.value = f.content;
      ui.paneIn.value = '7 8';
      await doRun();
      push('ui run end-to-end', ui.paneOut.textContent.trim() === '15', JSON.stringify(ui.paneOut.textContent.trim()));
      push('no error marked', editor.errorLine === null, String(editor.errorLine));

      // 结构体 + 数组输入（离线兼容层）端到端
      f.content = '#include <stdio.h>\nstruct Stu{char name[10];int score;};\nint main(){struct Stu a[2];scanf("%s%d",a[0].name,&a[0].score);printf("%s=%d",a[0].name,a[0].score);return 0;}';
      editor.ta.value = f.content;
      ui.paneIn.value = 'Ann 88';
      await doRun();
      push('struct+scanf 端到端', ui.paneOut.textContent.trim() === 'Ann=88', JSON.stringify(ui.paneOut.textContent.trim()));

      // 数组循环读入（离线兼容层）端到端
      f.content = '#include <stdio.h>\nint main(){int a[3];for(int i=0;i<3;i++)scanf("%d",&a[i]);int s=0;for(int i=0;i<3;i++)s+=a[i];printf("%d",s);return 0;}';
      editor.ta.value = f.content;
      ui.paneIn.value = '1 2 3';
      await doRun();
      push('array+scanf 端到端', ui.paneOut.textContent.trim() === '6', JSON.stringify(ui.paneOut.textContent.trim()));

      // 中文输出（离线引擎会把中文转义再还原）
      f.content = '#include <stdio.h>\nint main(){int s=88;printf("平均分 = %d\\n", s);return 0;}';
      editor.ta.value = f.content;
      ui.paneIn.value = '';
      await doRun();
      push('中文输出还原', ui.paneOut.textContent.includes('平均分'), JSON.stringify(ui.paneOut.textContent.trim()));
    } catch (e) {
      push('selftest crash', false, e.message);
    }
    ui.paneMsg.innerHTML = '<pre>' + results.join('\n') + '</pre>';
    document.title = results.some((r) => r.startsWith('FAIL')) ? 'SELFTEST FAIL' : 'SELFTEST PASS';
    console.log(results.join('\n'));
  })();
}
