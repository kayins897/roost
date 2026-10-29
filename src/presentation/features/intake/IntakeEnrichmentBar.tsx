import { t } from '../../i18n/index.ts';
export function IntakeEnrichmentBar({ count, busy, stopping, done, total, disabled, onRead, onStop }: {
  count: number; busy: boolean; stopping: boolean; done: number; total: number; disabled: boolean; onRead: () => void; onStop: () => void;
}) {
  return <div className="intake-enrichment">
    <div><strong>{t('补齐豆瓣资料')}</strong><p>{t('按清单中的作品链接读取，仅补空缺；不会按名称猜测作品。读取失败会暂停，收藏在确认导入前保持不变。')}</p></div>
    {busy ? <div className="intake-enrichment-progress"><span role="status">{stopping ? t('正在停止，等待当前请求结束…') : t('已读取 {0} / {1}', [done, total])}</span><button type="button" className="button button--ghost" onClick={onStop} disabled={stopping}>{t('停止读取')}</button></div>
      : <button type="button" className="button button--ghost" onClick={onRead} disabled={disabled || !count}>{t('读取所选 {0} 件', [count])}</button>}
  </div>;
}
