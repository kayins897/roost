import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalIsbn } from './isbn.ts';
import { createSteamImportItems, previewSteamImport, type SteamImportGame } from './steamImport.ts';

test('ISBN 验证校验位，规范空格连字符和大小写，ISBN-10 与等价 13 位共用身份', () => {
  assert.equal(canonicalIsbn('0-306-40615-2'), '9780306406157');
  assert.equal(canonicalIsbn('９７８ ０３０６４０６１５７'), '9780306406157');
  assert.equal(canonicalIsbn('0-8044-2957-x'), '9780804429573');
  for (const value of ['', '000123', '0000000000', '9780306406158', '0306406151', '1234567890128', '9780306406157extra']) assert.equal(canonicalIsbn(value), undefined, value);
});

test('同有效 ISBN 的异名书及同批重复被拦截，原 ISBN 和既有用户资料保持不变', () => {
  const book: SteamImportGame = { title: '版本原名', category: 'book', bookDetails: { isbn: '0-306-40615-2' } };
  const existing = createSteamImportItems([book]); existing[0].impression = '感想保留'; existing[0].personalScore = 0;
  const before = JSON.stringify(existing);
  const incoming = { title: '同版不同名称', category: 'book' as const, bookDetails: { isbn: '9780306406157' } };
  assert.equal(previewSteamImport([incoming], existing)[0].duplicate, 'existing-id');
  assert.equal(previewSteamImport([book, incoming], [])[1].duplicate, 'source-id');
  assert.equal(existing[0].bookDetails?.isbn, '0-306-40615-2'); assert.equal(JSON.stringify(existing), before);
});

test('无效 ISBN 不形成身份，不同有效版本可收录且不跨板块匹配', () => {
  const first: SteamImportGame = { title: '版本甲', category: 'book', bookDetails: { isbn: '9780306406157' } };
  const other: SteamImportGame = { title: '版本乙', category: 'book', bookDetails: { isbn: '9780804429573' } };
  assert.equal(previewSteamImport([other], createSteamImportItems([first]))[0].duplicate, null);
  const invalid = { ...first, bookDetails: { isbn: 'bad-isbn' } };
  assert.equal(previewSteamImport([{ ...invalid, title: '无效号另一书' }], createSteamImportItems([invalid]))[0].duplicate, null);
  assert.equal(previewSteamImport([{ ...first, title: '其他媒体', category: 'screen' }], createSteamImportItems([first]))[0].duplicate, null);
});
