/**
 * scanf 兼容层（本地离线引擎专用）
 *
 * 为什么需要：JSCPP 的 scanf 只能安全地写进"单个变量"，
 *   int  a[3];  scanf("%d", &a[i]);   → Memory overflow
 *   float a[3]; scanf("%f", &a[i]);   → Memory overflow
 *   char  c;    scanf("%c", &c);      → Memory overflow
 * 但写进 char 数组（%s）和单个 int/float 是好的。
 *
 * 做法：把 scanf 拆成"先读到临时变量、再赋值"：
 *   scanf("%d", &a[i]);   →   a[i] = __pocket_rd_int();
 *
 * 只有"一眼能看懂、能安全改写"的才改；格式串里有额外字符、参数不是取地址、
 * 或者 scanf 出现在表达式中，都会原样保留（不做任何修改）。
 */

import { tokenize } from './struct-compat.js';

const HELPERS_MARK = 'int __pocket_rd_int() {';
const HELPERS = [
  '',
  '/* ---- 随身 Dev-C++：scanf 兼容层（本地引擎） ---- */',
  'int __pocket_rd_int() { int t = 0; scanf("%d", &t); return t; }',
  'float __pocket_rd_float() { float t = 0; scanf("%f", &t); return t; }',
  'char __pocket_rd_char() { char b[8] = {0}; scanf("%s", b); return b[0]; }',
  '',
].join('\n');

const isTrivia = (tk) => tk && (tk.t === 'ws' || tk.t === 'com' || tk.t === 'pre');
const isId = (tk, v) => tk && tk.t === 'id' && (v === undefined || tk.v === v);
const isPunct = (tk, v) => tk && tk.t === 'punct' && tk.v === v;

function nextSig(tokens, from) {
  for (let i = from; i < tokens.length; i++) if (!isTrivia(tokens[i])) return i;
  return -1;
}
function prevSig(tokens, from) {
  for (let i = from; i >= 0; i--) if (!isTrivia(tokens[i])) return i;
  return -1;
}
function findMatching(tokens, start, open, close) {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (isPunct(tokens[i], open)) depth++;
    else if (isPunct(tokens[i], close)) { depth--; if (depth === 0) return i; }
  }
  return -1;
}
const text = (tokens, from, to) => tokens.slice(from, to + 1).map((t) => t.v).join('');

/** 解析格式串，返回 [{raw, conv}]；格式串里出现任何非空白字面字符就返回 null */
function parseFormat(format) {
  const specs = [];
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c !== '%') return null;               // 有字面字符（比如 "%d,%d"）→ 不改写
    let j = i + 1;
    while (j < format.length && /[-+ 0#]/.test(format[j])) j++;   // 标志
    while (j < format.length && /[0-9]/.test(format[j])) j++;      // 宽度
    if (format[j] === '.') { j++; while (j < format.length && /[0-9]/.test(format[j])) j++; }
    while (j < format.length && /[lhL]/.test(format[j])) j++;      // 长度修饰
    const conv = format[j];
    if (!conv) return null;
    const raw = format.slice(i, j + 1);
    if (!/[diouxXfFeEgGcs]/.test(conv)) return null;
    if (conv === 'l' ) return null;
    specs.push({ raw, conv });
    i = j + 1;
  }
  return specs;
}

/**
 * @param {string} code
 * @returns {{ok:true, code:string, transformed:number}}
 */
export function rewriteScanf(code) {
  if (!/\bscanf\s*\(/.test(code)) return { ok: true, code, transformed: 0 };

  const tokens = tokenize(code);
  let transformed = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (!isId(tokens[i], 'scanf')) continue;

    // 只处理"独立语句"形式的 scanf，避免破坏 if (scanf(...)) 这类表达式
    const prev = prevSig(tokens, i - 1);
    const statementStart = prev < 0
      || isPunct(tokens[prev], ';')
      || isPunct(tokens[prev], '{')
      || isPunct(tokens[prev], '}')
      || isPunct(tokens[prev], ')');   // for (...) scanf(...) / if (...) scanf(...)
    if (!statementStart) continue;

    const open = nextSig(tokens, i + 1);
    if (!isPunct(tokens[open], '(')) continue;
    const close = findMatching(tokens, open, '(', ')');
    if (close < 0) continue;
    const semi = nextSig(tokens, close + 1);
    if (!isPunct(tokens[semi], ';')) continue;

    // 拆分参数
    const args = [];
    let depth = 0;
    let argStart = open + 1;
    for (let k = open + 1; k < close; k++) {
      const tk = tokens[k];
      if (isPunct(tk, '(') || isPunct(tk, '[') || isPunct(tk, '{')) depth++;
      else if (isPunct(tk, ')') || isPunct(tk, ']') || isPunct(tk, '}')) depth--;
      else if (isPunct(tk, ',') && depth === 0) {
        args.push(text(tokens, argStart, k - 1));
        argStart = k + 1;
      }
    }
    args.push(text(tokens, argStart, close - 1));
    if (args.length < 2) continue;

    // 第一个参数必须是字符串字面量
    const fmtToken = tokens.slice(open + 1, close).find((t) => !isTrivia(t));
    if (!fmtToken || fmtToken.t !== 'str') continue;
    const rawFormat = fmtToken.v;
    if (rawFormat.length < 2 || rawFormat[0] !== '"' || rawFormat[rawFormat.length - 1] !== '"') continue;
    const format = rawFormat.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const specs = parseFormat(format);
    if (!specs || specs.length !== args.length - 1) continue;

    // 逐个生成语句
    const stmts = [];
    let unsupported = false;
    for (let s = 0; s < specs.length; s++) {
      const spec = specs[s];
      const arg = args[s + 1].trim();
      if (!arg) { unsupported = true; break; }

      if (spec.conv === 's') {
        const dest = arg.startsWith('&') ? arg.slice(1).trim() : arg;
        stmts.push('scanf("' + spec.raw + '", ' + dest + ');');
        continue;
      }

      if (!arg.startsWith('&')) { unsupported = true; break; }
      const dest = arg.slice(1).trim();
      if (!dest) { unsupported = true; break; }

      if (/[diouxX]/.test(spec.conv)) stmts.push(dest + ' = __pocket_rd_int();');
      else if (/[feEgG]/.test(spec.conv)) stmts.push(dest + ' = __pocket_rd_float();');
      else if (spec.conv === 'c') stmts.push(dest + ' = __pocket_rd_char();');
      else { unsupported = true; break; }
    }
    if (unsupported || !stmts.length) continue;

    // 替换整条语句；多条语句要包成块，否则 for(...) scanf(...) 这种循环体只有第一条会循环
    for (let k = i; k <= semi; k++) tokens[k] = { t: 'ws', v: '' };
    const replacement = stmts.length > 1 ? '{ ' + stmts.join(' ') + ' }' : stmts[0];
    tokens[i] = { t: 'gen', v: replacement };
    transformed++;
  }

  if (!transformed) return { ok: true, code, transformed: 0 };

  let out = tokens.map((t) => t.v).join('');
  if (!out.includes(HELPERS_MARK)) {
    // 插到最后一个 #include / using 之后，保证能用 scanf
    const lastInclude = out.lastIndexOf('#include');
    if (lastInclude >= 0) {
      const lineEnd = out.indexOf('\n', lastInclude);
      const at = lineEnd < 0 ? out.length : lineEnd + 1;
      out = out.slice(0, at) + HELPERS + out.slice(at);
    } else {
      out = HELPERS + out;
    }
  }
  return { ok: true, code: out, transformed };
}
