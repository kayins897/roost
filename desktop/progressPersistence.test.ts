import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryStore } from './store.ts';
import { recordCompletion } from '../src/domain/gameProgress.ts';
import { isValidSnapshot } from '../src/domain/library.ts';
import type { LibrarySnapshot } from '../src/domain/types.ts';

const old = (): LibrarySnapshot => ({ schemaVersion: 1, futureRoot: { keep: true }, items: [{
  id: 'legacy', category: 'game', title: '旧通关合成样例', subcategory: 'Steam', creator: '', year: '',
  status: 'finished', gamePlayState: 'cleared', personalGrade: 'SS', tags: [], impression: '保留原文',
  favorite: false, artwork: 'default', createdAt: '2023-01-01T00:00:00Z', updatedAt: '2023-01-01T00:00:00Z',
  futureItem: { keep: [1, 2] },
}] });

test('双维度与完成事件真实磁盘往返、旧库读取零写与导入前原文保留', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-progress-store-'));
  try {
    const file = path.join(directory, 'library.json');
    const original = JSON.stringify(old(), null, 3);
    fs.writeFileSync(file, original);
    const store = new LibraryStore(directory), loaded = store.load();
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(loaded.snapshot?.items[0].completion, undefined);
    const result = recordCompletion(loaded.snapshot!.items[0], { eventId: 'new-2023', occurredAt: '2023', countChoice: 'set', countValue: 5, markCleared: true }, '2026-10-25T00:00:00.000Z')!;
    const snapshot = { ...loaded.snapshot!, items: [{ ...loaded.snapshot!.items[0], ...result.patch, playEngagement: 'playing' as const }] };
    const saved = store.save(snapshot, loaded.revision);
    assert.equal(fs.readFileSync(path.join(directory, 'library.previous.json'), 'utf8'), original);
    const reopened = new LibraryStore(directory).load();
    assert.deepEqual(reopened.snapshot, snapshot);
    assert.equal(reopened.snapshot!.items[0].completionEvents![0].occurredAt, '2023');
    const exported = JSON.stringify(reopened.snapshot);
    assert.equal(isValidSnapshot(JSON.parse(exported)), true);
    store.save(old(), saved.revision, true);
    const backups = fs.readdirSync(path.join(directory, 'backups')).filter(name => name.startsWith('before-import-'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'backups', backups[0]), 'utf8')), snapshot);
    store.save(JSON.parse(exported), store.load().revision, true);
    assert.deepEqual(new LibraryStore(directory).load().snapshot, snapshot);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('完成记录并发修订冲突保持最新原文，损坏库不自动修复', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-progress-conflict-'));
  try {
    const first = new LibraryStore(directory);
    first.save(old(), first.load().revision);
    const stale = first.load();
    const second = new LibraryStore(directory);
    const current = second.load();
    const changed = { ...current.snapshot!, items: [{ ...current.snapshot!.items[0], completionCount: 0, completion: 'not-cleared' as const }] };
    second.save(changed, current.revision);
    const raw = fs.readFileSync(first.file, 'utf8');
    assert.throws(() => first.save(stale.snapshot, stale.revision), /变更/);
    assert.equal(fs.readFileSync(first.file, 'utf8'), raw);
    fs.writeFileSync(first.file, '{broken');
    assert.ok(first.load().error);
    assert.equal(fs.readFileSync(first.file, 'utf8'), '{broken');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
