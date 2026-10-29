import { t } from './i18n/index.ts';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { MetadataCandidate } from '../domain/catalog.ts';
import { desktopBridge } from '../infrastructure/repository.ts';
import { useDialogKeyboard } from './useDialogKeyboard.ts';
import './metadata.css';

export function MetadataImport({ onClose, onSelect }: { onClose: () => void; onSelect: (candidate: MetadataCandidate) => void }) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [needsDetails, setNeedsDetails] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  // 首个输入框带 autoFocus，挂载时不额外抢焦点；Tab 循环沿用原选择器。
  useDialogKeyboard(dialog, onClose, { selector: 'button:not([disabled]), input:not([disabled]), a[href]', initialFocus: () => null });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!desktopBridge || busy || !query.trim()) return;
    setBusy(true); setError(''); setCandidates([]); setSearched(false); setMessage('正在读取来源资料…');
    try {
      const result = await desktopBridge.lookupMetadata(query.trim());
      if (!mounted.current) return;
      if (!result.ok || !result.value) throw new Error(result.error || '未能读取作品资料');
      setCandidates(result.value);
      setNeedsDetails(!/^(?:[a-z][a-z\d+.-]*:\/\/|https?:|file:|data:|javascript:|about:)|^\/\//i.test(query.trim()));
      setSearched(true);
      setMessage(result.value.length ? `找到 ${result.value.length} 个候选，请确认作品。` : '没有找到匹配作品，请换个名称、粘贴直接链接或手动收录。');
    } catch (failure) { if (mounted.current) { setError(failure instanceof Error ? failure.message : '读取失败，请稍后重试'); setMessage(''); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function select(candidate: MetadataCandidate) {
    if (busy || !desktopBridge) return;
    if (!needsDetails) { onSelect(candidate); return; }
    setBusy(true); setError(''); setMessage('正在读取所选游戏的开发商、发行年份与封面…');
    try {
      const result = await desktopBridge.lookupMetadata(candidate.sourceUrl);
      if (!mounted.current) return;
      if (!result.ok || !result.value?.[0]) throw new Error(result.error || '未能读取游戏详细资料');
      onSelect(result.value[0]);
    } catch (failure) { if (mounted.current) { setError(failure instanceof Error ? failure.message : '读取失败，请稍后重试'); setMessage(''); } }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal modal--wide metadata-import" ref={dialog} role="dialog" aria-modal="true" aria-label={t("从来源收录")}>
      <div className="modal-heading"><div><h2>{t("从来源收录")}</h2><p>{t("搜索 Steam 游戏，或粘贴 Steam、豆瓣图书／影视的作品链接。")}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label={t("关闭")}><X size={19} /></button></div>
      {desktopBridge ? <>
        <form className="metadata-search" onSubmit={search}>
          <label className="form-field">{t("游戏名称或作品链接")}<input autoFocus required maxLength={2048} placeholder="Hades / https://book.douban.com/subject/…/" value={query} onChange={event => setQuery(event.target.value)} disabled={busy} /></label>
          <button type="submit" className="button button--primary" disabled={busy || !query.trim()}><Search size={16} />{busy ? t('读取中…') : t('读取资料')}</button>
        </form>
        <p className="metadata-note">{t("仅在点击读取或选择游戏时访问来源，无需账号或 API 密钥。确认并保存后才加入收藏。")}</p>
        <div role="status" aria-live="polite" className="metadata-note">{t(message)}</div>
        {error && <p className="form-error" role="alert">{t(error)}</p>}
        {!!candidates.length && <div className="metadata-results">{candidates.map(candidate => <article className="metadata-candidate" key={`${candidate.provider}:${candidate.category}:${candidate.externalId}`}>
          <div className="metadata-cover">{candidate.coverUrl?.startsWith('data:image/') ? <img src={candidate.coverUrl} alt={`${candidate.title}封面`} /> : <span aria-hidden="true">{candidate.title.slice(0, 1)}</span>}</div>
          <div className="metadata-candidate-copy"><small>{candidate.provider === 'steam' ? t('Steam · 游戏') : candidate.category === 'book' ? t('豆瓣 · 书籍') : t('豆瓣 · 影视')}</small><h3>{candidate.title}</h3>{candidate.originalTitle && <p>{candidate.originalTitle}</p>}<p>{[candidate.creator, candidate.year, candidate.subcategory].filter(Boolean).join(' · ') || t('选择后确认作品资料')}</p>{candidate.coverSourceUrl && !candidate.coverUrl && !needsDetails && <p>{t("封面未能读取，可稍后上传本地图片。")}</p>}<a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{t("查看来源页面")}</a></div>
          <button type="button" className="button button--primary" onClick={() => { void select(candidate); }} disabled={busy}>{t("选择")}<ArrowRight size={14} /></button>
        </article>)}</div>}
        {searched && !candidates.length && <p className="metadata-note">{t("也可以关闭窗口，通过“收录作品”手动填写。")}</p>}
      </> : <p className="metadata-note">{t("来源检索目前在 Windows 桌面版提供。浏览器版可继续手动收录，并粘贴作品链接。")}</p>}
      <div className="modal-actions"><button type="button" className="button button--ghost" onClick={onClose}>{t("关闭")}</button></div>
    </section>
  </div>;
}
