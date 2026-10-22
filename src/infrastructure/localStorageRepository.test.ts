import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalStorageRepository } from './localStorageRepository.ts';
import type { LibrarySnapshot } from '../domain/types.ts';

const empty = (): LibrarySnapshot => ({ schemaVersion: 1, items: [] });
function fakeStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set('qiyu.library.v1', initial);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('浏览器正常备份导入前保留当前原文，普通保存不覆盖导入前副本', () => {
  const original = JSON.stringify({ ...empty(), futureExtension: { preserved: true } }, null, 2);
  const storage = fakeStorage(original);
  const repository = new LocalStorageRepository(storage);
  assert.deepEqual(repository.load(), JSON.parse(original));
  repository.save(empty(), { allowRecovery: true });
  assert.equal(storage.values.get('qiyu.library.before-import'), original);
  repository.save(empty());
  assert.equal(storage.values.get('qiyu.library.before-import'), original);
});

test('浏览器损坏原文只能显式恢复，恢复前分别保留原文', () => {
  const original = '{broken library';
  const storage = fakeStorage(original);
  const repository = new LocalStorageRepository(storage);
  assert.throws(() => repository.load(), /读取本地收藏库失败/);
  assert.throws(() => repository.save(empty()), /需要恢复/);
  assert.equal(storage.getItem('qiyu.library.v1'), original);
  repository.save(empty(), { allowRecovery: true });
  assert.equal(storage.getItem('qiyu.library.recovery'), original);
  assert.equal(storage.getItem('qiyu.library.before-import'), original);
  assert.deepEqual(JSON.parse(storage.getItem('qiyu.library.v1')!), empty());
});

test('浏览器导入前备份失败或另一窗口修改时，不覆盖当前收藏', () => {
  const original = JSON.stringify(empty());
  const storage = fakeStorage(original);
  const repository = new LocalStorageRepository(storage);
  repository.load();
  const save = storage.setItem;
  storage.setItem = (key, value) => { if (key === 'qiyu.library.before-import') throw new Error('QuotaExceededError'); save(key, value); };
  assert.throws(() => repository.save(empty(), { allowRecovery: true }), /QuotaExceededError/);
  assert.equal(storage.getItem('qiyu.library.v1'), original);
  storage.values.set('qiyu.library.v1', original + '\n');
  assert.throws(() => repository.save(empty(), { allowRecovery: true }), /其他窗口/);
  assert.equal(storage.getItem('qiyu.library.v1'), original + '\n');
});

test('批量追加先保留库原文，备份失败时停止追加且允许原草稿重试', () => {
  const original = JSON.stringify({ ...empty(), futureRoot: { retained: true } }, null, 2);
  const storage = fakeStorage(original);
  const repository = new LocalStorageRepository(storage);
  const current = repository.load();
  const save = storage.setItem;
  storage.setItem = (key, value) => { if (key === 'qiyu.library.before-import') throw new Error('备份空间不足'); save(key, value); };
  assert.throws(() => repository.save(current, { backupBeforeAppend: true }), /备份空间不足/);
  assert.equal(storage.getItem('qiyu.library.v1'), original);
  storage.setItem = save;
  repository.save(current, { backupBeforeAppend: true });
  assert.equal(storage.getItem('qiyu.library.before-import'), original);
  assert.deepEqual(JSON.parse(storage.getItem('qiyu.library.v1')!), current);
  repository.save(current);
  assert.equal(storage.getItem('qiyu.library.before-import'), original);
});
