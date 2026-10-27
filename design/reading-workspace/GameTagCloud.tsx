import { useState } from 'react';
import { ArrowUpRight, Gamepad2, X } from 'lucide-react';
import type { Activity, GameTagGroupKey, Work } from './model';
import { gameTagStats, minutesLabel } from './retrospective';
import { Cover } from './ui';
import './retrospective.css';

interface CloudProps { activities: Activity[]; works: Work[]; periodLabel: string; openWork: (id: string) => void }
const groups: { id: GameTagGroupKey; label: string }[] = [{ id: 'gameplay', label: '玩法' }, { id: 'theme', label: '题材' }, { id: 'scenario', label: '游玩场景' }, { id: 'other', label: '其他' }];
const palette = ['#cfb9ed', '#a4d0bd', '#d8b58d', '#a7bfd8', '#cdb4c3'];

export function GameTagCloud({ activities, works, periodLabel, openWork }: CloudProps) {
  const [mode, setMode] = useState<'count' | 'minutes'>('count');
  const [group, setGroup] = useState<GameTagGroupKey>('gameplay');
  const [selected, setSelected] = useState<string | null>(null);
  const summary = gameTagStats(activities, works, group);
  const value = (tag: typeof summary.tags[number]) => mode === 'count' ? tag.count : tag.minutes ?? 0;
  const tags = [...summary.tags].sort((a, b) => value(b) - value(a) || a.label.localeCompare(b.label, 'zh-CN'));
  const max = Math.max(1, ...tags.map(value));
  const active = tags.find(tag => tag.id === selected);
  return <section className="tc-panel rw-card" aria-label="游戏标签总结">
    <header className="tc-heading"><div><p className="rw-eyebrow">{periodLabel}</p><h2>这段时间，偏爱什么</h2></div><Gamepad2 size={22}/></header>
    <div className="tc-controls"><div className="tc-mode" role="group" aria-label="词云统计方式"><button aria-pressed={mode === 'count'} onClick={() => setMode('count')}>游戏数量</button><button aria-pressed={mode === 'minutes'} onClick={() => setMode('minutes')}>游玩时长</button></div><span>{summary.games.length} 款实际体验</span></div>
    <div className="tc-groups" role="group" aria-label="词云标签分组">{groups.map(entry => <button key={entry.id} aria-pressed={group === entry.id} onClick={() => { setGroup(entry.id); setSelected(null); }}>{entry.label}</button>)}</div>
    {tags.length ? <div className="tc-cloud" aria-label="标签词云">{tags.map((tag, index) => {
      const weight = value(tag), missing = mode === 'minutes' && tag.minutes === undefined;
      const description = `${tag.label}，${tag.count} 款，${minutesLabel(tag.minutes, tag.unknown)}`;
      return <button key={tag.id} data-tag-id={tag.id} className={missing ? 'tc-word tc-word--unknown' : 'tc-word'} aria-pressed={selected === tag.id} aria-label={description} title={description} onClick={() => setSelected(selected === tag.id ? null : tag.id)} style={{ fontSize: `${16 + 27 * Math.sqrt(weight / max)}px`, color: palette[index % palette.length] }}><span>{tag.label}</span><small>{mode === 'count' ? tag.count : missing ? '未记录' : `${tag.minutes} 分`}</small></button>;
    })}</div> : <div className="tc-empty"><p>{summary.games.length ? '这些游戏暂未设置这组标签' : '这段时间还没有游戏体验记录'}</p><span>{summary.games.length ? '补充作品标签后，这里会呈现你的偏好。' : '记录游玩片段后，偏好会慢慢浮现。'}</span></div>}
    {active && <div className="tc-selection" aria-live="polite"><header><h3>{active.label} <small>{active.count} 款</small></h3><button className="rw-icon-button" aria-label="收起标签作品" onClick={() => setSelected(null)}><X size={15}/></button></header>
      <ul>{active.games.map(game => <li key={game.work.id}><button onClick={() => openWork(game.work.id)}><Cover work={game.work} small/><span><strong>{game.work.title}</strong><small>{minutesLabel(game.minutes, game.unknown)} · {game.records} 条记录</small></span><ArrowUpRight size={14}/></button></li>)}</ul>
    </div>}
    <footer className="tc-footer"><p>多标签分别计入，不表示互斥占比。</p>{summary.untagged > 0 && <p>{summary.untagged} 款尚无本组标签</p>}{mode === 'minutes' && summary.games.some(game => game.unknown > 0) && <p>仅累计已知时长；缺失记录不按 0 计算。</p>}</footer>
  </section>;
}
