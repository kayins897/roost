import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { LibraryStore } from './store.ts';
import type { LibrarySnapshot, MediaItem } from '../src/domain/types.ts';

const TEMP_PREFIX = 'qiyu-store-test-';

function createStore(t: TestContext) {
  const tempParent = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempParent, TEMP_PREFIX));
  t.after(() => {
    // Only remove the exclusive directory allocated by this test, inside tmp.
    const resolved = path.resolve(temporary);
    assert.equal(path.dirname(resolved), tempParent);
    assert.ok(path.basename(resolved).startsWith(TEMP_PREFIX));
    assert.equal(fs.lstatSync(resolved).isSymbolicLink(), false);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return new LibraryStore(path.join(temporary, 'data'));
}

function snapshot(title: string): LibrarySnapshot {
  const item: MediaItem = {
    id: 'record-1', title, category: 'game', subcategory: 'Steam',
    creator: '制作人', year: '2026', status: 'finished',
    gamePlayState: 'cleared', playtimeMinutes: 150,
    tags: ['剧情'], gameTags: { gameplay: [], theme: ['剧情'], scenario: [], other: [] },
    impression: '留给自己的记录', favorite: true, artwork: 'blue',
    sourceUrl: 'https://example.org/work',
    coverUrl: 'data:image/png;base64,aGVsbG8=',
    createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T01:00:00.000Z',
  };
  return { schemaVersion: 1, items: [item], exportedAt: '2026-10-22T02:00:00.000Z' };
}

function backupFiles(store: LibraryStore): string[] {
  const directory = path.join(store.directory, 'backups');
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
}

function raw(store: LibraryStore): string {
  return fs.readFileSync(store.file, 'utf8');
}

test('首次保存可创建数据目录，重新实例化后完整读取收藏与修订号', t => {
  const store = createStore(t);
  assert.deepEqual(store.load(), { snapshot: null, revision: 'missing', error: undefined });
  assert.equal(fs.existsSync(store.directory), false);

  const data = snapshot('中文收藏 🎮');
  const saved = store.save(data, 'missing');
  const loaded = new LibraryStore(store.directory).load();
  assert.match(saved.revision, /^[a-f\d]{64}$/);
  assert.equal(loaded.revision, saved.revision);
  assert.equal(loaded.error, undefined);
  assert.deepEqual(loaded.snapshot, data);
  assert.deepEqual(JSON.parse(raw(store)), data);
  assert.deepEqual(fs.readdirSync(store.directory), ['library.json']);
});

test('另一个实例写入后，旧修订号拒绝覆盖且不改动文件或备份', t => {
  const first = createStore(t);
  const second = new LibraryStore(first.directory);
  const sharedRevision = first.save(snapshot('初始记录'), 'missing').revision;
  assert.equal(second.load().revision, sharedRevision);

  const latest = snapshot('另一个窗口已更新');
  const latestRevision = second.save(latest, sharedRevision).revision;
  const latestRaw = raw(first);
  const previousRaw = fs.readFileSync(path.join(first.directory, 'library.previous.json'), 'utf8');
  const backups = backupFiles(first);

  assert.throws(() => first.save(snapshot('过期窗口的修改'), sharedRevision), /其他位置变更/);
  assert.equal(raw(first), latestRaw);
  assert.equal(fs.readFileSync(path.join(first.directory, 'library.previous.json'), 'utf8'), previousRaw);
  assert.deepEqual(backupFiles(first), backups);
  assert.deepEqual(first.load(), { snapshot: latest, revision: latestRevision, error: undefined });
});

test('外部修改原始 JSON 的格式也使旧修订号失效，外部删除不会被静默重建', t => {
  const store = createStore(t);
  const saved = store.save(snapshot('原始收藏'), 'missing');
  const externallyChanged = `${raw(store)}\n`;
  fs.writeFileSync(store.file, externallyChanged);
  assert.throws(() => store.save(snapshot('旧窗口修改'), saved.revision), /其他位置变更/);
  assert.equal(raw(store), externallyChanged);
  assert.deepEqual(backupFiles(store), []);

  const changedRevision = store.load().revision;
  fs.unlinkSync(store.file);
  assert.throws(() => store.save(snapshot('文件删除后修改'), changedRevision), /其他位置变更/);
  assert.equal(fs.existsSync(store.file), false);
});

test('损坏文件返回可恢复错误，普通保存保持原始字节且不生成备份', t => {
  const store = createStore(t);
  fs.mkdirSync(store.directory, { recursive: true });
  const broken = '{"schemaVersion":1,"items":[\n此处损坏\r\n';
  fs.writeFileSync(store.file, broken);
  const loaded = store.load();
  assert.equal(loaded.snapshot, null);
  assert.match(loaded.error ?? '', /无法解析/);
  assert.match(loaded.revision, /^[a-f\d]{64}$/);

  assert.throws(() => store.save(snapshot('普通修改'), loaded.revision), /需要恢复/);
  assert.equal(raw(store), broken);
  assert.deepEqual(fs.readdirSync(store.directory), ['library.json']);
});

test('显式恢复先保存坏文件原文，再写入有效收藏且不覆盖已有 previous 备份', t => {
  const store = createStore(t);
  fs.mkdirSync(store.directory, { recursive: true });
  const broken = 'not JSON\r\n原始坏文件';
  const previous = JSON.stringify(snapshot('已有的安全备份'));
  fs.writeFileSync(store.file, broken);
  fs.writeFileSync(path.join(store.directory, 'library.previous.json'), previous);
  const loaded = store.load();
  const recovered = snapshot('恢复后的收藏');

  const result = store.save(recovered, loaded.revision, true);
  assert.deepEqual(store.load(), { snapshot: recovered, revision: result.revision, error: undefined });
  const archives = backupFiles(store);
  assert.equal(archives.length, 1);
  assert.match(archives[0], /^before-import-.+\.json$/);
  assert.equal(fs.readFileSync(path.join(store.directory, 'backups', archives[0]), 'utf8'), broken);
  assert.equal(fs.readFileSync(path.join(store.directory, 'library.previous.json'), 'utf8'), previous);
  assert.equal(archives.some(name => name.startsWith('daily-')), false);
});

test('对正常收藏显式导入时保存每次导入前的原文，连续导入备份互不覆盖', t => {
  const store = createStore(t);
  const initial = store.save(snapshot('导入之前'), 'missing');
  const originalRaw = raw(store);
  const firstImport = store.save(snapshot('第一次导入'), initial.revision, true);
  const importedRaw = raw(store);
  const firstArchives = backupFiles(store).filter(name => name.startsWith('before-import-'));
  assert.equal(firstArchives.length, 1);
  assert.equal(fs.readFileSync(path.join(store.directory, 'backups', firstArchives[0]), 'utf8'), originalRaw);

  store.save(snapshot('第二次导入'), firstImport.revision, true);
  const archives = backupFiles(store).filter(name => name.startsWith('before-import-'));
  assert.equal(archives.length, 2);
  const newArchive = archives.find(name => !firstArchives.includes(name));
  assert.ok(newArchive);
  assert.equal(fs.readFileSync(path.join(store.directory, 'backups', newArchive), 'utf8'), importedRaw);
  assert.equal(fs.readFileSync(path.join(store.directory, 'backups', firstArchives[0]), 'utf8'), originalRaw);
  assert.equal(fs.readFileSync(path.join(store.directory, 'library.previous.json'), 'utf8'), importedRaw);
  assert.deepEqual(store.load().snapshot, snapshot('第二次导入'));
});

test('每次保存更新 previous，同一天只保留首次修改前的 daily 备份', t => {
  const store = createStore(t);
  const initial = store.save(snapshot('第一版'), 'missing');
  const firstRaw = raw(store);
  assert.deepEqual(backupFiles(store), []);
  const second = store.save(snapshot('第二版'), initial.revision);
  const secondRaw = raw(store);
  const daily = backupFiles(store).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  assert.equal(daily.length, 1);
  assert.equal(fs.readFileSync(path.join(store.directory, 'library.previous.json'), 'utf8'), firstRaw);
  assert.equal(fs.readFileSync(path.join(store.directory, 'backups', daily[0]), 'utf8'), firstRaw);

  store.save(snapshot('第三版'), second.revision);
  assert.equal(fs.readFileSync(path.join(store.directory, 'library.previous.json'), 'utf8'), secondRaw);
  assert.deepEqual(backupFiles(store), daily);
  assert.equal(fs.readFileSync(path.join(store.directory, 'backups', daily[0]), 'utf8'), firstRaw);
  assert.deepEqual(store.load().snapshot, snapshot('第三版'));
  assert.equal(fs.readdirSync(store.directory).some(name => name.endsWith('.tmp')), false);
});

test('仅清理超过七份的日期备份，保留导入备份和其他文件', t => {
  const store = createStore(t);
  const initial = store.save(snapshot('清理前'), 'missing');
  const directory = path.join(store.directory, 'backups');
  fs.mkdirSync(directory);
  for (let day = 1; day <= 9; day++) {
    fs.writeFileSync(path.join(directory, `daily-2000-01-${String(day).padStart(2, '0')}.json`), `archive-${day}`);
  }
  fs.writeFileSync(path.join(directory, 'before-import-keep.json'), '导入备份');
  fs.writeFileSync(path.join(directory, 'user-notes.json'), '用户文件');
  fs.writeFileSync(path.join(directory, 'daily-incomplete.json'), '其他文件');

  store.save(snapshot('清理后'), initial.revision);
  const files = backupFiles(store);
  const daily = files.filter(name => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  assert.equal(daily.length, 7);
  assert.deepEqual(daily.filter(name => name.startsWith('daily-2000-')), [
    'daily-2000-01-04.json', 'daily-2000-01-05.json', 'daily-2000-01-06.json',
    'daily-2000-01-07.json', 'daily-2000-01-08.json', 'daily-2000-01-09.json',
  ]);
  assert.equal(fs.readFileSync(path.join(directory, 'before-import-keep.json'), 'utf8'), '导入备份');
  assert.equal(fs.readFileSync(path.join(directory, 'user-notes.json'), 'utf8'), '用户文件');
  assert.equal(fs.readFileSync(path.join(directory, 'daily-incomplete.json'), 'utf8'), '其他文件');
});

test('非法快照在普通保存和显式恢复时都被拒绝，已有收藏和备份保持不变', t => {
  const store = createStore(t);
  const valid = snapshot('有效收藏');
  const saved = store.save(valid, 'missing');
  const original = raw(store);
  const invalid: unknown[] = [
    null,
    { schemaVersion: 2, items: [] },
    { schemaVersion: 1, items: {} },
    { ...valid, items: [{ ...valid.items[0], title: '  ' }] },
    { ...valid, items: [valid.items[0], valid.items[0]] },
    { ...valid, items: [{ ...valid.items[0], playtimeMinutes: -1 }] },
    { ...valid, items: [{ ...valid.items[0], gamePlayState: 'invalid' }] },
    { ...valid, items: [{ ...valid.items[0], sourceUrl: 'javascript:alert(1)' }] },
    { ...valid, items: [{ ...valid.items[0], coverUrl: 'https://example.org/remote.png' }] },
  ];
  for (const [index, value] of invalid.entries()) {
    for (const allowRecovery of [false, true]) {
      assert.throws(() => store.save(value, saved.revision, allowRecovery), /校验失败/, `case ${index}, recovery ${allowRecovery}`);
      assert.equal(raw(store), original);
      assert.deepEqual(backupFiles(store), []);
    }
  }
  assert.deepEqual(store.load(), { snapshot: valid, revision: saved.revision, error: undefined });
});

test('语法有效但内容非法的收藏文件也需要显式恢复', t => {
  const store = createStore(t);
  fs.mkdirSync(store.directory, { recursive: true });
  const unsupported = JSON.stringify({ schemaVersion: 99, items: [] });
  fs.writeFileSync(store.file, unsupported);
  const loaded = store.load();
  assert.equal(loaded.snapshot, null);
  assert.match(loaded.error ?? '', /无法解析/);
  assert.throws(() => store.save(snapshot('普通写入'), loaded.revision), /需要恢复/);
  assert.equal(raw(store), unsupported);
});

test('外部超限文件保持只读且显式恢复前完整另存，不覆盖之前的有效备份', t => {
  const store = createStore(t);
  const first = store.save(snapshot('有效收藏'), 'missing');
  store.save(snapshot('第二版有效收藏'), first.revision);
  const previous = fs.readFileSync(path.join(store.directory, 'library.previous.json'), 'utf8');
  const size = 100 * 1024 * 1024 + 1;
  fs.truncateSync(store.file, size);
  const loaded = store.load();
  assert.equal(loaded.snapshot, null);
  assert.match(loaded.error ?? '', /超过 100 MB/);
  assert.throws(() => store.save(snapshot('普通保存'), loaded.revision), /需要恢复/);
  assert.equal(fs.statSync(store.file).size, size);
  store.save(snapshot('恢复完成'), loaded.revision, true);
  assert.equal(store.load().snapshot?.items[0].title, '恢复完成');
  const archive = backupFiles(store).find(name => name.startsWith('before-import-'))!;
  assert.ok(archive);
  assert.equal(fs.statSync(path.join(store.directory, 'backups', archive)).size, size);
  assert.equal(fs.readFileSync(path.join(store.directory, 'library.previous.json'), 'utf8'), previous);
});
