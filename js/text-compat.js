/**
 * 中文文本兼容层（本地离线引擎专用）
 *
 * 问题：JSCPP 的 char 是 8 位，字符串里出现中文会直接报
 *   overflow of '你'(char)
 * 但纯 ASCII 字符串是正常的。
 *
 * 做法：把字符串字面量里的非 ASCII 片段换成占位符，
 *   printf("平均分 = %d\n", avg)  →  printf("@@Z0@@%d\n", avg)
 * 运行结束后再把输出里的占位符还原成中文。
 *
 * 注意：换掉以后 strlen("中文") 会变成占位符长度，属于已知限制；
 * 对"输出中文提示"这个最常见的场景没有影响。
 */

import { tokenize } from './struct-compat.js';

const MARK = (i) => '@@Z' + i + '@@';
export const MARK_RE = /@@Z\d+@@/g;

/**
 * @param {string} code
 * @returns {{code:string, map:Object<string,string>, replaced:number}}
 */
export function encodeTextLiterals(code) {
  if (!/[^\x00-\x7F]/.test(code)) return { code, map: {}, replaced: 0 };

  const tokens = tokenize(code);
  const map = {};
  let idx = 0;
  let replaced = 0;

  for (const tk of tokens) {
    if (tk.t !== 'str') continue;
    const v = tk.v;
    if (v.length < 2) continue;
    const quote = v[0];
    const body = v.slice(1, -1);
    if (!/[^\x00-\x7F]/.test(body)) continue;

    // 把连续的非 ASCII 片段替换成占位符，保留 ASCII（含 %d 这类格式符）
    let out = '';
    let i = 0;
    while (i < body.length) {
      if (body.charCodeAt(i) < 128) { out += body[i]; i++; continue; }
      let j = i;
      while (j < body.length && body.charCodeAt(j) >= 128) j++;
      const marker = MARK(idx);
      map[marker] = body.slice(i, j);
      out += marker;
      idx++;
      i = j;
    }
    tk.v = quote + out + quote;
    replaced++;
  }

  return { code: tokens.map((t) => t.v).join(''), map, replaced };
}

/** 把输出里的占位符还原成中文 */
export function decodeText(text, map) {
  if (!map || !text) return text;
  return String(text).replace(MARK_RE, (m) => (m in map ? map[m] : m));
}
