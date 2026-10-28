import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredCoverFinish, coverRangeError, DEFAULT_COVER_MATERIAL, DEFAULT_COVER_RANGES,
  loadCoverMaterial, saveCoverMaterial, subscribeCoverMaterial, type CoverMaterialPreferences,
} from './coverMaterialPreferences.ts';

const KEY = 'qiyu.cover-material.v1';
function environment(initial?: string) {
  const values = new Map<string, string>(); if (initial !== undefined) values.set(KEY, initial);
  let writes = 0, fail = false;
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('QuotaExceededError'); writes++; values.set(key, value); } };
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  return { values, events, writes: () => writes, fail: () => { fail = true; } };
}
const prefs = (patch: Partial<CoverMaterialPreferences> = {}): CoverMaterialPreferences => ({ ...DEFAULT_COVER_MATERIAL, ...patch });

test('卡面缺省读取不写库，快照稳定，恢复默认不改变原始高分映射', () => {
  const env = environment();
  const first = loadCoverMaterial();
  assert.deepEqual(first, DEFAULT_COVER_MATERIAL); assert.strictEqual(loadCoverMaterial(), first);
  assert.equal(env.writes(), 0); assert.equal(env.values.has(KEY), false);
  assert.equal(configuredCoverFinish(9, 'prismatic', first), 'prismatic');
  assert.equal(configuredCoverFinish(9.5, 'holographic', first), 'holographic');
  assert.equal(configuredCoverFinish(undefined, 'prismatic', first), 'prismatic', '历史字母评级原映射由调用方保留');
});

test('旧四字段偏好逐值保留，仅补读新缺省，显式保存保留未知扩展', () => {
  const old = { strength: .2, filter: .3, speed: 0, facets: false, future: { retained: true } };
  const env = environment(JSON.stringify(old));
  const read = loadCoverMaterial();
  assert.deepEqual([read.strength, read.filter, read.speed, read.facets], [.2, .3, 0, false]);
  assert.equal(read.enabled, true); assert.equal(read.mode, 'default'); assert.equal(env.writes(), 0);
  assert.equal(env.values.get(KEY), JSON.stringify(old));
  saveCoverMaterial({ ...read, enabled: false });
  const stored = JSON.parse(env.values.get(KEY)!);
  assert.deepEqual(stored.future, old.future); assert.equal(stored.speed, 0); assert.equal(stored.facets, false);
});

test('统一模式包含未评分游戏，关闭优先于统一及评分规则', () => {
  const uniform = prefs({ mode: 'uniform', uniformFinish: 'prismatic' });
  assert.equal(configuredCoverFinish(undefined, 'standard', uniform), 'prismatic');
  assert.equal(configuredCoverFinish(0, 'standard', uniform), 'prismatic');
  assert.equal(configuredCoverFinish(10, 'holographic', uniform), 'prismatic');
  for (const mode of ['default', 'uniform', 'ranges'] as const) assert.equal(configuredCoverFinish(10, 'holographic', prefs({ mode, enabled: false })), 'standard');
});

test('评分区间闭区间匹配，真实0不等于未评分，空缺不沿用原材质', () => {
  const custom = prefs({ mode: 'ranges', ranges: [{ min: 0, max: .9, finish: 'prismatic' }, ...DEFAULT_COVER_RANGES] });
  for (const score of [0, .1, .9]) assert.equal(configuredCoverFinish(score, 'standard', custom), 'prismatic');
  for (const score of [9, 9.4]) assert.equal(configuredCoverFinish(score, 'standard', custom), 'prismatic');
  for (const score of [9.5, 10]) assert.equal(configuredCoverFinish(score, 'standard', custom), 'holographic');
  for (const score of [undefined, 1, 8.9, 9.45, NaN, Infinity]) assert.equal(configuredCoverFinish(score, 'holographic', custom), 'standard');
  assert.equal(configuredCoverFinish(10, 'holographic', prefs({ mode: 'ranges', ranges: [] })), 'standard');
});

test('整数分段与原默认拆段均合法，区间排序不改输入，跨段共边界不合法', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ min: i, max: i === 9 ? 10 : i + .9, finish: 'holographic' as const }));
  assert.equal(coverRangeError(ten), undefined); assert.equal(coverRangeError(DEFAULT_COVER_RANGES), undefined);
  const reversed = [...DEFAULT_COVER_RANGES].reverse(), before = JSON.stringify(reversed);
  assert.equal(coverRangeError(reversed), undefined); assert.equal(JSON.stringify(reversed), before);
  assert.match(coverRangeError([{ min: 8, max: 9, finish: 'standard' }, { min: 9, max: 10, finish: 'prismatic' }])!, /不能重叠/);
});

test('非法区间不写偏好、不广播、不覆盖先前规则', () => {
  const env = environment(JSON.stringify(prefs())); const before = env.values.get(KEY); let events = 0;
  env.events.addEventListener('qiyu:cover-material', () => events++);
  const invalid = [
    [{ min: 8, max: 7, finish: 'standard' }], [{ min: -1, max: 1, finish: 'prismatic' }],
    [{ min: 0, max: 10.1, finish: 'holographic' }], [{ min: 9.45, max: 10, finish: 'prismatic' }],
    [{ min: NaN, max: 10, finish: 'prismatic' }], [{ min: 0, max: 10, finish: 'foil' }],
    [{ min: 0, max: 10, finish: 'standard' }, { min: 1, max: 2, finish: 'holographic' }],
  ];
  for (const ranges of invalid) assert.throws(() => saveCoverMaterial(prefs({ ranges: ranges as CoverMaterialPreferences['ranges'] })));
  assert.equal(env.writes(), 0); assert.equal(env.values.get(KEY), before); assert.equal(events, 0);
});

test('损坏扩展回退不丢合法旧参数、不启动修复写回', () => {
  const env = environment(JSON.stringify({ strength: .4, filter: .5, speed: .6, facets: false, mode: 'invalid', ranges: [{ min: 10, max: 0 }] }));
  const read = loadCoverMaterial();
  assert.equal(read.strength, .4); assert.equal(read.filter, .5); assert.equal(read.speed, .6); assert.equal(read.facets, false);
  assert.equal(read.mode, 'default'); assert.deepEqual(read.ranges, DEFAULT_COVER_RANGES); assert.equal(env.writes(), 0);
  env.values.set(KEY, '{broken'); assert.deepEqual(loadCoverMaterial(), DEFAULT_COVER_MATERIAL); assert.equal(env.writes(), 0);
});

test('共享订阅响应本机与跨窗更新，保存失败不通知，取消订阅不再通知', () => {
  const env = environment(); let count = 0; loadCoverMaterial();
  const unsubscribe = subscribeCoverMaterial(() => count++);
  saveCoverMaterial(prefs({ enabled: false })); assert.equal(count, 1); assert.equal(loadCoverMaterial().enabled, false);
  const stored = loadCoverMaterial(); assert.strictEqual(loadCoverMaterial(), stored);
  env.values.set(KEY, JSON.stringify(prefs({ mode: 'uniform' })));
  const crossWindow = new Event('storage'); Object.defineProperty(crossWindow, 'key', { value: KEY }); env.events.dispatchEvent(crossWindow);
  assert.equal(count, 2); assert.equal(loadCoverMaterial().mode, 'uniform');
  env.fail(); assert.throws(() => saveCoverMaterial(prefs()), /QuotaExceededError/); assert.equal(count, 2); assert.strictEqual(loadCoverMaterial(), loadCoverMaterial());
  unsubscribe(); env.events.dispatchEvent(new Event('qiyu:cover-material')); assert.equal(count, 2);
});
