import { Check, ChevronDown, Plus, Tag } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { Work } from '../reading-workspace/model';
import type { BookTags } from './book-tags';

export function TagFilter({ tags, works, selected, toggle, clear, manage }: { tags: BookTags; works: Work[]; selected: string[]; toggle: (name: string) => void; clear: () => void; manage: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [all, setAll] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const id = useId();
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const limit = compact ? 5 : 8;
  const shown = all ? tags.names : tags.names.filter((name, index) => index < limit || selected.includes(name));
  const remaining = tags.names.length - shown.length;
  return <section className="rd-tag-filter" aria-label="标签筛选">
    <header><button className="rd-tag-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}><Tag size={15}/><strong>标签筛选</strong><ChevronDown size={13}/></button><button className="rd-icon" aria-label="管理书籍标签" title="新增与管理标签" onClick={manage}><Plus size={16}/></button>{selected.length > 0 && <button className="rd-text-button" onClick={clear}>清除标签<span>{selected.length}</span></button>}</header>
    <div className="rd-tag-strip" id={id} hidden={!expanded}>
      {shown.map(name => {
        const count = works.filter(work => tags.byBook[work.id]?.includes(name)).length;
        return <button className="rd-tag-chip" key={name} aria-label={`${name}，${count} 本书`} aria-pressed={selected.includes(name)} onClick={() => toggle(name)}>{selected.includes(name) && <Check size={12}/>}<span>{name}</span><small>{count}</small></button>;
      })}
      {remaining > 0 && <button className="rd-tag-chip rd-tag-more" aria-label="展开全部标签" onClick={() => setAll(true)}>+{remaining}<span>更多</span></button>}
      {all && tags.names.length > limit && <button className="rd-tag-chip rd-tag-more" aria-label="收起更多标签" onClick={() => setAll(false)}>收起</button>}
      {!tags.names.length && <span className="rd-tag-empty">用 + 添加第一个标签</span>}
    </div>
    {selected.length > 1 && <p className="rd-tag-match">同时包含：{selected.join('、')}</p>}
  </section>;
}
