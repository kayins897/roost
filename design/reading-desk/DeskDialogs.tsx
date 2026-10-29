import { ArrowLeft, Plus } from 'lucide-react';
import { ActivityForm } from '../reading-workspace/ActivityForm';
import { PlanForm, RoundForm } from '../reading-workspace/BookForms';
import { PREVIEW_TODAY } from '../reading-workspace/seed';
import { Dialog } from '../reading-workspace/ui';
import { BookCover } from './BookCover';
import { BookPanel } from './BookPanel';
import { COLLECTIONS, durationLabel } from './catalog';
import { BookTagEditor, TagManager } from './TagEditor';
import type { DeskDialog, DeskProps } from './types';

export function DeskDialogs({ state, dispatch, open, tags, changeTags, dialog, onClose }: DeskProps & { dialog: DeskDialog; onClose: () => void }) {
  const common = { state, dispatch, today: PREVIEW_TODAY, onClose };
  if (dialog.kind === 'plan') return <PlanForm {...common} workId={dialog.workId}/>;
  if (dialog.kind === 'round') return <RoundForm {...common} workId={dialog.workId} round={dialog.round} finishPlan={dialog.finishPlan}/>;
  if (dialog.kind === 'log') return <ActivityForm {...common} workId={dialog.workId} date={dialog.date ?? PREVIEW_TODAY} initial={dialog.initial}/>;
  if (dialog.kind === 'book') return <BookPanel state={state} dispatch={dispatch} open={open} tags={tags} workId={dialog.workId} onClose={onClose}/>;
  if (dialog.kind === 'tags') {
    const props = { state, dispatch, open, tags, changeTags, onClose };
    return dialog.workId ? <BookTagEditor {...props} workId={dialog.workId}/> : <TagManager {...props}/>;
  }
  if (dialog.kind === 'collection') {
    const collections = dialog.id ? COLLECTIONS.filter(collection => collection.id === dialog.id) : COLLECTIONS;
    return <Dialog title={dialog.id ? collections[0].title : '主题书单'} wide onClose={onClose}>
      {collections.map(collection => <section className="rd-collection-detail" key={collection.id}><h3>{collection.title}</h3><p className="rd-author">{collection.description}</p><div>{collection.bookIds.map(id => {
        const work = state.works.find(work => work.id === id)!;
        return <button className="rd-collection-book" key={id} onClick={() => open({ kind: 'book', workId: id })}><BookCover id={id} title={work.title} author={work.subtitle}/><strong>{work.title}</strong><span className="rd-author">{work.subtitle}</span></button>;
      })}</div></section>)}
    </Dialog>;
  }
  if (dialog.kind === 'day') {
    const activities = state.activities.filter(activity => activity.date === dialog.date && activity.kind === 'reading');
    return <Dialog title={`${dialog.date.replaceAll('-', '.')} 的阅读`} onClose={onClose}>
      <button className="rd-text-button" onClick={onClose}><ArrowLeft size={14}/>阅读足迹</button>
      {activities.length ? activities.map(activity => <article className="rd-day" key={activity.id}><strong>{state.works.find(work => work.id === activity.workId)?.title}</strong><span>{durationLabel(activity.minutes)}</span><p>{activity.note}</p><button className="rd-text-button" onClick={() => open({ kind: 'log', date: dialog.date, initial: activity })}>编辑记录</button></article>) : <p className="rd-empty">这一天还没有阅读记录</p>}
      <button className="rd-button rd-button--primary" onClick={() => open({ kind: 'log', date: dialog.date })}><Plus size={15}/>记一次阅读</button>
    </Dialog>;
  }
  return <Dialog title="关于这个预览" onClose={onClose}><div className="rd-info"><p>这是书籍模块的独立交互预览，基于应用 v0.4.30。</p><p>书籍资料、封面、感想和分钟数都是演示样本。修改只在本次页面中保留，刷新恢复，不读取或写入正式收藏。</p><p>六种书架视图一次展示一面：全部、想读、在读、已读、闲置、弃读。想读只含准备读的书，在读在全部中置顶。已读按历史记录展示，因此重读、闲置、弃读的书也可能在已读中出现。切换当前安排不会删除历史。</p><p>我的评分与豆瓣评分分开，阅读来源与资料来源分开。同维度多选为任一匹配，跨维度取交集；标签多选仍须同时包含。出版资料、来源与评分都是合成示例，不代表真实豆瓣数据。年度热力表汇总全部实际阅读，不随书架筛选变化。书单使用固定示例；本页不提供电子书阅读器，也未连接豆瓣或微信读书。</p></div></Dialog>;
}
