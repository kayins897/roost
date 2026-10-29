import { t } from './i18n/index.ts';
import { Check, ChevronDown, Plus, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { availableTags, GAME_TAG_KEYS, GAME_TAG_LABELS, gameTagCounts } from '../domain/library.ts';
import type { GameTagGroupKey, GameTagGroups, MediaItem } from '../domain/types.ts';
import './features/tags/tag-filter.css';

interface Props {
  items: MediaItem[];
  game: boolean;
  open: boolean;
  onToggle: () => void;
  selectedTags: string[];
  selectedGameTags: GameTagGroups;
  onTag: (tag: string) => void;
  onGameTag: (group: GameTagGroupKey, tag: string) => void;
  onClear: () => void;
  onCreate?: () => void;
  creationDisabled?: boolean;
}

export function TagFilterPanel(props: Props) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1000px)').matches);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1000px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const groups = gameTagCounts(props.items);
  const tags = availableTags(props.items);
  const count = props.selectedTags.length + GAME_TAG_KEYS.reduce((sum, key) => sum + props.selectedGameTags[key].length, 0);
  function chip(name: string, total: number, group?: GameTagGroupKey) {
    const selected = group ? props.selectedGameTags[group].includes(name) : props.selectedTags.includes(name);
    return <button key={name} className={`tag-filter ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => group ? props.onGameTag(group, name) : props.onTag(name)}>{selected && <Check size={12} />}{name}<span>{total}</span></button>;
  }
  function strip(available: { name: string; count: number }[], group?: GameTagGroupKey) {
    const key = group ?? 'all';
    const matching = available;
    const selected = group ? props.selectedGameTags[group] : props.selectedTags;
    const limit = props.game ? compact ? 2 : 5 : compact ? 4 : 8;
    const all = expanded.has(key);
    const shown = all ? matching : matching.filter((tag, index) => index < limit || selected.includes(tag.name));
    const remaining = matching.length - shown.length;
    const label = group ? GAME_TAG_LABELS[group] : '';
    return <div className="tag-strip">
      {shown.map(tag => chip(tag.name, tag.count, group))}
      {remaining > 0 && <button className="tag-more" title={t("展开{0}全部标签", [label])} aria-label={t("展开{0}全部标签，共{1}个", [label, matching.length])} onClick={() => setExpanded(current => new Set([...current, key]))}>+{remaining}<span className="tag-more-label"> {" "}{t("更多")}</span></button>}
      {all && matching.length > limit && <button className="tag-more" aria-label={t("收起{0}更多标签", [label])} onClick={() => setExpanded(current => { const next = new Set(current); next.delete(key); return next; })}>{t("收起")}</button>}
      {!matching.length && <span className="no-tags">{props.game ? t('暂无标签') : t('添加标签后即可在这里筛选')}</span>}
    </div>;
  }
  return <section className="tag-panel" aria-label={t("标签筛选")}>
    <div className="tag-panel-heading">
      <button className="tag-panel-toggle" aria-label={props.open ? t('收起标签') : t('展开标签')} aria-expanded={props.open} aria-controls="library-tag-filters" onClick={props.onToggle}><Tag size={15} /><strong>{t("标签筛选")}</strong>{count > 0 && <span className="filter-counter">{count}</span>}<ChevronDown size={14} /></button>
      {props.onCreate && <button type="button" className="icon-button tag-create-button" aria-label={t("新增标签")} title={t("新增标签")} disabled={props.creationDisabled} onClick={props.onCreate}><Plus size={15} /></button>}
      {props.open && count > 0 && <button className="reset-tags" onClick={props.onClear}>{t("清除标签")}</button>}
    </div>
    <div id="library-tag-filters" hidden={!props.open}>
      {props.game ? <div className="game-tag-filter">{GAME_TAG_KEYS.map(key => <div className={`game-filter-group tag-type--${key}`} key={key}><span className="game-filter-label">{t(GAME_TAG_LABELS[key])}</span>{strip(groups[key], key)}</div>)}</div> : <div className="filter-tags">{strip(tags)}</div>}
    </div>
  </section>;
}
