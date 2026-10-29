import { t } from '../../i18n/index.ts';
import { Gamepad2 } from 'lucide-react';
import { useState } from 'react';
import { platformsFor } from '../../../domain/library.ts';
import type { MediaItem } from '../../../domain/types.ts';
import type { BentoSave } from './BentoContentEditors.tsx';
import { platformIcons } from './platformIcons.ts';

const CATALOG = [
  { id: 'steam', name: 'Steam', aliases: ['steam'] },
  { id: 'playstation', name: 'PlayStation', aliases: ['playstation', 'ps', 'ps3', 'ps4', 'ps5'] },
  { id: 'switch', name: 'Switch', aliases: ['switch', 'nintendo switch', '任天堂switch'] },
  { id: 'ea', name: 'EA', aliases: ['ea', 'ea app', 'origin'] },
  { id: 'battlenet', name: 'Battle.net', aliases: ['battle.net', 'battlenet', '暴雪', '战网'] },
  { id: 'ubisoft', name: 'Ubisoft', aliases: ['ubisoft', 'ubisoft connect', 'uplay', '育碧'] },
  { id: 'wegame', name: 'WeGame', aliases: ['wegame'] },
  { id: 'epic', name: 'Epic Games', aliases: ['epic', 'epic games', 'epic games store'] },
];
function identity(name: string) { return CATALOG.find(platform => platform.aliases.includes(name.trim().toLocaleLowerCase())); }
const platformKey = (name: string) => identity(name)?.id ?? name.trim().toLocaleLowerCase();
function PlatformLogo({ name }: { name: string }) {
  const art = platformIcons[identity(name)?.id ?? ''];
  return art ? <svg className="bento-platform-logo" viewBox={art.viewBox} aria-hidden="true">{art.paths.map((path, index) => <path d={path} key={index} />)}</svg> : <Gamepad2 className="bento-platform-logo" aria-hidden="true" />;
}
export function BentoPlatforms({ item }: { item: MediaItem }) {
  const platforms = platformsFor(item).filter((name, index, all) => all.findIndex(other => platformKey(name) === platformKey(other)) === index);
  return <div className="bento-platforms">{platforms.length ? platforms.map(name => <div className="bento-platform-badge" key={name}><PlatformLogo name={name} /><span>{name}</span></div>) : <p className="bento-muted">{t("未记录")}</p>}</div>;
}
export function BentoPlatformEditor({ item, save }: { item: MediaItem; save: BentoSave }) {
  const [custom, setCustom] = useState(''), [error, setError] = useState('');
  const owned = platformsFor(item), choices = [...CATALOG.map(value => value.name), ...owned.filter(name => !identity(name))];
  function toggle(name: string) {
    const selected = owned.some(value => platformKey(value) === platformKey(name));
    const next = selected ? owned.filter(value => platformKey(value) !== platformKey(name)) : [...owned, name];
    if (!save({ platforms: next, subcategory: next.join(' / ') })) setError('平台未能保存，请重试。'); else setError('');
  }
  return <div className="bento-context-form"><div className="bento-platform-choices">{choices.map(name => <button type="button" key={name} aria-pressed={owned.some(value => platformKey(value) === platformKey(name))} onClick={() => toggle(name)}><PlatformLogo name={name} /><span>{name}</span></button>)}</div>
    <form onSubmit={event => { event.preventDefault(); const name = custom.trim(); if (!name) return; if (owned.some(value => platformKey(value) === platformKey(name))) { setError('已添加该平台。'); return; } toggle(name); setCustom(''); }}><label>{t("其他平台")}<input maxLength={60} aria-label={t("其他平台名称")} value={custom} onChange={event => setCustom(event.target.value)} /></label><button type="submit">{t("加入")}</button></form>{error && <p role="alert" className="bento-context-error">{t(error)}</p>}
  </div>;
}
