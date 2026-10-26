import fs from 'node:fs';
import path from 'node:path';
import { LibraryStore } from './store.ts';

export interface LaunchMode { mode: 'normal' | 'test' | 'demo'; dataDirectory: string }

/** Resolve before creating directories or acquiring a lock. Partial isolation parameters fail closed. */
export function resolveLaunchMode(args: readonly string[], env: Record<string, string | undefined>, appData: string): LaunchMode {
  if (args.some(arg => arg.startsWith('--demo') && arg !== '--demo' && !arg.startsWith('--demo-profile=')) || args.filter(arg => arg === '--demo').length > 1) throw new Error('演示参数不完整，请使用随包“启动演示”入口。');
  const demo = args.includes('--demo');
  const profiles = args.filter(arg => arg.startsWith('--demo-profile='));
  const testing = env.QIYU_E2E === '1';
  if (demo && testing) throw new Error('演示模式与自动化测试模式不能同时启用。');
  if (testing || env.QIYU_TEST_DATA_DIR) {
    if (!testing || !env.QIYU_TEST_DATA_DIR || !path.isAbsolute(env.QIYU_TEST_DATA_DIR) || profiles.length) throw new Error('测试模式必须同时提供完整的隔离目录参数。');
    return { mode: 'test', dataDirectory: path.resolve(env.QIYU_TEST_DATA_DIR) };
  }
  if (!demo && profiles.length) throw new Error('演示目录参数必须与演示模式一起使用。');
  if (!demo) return { mode: 'normal', dataDirectory: path.join(appData, 'QIYU') };
  if (profiles.length !== 1) throw new Error('请双击随包“启动演示”，不要单独添加 --demo 参数。');
  const profile = profiles[0].slice('--demo-profile='.length);
  if (!path.isAbsolute(profile)) throw new Error('演示目录必须是启动器建立的独立绝对路径。');
  const dataDirectory = path.resolve(profile);
  if (dataDirectory.toLowerCase() === path.resolve(appData, 'QIYU').toLowerCase()) throw new Error('演示不能使用正式收藏目录。');
  return { mode: 'demo', dataDirectory };
}

/** A demo is seeded once by its launcher, never silently recreated by the application. */
export function assertDemoProfile(directory: string): void {
  try {
    const marker = path.join(directory, 'qiyu-demo.json');
    if (fs.statSync(marker).size > 4096) throw new Error('marker');
    const value: unknown = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'qiyu.demo.v1') throw new Error('marker');
    const loaded = new LibraryStore(directory).load();
    if (!loaded.snapshot || loaded.error) throw new Error('library');
  } catch {
    throw new Error('演示目录或收藏缺失、损坏，已停止启动，未重置任何数据。请保留原目录和“qiyu-demo-profile.json”，重新解压到新文件夹后可新建一份演示。');
  }
}
