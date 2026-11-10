/**
 * 内置例题回归测试：每个例题都走完整的本地兼容管线（struct 展开 → scanf 改写 → 中文转义），
 * 再用离线引擎真的跑一遍，确认有输出、中文能还原。
 * 跑法：node tests/examples.test.mjs
 */

import fs from 'node:fs';
import vm from 'node:vm';
import { EXAMPLES } from '../js/examples.js';
import { expandStructs } from '../js/struct-compat.js';
import { rewriteScanf } from '../js/scanf-compat.js';
import { encodeTextLiterals, decodeText } from '../js/text-compat.js';

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

export function prepare(code) {
  const st = expandStructs(code);
  if (!st.ok) return { ok: false, reason: st.reason };
  const sf = rewriteScanf(st.code);
  const enc = encodeTextLiterals(sf.code);
  return { ok: true, code: enc.code, map: enc.map };
}

let pass = 0;
let fail = 0;

for (const ex of EXAMPLES) {
  const p = prepare(ex.code);
  if (!p.ok) {
    console.log('FAIL 展开 ' + ex.name + ' :: ' + p.reason);
    fail++;
    continue;
  }
  let out = '';
  try {
    JSCPP.run(p.code, ex.stdin || '', { stdio: { write: (s) => { out += s; return s.length; } }, maxTimeout: 3000 });
  } catch (e) {
    console.log('FAIL 运行 ' + ex.name + ' :: ' + String(e.message).slice(0, 80));
    fail++;
    continue;
  }
  const text = decodeText(out, p.map).trim();
  if (!text) {
    console.log('FAIL 无输出 ' + ex.name);
    fail++;
    continue;
  }
  pass++;
  console.log('PASS ' + ex.name.padEnd(20) + ' -> ' + JSON.stringify(text.split('\n')[0].slice(0, 36)));
}

// 中文必须能还原
const zh = prepare('#include <stdio.h>\nint main(){printf("平均分 = %d\\n", 88); return 0;}');
let zhOut = '';
JSCPP.run(zh.code, '', { stdio: { write: (s) => { zhOut += s; return s.length; } }, maxTimeout: 2000 });
const zhText = decodeText(zhOut, zh.map).trim();
const zhOk = zhText === '平均分 = 88';
console.log((zhOk ? 'PASS ' : 'FAIL ') + '中文输出还原 :: ' + JSON.stringify(zhText));
if (zhOk) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
