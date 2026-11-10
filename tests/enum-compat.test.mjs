/**
 * enum 兼容层测试：改写后用离线引擎真的跑，比对输出。
 * 跑法：node tests/enum-compat.test.mjs
 */

import fs from 'node:fs';
import vm from 'node:vm';
import { expandEnums } from '../js/enum-compat.js';
import { expandStructs } from '../js/struct-compat.js';
import { rewriteScanf } from '../js/scanf-compat.js';

function loadEngine() {
  const src = fs.readFileSync(new URL('../vendor/JSCPP.es5.min.js', import.meta.url), 'utf8');
  const ctx = { console, setTimeout, Date, Math, document: {} };
  ctx.self = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'JSCPP.es5.min.js' });
  return ctx.JSCPP;
}
const JSCPP = loadEngine();

function run(code, stdin = '') {
  let out = '';
  try {
    JSCPP.run(code, stdin, { stdio: { write: (s) => { out += s; return s.length; } }, maxTimeout: 3000 });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out, msg: String((e && e.message) || e).slice(0, 100) };
  }
}

/** 完整管线：enum → struct → scanf */
function prepare(code) {
  const en = expandEnums(code);
  if (!en.ok) return en;
  const st = expandStructs(en.code);
  if (!st.ok) return st;
  return { ok: true, code: rewriteScanf(st.code).code };
}

const cases = [
  {
    name: '基础 enum 三个值',
    code: '#include <stdio.h>\nenum Color { RED, GREEN, BLUE };\nint main(){ printf("%d %d %d", RED, GREEN, BLUE); return 0; }',
    expect: '0 1 2',
  },
  {
    name: '指定初值 + 自动递增',
    code: '#include <stdio.h>\nenum E { A = 3, B, C = 10, D };\nint main(){ printf("%d %d %d %d", A, B, C, D); return 0; }',
    expect: '3 4 10 11',
  },
  {
    name: 'enum 变量 + 赋值',
    code: '#include <stdio.h>\nenum Color { RED, GREEN, BLUE };\nint main(){ enum Color c = RED; c = BLUE; printf("%d", c); return 0; }',
    expect: '2',
  },
  {
    name: 'enum 当函数参数',
    code: '#include <stdio.h>\nenum Color { RED, GREEN, BLUE };\nvoid show(enum Color c){ printf("c=%d", c); }\nint main(){ show(GREEN); return 0; }',
    expect: 'c=1',
  },
  {
    name: 'typedef enum',
    code: '#include <stdio.h>\ntypedef enum { OK = 1, FAIL = -1 } Status;\nint main(){ Status s = OK; printf("%d", s); return 0; }',
    expect: '1',
  },
  {
    name: 'switch + case 用枚举',
    code: `#include <stdio.h>
enum Color { RED, GREEN, BLUE };
int main() {
    int c = GREEN;
    switch (c) {
        case RED: printf("red"); break;
        case GREEN: printf("green"); break;
        default: printf("other");
    }
    return 0;
}`,
    expect: 'green',
  },
  {
    name: 'enum 字段 + 结构体（与结构体兼容层串联）',
    code: `#include <stdio.h>
enum Color { RED, GREEN, BLUE };
struct Ball { enum Color c; int size; };
int main() {
    struct Ball b;
    b.c = BLUE;
    b.size = 7;
    printf("%d-%d", b.c, b.size);
    return 0;
}`,
    expect: '2-7',
  },
  {
    name: '匿名 enum 当常量',
    code: '#include <stdio.h>\nenum { MAXN = 100 };\nint main(){ int a[MAXN]; a[0] = 5; printf("%d", a[0]); return 0; }',
    expect: '5',
  },
];

const rejectCases = [
  {
    name: '枚举初值是表达式',
    code: 'enum E { A = 1 << 2 };\nint main(){ return 0; }',
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const p = prepare(c.code);
  if (!p.ok) {
    fail++;
    console.log('FAIL ' + c.name + ' :: 被误拒：' + p.reason + (p.detail ? ' / ' + p.detail : ''));
    continue;
  }
  const r = run(p.code, c.stdin || '');
  const actual = r.ok ? r.out : '（运行错误：' + r.msg + '）';
  const ok = r.ok && actual === c.expect;
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.name + (ok ? '' : ' :: 期望 ' + JSON.stringify(c.expect) + ' 实际 ' + JSON.stringify(actual)));
  if (!ok) console.log('--- 改写后 ---\n' + p.code + '\n-------------');
}

for (const c of rejectCases) {
  const t = expandEnums(c.code);
  const ok = t.ok === false;
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + '拒绝：' + c.name + (ok ? ' :: ' + t.reason : ' :: 本应拒绝但通过了'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
