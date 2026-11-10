/**
 * C/C++ 语法着色（纯函数，可在 Node 里单测）
 * highlight(code) -> HTML 字符串
 * 只用 span + class，样式全部在 app.css 里控制。
 */

const KEYWORDS = new Set((
  'auto break case const continue default do else enum extern for goto if inline ' +
  'register restrict return sizeof static struct switch typedef union volatile while ' +
  'class public private protected virtual friend template typename namespace using new ' +
  'delete this operator try catch throw true false nullptr NULL bool'
).split(' '));

const TYPES = new Set((
  'int char float double void long short signed unsigned size_t ssize_t FILE string ' +
  'int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t'
).split(' '));

const BUILTINS = new Set((
  'printf scanf puts gets putchar getchar sprintf sscanf fprintf malloc calloc realloc free ' +
  'exit abort abs labs fabs sqrt pow floor ceil round rand srand time ' +
  'strlen strcpy strncpy strcat strncat strcmp strncmp memset memcpy memmove ' +
  'cin cout cerr endl std to_string stoi stod sort reverse max min swap'
).split(' '));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);

// 顺序很重要：注释 / 字符串 / 字符 / 预处理 / 数字 / 标识符 / 标点 / 运算符
const TOKEN_RE = new RegExp([
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/.source,          // 1 注释
  /("(?:\\.|[^"\\\n])*"?)/.source,                 // 2 字符串
  /('(?:\\.|[^'\\\n])*'?)/.source,                 // 3 字符
  /(^[ \t]*#[^\n]*)/.source,                       // 4 预处理
  /(\b(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)[fFuUlL]*\b)/.source, // 5 数字
  /([A-Za-z_]\w*)/.source,                         // 6 标识符
  /([{}()\[\];,])/.source,                         // 7 标点
  /([-+*/%=<>!&|^~?:.]+)/.source,                  // 8 运算符
].join('|'), 'gm');

export function highlight(code) {
  let html = '';
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) html += escapeHtml(code.slice(last, m.index));
    const [text, comment, str, chr, pp, num, ident, punct, op] = m;

    if (comment) html += cls('tok-com', text);
    else if (str) html += cls('tok-str', text);
    else if (chr) html += cls('tok-str', text);
    else if (pp) html += cls('tok-pp', text);
    else if (num) html += cls('tok-num', text);
    else if (ident) {
      const nextIsCall = /^\s*\(/.test(code.slice(m.index + text.length));
      let kind = null;
      if (KEYWORDS.has(text)) kind = 'tok-kw';
      else if (TYPES.has(text)) kind = 'tok-type';
      else if (BUILTINS.has(text)) kind = 'tok-fn';
      else if (nextIsCall) kind = 'tok-fn';
      html += kind ? cls(kind, text) : escapeHtml(text);
    } else if (punct || op) html += cls('tok-op', text);
    else html += escapeHtml(text);

    last = m.index + text.length;
    if (text.length === 0) { TOKEN_RE.lastIndex += 1; } // 防死循环
  }
  html += escapeHtml(code.slice(last));
  return html;
}

function cls(name, text) {
  return '<span class="' + name + '">' + escapeHtml(text) + '</span>';
}

/** 行数（用于行号槽） */
export function countLines(code) {
  return code.split('\n').length;
}
