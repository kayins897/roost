import { t } from '../../i18n/index.ts';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GameScreenshot, MediaItem } from '../../../domain/types.ts';
import { desktopGameAssetsAvailable, importScreenshots, screenshotUrl } from '../../../infrastructure/gameAssets.ts';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';
import type { BentoSave } from './BentoContentEditors.tsx';

interface GalleryProps { item: MediaItem; mode: 1 | 4 | 9; onOpen: (id: string) => void }
export function BentoGallery({ item, mode, onOpen }: GalleryProps) {
  const [page, setPage] = useState(0), [failed, setFailed] = useState<string[]>([]);
  const images = item.screenshots ?? [], pages = Math.max(1, Math.ceil(images.length / mode));
  const safePage = Math.min(page, pages - 1), cover = images.find(image => image.id === item.screenshotCoverId) ?? images[0];
  const visible = mode === 1 ? cover ? [cover] : [] : images.slice(safePage * mode, (safePage + 1) * mode);
  return <div className="bento-gallery" data-mode={mode}>
    <div className="bento-gallery-heading"><span><ImageIcon size={13} />{t("我的截图")}<small>{images.length} {" "}{t("张")}</small></span></div>
    <div className="bento-gallery-grid">{visible.map(image => <button type="button" key={image.id} className="bento-gallery-image" aria-label={t("查看截图 {0}", [image.filename])} onClick={() => onOpen(image.id)}>{failed.includes(image.id) ? <span className="bento-gallery-unavailable">{t("图片暂不可用")}</span> : <img src={screenshotUrl(image, true)} alt={image.caption || image.filename} loading="lazy" draggable={false} onError={() => setFailed(current => [...current, image.id])} />}</button>)}
      {!images.length && <p className="bento-gallery-empty">{t("还没有截图")}</p>}
      {mode > 1 && images.length > 0 && Array.from({ length: Math.max(0, mode - visible.length) }, (_, index) => <span className="bento-gallery-slot" key={`empty-${index}`} />)}
    </div>
    {mode > 1 && pages > 1 && <div className="bento-gallery-pages"><button type="button" aria-label={t("上一组截图")} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={15} /></button><span>{safePage + 1} / {pages}</span><button type="button" aria-label={t("下一组截图")} disabled={safePage === pages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={15} /></button></div>}
  </div>;
}
export function BentoGalleryEditor({ item, mode, setMode, save }: { item: MediaItem; mode: 1 | 4 | 9; setMode: (mode: 1 | 4 | 9) => void; save: BentoSave }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function add() {
    setBusy(true); setError('');
    try {
      const images = await importScreenshots(); if (!images.length) return;
      const existing = item.screenshots ?? [];
      const merged = [...existing, ...images.filter(image => !existing.some(value => value.id === image.id))];
      if (!save({ screenshots: merged })) setError('相册未能保存，已复制的原图仍安全保留，请重试。');
    } catch (error) { setError(error instanceof Error ? error.message : '截图导入失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <div className="bento-context-form"><p className="bento-context-description">{t("展示方式")}</p><div className="bento-context-options">{([1, 4, 9] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 1 ? t('单图') : value === 4 ? t('四宫格') : t('九宫格')}</button>)}</div>
    <button type="button" disabled={!desktopGameAssetsAvailable || busy} onClick={add}>{busy ? t('正在保存原图…') : t('导入截图')}</button>{!desktopGameAssetsAvailable && <p className="bento-context-description">{t("截图原图保存在本机，需在桌面版导入。")}</p>}
    {(item.screenshots?.length ?? 0) > 0 && <label>{t("封面截图")}<select aria-label={t("封面截图")} value={item.screenshotCoverId ?? item.screenshots![0].id} onChange={event => { if (!save({ screenshotCoverId: event.target.value })) setError('截图封面未能保存。'); }}>{item.screenshots!.map(image => <option key={image.id} value={image.id}>{image.caption || image.filename}</option>)}</select></label>}{error && <p className="bento-context-error" role="alert">{t(error)}</p>}
  </div>;
}
export function BentoLightbox({ item, initialId, save, close }: { item: MediaItem; initialId: string; save: BentoSave; close: () => void }) {
  const panel = useRef<HTMLElement>(null), images = item.screenshots ?? [];
  const [id, setId] = useState(initialId), [error, setError] = useState('');
  const index = Math.max(0, images.findIndex(image => image.id === id)), image: GameScreenshot | undefined = images[index];
  const [caption, setCaption] = useState(image?.caption ?? '');
  useEffect(() => { setCaption(image?.caption ?? ''); setError(''); }, [image?.id, image?.caption]);
  useDialogKeyboard(panel, tryClose, { filterVisible: true, initialFocus: element => element.querySelector('button') });
  function tryClose() { if (saveCaption()) close(); }
  function move(delta: number) { if (images.length && saveCaption()) setId(images[(index + delta + images.length) % images.length].id); }
  function saveCaption() {
    if (!image || caption === (image.caption ?? '')) return true;
    const ok = save({ screenshots: images.map(value => value.id === image.id ? { ...value, caption: caption.trim() || undefined } : value) });
    setError(ok ? '' : '说明未能保存，请重试。'); return ok;
  }
  function remove() {
    if (!image || !saveCaption()) return;
    const next = images.filter(value => value.id !== image.id);
    if (!save({ screenshots: next, ...(item.screenshotCoverId === image.id ? { screenshotCoverId: undefined } : {}) })) { setError('图片未能移出相册，请重试。'); return; }
    if (!next.length) close(); else setId(next[Math.min(index, next.length - 1)].id);
  }
  return <div className="bento-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) tryClose(); }}>
    <section ref={panel} className="bento-lightbox" role="dialog" aria-modal="true" aria-label={t("截图原图")} onKeyDown={event => { if (event.target instanceof HTMLInputElement) return; if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } }}>
      <header><span>{image?.filename} · {index + 1} / {images.length}</span><button type="button" className="icon-button" onClick={tryClose} aria-label={t("关闭截图")}><X size={20} /></button></header>
      <div className="bento-lightbox-stage"><button type="button" aria-label={t("上一张截图")} onClick={() => move(-1)} disabled={images.length < 2}><ChevronLeft /></button>{image && <img src={screenshotUrl(image)} alt={image.caption || image.filename} />}<button type="button" aria-label={t("下一张截图")} onClick={() => move(1)} disabled={images.length < 2}><ChevronRight /></button></div>
      {!item.removedAt && <footer><input aria-label={t("截图说明")} placeholder={t("留下这张截图的故事…")} maxLength={500} value={caption} onChange={event => setCaption(event.target.value)} onBlur={saveCaption} onKeyDown={event => { if (event.key === 'Enter' && saveCaption()) event.currentTarget.blur(); }} /><button type="button" disabled={image?.id === item.screenshotCoverId} onClick={() => { if (image && saveCaption() && !save({ screenshotCoverId: image.id })) setError('封面未能保存。'); }}>{t("设为封面")}</button><button type="button" onClick={remove}>{t("移出相册")}</button></footer>}{error && <p className="bento-context-error" role="alert">{t(error)}</p>}
    </section>
  </div>;
}
