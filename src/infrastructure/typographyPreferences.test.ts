import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TYPOGRAPHY, initializeTypography, loadTypography, saveTypography, subscribeTypography } from './typographyPreferences.ts';

const KEY = 'qiyu.typography.v1';
function environment(raw?: string) {
  const values = new Map<string, string>();
  if (raw !== undefined) values.set(KEY, raw);
  values.set('qiyu.library.v1', '{"privateCollection":"untouched"}');
  let writes = 0, blocked = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('Storage blocked'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blocked) throw new Error('Storage blocked'); writes++; values.set(key, value); },
  } });
  const events = new EventTarget(), dataset: Record<string, string> = {};
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset } } });
  return { values, events, dataset, writes: () => writes, block: () => { blocked = true; } };
}
function storageEvent(key: string | null) {
  const event = new Event('storage'); Object.defineProperty(event, 'key', { value: key }); return event;
}

test('界面字体缺省与损坏偏好只读回退，不重写外观或收藏', () => {
  for (const raw of [undefined, '{broken', 'null', '[]', '"serif"', '{"family":"paid-font"}']) {
    const env = environment(raw);
    assert.deepEqual(loadTypography(), DEFAULT_TYPOGRAPHY);
    const stop = initializeTypography();
    assert.equal(env.dataset.interfaceFont, 'sans'); assert.equal(env.writes(), 0);
    assert.equal(env.values.get(KEY), raw);
    assert.equal(env.values.get('qiyu.library.v1'), '{"privateCollection":"untouched"}');
    stop();
  }
});

test('三种字体即时应用与本机订阅，加载及关闭设置不会追加写入', () => {
  const env = environment(); const stop = initializeTypography(); let changes = 0;
  const unsubscribe = subscribeTypography(() => changes++);
  for (const family of ['serif', 'system', 'sans'] as const) {
    saveTypography({ family });
    assert.equal(env.dataset.interfaceFont, family);
    assert.equal(loadTypography().family, family);
    assert.strictEqual(loadTypography(), loadTypography());
    assert.equal(JSON.parse(env.values.get(KEY)!).family, family);
  }
  assert.equal(changes, 3); assert.equal(env.writes(), 3);
  unsubscribe(); stop();
  env.events.dispatchEvent(new Event('qiyu:typography'));
  assert.equal(changes, 3); assert.equal(env.writes(), 3);
});

test('字体跨窗修改及清空按新快照应用，不响应无关键', () => {
  const env = environment('{"family":"system"}'); const stop = initializeTypography();
  assert.equal(env.dataset.interfaceFont, 'system');
  env.values.set(KEY, '{"family":"serif"}');
  env.events.dispatchEvent(storageEvent('unrelated'));
  assert.equal(env.dataset.interfaceFont, 'system');
  env.events.dispatchEvent(storageEvent(KEY)); assert.equal(env.dataset.interfaceFont, 'serif');
  env.values.delete(KEY); env.events.dispatchEvent(storageEvent(null));
  assert.equal(env.dataset.interfaceFont, 'sans'); assert.equal(env.writes(), 0); stop();
});

test('字体保存无效或权限失败时不显示保存成功，不改收藏', () => {
  const env = environment('{"family":"serif"}'); const stop = initializeTypography(); let changes = 0;
  const unsubscribe = subscribeTypography(() => changes++);
  assert.throws(() => saveTypography({ family: 'arbitrary-font' as 'sans' }), /Invalid interface font/);
  env.block();
  assert.throws(() => saveTypography({ family: 'system' }), /Storage blocked/);
  assert.equal(env.dataset.interfaceFont, 'serif'); assert.equal(changes, 0); assert.equal(env.writes(), 0);
  assert.equal(env.values.get(KEY), '{"family":"serif"}');
  assert.equal(env.values.get('qiyu.library.v1'), '{"privateCollection":"untouched"}');
  assert.equal(loadTypography().family, 'serif');
  unsubscribe(); stop();
});
