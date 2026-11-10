/**
 * 在线引擎：真实 gcc/g++（Compiler Explorer 公开 API）
 *
 * 为什么用它：
 *  - 真正的 GCC 14，和电脑上 Dev-C++ 同一编译器家族，报错风格一致
 *  - 支持 struct / class / std::string / vector / sort 等本地引擎做不到的东西
 *  - 允许浏览器跨域直连（Access-Control-Allow-Origin: *）
 *  - 能直接执行程序并把 stdin / stdout 带回来
 *
 * 代价：必须联网；代码会发送到 godbolt.org（公共编译器服务）。
 */

import { describeError } from './errors.js';

export const ONLINE_BASE = 'https://godbolt.org/api/compiler';

/** Compiler Explorer 的编译器 id：C 用 cg142（x86-64 gcc 14.2），C++ 用 g142 */
export const COMPILERS = { c: 'cg142', cpp: 'g142' };

function joinText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map((b) => (typeof b === 'string' ? b : b && b.text || '')).join('');
}

export async function runOnline(code, stdin, options = {}) {
  const started = Date.now();
  const lang = options.language === 'c' ? 'c' : 'c++';
  const compilerId = options.compilerId || (lang === 'c' ? COMPILERS.c : COMPILERS.cpp);
  const url = (options.url && String(options.url).trim()) || (ONLINE_BASE + '/' + compilerId + '/compile');

  const body = {
    source: code,
    lang,
    allowStoreCodeDebug: false,
    options: {
      userArguments: '',
      compilerOptions: { skipAsm: true, executorRequest: false },
      executeParameters: { args: [], stdin: stdin || '' },
      filters: {
        execute: true,
        intel: false,
        demangle: true,
        labels: false,
        libraryCode: false,
        directives: false,
        commentOnly: false,
        trim: false,
      },
    },
  };

  const fail = (raw, hint) => ({
    ok: false, out: '', exitCode: null, ms: Date.now() - started, engine: 'online',
    err: { raw, line: describeError({ message: raw }).line, hint },
  });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return fail('连不上在线编译器：' + (e.message || e),
      '检查网络。没网时用本地引擎跑基础题；结构体/string/STL 只能联网跑。');
  }

  if (!res.ok) {
    return fail('在线编译器返回 HTTP ' + res.status,
      res.status === 429 ? '请求太频繁了，等十几秒再试。' : '这个公共服务可能暂时不可用，稍后再试或用本地引擎。');
  }

  let data;
  try { data = await res.json(); } catch (e) {
    return fail('在线编译器返回的内容无法解析', '稍后重试；或切回本地引擎。');
  }

  const compileLog = joinText(data.stderr) + (joinText(data.stdout) && data.execResult ? '' : '');
  const exec = data.execResult || null;

  // 编译失败
  if (!exec || data.code !== 0) {
    const raw = compileLog.trim() || ('编译失败（退出码 ' + data.code + '）');
    const err = describeError({ message: raw });
    return {
      ok: false, out: '', exitCode: null, ms: Date.now() - started, engine: 'online',
      err: { raw, line: err.line, hint: err.hint || (err.line ? '' : '看上面 gcc 的原始报错，通常第一行就是原因。') },
    };
  }

  const out = joinText(exec.stdout);
  const runErr = joinText(exec.stderr).trim();
  const exitCode = typeof exec.code === 'number' ? exec.code : 0;
  const timedOut = /timed? ?out/i.test(runErr) || exec.didTimeout === true;

  if (timedOut) {
    return {
      ok: false, out, exitCode, ms: Date.now() - started, engine: 'online',
      err: { raw: runErr, line: null, hint: '程序运行超时（可能是死循环），在线编译器已经帮你停了。' },
    };
  }

  if (exitCode !== 0 || runErr) {
    const err = describeError({ message: runErr || ('程序退出码 ' + exitCode) });
    return {
      ok: false, out, exitCode, ms: Date.now() - started, engine: 'online',
      err: { raw: err.raw, line: err.line, hint: err.hint },
    };
  }

  return { ok: true, out, exitCode, ms: Date.now() - started, engine: 'online' };
}

/** 连接测试，供"设置"里用 */
export async function pingOnline() {
  try {
    const res = await fetch(ONLINE_BASE + '/' + COMPILERS.cpp + '/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ source: 'int main(){return 0;}', lang: 'c++', options: { filters: { execute: true } } }),
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
