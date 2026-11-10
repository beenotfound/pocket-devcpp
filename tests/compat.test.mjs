/**
 * 本地兼容层管线测试：struct 展开 → scanf 改写 → 离线引擎真的跑
 * 跑法：node tests/compat.test.mjs
 */

import fs from 'node:fs';
import vm from 'node:vm';
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
    return { ok: false, out, msg: String((e && e.message) || e).slice(0, 120) };
  }
}

/** 完整管线：结构体展开 + scanf 改写 */
export function prepare(code) {
  const st = expandStructs(code);
  if (!st.ok) return { ok: false, stage: 'struct', reason: st.reason, detail: st.detail };
  const sf = rewriteScanf(st.code);
  return { ok: true, code: sf.code, structRewritten: st.structs.length > 0, scanfRewritten: sf.transformed };
}

const cases = [
  {
    name: '数组输入：for + scanf(&a[i])',
    code: `#include <stdio.h>
int main() {
    int a[3];
    for (int i = 0; i < 3; i++) scanf("%d", &a[i]);
    int sum = 0;
    for (int i = 0; i < 3; i++) sum += a[i];
    printf("%d", sum);
    return 0;
}`,
    stdin: '1 2 3',
    expect: '6',
  },
  {
    name: '浮点数组输入',
    code: `#include <stdio.h>
int main() {
    float a[2];
    scanf("%f%f", &a[0], &a[1]);
    printf("%.1f", a[0] + a[1]);
    return 0;
}`,
    stdin: '1.5 2.5',
    expect: '4.0',
  },
  {
    name: '结构体数组 + 字符串 + 分数输入',
    code: `#include <stdio.h>
struct Stu { char name[10]; int score; };
int main() {
    struct Stu a[2];
    scanf("%s%d", a[0].name, &a[0].score);
    printf("%s=%d", a[0].name, a[0].score);
    return 0;
}`,
    stdin: 'Ann 88',
    expect: 'Ann=88',
  },
  {
    name: '结构体数组循环输入 + 求平均',
    code: `#include <stdio.h>
struct S { int score; };
int main() {
    struct S a[3];
    for (int i = 0; i < 3; i++) scanf("%d", &a[i].score);
    int sum = 0;
    for (int i = 0; i < 3; i++) sum += a[i].score;
    printf("%d", sum / 3);
    return 0;
}`,
    stdin: '90 60 75',
    expect: '75',
  },
  {
    name: '二维数组输入',
    code: `#include <stdio.h>
int main() {
    int a[2][2];
    for (int i = 0; i < 2; i++)
        for (int j = 0; j < 2; j++)
            scanf("%d", &a[i][j]);
    printf("%d", a[0][0] + a[1][1]);
    return 0;
}`,
    stdin: '1 2 3 4',
    expect: '5',
  },
  {
    name: '字符变量输入',
    code: `#include <stdio.h>
int main() {
    char c;
    scanf("%c", &c);
    printf("[%c]", c);
    return 0;
}`,
    stdin: 'A',
    expect: '[A]',
  },
  {
    name: '混合格式：数字 + 字符串',
    code: `#include <stdio.h>
int main() {
    int n;
    char name[10];
    scanf("%d%s", &n, name);
    printf("%s-%d", name, n);
    return 0;
}`,
    stdin: '7 Tom',
    expect: 'Tom-7',
  },
  {
    name: '结构体 + 排序 + 输出',
    code: `#include <stdio.h>
#include <string.h>
struct S { char name[8]; int score; };
int main() {
    struct S a[3];
    for (int i = 0; i < 3; i++) scanf("%s%d", a[i].name, &a[i].score);
    for (int i = 0; i < 2; i++)
        for (int j = 0; j < 2 - i; j++)
            if (a[j].score > a[j + 1].score) {
                int t = a[j].score; a[j].score = a[j + 1].score; a[j + 1].score = t;
                char tn[8]; strcpy(tn, a[j].name); strcpy(a[j].name, a[j + 1].name); strcpy(a[j + 1].name, tn);
            }
    for (int i = 0; i < 3; i++) printf("%s ", a[i].name);
    return 0;
}`,
    stdin: 'A 90\nB 60\nC 75',
    expect: 'B C A ',
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const p = prepare(c.code);
  if (!p.ok) {
    fail++;
    console.log('FAIL ' + c.name + ' :: 兼容层拒绝：' + p.reason + ' / ' + (p.detail || ''));
    continue;
  }
  const r = run(p.code, c.stdin || '');
  const actual = r.ok ? r.out : '（运行错误：' + r.msg + '）';
  const ok = r.ok && actual === c.expect;
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.name + (ok ? '' : ' :: 期望 ' + JSON.stringify(c.expect) + ' 实际 ' + JSON.stringify(actual)));
  if (!ok) console.log('--- 改写后 ---\n' + p.code + '\n-------------');
}

// 不改写的场景：格式串里有逗号，应当保持原样
const untouched = rewriteScanf('#include <stdio.h>\nint main(){int a,b;scanf("%d,%d",&a,&b);return 0;}');
const okUntouched = untouched.transformed === 0;
console.log((okUntouched ? 'PASS ' : 'FAIL ') + '复杂格式串不强行改写');
if (okUntouched) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
