/**
 * enum 兼容层（本地离线引擎专用）
 *
 * 引擎不支持 enum，但 enum 在 C 里基本就是"整数常量 + 一个 int 类型"，
 * 所以可以直接展开：
 *
 *   enum Color { RED, GREEN = 5, BLUE };
 *   enum Color c = RED;
 *   ↓
 *   #define RED 0
 *   #define GREEN 5
 *   #define BLUE 6
 *   int c = 0;
 *
 * 规则：
 *  - 只支持整数常量（十进制/十六进制，可带负号）；遇到表达式就拒绝，交给联网引擎
 *  - 支持 typedef enum {...} Alias;  →  #define + typedef int Alias;
 *  - 支持 enum Tag 作为类型使用 → int
 */

import { tokenize } from './struct-compat.js';

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

const reject = (reason, detail) => ({ ok: false, reason, detail });

/** 解析 `= 表达式`，只接受整数常量 */
function parseConstExpr(tokens, from, to) {
  const parts = tokens.slice(from, to).filter((t) => !isTrivia(t));
  if (!parts.length) return null;
  let sign = 1;
  let i = 0;
  if (parts[i].v === '-') { sign = -1; i++; }
  else if (parts[i].v === '+') { i++; }
  if (i >= parts.length) return null;
  const v = parts[i].v;
  if (!/^(0[xX][0-9a-fA-F]+|\d+)$/.test(v)) return null;
  if (i !== parts.length - 1) return null;
  const num = /^0[xX]/.test(v) ? parseInt(v, 16) : parseInt(v, 10);
  if (!Number.isFinite(num)) return null;
  return sign * num;
}

/**
 * @param {string} code
 * @returns {{ok:true, code:string, count:number} | {ok:false, reason:string, detail?:string}}
 */
export function expandEnums(code) {
  if (!/\benum\b/.test(code)) return { ok: true, code, count: 0 };

  const tokens = tokenize(code);
  const defines = [];
  const aliasTypes = new Set();
  let count = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (!isId(tokens[i], 'enum')) continue;

    let j = nextSig(tokens, i + 1);
    let tag = null;
    let tagIdx = -1;
    if (isId(tokens[j])) { tag = tokens[j].v; tagIdx = j; j = nextSig(tokens, j + 1); }

    // 不是定义，只是类型使用：enum Tag  →  int
    if (!isPunct(tokens[j], '{')) {
      if (!tag) continue;
      tokens[i] = { t: 'id', v: 'int' };
      tokens[tagIdx] = { t: 'ws', v: ' ' };
      for (let k = i + 1; k < tagIdx; k++) tokens[k] = { t: 'ws', v: '' };
      continue;
    }

    // 定义：解析 { ... }
    const close = findMatching(tokens, j, '{', '}');
    if (close < 0) return reject('enum 定义没有闭合', '找不到对应的 }');

    const members = [];
    let k = j + 1;
    let cursor = -1;
    while (k < close) {
      const t = tokens[k];
      if (isTrivia(t) || isPunct(t, ',')) { k++; continue; }
      if (t.t !== 'id') return reject('enum 成员写法不认识', JSON.stringify(t.v));

      const name = t.v;
      let value = null;

      // 看后面有没有 = 表达式
      let m = nextSig(tokens, k + 1);
      if (isPunct(tokens[m], '=')) {
        const end = m + 1;
        let q = end;
        let depth = 0;
        while (q < close) {
          const tk2 = tokens[q];
          if (isPunct(tk2, '(') || isPunct(tk2, '[')) depth++;
          else if (isPunct(tk2, ')') || isPunct(tk2, ']')) depth--;
          else if (isPunct(tk2, ',') && depth === 0) break;
          q++;
        }
        value = parseConstExpr(tokens, end, q);
        if (value === null) {
          return reject('enum 成员用了不支持的初值表达式', '只支持整数常量，例如 GREEN = 5');
        }
        k = q;
      } else {
        k++;
      }

      cursor = value === null ? cursor + 1 : value;
      members.push({ name, value: cursor });
    }

    if (!members.length) return reject('enum 没有任何成员', '空 enum');

    for (const mb of members) defines.push('#define ' + mb.name + ' ' + mb.value);

    // typedef enum {...} Alias;
    let m2 = nextSig(tokens, close + 1);
    let alias = null;
    if (isId(tokens[m2])) { alias = tokens[m2].v; m2 = nextSig(tokens, m2 + 1); }
    let typedefStart = prevSig(tokens, i - 1);
    const isTypedef = isId(tokens[typedefStart], 'typedef');

    if (alias) {
      // 不管有没有 typedef，别名都当成 int 类型
      aliasTypes.add(alias);
      defines.push('typedef int ' + alias + ';');
    }
    if (!isPunct(tokens[m2], ';')) return reject('enum 定义后缺少分号', '检查 } 后面是否漏了 ;');

    // 删除原定义（含 typedef 关键字）
    const from = isTypedef ? typedefStart : i;
    for (let q = from; q <= m2; q++) tokens[q] = { t: 'ws', v: '' };
    tokens[from] = { t: 'gen', v: '' };
    count++;
    i = m2;
  }

  if (!count) {
    return { ok: true, code, count: 0 };
  }

  const body = tokens.map((t) => t.v).join('');
  const header = defines.join('\n') + '\n\n';
  return { ok: true, code: header + body, count };
}
