import { t } from '../../i18n/index.ts';
import { Clapperboard, MoreHorizontal, Star } from 'lucide-react';
import { screenHasWatched, screenProgressLabel, screenRounds } from '../../../domain/screens.ts';
import { screenDisplayArrangement, screenKind } from '../../../domain/screenConsumption.ts';
import { personalWritingFor } from '../../../domain/personalWriting.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { Poster } from '../../components/MediaPrimitives.tsx';
import type { ScreenMenuTarget } from './ScreenMenu.tsx';
import { viewingLabel } from './screenView.ts';

interface Props {
  items: MediaItem[]; layout: 'grid' | 'list'; disabled: boolean; recycled: boolean;
  selecting: boolean; selected: string[]; onSelect: (id: string) => void; onOpen: (id: string) => void;
  onMenu: (target: ScreenMenuTarget) => void; onCreate: () => void;
}
export function ScreenShelf(props: Props) {
  if (!props.items.length) return <div className="books-empty books-surface"><Clapperboard size={29}/><h3>{t("这里还没有作品")}</h3><p>{props.recycled ? t('回收站中没有符合筛选的影视。') : t('收录一部作品，或调整当前筛选。')}</p>{!props.recycled && <button className="button button--secondary" disabled={props.disabled} onClick={props.onCreate}>{t("收录影视")}</button>}</div>;
  const watching = props.items.filter(item => screenDisplayArrangement(item) === 'watching'), rest = props.items.filter(item => screenDisplayArrangement(item) !== 'watching');
  const groups = watching.length && rest.length && !props.recycled ? [{ title: '正在观看', items: watching }, { title: '片库', items: rest }] : [{ title: '', items: props.items }];
  return <div className="books-shelf screen-shelf">{groups.map(group => <section key={group.title}>{group.title && <h3 className="books-section-label">{t(group.title)}<small>{group.items.length}</small></h3>}<div className={props.layout === 'grid' ? 'media-gallery media-gallery--grid books-gallery' : 'books-list'}>{group.items.map(item => <article key={item.id} className={`books-book screen-work books-book--${props.layout} ${props.selected.includes(item.id) ? 'is-selected' : ''}`} data-screen-state={screenDisplayArrangement(item)}>
    <button className={`media-card media-card--${props.layout} books-book-open`} onClick={() => props.selecting ? props.onSelect(item.id) : props.onOpen(item.id)} onContextMenu={event => { event.preventDefault(); props.onMenu({ id: item.id, x: event.clientX, y: event.clientY, trigger: event.currentTarget }); }} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); props.onMenu({ id: item.id, x: rect.left + 30, y: rect.top + 30, trigger: event.currentTarget }); } }} aria-label={props.selecting ? t('选择{0}', [item.title]) : t('查看{0}详情', [item.title])} aria-pressed={props.selecting ? props.selected.includes(item.id) : undefined}>
      <div className="card-cover"><Poster item={item}/><span className="card-cover-shine" aria-hidden="true"/></div>
      <div className="books-book-info"><strong>{item.title}</strong><span className="books-muted">{item.subcategory || t('影视')}{item.year ? ` · ${item.year}` : ''}</span><span className="screen-viewing-state">{t(viewingLabel(item))}{screenHasWatched(item) && screenDisplayArrangement(item) !== 'none' && t(' · 已看过')}{screenKind(item) === 'movie' && screenRounds(item).length > 1 && t(" · {0} 刷", [screenRounds(item).length])}</span><span className="books-book-metrics">{t(screenProgressLabel(item))}{item.personalScore !== undefined && <span><Star size={12}/><strong>{item.personalScore.toFixed(1)}</strong></span>}</span></div>
      {props.layout === 'list' && <p className="books-book-impression">{personalWritingFor(item).impression || t('还没有留下感想')}</p>}
    </button>
    {props.selecting ? <input type="checkbox" className="screen-select" aria-label={t("选择{0}", [item.title])} checked={props.selected.includes(item.id)} onChange={() => props.onSelect(item.id)}/> : <button className="icon-button books-book-more" aria-label={t("{0}更多操作", [item.title])} aria-haspopup="menu" disabled={props.disabled} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); props.onMenu({ id: item.id, x: rect.right, y: rect.bottom + 5, trigger: event.currentTarget }); }}><MoreHorizontal size={17}/></button>}
  </article>)}</div></section>)}</div>;
}
