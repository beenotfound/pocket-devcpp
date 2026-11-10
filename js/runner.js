/**
 * 运行引擎适配层（统一出口）。
 *  - 本地：JSCPP 解释器，离线可用，但只支持 C/C++ 的一个子集
 *  - 在线：真实 gcc/g++（Compiler Explorer），支持 struct/class/std::string/STL，需要网络
 *
 * 两个函数都返回统一结构：
 *   { ok, out, err: { raw, line, hint } | null, exitCode, ms, engine }
 */

import { describeError } from './errors.js';
import { runOnline } from './engine-online.js';

export { runOnline };

const OUTPUT_LIMIT = 200 * 1024;

function makeCollector(onOutput) {
  let out = '';
  return {
    write(s) {
      const str = String(s);
      if (out.length < OUTPUT_LIMIT) {
        out += str;
        if (onOutput) onOutput(str);
      }
      return str.length;
    },
    get out() { return out; },
    get truncated() { return out.length >= OUTPUT_LIMIT; },
  };
}

/** 让"运行中"状态先画出来，再开始执行（本地引擎是同步的） */
function yieldToPaint() {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

export async function runLocal(code, stdin, options = {}) {
  const { onOutput, timeoutMs = 2000 } = options;
  const JSCPP = globalThis.JSCPP || (globalThis.window && globalThis.window.JSCPP);
  if (!JSCPP) {
    return {
      ok: false, out: '', exitCode: null, ms: 0, engine: 'local',
      err: { raw: '离线引擎没有加载成功', line: null, hint: '刷新页面重试；如果一直这样，说明 vendor/JSCPP.es5.min.js 没有一起上传。' },
    };
  }

  const io = makeCollector(onOutput);
  const started = Date.now();
  await yieldToPaint();

  try {
    const exitCode = JSCPP.run(code, stdin || '', {
      stdio: { write: (s) => io.write(s) },
      maxTimeout: timeoutMs,
    });
    return { ok: true, out: io.out, err: null, exitCode, ms: Date.now() - started, engine: 'local', truncated: io.truncated };
  } catch (e) {
    return {
      ok: false, out: io.out, exitCode: null, ms: Date.now() - started, engine: 'local',
      truncated: io.truncated,
      err: describeError(e),
    };
  }
}
