import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTags, createBookTags, tagReducer } from './book-tags.ts';

test('tag names trim whitespace, deduplicate case and retain empty unassigned tags', () => {
  assert.deepEqual(cleanTags([' Steam ', 'steam', '', '中文', '中文', 'x'.repeat(33)]), ['Steam', '中文']);
  const state = tagReducer(createBookTags(), { type: 'create', name: ' 夏日书单 ' });
  assert.ok(state.names.includes('夏日书单'));
  assert.ok(Object.values(state.byBook).every(names => !names.includes('夏日书单')));
});
test('assigning an existing tag to a book preserves canonical spelling and other books', () => {
  const initial = tagReducer(createBookTags(), { type: 'create', name: 'SciFi' });
  const next = tagReducer(initial, { type: 'book', workId: 'b1', names: ['文学', ' scifi ', 'SCIFI'] });
  assert.deepEqual(next.byBook.b1, ['文学', 'SciFi']);
  assert.deepEqual(next.byBook.b2, initial.byBook.b2);
  assert.deepEqual(initial.byBook.b1, ['文学', '城市', '旅行', '哲学']);
});
test('batch assignment changes only the selected tag and deleting it keeps all books', () => {
  const initial = createBookTags();
  const next = tagReducer(initial, { type: 'assign', name: '文学', workIds: ['b4', 'b8'] });
  assert.deepEqual(next.byBook.b4, ['科幻', '宇宙', '冒险', '文学']);
  assert.deepEqual(next.byBook.b1, ['城市', '旅行', '哲学']);
  assert.deepEqual(next.byBook.b3, initial.byBook.b3);
  const deleted = tagReducer(next, { type: 'delete', name: '文学' });
  assert.deepEqual(Object.keys(deleted.byBook), Object.keys(initial.byBook));
  assert.ok(Object.values(deleted.byBook).every(names => !names.includes('文学')));
  assert.ok(!deleted.names.includes('文学'));
  assert.deepEqual(deleted.byBook.b4, ['科幻', '宇宙', '冒险']);
});
