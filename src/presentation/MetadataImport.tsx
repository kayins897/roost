import { t } from './i18n/index.ts';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { MetadataCandidate } from '../domain/catalog.ts';
import { previewSteamImport } from '../domain/steamImport.ts';
import { SCREEN_KINDS, type ScreenKind } from '../domain/screenConsumption.ts';
import type { ExternalId, MediaItem } from '../domain/types.ts';
import type { MetadataSearchScope } from '../shared/ipc-contract.ts';
import { desktopBridge } from '../infrastructure/repository.ts';
import { useDialogKeyboard } from './useDialogKeyboard.ts';
import './metadata.css';

const scopes = [
  { id: 'game', label: '游戏', field: '游戏名称或作品链接', placeholder: 'Hades' },
  { id: 'book', label: '书籍', field: '书名、作者、ISBN 或作品链接', placeholder: '活着' },
  { id: 'screen', label: '影视', field: '片名或作品链接', placeholder: '星际穿越' },
] as const;
const candidateKey = (candidate: MetadataCandidate) => `${candidate.provider}:${candidate.category}:${candidate.externalId}`;

type Props = {
  initialScope: MetadataSearchScope;
  screenKind: ScreenKind;
  items: MediaItem[];
  exclusions?: ExternalId[];
  onClose: () => void;
  onSelect: (candidate: MetadataCandidate) => void;
  onQuickAdd: (candidate: MetadataCandidate) => boolean;
  onManual: (scope: MetadataSearchScope) => void;
};

export function MetadataImport({ initialScope, screenKind, items, exclusions, onClose, onSelect, onQuickAdd, onManual }: Props) {
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detailFailed, setDetailFailed] = useState('');
  const [needsDetails, setNeedsDetails] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const active = scopes.find(option => option.id === scope)!;
  const screenLabel = SCREEN_KINDS.find(option => option.id === screenKind)!.label;
  const duplicateFor = (candidate: MetadataCandidate) => previewSteamImport([candidate], items, exclusions)[0].duplicate;
  // 首个输入框带 autoFocus，挂载时不额外抢焦点；Tab 循环沿用原选择器。
  useDialogKeyboard(dialog, onClose, { selector: 'button:not([disabled]), input:not([disabled]), a[href]', initialFocus: () => null });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!desktopBridge || busy || !query.trim()) return;
    setBusy(true); setError(''); setCandidates([]); setDetailFailed(''); setMessage('正在读取来源资料…');
    try {
      const result = await desktopBridge.lookupMetadata(query.trim(), scope);
      if (!mounted.current) return;
      if (!result.ok || !result.value) throw new Error(result.error || '未能读取作品资料');
      setCandidates(result.value);
      setNeedsDetails(!/^(?:[a-z][a-z\d+.-]*:\/\/|https?:|file:|data:|javascript:|about:)|^\/\//i.test(query.trim()));
      setMessage(result.value.length ? t('找到 {0} 个候选，请确认作品。', [result.value.length]) : t('没有找到匹配作品，请换个名称、粘贴直接链接或手动收录。'));
    } catch (failure) { if (mounted.current) { setError(failure instanceof Error ? failure.message : '读取失败，请稍后重试'); setMessage(''); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function select(candidate: MetadataCandidate, summaryOnly = false) {
    if (busy || !desktopBridge) return;
    const reviewRequested = needsDetails && candidate.category !== 'game' && duplicateFor(candidate) === 'existing-name';
    setBusy(true);
    setError('');
    setDetailFailed('');
    setMessage('');
    let selected = candidate;
    try {
      if (needsDetails && !summaryOnly) {
        setMessage('正在读取所选作品的详细资料…');
        const result = await desktopBridge.lookupMetadata(candidate.sourceUrl);
        if (!mounted.current) return;
        const details = result.value?.[0];
        if (!result.ok || !details || candidateKey(details) !== candidateKey(candidate)) {
          setDetailFailed(candidateKey(candidate));
          setError(result.error || '未能读取匹配的作品详情');
          setMessage('');
          return;
        }
        selected = details;
        setCandidates(current => current.map(row => candidateKey(row) === candidateKey(details) ? details : row));
      }
      if (summaryOnly) {
        selected = selected.category === 'book'
          ? { ...selected, bookDetails: { ...selected.bookDetails, metadataSource: '豆瓣' } }
          : { ...selected, subcategory: screenLabel, screenDetails: { ...selected.screenDetails, metadataSource: '豆瓣' } };
      }
      if (selected.category === 'game' || !needsDetails) {
        onSelect(selected);
        return;
      }
      const duplicate = duplicateFor(selected);
      if (duplicate === 'existing-id' || duplicate === 'excluded') {
        setMessage(t(duplicate === 'excluded' ? '已移除，跳过收录' : '已收录'));
        return;
      }
      if (reviewRequested || duplicate === 'existing-name') {
        onSelect(selected);
        return;
      }
      if (onQuickAdd(selected)) {
        setMessage(t('《{0}》已加入{1}', [selected.title, t(selected.category === 'book' ? '想读' : '想看')]));
      } else {
        setMessage('');
        setError('未能保存，请检查收藏库提示后重试。');
      }
    } catch (failure) {
      if (!mounted.current) return;
      if (needsDetails && !summaryOnly) setDetailFailed(candidateKey(candidate));
      setError(failure instanceof Error ? failure.message : '读取失败，请稍后重试');
      setMessage('');
    }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal modal--wide metadata-import" ref={dialog} role="dialog" aria-modal="true" aria-label={t("从来源收录")}>
      <div className="modal-heading"><div><h2>{t("从来源收录")}</h2><p>{t("按名称搜索，或粘贴 Steam、豆瓣作品链接。")}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label={t("关闭")}><X size={19} /></button></div>
      {desktopBridge ? <>
        <div className="status-tabs metadata-scopes" role="group" aria-label={t('搜索板块')}>
          {scopes.map(option => <button type="button" key={option.id} className={scope === option.id ? 'is-selected' : ''} aria-pressed={scope === option.id} disabled={busy}
            onClick={() => {
              if (scope === option.id) return;
              setScope(option.id);
              setCandidates([]);
              setError('');
              setMessage('');
              setDetailFailed('');
            }}>{t(option.label)}</button>)}
        </div>
        <form className="metadata-search" onSubmit={search}>
          <label className="form-field">{t(active.field)}<input autoFocus required maxLength={2048} placeholder={active.placeholder} value={query} onChange={event => setQuery(event.target.value)} disabled={busy} /></label>
          <button type="submit" className="button button--primary" disabled={busy || !query.trim()}><Search size={16} />{busy ? t('读取中…') : t('读取资料')}</button>
        </form>
        <p className="metadata-note">{t(scope === 'game' ? '游戏搜索来自 Steam。选择后可核对并编辑资料。' : '搜索来自豆瓣。点击候选可收录，并继续搜索其他作品。')}</p>
        <div role="status" aria-live="polite" className="metadata-note">{t(message)}</div>
        {error && <p className="form-error" role="alert">{t(error)}</p>}
        {!!candidates.length && <div className="metadata-results">{candidates.map(candidate => {
          const key = candidateKey(candidate);
          const quickAdd = needsDetails && candidate.category !== 'game';
          const duplicate = quickAdd ? duplicateFor(candidate) : null;
          const unavailable = duplicate === 'existing-id' || duplicate === 'excluded';
          const action = unavailable ? duplicate === 'excluded' ? '已移除，跳过收录' : '已收录'
            : duplicate === 'existing-name' ? '核对同名作品'
              : quickAdd ? candidate.category === 'book' ? '加入想读' : '加入想看' : '选择';
          return <article className="metadata-candidate" key={key}>
          <div className="metadata-cover">{candidate.coverUrl?.startsWith('data:image/') ? <img src={candidate.coverUrl} alt={`${candidate.title}封面`} /> : <span aria-hidden="true">{candidate.title.slice(0, 1)}</span>}</div>
          <div className="metadata-candidate-copy"><small>{candidate.provider === 'steam' ? t('Steam · 游戏') : candidate.category === 'book' ? t('豆瓣 · 书籍') : t('豆瓣 · 影视')}</small><h3>{candidate.title}</h3>{candidate.originalTitle && <p>{candidate.originalTitle}</p>}<p>{[candidate.creator, candidate.year, candidate.subcategory].filter(Boolean).join(' · ') || t('选择后确认作品资料')}</p>{candidate.coverSourceUrl && !candidate.coverUrl && !needsDetails && <p>{t("封面未能读取，可稍后上传本地图片。")}</p>}<a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{t("查看来源页面")}</a></div>
          <div className="metadata-result-actions">
            <button type="button" className="button button--primary" onClick={() => { void select(candidate); }} disabled={busy || unavailable}>{t(action)}{!unavailable && <ArrowRight size={14} />}</button>
            {candidate.category !== 'game' && detailFailed === key && !unavailable && <>
              <button type="button" className="button button--secondary" disabled={busy} onClick={() => { void select(candidate, true); }}>{t('仅用搜索结果收录')}</button>
              {candidate.category === 'screen' && <small>{t('将归入{0}', [t(screenLabel)])}</small>}
            </>}
          </div>
        </article>;
        })}</div>}
      </> : <p className="metadata-note">{t("来源检索目前在 Windows 桌面版提供。浏览器版可继续手动收录，并粘贴作品链接。")}</p>}
      <div className="modal-actions">
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => onManual(scope)}>{t('手动收录')}</button>
        <button type="button" className="button button--ghost" onClick={onClose}>{t("关闭")}</button>
      </div>
    </section>
  </div>;
}
