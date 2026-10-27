import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { ActivityForm } from '../reading-workspace/ActivityForm';
import { PlanForm, RoundForm, readingDate } from '../reading-workspace/BookForms';
import { Heatmap } from '../reading-workspace/Heatmap';
import { PREVIEW_TODAY } from '../reading-workspace/seed';
import { Dialog } from '../reading-workspace/ui';
import { BookCover } from './BookCover';
import { BOOK_TAGS, COLLECTIONS, durationLabel } from './catalog';
import type { DeskDialog, DeskProps } from './types';

function BookPanel({ state, open, workId, onClose }: Pick<DeskProps, 'state' | 'open'> & { workId: string; onClose: () => void }) {
  const work = state.works.find(work => work.id === workId)!;
  const plan = state.plans.find(plan => plan.workId === workId);
  const rounds = state.rounds.filter(round => round.workId === workId).sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
  return <Dialog title={work.title} wide onClose={onClose}>
    <div className="rd-detail">
      <aside><BookCover id={work.id} title={work.title} author={work.subtitle}/><p className="rd-author">{work.subtitle} · {work.year}</p><p className="rd-detail-description">{work.description}</p><div className="rd-detail-tags">{(BOOK_TAGS[work.id] ?? []).map(tag => <span key={tag}>{tag}</span>)}</div></aside>
      <div>
        {plan && <section className="rd-detail-plan"><span className="rd-reading-status"><i/>{plan.state === 'reading' ? '正在阅读' : '接下来读'}</span><p>{plan.reason || '还没有写下想读的理由。'}</p></section>}
        <div className="rd-detail-actions"><button className="rd-button" onClick={() => open({ kind: 'plan', workId })}>{plan ? '调整计划' : '加入计划'}</button><button className="rd-button" onClick={() => open({ kind: 'log', workId })}><Pencil size={14}/>记一次阅读</button>{plan?.state === 'reading' && <button className="rd-button" onClick={() => open({ kind: 'round', workId, finishPlan: true })}>记录读完</button>}</div>
        <header className="rd-section-head"><h3>我的阅读与感想</h3><button className="rd-text-button" onClick={() => open({ kind: 'round', workId })}><Plus size={14}/>补录</button></header>
        {rounds.length ? rounds.map(round => <article className="rd-round" key={round.id}><header><span>{readingDate(round.finishedOn)}</span><button className="rd-icon" aria-label={`编辑${readingDate(round.finishedOn)}的阅读感想`} onClick={() => open({ kind: 'round', workId, round })}><Pencil size={15}/></button></header><blockquote>{round.impression || '这次阅读还没有留下一句话。'}</blockquote>{round.review && <details><summary>读后感</summary><p>{round.review}</p></details>}</article>) : <p className="rd-empty">还没有读后记录，感想可以以后慢慢补。</p>}
      </div>
    </div>
  </Dialog>;
}

export function DeskDialogs({ state, dispatch, open, dialog, onClose }: DeskProps & { dialog: DeskDialog; onClose: () => void }) {
  const common = { state, dispatch, today: PREVIEW_TODAY, onClose };
  if (dialog.kind === 'plan') return <PlanForm {...common} workId={dialog.workId}/>;
  if (dialog.kind === 'round') return <RoundForm {...common} workId={dialog.workId} round={dialog.round} finishPlan={dialog.finishPlan}/>;
  if (dialog.kind === 'log') return <ActivityForm {...common} workId={dialog.workId} date={dialog.date ?? PREVIEW_TODAY} initial={dialog.initial}/>;
  if (dialog.kind === 'book') return <BookPanel state={state} open={open} workId={dialog.workId} onClose={onClose}/>;
  if (dialog.kind === 'collection') {
    const collections = dialog.id ? COLLECTIONS.filter(collection => collection.id === dialog.id) : COLLECTIONS;
    return <Dialog title={dialog.id ? collections[0].title : '主题书单'} wide onClose={onClose}>
      {collections.map(collection => <section className="rd-collection-detail" key={collection.id}><h3>{collection.title}</h3><p className="rd-author">{collection.description}</p><div>{collection.bookIds.map(id => {
        const work = state.works.find(work => work.id === id)!;
        return <button className="rd-collection-book" key={id} onClick={() => open({ kind: 'book', workId: id })}><BookCover id={id} title={work.title} author={work.subtitle}/><strong>{work.title}</strong><span className="rd-author">{work.subtitle}</span></button>;
      })}</div></section>)}
    </Dialog>;
  }
  if (dialog.kind === 'heatmap') return <Dialog title="阅读足迹" wide onClose={onClose}>
    <Heatmap state={state} today={PREVIEW_TODAY} openDay={date => open({ kind: 'day', date })} logReading={(workId, date) => open({ kind: 'log', workId, date })}/>
  </Dialog>;
  if (dialog.kind === 'day') {
    const activities = state.activities.filter(activity => activity.date === dialog.date && activity.kind === 'reading');
    return <Dialog title={`${dialog.date.replaceAll('-', '.')} 的阅读`} onClose={onClose}>
      <button className="rd-text-button" onClick={() => open({ kind: 'heatmap' })}><ArrowLeft size={14}/>阅读足迹</button>
      {activities.length ? activities.map(activity => <article className="rd-day" key={activity.id}><strong>{state.works.find(work => work.id === activity.workId)?.title}</strong><span>{durationLabel(activity.minutes)}</span><p>{activity.note}</p><button className="rd-text-button" onClick={() => open({ kind: 'log', date: dialog.date, initial: activity })}>编辑记录</button></article>) : <p className="rd-empty">这一天还没有阅读记录</p>}
      <button className="rd-button rd-button--primary" onClick={() => open({ kind: 'log', date: dialog.date })}><Plus size={15}/>记一次阅读</button>
    </Dialog>;
  }
  return <Dialog title="关于这个预览" onClose={onClose}><div className="rd-info"><p>这是书籍模块的独立交互预览，基于应用 v0.4.30。</p><p>书籍资料、封面、感想和分钟数都是演示样本。修改只在本次页面中保留，刷新恢复，不读取或写入正式收藏。</p><p>可以切换阅读计划与记录、网格与列表，点击封面查看感想，点击词云筛选，补录阅读时长和读后记录。</p><p>书单使用固定示例展示；本页不提供电子书阅读器，也未连接豆瓣或微信读书。</p></div></Dialog>;
}
