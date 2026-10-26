import { ChevronDown,EyeOff,Heart,Pencil,Trash2,X } from 'lucide-react';
import { useId,useRef,useState,type RefObject } from 'react';
import { GAME_TAG_KEYS,GAME_TAG_LABELS,gameTagsFor,platformsFor } from '../../../domain/library.ts';
import { gameVisualState } from '../library/gameVisualState.ts';
import type { ExperienceEntry,GameTagGroupKey,MediaItem,ProgressStatus } from '../../../domain/types.ts';
import { ExperienceEditor,ExperienceList,QuickEditor } from '../../RecordEditors.tsx';
import { Poster,StatusMark } from '../../components/MediaPrimitives.tsx';
import { statuses } from '../../components/libraryOptions.ts';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';
import { GameProgressPanel } from './GameProgressPanel.tsx';
import { BentoWritingFields,PersonalWritingFields } from './PersonalWritingFields.tsx';
import { DetailCover } from './DetailCover.tsx';
import { usePersonalWriting } from './usePersonalWriting.ts';
import './detail.css';

interface Props {
  item: MediaItem; availableItems?: MediaItem[]; onClose: () => void; onEdit: () => void;
  onPatch: (patch: Partial<MediaItem>) => boolean; onDelete: () => void; onHide: () => void;
  onRestore: () => void; onDeletePermanently: () => void;
  onFilterTag: (tag: string, group?: GameTagGroupKey) => void; guardRef: RefObject<(() => boolean) | null>;
}
export function DetailPanel({ item, availableItems, onClose, onEdit, onPatch, onDelete, onHide, onRestore, onDeletePermanently, onFilterTag, guardRef }: Props) {
  const panel = useRef<HTMLElement>(null);
  const factsId = useId();
  const [factsOpen, setFactsOpen] = useState(false);
  const [quickEdit, setQuickEdit] = useState<'time' | 'tags' | null>(null);
  const [experienceEdit, setExperienceEdit] = useState<ExperienceEntry | 'new' | null>(null);
  const writing = usePersonalWriting(item, onPatch);
  guardRef.current = writing.save;
  useDialogKeyboard(panel, onClose, { filterVisible: true, initialFocus: element => element.querySelector('.detail-close') });
  function openQuick(mode: 'time' | 'tags') { if (writing.save()) setQuickEdit(mode); }
  function openExperience(entry: ExperienceEntry | 'new') { if (writing.save()) setExperienceEdit(entry); }
  const state = gameVisualState(item);
  const locked = Boolean(item.removedAt);
  const experienceList = <ExperienceList item={item} compact={item.category === 'game'} readOnly={locked} onAdd={() => openExperience('new')} onEdit={openExperience} onDelete={entry => { if (window.confirm(`删除 ${entry.date} 的这条体验记录？`)) onPatch({ experienceEntries: (item.experienceEntries ?? []).filter(value => value.id !== entry.id) }); }} />;
  return <div className="detail-shell detail-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={`detail-panel detail-dialog ${factsOpen ? 'detail-dialog--facts-open' : ''}`} data-category={item.category} role="dialog" aria-modal="true" aria-label={`${item.title}详情`}>
      <header className="detail-dialog-heading"><div><span>个人档案</span><h2>{item.title}</h2></div><div className="detail-heading-actions"><button className="button button--secondary detail-facts-toggle" aria-expanded={factsOpen} aria-controls={factsId} onClick={() => setFactsOpen(value => !value)}>{factsOpen ? '收起作品资料' : '展开作品资料'}<ChevronDown size={14} /></button><button className="icon-button detail-close" onClick={onClose} aria-label="关闭详情"><X size={21} /></button></div></header>
      <div className="detail-columns">
        <main className={`detail-personal ${item.category === 'game' ? 'detail-bento' : ''}`} aria-label="个人体验">
          {item.category === 'game' ? <><DetailCover item={item} /><GameProgressPanel item={item} onPatch={onPatch} onEditTime={() => openQuick('time')} footprint={experienceList} /><BentoWritingFields writing={writing} locked={locked} /></> : <>
            <div className="detail-personal-heading"><h3>我的体验</h3>{!locked && <button className="icon-button" onClick={() => onPatch({ favorite: !item.favorite })} aria-label={item.favorite ? '取消喜欢' : '标为喜欢'}><Heart size={18} fill={item.favorite ? 'currentColor' : 'none'} /></button>}</div>
            <StatusMark status={item.status} />{!locked && <div className="detail-statuses">{statuses.slice(1).map(value => <button key={value.id} className={`status-option ${item.status === value.id ? 'is-selected' : ''}`} onClick={() => onPatch({ status: value.id as ProgressStatus })}>{value.label}</button>)}</div>}
            <PersonalWritingFields writing={writing} locked={locked} />{!locked && experienceList}{locked && <p className="feature-help">回收站中的记录保留原文。恢复后可以继续编辑。</p>}
          </>}
        </main>
        <aside id={factsId} className="detail-facts" aria-label="作品资料" hidden={!factsOpen}>
          {item.category !== 'game' && <div className="detail-facts-cover" data-game-state={state}><Poster item={item} large /></div>}<div className="detail-facts-heading"><h3>作品资料</h3>{!locked && <button className="text-button" onClick={onEdit}><Pencil size={13} />编辑</button>}</div>
          <dl><dt>作品原名</dt><dd>{item.originalTitle || '未记录'}</dd><dt>发行年份</dt><dd>{item.year || '未记录'}</dd><dt>{item.category === 'game' ? '拥有平台' : '分类'}</dt><dd>{item.category === 'game' ? platformsFor(item).join(' / ') || '未记录' : item.subcategory || '未记录'}</dd><dt>创作者</dt><dd>{item.creator || '未记录'}</dd><dt>收录日期</dt><dd>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</dd></dl>
          {item.sourceUrl && <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源页面 ↗</a>}
          <div className="detail-facts-heading"><h3>标签</h3>{!locked && <button className="text-button" onClick={() => openQuick('tags')}>编辑标签</button>}</div>
          {item.category === 'game' ? GAME_TAG_KEYS.map(group => <div className={`detail-game-tag-group tag-type--${group}`} key={group}><span>{GAME_TAG_LABELS[group]}</span><div className="detail-tag-list">{gameTagsFor(item)[group].map(tag => <button className="detail-tag" key={tag} onClick={() => onFilterTag(tag, group)}>{tag}</button>)}{!gameTagsFor(item)[group].length && <span className="detail-no-tag">—</span>}</div></div>) : <div className="detail-tag-list">{item.tags.map(tag => <button className="detail-tag" key={tag} onClick={() => onFilterTag(tag)}>{tag}</button>)}</div>}
          <footer className="detail-manage">{locked ? <><button className="button button--secondary" onClick={onRestore}>恢复作品</button><button className="text-button detail-remove" onClick={onDeletePermanently}><Trash2 size={14} />永久删除</button></> : <>{item.hiddenAt && <button className="text-button" onClick={onHide}><EyeOff size={14} />取消隐藏</button>}<button className="text-button detail-remove" onClick={onDelete}><Trash2 size={14} />移到回收站</button></>}</footer>
        </aside>
      </div>
    </section>
    {quickEdit && <QuickEditor item={item} availableItems={availableItems} mode={quickEdit} onClose={() => setQuickEdit(null)} onSave={onPatch} />}
    {experienceEdit && <ExperienceEditor initial={experienceEdit === 'new' ? undefined : experienceEdit} onClose={() => setExperienceEdit(null)} onSave={entry => onPatch({ experienceEntries: [...(item.experienceEntries ?? []).filter(value => value.id !== entry.id), entry] })} />}
  </div>;
}
