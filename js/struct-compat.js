/**
 * 结构体兼容层（把 struct 源码"展开"成解释器能跑的等价代码）
 *
 * 原理：
 *   struct Student { char name[20]; int score; };
 *   struct Student a[3];
 *   a[i].score = 90;              a[i].name = ...
 *   ↓
 *   char a_name[3][20];
 *   int  a_score[3];
 *   a_score[i] = 90;              a_name[i] = ...
 *
 * 设计原则：**宁可拒绝，也不乱改**。
 * 只要遇到本层不支持的写法（指针 ->、结构体当参数、整体赋值、嵌套、初始化列表…），
 * 就返回 ok:false 并说明原因，由上层引导用户切到联网真实 g++。
 */

/* ============================== 词法 ============================== */

const PUNCT = '{}()[];,.*&+-/%<>=!?:~^|';
const TWO_CHAR = new Set(['->', '::', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=']);

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  let atLineStart = true;

  while (i < n) {
    const c = src[i];
    const rest = src.slice(i);

    // 行首的预处理指令：整行保留
    if (c === '#' && atLineStart) {
      let j = i;
      let text = '';
      while (j < n && src[j] !== '\n') { text += src[j]; j++; }
      tokens.push({ t: 'pre', v: text });
      i = j;
      continue;
    }
    if (c === '\n') { tokens.push({ t: 'ws', v: '\n' }); i++; atLineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') {
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
      tokens.push({ t: 'ws', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (rest.startsWith('//')) {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      tokens.push({ t: 'com', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = src.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      tokens.push({ t: 'com', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let v = quote;
      while (j < n) {
        v += src[j];
        if (src[j] === '\\') { v += src[j + 1] || ''; j += 2; continue; }
        if (src[j] === quote) { j++; break; }
        if (src[j] === '\n') break;
        j++;
      }
      tokens.push({ t: quote === '"' ? 'str' : 'chr', v });
      i = j;
      atLineStart = false;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxX.]/.test(src[j])) j++;
      tokens.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      atLineStart = false;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      atLineStart = false;
      continue;
    }
    if (PUNCT.includes(c)) {
      // 只把真正的多字符运算符整体保留（-> :: << >> <= >= == != && || ++ -- += …）
      const two = rest.slice(0, 2);
      if (TWO_CHAR.has(two)) {
        tokens.push({ t: 'punct', v: two });
        i += 2;
      } else {
        tokens.push({ t: 'punct', v: c });
        i += 1;
      }
      atLineStart = false;
      continue;
    }
    tokens.push({ t: 'punct', v: c });
    i++;
    atLineStart = false;
  }
  return tokens;
}

const isTrivia = (tk) => tk && (tk.t === 'ws' || tk.t === 'com' || tk.t === 'pre');
const isId = (tk, v) => tk && tk.t === 'id' && (v === undefined || tk.v === v);
const isPunct = (tk, v) => tk && tk.t === 'punct' && tk.v === v;

function nextSignificant(tokens, from) {
  for (let i = from; i < tokens.length; i++) if (!isTrivia(tokens[i])) return i;
  return -1;
}
function prevSignificant(tokens, from) {
  for (let i = from; i >= 0; i--) if (!isTrivia(tokens[i])) return i;
  return -1;
}

/* ============================== 解析结构体定义 ============================== */

const BUILTIN_TYPES = new Set([
  'void', 'char', 'short', 'int', 'long', 'float', 'double',
  'signed', 'unsigned', 'bool', '_Bool', 'size_t',
]);

function reject(reason, detail) {
  return { ok: false, reason, detail };
}

/**
 * 解析所有 struct 定义。
 * 支持：struct X {...}; / typedef struct {...} X; / typedef struct X {...} Y;
 * 拒绝：嵌套 struct、指针字段、位域、函数指针字段。
 */
function collectStructs(tokens) {
  const structs = new Map();   // name -> { fields: [{type, name, dims}] }
  const aliases = new Map();   // alias -> struct name
  const removeRanges = [];     // 要删掉的 token 区间 [start, end)

  for (let i = 0; i < tokens.length; i++) {
    if (!isId(tokens[i], 'struct')) continue;

    // 定位名字和 {
    let j = nextSignificant(tokens, i + 1);
    let name = null;
    if (isId(tokens[j])) { name = tokens[j].v; j = nextSignificant(tokens, j + 1); }
    if (!isPunct(tokens[j], '{')) continue;   // 只是在使用 struct 类型，不是定义

    const close = findMatching(tokens, j, '{', '}');
    if (close < 0) return reject('结构体定义没有结束', '找不到对应的 }');

    const parsedFields = parseFields(tokens, j + 1, close);
    if (!parsedFields.ok) return parsedFields;

    // 是否 typedef，以及别名
    let m = nextSignificant(tokens, close + 1);
    let alias = null;
    if (isId(tokens[m])) { alias = tokens[m].v; m = nextSignificant(tokens, m + 1); }
    if (!isPunct(tokens[m], ';')) return reject('结构体定义后缺少分号', '检查 struct 定义是否以 }; 结束');

    const finalName = name || alias;
    if (!finalName) return reject('匿名结构体缺少类型名', '请写成 typedef struct {...} 名字; 的形式');
    if (structs.has(finalName)) return reject('重复的结构体名', finalName);

    structs.set(finalName, parsedFields.fields);
    if (name && alias) aliases.set(alias, name);
    if (!name && alias) aliases.set(alias, alias);

    // typedef 关键字也要一起删掉
    const prev = prevSignificant(tokens, i - 1);
    const rangeStart = isId(tokens[prev], 'typedef') ? prev : i;
    removeRanges.push([rangeStart, m + 1]);
    i = m;
  }

  return { ok: true, structs, aliases, removeRanges };
}

/** 解析 { ... } 之间的字段列表 */
function parseFields(tokens, start, end) {
  const fields = [];
  let typeParts = [];
  let i = start;

  while (i < end) {
    const tk = tokens[i];
    if (isTrivia(tk)) { i++; continue; }
    if (isPunct(tk, ';')) { typeParts = []; i++; continue; }
    if (isPunct(tk, ',')) { i++; continue; }

    if (tk.t === 'id') {
      if (typeParts.length === 0) {
        if (!BUILTIN_TYPES.has(tk.v)) return reject('不支持的字段类型：' + tk.v, '只支持基本类型（int/char/float/double/long/short/unsigned）');
        typeParts.push(tk.v);
        i++;
        continue;
      }
      // 字段名
      const fieldName = tk.v;
      const dims = [];
      let j = nextSignificant(tokens, i + 1);
      while (isPunct(tokens[j], '[')) {
        const close = findMatching(tokens, j, '[', ']');
        if (close < 0) return reject('字段数组缺少 ]', fieldName);
        const dim = tokens.slice(j + 1, close).filter((x) => !isTrivia(x)).map((x) => x.v).join('');
        dims.push(dim);
        j = nextSignificant(tokens, close + 1);
      }
      fields.push({ type: typeParts.join(' '), name: fieldName, dims });
      i = j;
      continue;
    }

    if (isPunct(tk, '*')) return reject('结构体里有指针字段', '不支持成员指针');
    if (isPunct(tk, ':')) return reject('位域字段', '不支持位域');
    if (isPunct(tk, '[')) return reject('字段声明异常', '检查数组字段的写法');
    i++;
  }

  if (!fields.length) return reject('结构体没有任何字段', '空的 struct 无法展开');
  return { ok: true, fields };
}

function findMatching(tokens, start, open, close) {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (isPunct(tokens[i], open)) depth++;
    else if (isPunct(tokens[i], close)) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* ============================== 主入口 ============================== */

/**
 * @param {string} code 原始 C/C++ 源码
 * @returns {{ok:true, code:string, vars:Array, structs:Array} | {ok:false, reason:string, detail?:string}}
 */
export function expandStructs(code) {
  const tokens = tokenize(code);

  const parsed = collectStructs(tokens);
  if (!parsed.ok) return parsed;
  const { structs, aliases, removeRanges } = parsed;

  // 没有结构体就原样返回
  if (structs.size === 0) return { ok: true, code, vars: [], structs: [] };

  // 先删掉 struct 定义本身
  let out = tokens.slice();
  for (const [s, e] of removeRanges.slice().reverse()) {
    for (let i = s; i < e; i++) out[i] = { t: 'ws', v: '' };
  }

  const vars = new Map();     // 变量名 -> 结构体名
  const renames = new Map();  // 新变量名 -> 原变量名（用于诊断）

  // 展开声明
  const declResult = expandDeclarations(out, structs, aliases, vars, renames);
  if (!declResult.ok) return declResult;

  // 改写成员访问
  const accessResult = rewriteAccess(out, vars, structs);
  if (!accessResult.ok) return accessResult;

  const finalCode = out.map((t) => t.v).join('');

  // 兜底：还有没处理掉的结构体用法
  const leftover = findLeftover(finalCode, structs, aliases);
  if (leftover) return reject('还有结构体用法没处理', leftover);

  return {
    ok: true,
    code: finalCode,
    vars: Array.from(vars.entries()).map(([v, s]) => ({ var: v, struct: s })),
    structs: Array.from(structs.keys()),
  };
}

/** 判断某个位置是否位于函数参数列表的括号内 */
function isInsideParens(tokens, index) {
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const tk = tokens[i];
    if (isTrivia(tk)) continue;
    if (isPunct(tk, ')')) { depth++; continue; }
    if (isPunct(tk, '(')) {
      if (depth === 0) return true;
      depth--;
      continue;
    }
    if (isPunct(tk, '{') || isPunct(tk, '}') || isPunct(tk, ';')) return false;
  }
  return false;
}

/** 把 `struct X a[3], b;` 换成按字段展开的普通声明 */
function expandDeclarations(tokens, structs, aliases, vars, renames) {
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    let structName = null;
    let typeStart = i;

    if (isId(tk, 'struct')) {
      const j = nextSignificant(tokens, i + 1);
      if (!isId(tokens[j]) || !structs.has(tokens[j].v)) continue;
      structName = tokens[j].v;
      typeStart = i;
      i = j;
    } else if (tk.t === 'id' && aliases.has(tk.v)) {
      structName = aliases.get(tk.v);
      typeStart = i;
      // typedef 名可能也是普通变量名，要求后面紧跟变量名
      const j = nextSignificant(tokens, i + 1);
      if (!isId(tokens[j])) continue;
      i = i;
    } else {
      continue;
    }

    // 解析声明符列表，直到 ;
    const fields = structs.get(structName);
    const decls = [];

    if (isInsideParens(tokens, typeStart)) {
      return reject('结构体用作函数参数', '把结构体当参数传，离线兼容层不支持；请用联网真实 g++，或改成传各个字段');
    }

    let j = nextSignificant(tokens, i + 1);
    let guard = 0;

    while (j >= 0 && j < tokens.length && !isPunct(tokens[j], ';')) {
      if (guard++ > 200) return reject('声明解析失败', '结构体声明太长或格式异常');

      if (isPunct(tokens[j], '*')) return reject('结构体指针', '不支持 struct 指针（包括 -> 访问）');
      if (isPunct(tokens[j], '=')) {
        // 只支持 = {0} / = {} 这种清零初始化
        const v = nextSignificant(tokens, j + 1);
        if (isPunct(tokens[v], '{')) {
          const close = findMatching(tokens, v, '{', '}');
          if (close < 0) return reject('初始化列表没有闭合', '检查 = { ... }');
          const inner = tokens.slice(v + 1, close).filter((x) => !isTrivia(x));
          if (inner.length !== 0 && !(inner.length === 1 && inner[0].v === '0')) {
            return reject('结构体初始化列表', '只支持 = {0}，其它初始化请改用逐字段赋值');
          }
          j = nextSignificant(tokens, close + 1);
          continue;
        }
        return reject('结构体初始化', '请把 struct 变量声明和赋值分开写');
      }
      if (!isId(tokens[j])) { j = nextSignificant(tokens, j + 1); continue; }

      const varName = tokens[j].v;
      const dims = [];
      let k = nextSignificant(tokens, j + 1);
      while (isPunct(tokens[k], '[')) {
        const close = findMatching(tokens, k, '[', ']');
        if (close < 0) return reject('数组维度没有闭合', varName);
        const dim = tokens.slice(k + 1, close).filter((x) => !isTrivia(x)).map((x) => x.v).join('');
        if (!dim) return reject('数组维度为空', varName);
        dims.push(dim);
        k = nextSignificant(tokens, close + 1);
      }

      // 只接受 = {0} / = {} 这类清零初始化
      let zeroInit = false;
      if (isPunct(tokens[k], '=')) {
        const v = nextSignificant(tokens, k + 1);
        if (!isPunct(tokens[v], '{')) {
          return reject('结构体初始化', '请把 struct 变量声明和赋值分开写（例如先声明，再 p.v = 1;）');
        }
        const close = findMatching(tokens, v, '{', '}');
        if (close < 0) return reject('初始化列表没有闭合', '检查 = { ... }');
        const inner = tokens.slice(v + 1, close).filter((x) => !isTrivia(x));
        if (inner.length !== 0 && !(inner.length === 1 && inner[0].v === '0')) {
          return reject('结构体初始化列表', '只支持 = {0}，其它初始化请改成逐字段赋值');
        }
        zeroInit = true;
        k = nextSignificant(tokens, close + 1);
      }

      decls.push({ name: varName, dims, zeroInit });
      j = k;
      if (isPunct(tokens[j], '(')) {
        return reject('函数返回结构体', '离线兼容层不支持结构体作为返回类型，请用联网真实 g++');
      }
      if (isPunct(tokens[j], ',')) { j = nextSignificant(tokens, j + 1); continue; }
      break;
    }

    if (!isPunct(tokens[j], ';')) return reject('结构体声明后缺少分号', '检查声明语句');
    if (!decls.length) continue;

    // 生成新声明
    const lines = [];
    for (const d of decls) {
      if (vars.has(d.name)) return reject('同名变量重复声明', d.name);
      vars.set(d.name, structName);
      for (const f of fields) {
        const newName = d.name + '_' + f.name;
        renames.set(newName, d.name + '.' + f.name);
        const dimText = dimsToText(d.dims) + dimsToText(f.dims);
        const init = d.zeroInit ? (f.dims.length ? ' = {0}' : ' = 0') : '';
        lines.push(f.type + ' ' + newName + dimText + init + ';');
      }
    }

    // 用新声明替换原语句
    for (let k = typeStart; k <= j; k++) tokens[k] = { t: 'ws', v: '' };
    tokens[typeStart] = { t: 'gen', v: lines.join(' ') };
  }

  return { ok: true };
}

function dimsToText(dims) {
  return dims.map((d) => '[' + d + ']').join('');
}

/** 把 v.field / a[i].field 改写成 v_field / a_field[i] */
function rewriteAccess(tokens, vars, structs) {
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t !== 'id' || !vars.has(tk.v)) continue;

    const structName = vars.get(tk.v);
    const fields = structs.get(structName);

    // 收集变量名后面的索引组
    const groups = [];
    let j = nextSignificant(tokens, i + 1);
    while (isPunct(tokens[j], '[')) {
      const close = findMatching(tokens, j, '[', ']');
      if (close < 0) return reject('下标没有闭合', tk.v);
      groups.push([j, close]);
      j = nextSignificant(tokens, close + 1);
    }

    // 不是 .field 就跳过（可能是普通表达式里的变量名）
    if (!isPunct(tokens[j], '.')) {
      if (isPunct(tokens[j], '->')) return reject('结构体指针访问 ->', '请改用 . 访问，或联网用真实 g++');
      return reject(
        '结构体整体使用（赋值 / 传参 / sizeof 等）',
        '形如 b = a; 或 f(a) 的写法离线兼容层不支持，请用联网真实 g++'
      );
    }

    const fieldIdx = nextSignificant(tokens, j + 1);
    if (!isId(tokens[fieldIdx])) return reject('无法识别的成员访问', '检查 . 后面是否写了字段名');
    const fieldName = tokens[fieldIdx].v;
    if (!fields.some((f) => f.name === fieldName)) {
      return reject('访问了不存在的字段：' + fieldName, '结构体 ' + structName + ' 没有这个成员');
    }

    // 重组：把 v [..] . field 换成 v_field [..]
    const idxTokens = [];
    for (const [open, close] of groups) {
      for (let k = open; k <= close; k++) idxTokens.push(tokens[k]);
    }
    tokens[i] = { t: 'id', v: tk.v + '_' + fieldName };
    for (let k = i + 1; k <= fieldIdx; k++) tokens[k] = { t: 'ws', v: '' };
    // 把下标放回字段名后面
    if (idxTokens.length) {
      tokens[i] = { t: 'gen', v: tk.v + '_' + fieldName + idxTokens.map((t) => t.v).join('') };
    }
  }
  return { ok: true };
}

/** 兜底检查：是否还有没被处理的结构体用法 */
function findLeftover(code, structs, aliases) {
  for (const name of structs.keys()) {
    const re = new RegExp('\\bstruct\\s+' + name + '\\b');
    if (re.test(code)) return '还有 struct ' + name + ' 的声明没处理（可能是函数参数或 sizeof）';
  }
  for (const alias of aliases.keys()) {
    const re = new RegExp('\\b' + alias + '\\b(?!\\s*\\.)');
    // typedef 名出现在剩余代码里且不是成员访问，说明还有声明没展开
    if (re.test(code)) {
      const lines = code.split('\n').filter((l) => re.test(l) && !l.trim().startsWith('//'));
      if (lines.length) return '还有 ' + alias + ' 类型的用法没处理（可能是函数参数或数组参数）';
    }
  }
  return null;
}

/** 给 UI 用：判断这段代码用到了结构体 */
export function usesStruct(code) {
  return /\bstruct\s+\w*\s*\{/.test(code) || /\btypedef\s+struct\b/.test(code);
}
