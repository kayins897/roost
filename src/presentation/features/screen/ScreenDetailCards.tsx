import { Clock3 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { isScreenSeries } from '../../../domain/screens.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { t } from '../../i18n/index.ts';
import { BentoCardAction, BentoDetailCard } from '../detail/BentoDetailCard.tsx';
import type { ScreenFactsScope } from './ScreenFactsForm.tsx';
import { facetValues } from './screenView.ts';

export function ScreenDetailCard({ card, tone, edit, children }: {
  card: string; tone?: string; edit?: () => void; children: ReactNode;
}) {
  return <BentoDetailCard className={'screen-detail-' + card} tone={tone} edit={edit}>{children}</BentoDetailCard>;
}

export function CardEdit(props: Omit<ComponentProps<typeof BentoCardAction>, 'className'>) {
  return <BentoCardAction {...props} className="screen-card-edit" />;
}

function FactsList({ rows }: { rows: Array<[string, string | undefined]> }) {
  return <dl className="bento-facts">{rows.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value || t('未记录')}</dd></div>)}</dl>;
}

export function ScreenMetadataCard({ card, item, edit }: {
  card: Exclude<ScreenFactsScope, 'identity'>; item: MediaItem; edit?: () => void;
}) {
  const facts = item.screenDetails;
  const series = isScreenSeries(item);
  const titles = {
    runtime: series ? '单集片长' : '片长', release: '发行信息', credits: '演职员', sources: '来源与评分', synopsis: '作品简介',
  };
  const editLabels = {
    runtime: series ? '编辑片长与集数' : '编辑片长', release: '编辑发行信息', credits: '编辑演职员', sources: '编辑来源与评分', synopsis: '编辑作品简介',
  };
  let content: ReactNode;
  switch (card) {
    case 'runtime':
      content = <>
        <strong className="bento-stat-number">{facts?.durationMinutes === undefined ? <span className="screen-detail-stat-empty">{t('未记录')}</span> : <>{facts.durationMinutes}<small>{t('分钟')}</small></>}</strong>
        {series && facts?.episodeCount !== undefined && <p className="screen-metadata-note">{t('总集数')} · {t('{0} 集', [facts.episodeCount])}</p>}
      </>;
      break;
    case 'release':
      content = <>
        <strong className="screen-release-year">{item.year || <span className="screen-detail-stat-empty">{t('年份未记录')}</span>}</strong>
        {facts?.regions?.length ? <p className="screen-metadata-note">{facts.regions.join(' · ')}</p> : null}
      </>;
      break;
    case 'credits':
      content = <FactsList rows={[[ '导演', item.creator ], [ '演员', facts?.actors?.join(' · ') ]]} />;
      break;
    case 'sources':
      content = <>
        <FactsList rows={[
          ['观看来源', facts?.viewingSources?.join(' · ')],
          ['资料来源', facetValues(item, 'metadata')[0]],
          ['豆瓣评分', facts?.doubanScore === undefined ? t('未评分') : t('{0} 分', [facts.doubanScore.toFixed(1)])],
        ]} />
        {item.sourceUrl && <a className="bento-source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{t('查看来源页面 ↗')}</a>}
      </>;
      break;
    case 'synopsis':
      content = facts?.description ? <details className="screen-synopsis-details">
        <summary><span className="screen-synopsis-excerpt">{facts.description}</span><span className="screen-synopsis-expand">{t('展开简介')}</span><span className="screen-synopsis-collapse">{t('收起简介')}</span></summary>
        <p>{facts.description}</p>
      </details> : <p className="bento-muted screen-synopsis-empty">{t('暂无简介')}</p>;
      break;
  }
  return <ScreenDetailCard card={card} tone={card === 'credits' || card === 'synopsis' ? 'facts' : undefined} edit={edit}>
    <div className="bento-heading"><h3>{t(titles[card])}</h3>{edit ? <CardEdit label={editLabels[card]} onClick={edit} /> : card === 'runtime' ? <Clock3 size={16} /> : null}</div>
    {content}
  </ScreenDetailCard>;
}
