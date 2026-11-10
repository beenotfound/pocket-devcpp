/**
 * 结构体兼容层测试：先改写，再用离线引擎真的跑一遍，比对输出。
 * 跑法：node tests/struct-compat.test.mjs
 */

import fs from 'node:fs';
import vm from 'node:vm';
import { expandStructs } from '../js/struct-compat.js';
import { rewriteScanf } from '../js/scanf-compat.js';

/* ---- 在 Node 里加载 JSCPP（它需要 document 才会走"页面模式"） ---- */
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
    const rc = JSCPP.run(code, stdin, { stdio: { write: (s) => { out += s; return s.length; } }, maxTimeout: 2000 });
    return { ok: true, out, rc };
  } catch (e) {
    return { ok: false, out, msg: String((e && e.message) || e).slice(0, 120) };
  }
}

/* ---------------- 应当成功改写并输出正确 ---------------- */

const okCases = [
  {
    name: '单个结构体 + 成员赋值',
    code: `#include <stdio.h>
struct Point { int x; int y; };
int main() {
    struct Point p;
    p.x = 3;
    p.y = 4;
    printf("%d", p.x + p.y);
    return 0;
}`,
    expect: '7',
  },
  {
    name: 'typedef struct + 结构体数组 + 循环',
    code: `#include <stdio.h>
typedef struct { int score; int id; } S;
int main() {
    S a[3];
    for (int i = 0; i < 3; i++) { a[i].score = i * 10; a[i].id = i; }
    int sum = 0;
    for (int i = 0; i < 3; i++) sum += a[i].score;
    printf("%d", sum);
    return 0;
}`,
    expect: '30',
  },
  {
    name: '字符数组成员（字符串）',
    code: `#include <stdio.h>
#include <string.h>
struct Student { char name[20]; int score; };
int main() {
    struct Student s;
    strcpy(s.name, "Tom");
    s.score = 90;
    printf("%s:%d", s.name, s.score);
    return 0;
}`,
    expect: 'Tom:90',
  },
  {
    name: '结构体数组 + scanf 读入字符串和分数',
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
    name: '二维结构体数组',
    code: `#include <stdio.h>
struct P { int v; };
int main() {
    struct P g[2][3];
    g[1][2].v = 9;
    printf("%d", g[1][2].v);
    return 0;
}`,
    expect: '9',
  },
  {
    name: '= {0} 清零初始化',
    code: `#include <stdio.h>
struct P { int v; int w; };
int main() {
    struct P p = {0};
    p.v = 5;
    printf("%d%d", p.v, p.w);
    return 0;
}`,
    expect: '50',
  },
  {
    name: '按字段排序（冒泡）',
    code: `#include <stdio.h>
struct S { int score; };
int main() {
    struct S a[3];
    a[0].score = 90; a[1].score = 60; a[2].score = 75;
    for (int i = 0; i < 2; i++)
        for (int j = 0; j < 2 - i; j++)
            if (a[j].score > a[j + 1].score) { int t = a[j].score; a[j].score = a[j + 1].score; a[j + 1].score = t; }
    for (int i = 0; i < 3; i++) printf("%d ", a[i].score);
    return 0;
}`,
    expect: `60 75 90 `,
  },
  {
    name: '字符串字段 + 二维数组混合',
    code: `#include <stdio.h>
#include <string.h>
struct Item { char name[8]; int qty; };
int main() {
    struct Item m[2][2];
    strcpy(m[0][1].name, "pen");
    m[0][1].qty = 12;
    printf("%s x%d", m[0][1].name, m[0][1].qty);
    return 0;
}`,
    expect: 'pen x12',
  },
];

/* ---------------- 应当被拒绝（交给联网引擎） ---------------- */

const rejectCases = [
  {
    name: '结构体指针 / ->',
    code: `struct P { int v; };
int main() { struct P p; struct P *q = &p; q->v = 1; return 0; }`,
  },
  {
    name: '结构体当函数参数',
    code: `struct P { int v; };
void show(struct P p) { }
int main() { struct P a; return 0; }`,
  },
  {
    name: '结构体整体赋值',
    code: `struct P { int v; };
int main() { struct P a; struct P b; a.v = 1; b = a; return 0; }`,
  },
  {
    name: '嵌套结构体',
    code: `struct A { int x; };
struct B { struct A inner; };
int main() { return 0; }`,
  },
  {
    name: '非零初始化列表',
    code: `struct P { int v; };
int main() { struct P p = {5}; return 0; }`,
  },
];

let pass = 0;
let fail = 0;

for (const c of okCases) {
  const t = expandStructs(c.code);
  if (!t.ok) {
    fail++;
    console.log('FAIL ' + c.name + ' :: 被误拒：' + t.reason + (t.detail ? ' / ' + t.detail : ''));
    continue;
  }
  const r = run(rewriteScanf(t.code).code, c.stdin || '');
  const actual = r.ok ? r.out : '（运行错误：' + r.msg + '）';
  const ok = r.ok && actual === c.expect;
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.name + (ok ? '' : ' :: 期望 ' + JSON.stringify(c.expect) + ' 实际 ' + JSON.stringify(actual)));
  if (!ok) console.log('--- 改写后代码 ---\n' + t.code + '\n------------------');
}

for (const c of rejectCases) {
  const t = expandStructs(c.code);
  const ok = t.ok === false;
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + '拒绝：' + c.name + (ok ? ' :: ' + t.reason : ' :: 本应拒绝但通过了'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
