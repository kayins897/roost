import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { MEDIA_LABELS, platformsFor } from '../domain/library.ts';
import type { MediaItem } from '../domain/types.ts';
import type { MetadataCandidate } from '../domain/catalog.ts';

export function MetadataReview({ candidate, matches, items, onClose, onConfirm }: { candidate: MetadataCandidate; matches: MediaItem[]; items: MediaItem[]; onClose: () => void; onConfirm: (existing?: MediaItem) => void }) {
  const [target, setTarget] = useState<string | null>(matches[0]?.id ?? null);
  const others = items.filter(item => item.category === candidate.category && !matches.some(match => match.id === item.id));
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="确认收录与合并"><div className="modal-heading"><div><h2>确认收录与合并</h2><p>核对资料并决定保存到哪里，确认后仍可编辑。</p></div><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button></div>
    <div className="settings-body"><strong>{candidate.title}</strong><p className="feature-help">{[MEDIA_LABELS[candidate.category], candidate.originalTitle, candidate.creator, candidate.year, candidate.platforms?.join(' · ')].filter(Boolean).join(' / ')}</p><a className="source-link" href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">查看资料来源</a>
      <p className="feature-help">合并只补充空缺资料、添加平台与来源编号，保留已有封面、印象、时长、状态、标签和体验记录。你可以在下一步修改。</p>
      <div className="metadata-review-list"><label className="metadata-review-choice"><input type="radio" name="metadata-target" checked={target === null} onChange={() => setTarget(null)} /><span>新建独立作品<small>{matches.length ? '已有相似作品，请确认不是重复收录。' : '收藏库中没有识别到相同作品。'}</small></span></label>{matches.map(item => <label className="metadata-review-choice" key={item.id}><input type="radio" name="metadata-target" checked={target === item.id} onChange={() => setTarget(item.id)} /><span>合并到「{item.title}」<small>{[item.category === 'game' ? platformsFor(item).join(' · ') : item.subcategory, item.creator, item.year].filter(Boolean).join(' / ') || '已有收藏'}</small></span></label>)}</div>
      {others.length > 0 && <label className="form-field">或手动选择同板块的作品<select aria-label="手动选择合并作品" value={others.some(item => item.id === target) ? target ?? '' : ''} onChange={event => { if (event.target.value) setTarget(event.target.value); }}><option value="">选择已有作品……</option>{others.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
    </div><div className="modal-actions"><button className="button button--ghost" onClick={onClose}>取消</button><button className="button button--primary" onClick={() => { if (target === null && matches.length && !window.confirm('收藏库已有相似作品，仍要新建独立作品吗？')) return; onConfirm(target === null ? undefined : items.find(item => item.id === target)); }}>确认并编辑<ArrowRight size={16} /></button></div>
  </section></div>;
}
