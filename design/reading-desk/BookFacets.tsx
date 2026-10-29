import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import type { Work } from '../reading-workspace/model';
import { FACET_KEYS, FACET_LABELS, facetOptions, facetValueLabel, matchesFacets } from './book-metadata';
import type { FacetKey, FacetSelection } from './book-metadata';
import './facets.css';

interface Props {
  works: Work[];
  selected: FacetSelection;
  toggle: (key: FacetKey, value: string) => void;
  clear: () => void;
  control: FacetControl;
}

export interface FacetControl {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
  panelId: string;
}

export function BookFacetTrigger({ selected, control }: { selected: FacetSelection; control: FacetControl }) {
  const count = FACET_KEYS.reduce((sum, key) => sum + (selected[key]?.length ?? 0), 0);
  return <button ref={control.trigger} className="rd-button rd-facets-trigger" aria-label={`筛选资料，已选 ${count} 项`} aria-expanded={control.expanded} aria-controls={control.panelId} onClick={() => control.setExpanded(!control.expanded)} onKeyDown={event => { if (event.key === 'Escape') control.setExpanded(false); }}>
    <SlidersHorizontal size={14}/><span>筛选</span>{count > 0 && <b>{count}</b>}<ChevronDown size={13}/>
  </button>;
}

export function BookFacets({ works, selected, toggle, clear, control }: Props) {
  const { expanded, setExpanded, trigger, panelId } = control;
  const [active, setActive] = useState<FacetKey>('author');
  const tabs = useRef<HTMLDivElement>(null);
  const id = panelId;
  const conditions = FACET_KEYS.flatMap(key => (selected[key] ?? []).map(value => ({ key, value })));
  const count = conditions.length;
  const currentWorks = works.filter(work => matchesFacets(work, selected, active));
  const counts = new Map(facetOptions(currentWorks, active).map(option => [option.value, option.count]));
  const options = facetOptions(works, active);
  for (const value of selected[active] ?? []) {
    if (!options.some(option => option.value === value)) options.push({ value, label: facetValueLabel(active, value), count: 0 });
  }
  const resultCount = works.filter(work => matchesFacets(work, selected)).length;

  return <section className={`rd-facets ${count || expanded ? 'is-visible' : ''}`} aria-label="书籍资料筛选" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); setExpanded(false); trigger.current?.focus(); }
  }}>
    {count > 0 && <div className="rd-facets-selected" role="group" aria-label="已选资料筛选条件">
      {conditions.map(({ key, value }) => <button key={`${key}:${value}`} className="rd-facet-condition" onClick={() => toggle(key, value)} aria-label={`移除${FACET_LABELS[key]}筛选：${facetValueLabel(key, value)}`}>
        <span>{FACET_LABELS[key]}<i>·</i>{facetValueLabel(key, value)}</span><X size={11}/>
      </button>)}
      <button className="rd-text-button rd-facets-clear" onClick={clear} aria-label="清除所有资料筛选条件">清除筛选</button>
    </div>}
    <div className="rd-facets-panel" id={id} hidden={!expanded}>
      <div className="rd-facets-tabs" ref={tabs} role="tablist" aria-label="筛选维度" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = FACET_KEYS.indexOf(active);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? FACET_KEYS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + FACET_KEYS.length) % FACET_KEYS.length;
        setActive(FACET_KEYS[next]); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>
        {FACET_KEYS.map(key => <button key={key} role="tab" id={`${id}-${key}-tab`} aria-controls={`${id}-choices`} aria-selected={active === key} tabIndex={active === key ? 0 : -1} onClick={() => setActive(key)}>
          {FACET_LABELS[key]}{Boolean(selected[key]?.length) && <b>{selected[key]!.length}</b>}
        </button>)}
      </div>
      <div className="rd-facets-choices" id={`${id}-choices`} role="tabpanel" aria-labelledby={`${id}-${active}-tab`}>
        {options.map(option => {
          const checked = Boolean(selected[active]?.includes(option.value));
          const amount = counts.get(option.value) ?? 0;
          return <button key={option.value} className="rd-facet-option" aria-pressed={checked} aria-label={`${FACET_LABELS[active]}：${option.label}，${amount} 本${checked ? '，已选' : ''}`} onClick={() => toggle(active, option.value)}>
            {option.label}<small>{amount}</small>
          </button>;
        })}
      </div>
      <div className="rd-facets-foot"><span aria-live="polite">匹配 {resultCount} 本 · 同类任选，跨类同时满足</span><small>出版社、评分和来源均为合成演示</small></div>
    </div>
  </section>;
}
