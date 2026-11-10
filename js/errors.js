/**
 * 把引擎抛出的原始错误，翻译成"学生看得懂"的提示。
 * 全部是纯函数，方便单测与后续调整。
 */

/** 本地引擎不支持的写法 —— 提前告诉用户别浪费时间 */
const UNSUPPORTED = [
  { re: /\bstruct\s+\w*\s*\{/, what: '结构体（struct）' },
  { re: /\benum\s+\w*\s*\{/, what: '枚举（enum）' },
  { re: /\bclass\s+\w+/, what: '类（class）' },
  { re: /\btemplate\s*</, what: '模板（template）' },
  { re: /#\s*include\s*[<"](vector|algorithm|map|set|queue|stack|list|deque|memory|utility|functional|string|array)[>"]/, what: 'C++ STL（vector / string / sort 等）' },
  { re: /\bstd\s*::\s*string\b/, what: 'std::string' },
  { re: /\b(malloc|calloc|realloc|free)\s*\(/, what: 'malloc / free 动态内存' },
  { re: /\bgoto\b/, what: 'goto 语句' },
  { re: /\b(fopen|fclose|fread|fwrite|ifstream|ofstream)\s*\(/, what: '文件读写' },
];

export function detectUnsupported(code) {
  const found = [];
  for (const item of UNSUPPORTED) {
    if (item.re.test(code) && !found.some((f) => f.what === item.what)) found.push({ what: item.what });
  }
  return found;
}

/** 常见错误 -> 中文解释 */
const HINTS = [
  { re: /expected\s*['"]?;/i, hint: '这一行（或上一行）结尾少了一个分号。' },
  { re: /expected\s*['"]?[)}\]]/i, hint: '括号没有配对：检查是不是多写或少写了 ) 或 }。' },
  { re: /unexpected\s+(token|end)/i, hint: '这里出现了不该出现的符号，常见原因是上一行没写完（少分号/少括号）。' },
  { re: /not declared|is not defined|undeclared/i, hint: '用了一个没定义的变量或函数。检查拼写是否正确、是不是忘了定义，或者在 C 里忘记声明类型。' },
  { re: /was not declared/i, hint: '这个名字没有声明：可能是拼写错误，或者变量定义在别的作用域里。' },
  { re: /no matching function|too (many|few) arguments/i, hint: '函数调用参数个数或类型不对，对照函数定义数一下。' },
  { re: /out of (bound|range)|index.*(bound|range)/i, hint: '数组下标越界。C 的数组下标从 0 开始，长度 n 的数组最大下标是 n-1。' },
  { re: /division by zero|divide by zero/i, hint: '除以 0 了，检查除数。' },
  { re: /uninitialized/i, hint: '用了没有赋初值的变量。本地引擎比 gcc 严格，会直接拦下来 —— 这在 C 里确实是隐患。' },
  { re: /overflow/i, hint: '数值溢出，检查数据类型范围（int 大约 -21 亿 ~ 21 亿）。' },
  { re: /no such file|include.*not found|unknown header|cannot find/i, hint: '找不到这个头文件。本地引擎只内置了常用头文件，其余请改用支持的写法。' },
  { re: /expected.*identifier/i, hint: '这里应该写一个名字（变量名/函数名），检查是不是多打了符号。' },
  { re: /invalid|syntax/i, hint: '语法不合法，重点看这一行及上一行。' },
];

/** 从错误对象/文本里抽行号 */
export function extractLine(err) {
  if (!err) return null;
  const candidates = [err.line, err.lineNumber, err.sLine, err.location && err.location.start && err.location.start.line];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const text = String(err.message || err.raw || err.err || err);
  const m = text.match(/line\s+(\d+)/i)
    || text.match(/第\s*(\d+)\s*行/)
    || text.match(/^\s*(\d+):(\d+)\s/)
    || text.match(/:(\d+):\d+/);
  if (m) {
    const n = Number(m[1]);
    if (n > 0) return n;
  }
  return null;
}

export function describeError(err) {
  const raw = String((err && (err.message || err.raw)) || err || '未知错误').trim();
  const line = extractLine(err);
  let hint = '';
  for (const h of HINTS) {
    if (h.re.test(raw)) { hint = h.hint; break; }
  }
  return { raw, line, hint };
}

/**
 * 结构化预检：本地引擎只报第一条错，这里先把"一眼能看出来"的问题全部列出来。
 * 只做低误报检查：括号配对、块注释未闭合、缺少 main。
 */
export function precheck(code) {
  const issues = [];
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let line = 1;
  let inBlock = false;
  let inLine = false;
  let inStr = false;
  let inChr = false;

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '\n') { line++; inLine = false; continue; }
    if (inLine) continue;
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; } else if (c === '"') { inStr = false; } continue; }
    if (inChr) { if (c === '\\') { i++; } else if (c === "'") { inChr = false; } continue; }

    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "'") { inChr = true; continue; }

    if (c === '(' || c === '[' || c === '{') { stack.push({ c, line }); }
    else if (pairs[c]) {
      const top = stack.pop();
      if (!top) issues.push({ line, message: '多了一个 ' + c + '（前面没有对应的 ' + pairs[c] + '）' });
      else if (top.c !== pairs[c]) issues.push({ line, message: '括号不匹配：第 ' + top.line + ' 行的 ' + top.c + ' 与这里的 ' + c + ' 对不上' });
    }
  }
  if (inBlock) issues.push({ line, message: '块注释 /* 一直没有用 */ 结束' });
  for (const s of stack) issues.push({ line: s.line, message: '第 ' + s.line + ' 行的 ' + s.c + ' 一直没有闭合' });
  if (!/\bmain\s*\(/.test(code)) issues.push({ line: 1, message: '没有找到 main 函数，程序无法运行' });
  return issues;
}
