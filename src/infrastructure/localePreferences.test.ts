import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalePreference } from './localePreferences.ts';
import { translateMessage } from '../shared/translate.ts';
import { english } from '../shared/locales/en.ts';
import { interfaceEnglish } from '../shared/locales/enInterface.ts';

test('界面语言缺省、损坏或不支持时回退中文，不猜测收藏内容', () => {
  for (const value of [null, '', 'null', '{bad', 'fr', 'zh-CN']) assert.equal(parseLocalePreference(value), 'zh-CN');
  assert.equal(parseLocalePreference('en'), 'en');
});
test('语言翻译仅替换明确的界面模板，保留用户文字及插入值', () => {
  assert.equal(translateMessage('查看{0}详情', 'en', ['新作开荒']), 'View 新作开荒 details');
  assert.equal(translateMessage('查看{0}详情', 'zh-CN', ['New game']), '查看New game详情');
  assert.equal(translateMessage('个人原文 {emoji} $&', 'en'), '个人原文 {emoji} $&');
  assert.equal(translateMessage('选择{0}', 'en', ['$& <script>游戏</script>']), 'Select $& <script>游戏</script>');
});
test('已格式化的时长和季集提示优先匹配完整模板，不留下半句中文', () => {
  assert.equal(translateMessage('1 小时 20 分钟', 'en'), '1 h 20 min');
  assert.equal(translateMessage('2 小时 0 分', 'en'), '2 h 0 min');
  assert.equal(translateMessage('第 2 季 · 第 3 集', 'en'), 'Season 2 · Episode 3');
  assert.equal(translateMessage('第 2 季 · 尚未开始', 'en'), 'Season 2 · Not started');
});
test('界面字典保留模板占位符且通用分类不触碰业务枚举', () => {
  for (const [source, translation] of Object.entries({ ...english, ...interfaceEnglish })) {
    const tokens = (value: string) => [...value.matchAll(/\{\d+\}/g)].map(value => value[0]).sort();
    assert.deepEqual(tokens(source), tokens(translation), source);
  }
  assert.equal(translateMessage('番剧', 'en'), 'Anime');
  assert.equal(translateMessage('番剧', 'zh-CN'), '番剧');
});
