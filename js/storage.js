/**
 * 文件与设置的本地持久化。
 * 只用 localStorage（iPad Safari 上最稳），并可导入/导出备份。
 * 所有函数纯逻辑，方便测试。
 */

export const STORAGE_KEY = 'pocket-devcpp.v1';

export const TEMPLATE_CPP = `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, C++!" << endl;
    return 0;
}
`;

export const TEMPLATE_C = `#include <stdio.h>

int main() {
    printf("Hello, C!\\n");
    return 0;
}
`;

let seq = 0;
export function makeId() {
  seq = (seq + 1) % 1000;
  return 'f_' + Date.now().toString(36) + seq.toString(36);
}

export function makeFile(name, content = '') {
  return { id: makeId(), name, content, updatedAt: Date.now() };
}

export function defaultState() {
  const f = makeFile('main.cpp', TEMPLATE_CPP);
  return {
    version: 1,
    files: [f],
    activeId: f.id,
    settings: {
      theme: 'classic',
      fontSize: 15,
      engine: 'local',        // local | online
      onlineUrl: '',
      stdin: '',
    },
  };
}

/** 判断文件语言：按扩展名 */
export function languageOf(name) {
  const n = String(name || '').toLowerCase();
  if (/\.c$/.test(n)) return 'c';
  if (/\.(cpp|cc|cxx|c\+\+)$/.test(n)) return 'cpp';
  return 'cpp';
}

/** 取一个不重复的文件名，如 main.cpp -> main2.cpp */
export function uniqueName(files, wanted) {
  const used = new Set(files.map((f) => f.name.toLowerCase()));
  let name = String(wanted || 'untitled.cpp').trim() || 'untitled.cpp';
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (used.has((base + i + ext).toLowerCase())) i++;
  return base + i + ext;
}

/** 文件名合法化：去掉路径分隔符等 */
export function sanitizeName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .trim()
    .slice(0, 60) || 'untitled.cpp';
}

function isState(x) {
  return x && typeof x === 'object' && Array.isArray(x.files) && x.files.length > 0;
}

/** 归一化：补齐缺字段、剔除坏文件，保证后续代码拿到可用结构 */
export function normalizeState(raw) {
  if (!isState(raw)) return defaultState();
  const files = raw.files
    .filter((f) => f && typeof f.name === 'string')
    .map((f) => ({
      id: typeof f.id === 'string' ? f.id : makeId(),
      name: sanitizeName(f.name),
      content: typeof f.content === 'string' ? f.content : '',
      updatedAt: Number(f.updatedAt) || Date.now(),
    }));
  if (!files.length) return defaultState();
  const settings = Object.assign({}, defaultState().settings, raw.settings || {});
  settings.fontSize = Math.min(24, Math.max(12, Number(settings.fontSize) || 15));
  const activeId = files.some((f) => f.id === raw.activeId) ? raw.activeId : files[0].id;
  return { version: 1, files, activeId, settings };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    return defaultState();
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/** 导出备份（JSON 文本） */
export function serializeBackup(state) {
  return JSON.stringify(
    { app: 'pocket-devcpp', version: 1, exportedAt: new Date().toISOString(), files: state.files, settings: state.settings },
    null,
    2
  );
}

/** 解析备份，容忍直接拖进来的普通 .c/.cpp 文件 */
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data && Array.isArray(data.files)) {
    return normalizeState({ files: data.files, settings: data.settings || {}, activeId: null });
  }
  if (data && typeof data.content === 'string') {
    return normalizeState({ files: [data], settings: {}, activeId: null });
  }
  throw new Error('备份文件格式无法识别');
}
