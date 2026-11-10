/**
 * 在线引擎（Compiler Explorer）验证脚本
 * 直接跑：node tests/online.test.mjs
 * 需要联网；Node 里没有 CORS 限制，浏览器里的 CORS 由 Access-Control-Allow-Origin:* 保证。
 */

import { runOnline } from '../js/engine-online.js';

const cases = [
  {
    name: 'C++ struct + std::string',
    lang: 'cpp',
    code: `#include <iostream>
#include <string>
using namespace std;
struct P { string name; int age; };
int main() { P p; p.name = "Tom"; p.age = 18; cout << p.name << " " << p.age << endl; return 0; }`,
    stdin: '',
    expect: (r) => r.ok && r.out.trim() === 'Tom 18',
  },
  {
    name: 'C struct + printf',
    lang: 'c',
    code: `#include <stdio.h>
struct S { int a; int b; };
int main() { struct S s; s.a = 3; s.b = 4; printf("%d", s.a + s.b); return 0; }`,
    stdin: '',
    expect: (r) => r.ok && r.out.trim() === '7',
  },
  {
    name: 'scanf 读取标准输入',
    lang: 'c',
    code: `#include <stdio.h>
int main() { int a, b; scanf("%d%d", &a, &b); printf("%d", a + b); return 0; }`,
    stdin: '1 2',
    expect: (r) => r.ok && r.out.trim() === '3',
  },
  {
    name: 'C++ STL vector + sort',
    lang: 'cpp',
    code: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() { vector<int> v = {3, 1, 2}; sort(v.begin(), v.end()); for (int x : v) cout << x << " "; return 0; }`,
    stdin: '',
    expect: (r) => r.ok && r.out.trim().startsWith('1 2 3'),
  },
  {
    name: '语法错误定位行号',
    lang: 'cpp',
    code: `int main() { int a = 1 return 0; }`,
    stdin: '',
    expect: (r) => !r.ok && r.err && r.err.line === 1 && /expected|before/i.test(r.err.raw),
  },
  {
    name: '编译期类型错误',
    lang: 'cpp',
    code: `#include <iostream>
int main() { std::cout << undefined_var; return 0; }`,
    stdin: '',
    expect: (r) => !r.ok && /was not declared|undefined/i.test(r.err.raw),
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const r = await runOnline(c.code, c.stdin, { language: c.lang });
  const ok = c.expect(r);
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.name);
  if (!ok) {
    console.log('  ->', JSON.stringify({ ok: r.ok, out: r.out, err: r.err, exitCode: r.exitCode }).slice(0, 400));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
