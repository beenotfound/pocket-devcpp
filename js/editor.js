/**
 * 编辑器：原生 textarea + 高亮图层 + 行号槽
 * 这样做的好处（也是选它的原因）：
 *  - 中文输入法完全正常（不用第三方编辑器就不会有输入法串行/光标乱跳）
 *  - 零依赖、离线可用
 *  - 光标、选择、长按复制粘贴都是系统原生行为
 */

import { highlight } from './highlight.js';

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
const CLOSERS = new Set([')', ']', '}', '"', "'"]);

export class CodeEditor {
  constructor({ textarea, highlightEl, gutterEl, bandsEl, onChange, onCursor }) {
    this.ta = textarea;
    this.hl = highlightEl;
    this.gutter = gutterEl;
    this.bands = bandsEl;
    this.onChange = onChange || (() => {});
    this.onCursor = onCursor || (() => {});

    this.undoStack = [];
    this.redoStack = [];
    this.prevValue = this.ta.value;
    this.lastPush = 0;
    this.errorLine = null;
    this._raf = 0;

    this._bind();
    this.render();
  }

  get value() { return this.ta.value; }

  set value(v) {
    this.ta.value = v;
    this.prevValue = v;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.render();
    this.onChange(v);
  }

  /* ---------------- 渲染 ---------------- */

  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._renderNow();
    });
  }

  _renderNow() {
    const code = this.ta.value;
    // 结尾是换行时补一个空格，保证高亮层比 textarea 少一行的视觉差消失
    this.hl.innerHTML = highlight(code.endsWith('\n') ? code + ' ' : code);
    this._renderGutter(code);
    this._renderBands();
    this.syncScroll();
  }

  _renderGutter(code) {
    const lines = code.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
      html += '<div class="ln' + (i === this.errorLine ? ' err' : '') + '">' + i + '</div>';
    }
    this.gutter.innerHTML = html;
  }

  _renderBands() {
    const lineHeight = this.lineHeight();
    const line = this.currentLine();
    let html = '';
    if (line !== this.errorLine) {
      html += '<div class="band cur" style="top:' + (8 + (line - 1) * lineHeight) + 'px"></div>';
    }
    if (this.errorLine) {
      html += '<div class="band err" style="top:' + (8 + (this.errorLine - 1) * lineHeight) + 'px"></div>';
    }
    this.bands.innerHTML = html;
    this.bands.style.transform = this.hl.style.transform;
  }

  syncScroll() {
    const x = this.ta.scrollLeft;
    const y = this.ta.scrollTop;
    const t = 'translate(' + -x + 'px,' + -y + 'px)';
    this.hl.style.transform = t;
    this.bands.style.transform = t;
    this.gutter.scrollTop = y;
  }

  lineHeight() {
    const v = parseFloat(getComputedStyle(this.ta).lineHeight);
    return Number.isFinite(v) ? v : 22;
  }

  /* ---------------- 光标 / 行号 ---------------- */

  selection() {
    return { start: this.ta.selectionStart, end: this.ta.selectionEnd };
  }

  currentLine() {
    return this.lineAt(this.ta.selectionStart);
  }

  lineAt(offset) {
    return this.ta.value.slice(0, offset).split('\n').length;
  }

  lineStartOffset(line) {
    const parts = this.ta.value.split('\n');
    let off = 0;
    for (let i = 0; i < line - 1 && i < parts.length; i++) off += parts[i].length + 1;
    return off;
  }

  emitCursor() {
    const sel = this.selection();
    const pos = sel.start;
    const before = this.ta.value.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - (before.lastIndexOf('\n') + 1) + 1;
    this.onCursor({ line, col, selected: sel.end - sel.start });
  }

  /* ---------------- 撤销 / 重做 ---------------- */

  _pushUndo(value, sel) {
    const now = Date.now();
    if (now - this.lastPush < 450 && this.undoStack.length) return;
    this.lastPush = now;
    this.undoStack.push({ value, start: sel.start, end: sel.end });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push({ value: this.ta.value, start: this.ta.selectionStart, end: this.ta.selectionEnd });
    const s = this.undoStack.pop();
    this.ta.value = s.value;
    this.ta.setSelectionRange(s.start, s.end);
    this._afterEdit(true);
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push({ value: this.ta.value, start: this.ta.selectionStart, end: this.ta.selectionEnd });
    const s = this.redoStack.pop();
    this.ta.value = s.value;
    this.ta.setSelectionRange(s.start, s.end);
    this._afterEdit(true);
    return true;
  }

  _afterEdit(silent) {
    this.prevValue = this.ta.value;
    this._renderNow();
    this.emitCursor();
    if (!silent) this.onChange(this.ta.value);
    else this.onChange(this.ta.value);
  }

  /** 用新内容替换选区（自己的编辑入口，统一走这里） */
  replaceRange(text, start, end, caretStart, caretEnd) {
    const value = this.ta.value;
    this._pushUndo(value, { start, end });
    const next = value.slice(0, start) + text + value.slice(end);
    this.ta.value = next;
    const cs = caretStart === undefined ? start + text.length : caretStart;
    const ce = caretEnd === undefined ? cs : caretEnd;
    this.ta.setSelectionRange(cs, ce);
    this._afterEdit();
  }

  insert(text) {
    const { start, end } = this.selection();
    this.replaceRange(text, start, end);
    this.ta.focus();
  }

  /* ---------------- 缩进 ---------------- */

  indent() {
    const { start, end } = this.selection();
    const value = this.ta.value;
    if (start === end) {
      this.replaceRange('    ', start, end);
      return;
    }
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const to = value.indexOf('\n', end);
    const block = value.slice(from, to < 0 ? value.length : to);
    const lines = block.split('\n').map((l) => '    ' + l);
    this.replaceRange(lines.join('\n'), from, to < 0 ? value.length : to, from + 4, from + 4 + block.length + 3);
  }

  outdent() {
    const { start, end } = this.selection();
    const value = this.ta.value;
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const toRaw = value.indexOf('\n', end);
    const to = toRaw < 0 ? value.length : toRaw;
    const block = value.slice(from, to);
    const changed = block.replace(/^ {1,4}/gm, '');
    this.replaceRange(changed, from, to, Math.max(from, start - 4));
  }

  /* ---------------- 定位 / 错误标记 ---------------- */

  gotoLine(line) {
    const total = this.ta.value.split('\n').length;
    const n = Math.min(Math.max(1, line), total);
    const off = this.lineStartOffset(n);
    const lineEnd = this.ta.value.indexOf('\n', off);
    this.ta.focus();
    this.ta.setSelectionRange(off, lineEnd < 0 ? this.ta.value.length : lineEnd);
    const lh = this.lineHeight();
    this.ta.scrollTop = Math.max(0, (n - 1) * lh - this.ta.clientHeight / 3);
    this._renderNow();
    this.emitCursor();
  }

  markError(line) {
    this.errorLine = line || null;
    this._renderNow();
  }

  /* ---------------- 键盘 / 输入 ---------------- */

  _bind() {
    const ta = this.ta;

    ta.addEventListener('scroll', () => this.syncScroll(), { passive: true });
    ta.addEventListener('click', () => { this.emitCursor(); this._renderBands(); });
    ta.addEventListener('keyup', () => this.emitCursor());
    ta.addEventListener('select', () => this.emitCursor());

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ta) this.emitCursor();
    });

    ta.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.redo();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) this.outdent(); else this.indent();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this._handleEnter();
        return;
      }
      if (e.key === 'Backspace') {
        // 智能退格：在 "    |" 的空缩进处一次退 4 格
        const { start, end } = this.selection();
        if (start === end) {
          const before = ta.value.slice(0, start);
          const lineStart = before.lastIndexOf('\n') + 1;
          const indent = before.slice(lineStart);
          if (indent.length > 0 && /^ +$/.test(indent) && indent.length % 4 === 0) {
            e.preventDefault();
            this.replaceRange('', start - 4, start);
            return;
          }
        }
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('pocket-run'));
      }
    });

    ta.addEventListener('input', (e) => {
      if (e.isComposing) return;
      const before = this.prevValue;
      const after = ta.value;
      if (before === after) return;

      // 记录撤销点（用修改前的值）
      const now = Date.now();
      if (now - this.lastPush > 450) {
        this.lastPush = now;
        this.undoStack.push({ value: before, start: ta.selectionStart, end: ta.selectionEnd });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack.length = 0;
      }

      if (e.data && e.data.length === 1 && !this._handledPair(after, e.data)) {
        this.prevValue = after;
      } else {
        this.prevValue = ta.value;
      }

      this._renderNow();
      this.emitCursor();
      this.onChange(ta.value);
    });

    ta.addEventListener('compositionend', () => {
      this.prevValue = ta.value;
      this._renderNow();
    });
  }

  /** 自动配对：返回 true 表示已经处理过，不再走普通流程 */
  _handledPair(value, data) {
    const pos = this.ta.selectionStart;

    // 输入左括号/引号：自动补右半边
    const closer = PAIRS[data];
    if (closer) {
      const nextChar = value[pos] || '';
      if (nextChar === '' || /[\s)\]};,]/.test(nextChar)) {
        if (nextChar === closer) return false; // 下一个正好是它，直接跳过
        this.replaceRange(closer, pos, pos, pos, pos);
        return true;
      }
      return false;
    }

    // 输入右括号：如果下一个字符正好是它，说明是自动补的，跳过而不是重复插入
    if (CLOSERS.has(data)) {
      const prevChar = value[pos - 2] || '';
      const nextChar = value[pos] || '';
      if (prevChar === data && nextChar === data) {
        // 用户刚输入的重复字符，删掉新输入并把光标移到后一个括号后面
        this.replaceRange('', pos - 1, pos, pos - 1, pos - 1);
        return true;
      }
    }
    return false;
  }

  _handleEnter() {
    const { start, end } = this.selection();
    const value = this.ta.value;
    const before = value.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineText = before.slice(lineStart);
    const indentMatch = lineText.match(/^[ \t]*/);
    let indent = indentMatch ? indentMatch[0] : '';

    const trimmed = lineText.trimEnd();
    const opensBlock = /[{(]$/.test(trimmed) || /:\s*$/.test(trimmed) && /\b(if|for|while|switch|else|default)\b/.test(lineText);

    if (opensBlock) indent += '    ';
    this.replaceRange('\n' + indent, start, end);
  }
}
