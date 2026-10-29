import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLabel, dateLabel, gameTagStats, timelineGroups } from './retrospective.ts';
import type { Activity, Work } from './model.ts';

const work = (id: string, category: Work['category'] = 'game', gameTags?: Work['gameTags']): Work => ({ id, title: id, category, gameTags, subtitle: '', tone: '#000', accent: '#fff', year: '2026', description: '' });
const record = (id: string, workId: string, minutes?: number, date = '2026-10-27'): Activity => ({ id, workId, date, kind: 'note', minutes, note: '' });

test('tag counts distinct games, deduplicates sessions and tag case, excludes unplayed inventory and other media', () => {
  const works = [work('g1', 'game', { gameplay: ['动作', '动作', 'RPG', 'rpg'] }), work('g2', 'game', { gameplay: ['动作'] }), work('unplayed', 'game', { gameplay: ['库存专属'] }), work('book', 'book', { gameplay: ['动作'] })];
  const a = record('a', 'g1', 20), activities = [a, a, record('b', 'g1', 30), record('c', 'g2', 40), record('d', 'book', 50)];
  const summary = gameTagStats(activities, works, 'gameplay');
  assert.equal(summary.games.length, 2);
  assert.equal(summary.tags.find(tag => tag.id === '动作')?.count, 2);
  assert.equal(summary.tags.find(tag => tag.id === '动作')?.minutes, 90);
  assert.equal(summary.tags.find(tag => tag.id === 'rpg')?.count, 1);
  assert.equal(summary.tags.find(tag => tag.id === 'rpg')?.minutes, 50);
  assert.ok(!summary.tags.some(tag => tag.label === '库存专属'));
});

test('known zero and missing minutes remain distinct; partially known tag totals retain missing count', () => {
  const works = [work('zero', 'game', { theme: ['零时长', '共享'] }), work('unknown', 'game', { theme: ['未知', '共享'] })];
  const summary = gameTagStats([record('a', 'zero', 0), record('b', 'unknown')], works, 'theme');
  assert.equal(summary.tags.find(tag => tag.id === '零时长')?.minutes, 0);
  assert.equal(summary.tags.find(tag => tag.id === '未知')?.minutes, undefined);
  assert.deepEqual([summary.tags.find(tag => tag.id === '共享')?.minutes, summary.tags.find(tag => tag.id === '共享')?.unknown], [0, 1]);
});

test('tag groups remain independent and count untagged played games without inventing labels', () => {
  const works = [work('a', 'game', { gameplay: ['探索'], theme: ['探索'] }), work('b')];
  const summary = gameTagStats([record('a1', 'a', 10), record('b1', 'b', 20)], works, 'gameplay');
  assert.equal(summary.tags.length, 1); assert.equal(summary.untagged, 1);
  assert.equal(gameTagStats([record('a1', 'a')], works, 'scenario').tags.length, 0);
});

test('timeline aggregates same-day sessions without treating an experience as completion', () => {
  const works = [work('g')];
  const records = [record('a', 'g', 0), record('b', 'g'), record('c', 'g', 20, '2026-10-26')];
  const groups = timelineGroups(records, works, 'week');
  assert.equal(groups.length, 2);
  const entry = groups[0].entries[0];
  assert.equal(entry.records.length, 2); assert.equal(entry.minutes, 0); assert.equal(entry.unknown, 1);
  assert.deepEqual(entry.labels, ['体验']);
  assert.equal(groups[1].entries[0].date, '2026-10-26');
});

test('month/year/unknown precision is preserved; book finished rounds are not game clears', () => {
  const works = [work('b', 'book')];
  const activities: Activity[] = [record('m', 'b', undefined, '2026-09'), record('y', 'b', undefined, '2026'), { ...record('u', 'b'), date: undefined }, { ...record('round:r1', 'b'), kind: 'completed' }];
  const groups = timelineGroups(activities, works, 'year');
  assert.ok(groups.some(group => group.id === '2026-09' && group.entries[0].date === '2026-09'));
  assert.ok(groups.some(group => group.id === '2026'));
  assert.ok(groups.some(group => group.id === 'unknown'));
  assert.equal(activityLabel(activities[3], works[0]), '读完');
  assert.equal(dateLabel('2026-09'), '9 月 · 日期未详');
  assert.ok(!groups.flatMap(group => group.entries).some(entry => entry.date === '2026-09-01'));
});
