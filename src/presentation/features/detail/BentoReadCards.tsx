import { uiLocale, t } from '../../i18n/index.ts';
import { useState } from 'react';
import { ChevronDown, Clock3, Tags } from 'lucide-react';
import { formatPlaytime, GAME_TAG_KEYS, GAME_TAG_LABELS, gameTagsFor } from '../../../domain/library.ts';
import { gradeEditable } from '../../../domain/gameProgress.ts';
import type { GameTagGroupKey, MediaItem } from '../../../domain/types.ts';

export function BentoArtwork({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState<string>();
  return item.coverUrl && failed !== item.coverUrl ? <img className="bento-cover-image" src={item.coverUrl} alt={`${item.title}封面`} draggable={false} onError={() => setFailed(item.coverUrl)} /> : <div className="bento-cover-placeholder"><strong>{item.title.slice(0, 1)}</strong><span>{t("暂无封面")}</span></div>;
}
export function BentoScore({ item }: { item: MediaItem }) {
  const eligible = gradeEditable(item), score = item.personalScore;
  return <><div className="bento-heading"><h3>{t("通关评分")}</h3></div><div className="bento-score-display"><strong>{score === undefined ? '—' : score.toFixed(1)}</strong>{score !== undefined && <span>/ 10</span>}</div><p className="bento-score-caption">{score === undefined ? item.personalGrade ? t("原评级 {0}", [item.personalGrade]) : eligible ? t('尚未评分') : t('新游戏+与收官完结可评分') : t('我的个人评价')}</p></>;
}
export function BentoHours({ item }: { item: MediaItem }) {
  return <><div className="bento-heading"><h3>{t("游玩时长")}</h3><Clock3 size={17} /></div><strong className="bento-stat-number">{item.playtimeMinutes === undefined ? t('未记录') : formatPlaytime(item.playtimeMinutes)}</strong><div className="bento-last-played"><span>{t("最后运行")}</span><time dateTime={item.lastPlayedAt}>{item.lastPlayedAt ? new Date(item.lastPlayedAt).toLocaleString(uiLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : t('未记录')}</time></div></>;
}
export function BentoFacts({ item, fields }: { item: MediaItem; fields: Record<string, boolean> }) {
  return <><div className="bento-heading"><h3>{t("作品资料")}</h3></div><dl className="bento-facts">
    {fields.original !== false && <div className="bento-facts-title"><dt>{t("作品名称")}</dt><dd><strong>{item.title}</strong>{item.originalTitle && item.originalTitle !== item.title && <small>{item.originalTitle}</small>}</dd></div>}
    {fields.year !== false && <div><dt>{t("发行年份")}</dt><dd>{item.year || t('未记录')}</dd></div>}{fields.creator !== false && <div><dt>{t("创作者")}</dt><dd>{item.creator || t('未记录')}</dd></div>}{fields.date !== false && <div><dt>{t("收录日期")}</dt><dd>{new Date(item.createdAt).toLocaleDateString(uiLocale())}</dd></div>}
  </dl>{fields.source !== false && item.sourceUrl && <a className="bento-source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{t("查看来源页面 ↗")}</a>}</>;
}
export function BentoTags({ item, fields, onFilter }: { item: MediaItem; fields: Record<string, boolean>; onFilter: (tag: string, group: GameTagGroupKey) => void }) {
  const tags = gameTagsFor(item);
  return <><div className="bento-heading"><h3>{t("标签")}</h3><Tags size={17} /></div><div className="bento-tags">{GAME_TAG_KEYS.map((key, index) => fields[`tag${index}`] !== false && <div className="bento-tag-row" key={key}><span>{t(GAME_TAG_LABELS[key])}</span><div>{tags[key].length ? tags[key].map(tag => <button type="button" key={tag} onClick={() => onFilter(tag, key)}>{tag}</button>) : <small>—</small>}</div></div>)}</div></>;
}
export function BentoReview({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="bento-review-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}><h3>{t("长文测评")}</h3><span>{Array.from(value).length.toLocaleString(uiLocale())} {" "}{t("字")}</span><ChevronDown size={16} /></button>{open && <div className="bento-review-body">{value || <span className="bento-muted">{t("还没有长文测评")}</span>}</div>}</>;
}
