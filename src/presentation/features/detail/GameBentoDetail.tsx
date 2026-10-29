import { t } from '../../i18n/index.ts';
import { X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { ExperienceEntry } from '../../../domain/types.ts';
import { undoCompletionRecord, type CompletionRecordUndo } from '../../../domain/gameProgress.ts';
import type { DetailWidgetId } from '../../../infrastructure/detailLayout.ts';
import { ExperienceEditor } from '../../RecordEditors.tsx';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';
import { BentoContextMenu, type BentoMenuAnchor } from './BentoContextMenu.tsx';
import { BentoCoverEditor, BentoFactsEditor, BentoScoreEditor, BentoStatEditor, BentoWritingEditor } from './BentoContentEditors.tsx';
import { BentoFootprint, BentoFootprintEditor } from './BentoFootprint.tsx';
import { BentoGallery, BentoGalleryEditor, BentoLightbox } from './BentoGallery.tsx';
import { BentoLayoutTools } from './BentoLayoutTools.tsx';
import { BentoPlatformEditor, BentoPlatforms } from './BentoPlatform.tsx';
import { BentoArtwork, BentoFacts, BentoHours, BentoReview, BentoScore, BentoTags } from './BentoReadCards.tsx';
import { BentoTagsEditor } from './BentoTagsEditor.tsx';
import { BentoWidget } from './BentoWidget.tsx';
import { CompletionEvents } from './CompletionEvents.tsx';
import { CompletionRecordForm } from './CompletionRecordForm.tsx';
import type { DetailPanelProps } from './DetailPanel.tsx';
import { useBentoLayout } from './useBentoLayout.ts';
import { usePersonalWriting } from './usePersonalWriting.ts';
import './bento.css';

/** The game sheet consumes the same repository patch/leave guard as the former detail. */
export function GameBentoDetail({ item, availableItems = [], onClose, onPatch, onDelete, onRestore, onDeletePermanently, onFilterTag, guardRef }: DetailPanelProps) {
  const panel = useRef<HTMLElement>(null), dragged = useRef<DetailWidgetId | null>(null);
  const controller = useBentoLayout(), writing = usePersonalWriting(item, onPatch);
  const [menu, setMenu] = useState<BentoMenuAnchor | null>(null);
  const [experience, setExperience] = useState<ExperienceEntry | 'new' | null>(null);
  const [completion, setCompletion] = useState<'new' | 'history' | null>(null);
  const [undoable, setUndoable] = useState<CompletionRecordUndo | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const locked = Boolean(item.removedAt);
  guardRef.current = () => (!controller.editing || controller.finish()) && writing.save();
  useDialogKeyboard(panel, onClose, { filterVisible: true, selector: 'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), textarea, select, a[href], summary, [tabindex="0"]', initialFocus: element => element.querySelector('.game-bento-close') });
  const closeMenu = useCallback(() => setMenu(null), []);
  function openMenu(id: DetailWidgetId | null, x: number, y: number, origin?: HTMLElement) {
    if (!writing.save()) return;
    origin?.focus({ preventScroll: true }); setMenu({ id, x, y });
  }
  function editExperience(entry: ExperienceEntry | 'new') { closeMenu(); setExperience(entry); }
  function undo() {
    if (!undoable) return;
    const patch = undoCompletionRecord(item, undoable);
    if (!patch) { setMessage('相关记录已改变，请在完成事件中手动修正。'); setUndoable(null); return; }
    if (onPatch(patch)) { setUndoable(null); setMessage('已撤销本次完成记录。'); closeMenu(); }
    else setMessage('撤销未能保存，请重试。');
  }
  const content = (id: DetailWidgetId) => {
    switch (id) {
      case 'cover': return <BentoArtwork item={item} />;
      case 'grade': return <BentoScore item={item} />;
      case 'hours': return <BentoHours item={item} />;
      case 'platform': return <><div className="bento-heading"><h3>{t("拥有平台")}</h3></div><BentoPlatforms item={item} /></>;
      case 'facts': return <BentoFacts item={item} fields={controller.layout.fields} />;
      case 'tags': return <BentoTags item={item} fields={controller.layout.fields} onFilter={onFilterTag} />;
      case 'impression': return <><div className="bento-heading"><h3>{t("一句话印象")}</h3></div><p className="bento-impression-text">{writing.draft.impression || <span className="bento-muted">{t("还没有一句话印象")}</span>}</p></>;
      case 'footprint': return <BentoFootprint item={item} save={onPatch} />;
      case 'gallery': return <BentoGallery item={item} mode={controller.layout.galleryMode} onOpen={setPhoto} />;
      case 'count': return <><div className="bento-heading"><h3>{t("完成次数")}</h3></div><strong className="bento-stat-number">{item.completionCount === undefined ? t('未记录') : <>{item.completionCount}<small>{t("次")}</small></>}</strong></>;
      case 'review': return <BentoReview value={writing.draft.review} />;
    }
  };
  const editor = (id: DetailWidgetId | null) => {
    const props = { item, save: onPatch, close: closeMenu };
    switch (id) {
      case 'cover': return <BentoCoverEditor {...props} />;
      case 'grade': return <BentoScoreEditor {...props} />;
      case 'hours': return <BentoStatEditor {...props} count={false} />;
      case 'count': return <BentoStatEditor {...props} count />;
      case 'facts': return <><BentoFactsEditor {...props} /><div className="bento-context-divider" />{locked ? <><button type="button" onClick={onRestore}>{t("恢复作品")}</button><button type="button" onClick={onDeletePermanently}>{t("永久删除")}</button></> : <button type="button" onClick={onDelete}>{t("移到回收站")}</button>}</>;
      case 'platform': return <BentoPlatformEditor {...props} />;
      case 'tags': return <BentoTagsEditor {...props} availableItems={availableItems} />;
      case 'impression': return <BentoWritingEditor {...props} review={false} />;
      case 'review': return <BentoWritingEditor {...props} review />;
      case 'footprint': return <BentoFootprintEditor {...props} onExperience={editExperience} onCompletion={() => { closeMenu(); setCompletion('new'); }} onCompletionHistory={() => { closeMenu(); setCompletion('history'); }} onUndo={undo} canUndo={Boolean(undoable)} />;
      case 'gallery': return <BentoGalleryEditor {...props} mode={controller.layout.galleryMode} setMode={controller.setGalleryMode} />;
      default: return null;
    }
  };
  return <div className="detail-shell detail-dialog-backdrop game-bento-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={`game-bento-dialog ${controller.editing ? 'game-bento-dialog--editing' : ''}`} role="dialog" aria-modal="true" aria-label={t("{0}详情", [item.title])}>
      <button type="button" className="icon-button game-bento-close detail-close" aria-label={t("关闭详情")} onClick={onClose}><X size={21} /></button>
      <main className="game-bento-grid" aria-label={t("游戏档案卡片")} onContextMenu={event => { if (event.target === event.currentTarget) { event.preventDefault(); openMenu(null, event.clientX, event.clientY); } }}>
        {controller.layout.cards.filter(card => card.visible).map(card => <BentoWidget key={card.id} card={card} controller={controller} menuOpen={menu?.id === card.id} onMenu={openMenu} onDragStart={id => { dragged.current = id; }} onDrop={(target, after) => { if (dragged.current) controller.move(dragged.current, target, after); dragged.current = null; }}>{content(card.id)}</BentoWidget>)}
        {!controller.layout.cards.some(card => card.visible) && <div className="bento-layout-empty"><p>{t("卡片已隐藏，收藏内容仍完整保留。")}</p><button type="button" onClick={() => controller.begin(true)}>{t("管理卡片")}</button></div>}
      </main>
      {(controller.error || message) && <p className="bento-status" role="status">{controller.error || message}</p>}
      {locked && <div className="bento-recycle-actions"><span>{t("回收站 · 只读")}</span><button type="button" onClick={onRestore}>{t("恢复作品")}</button><button type="button" onClick={onDeletePermanently}>{t("永久删除")}</button></div>}
      <BentoLayoutTools controller={controller} />
    </section>
    {menu && <BentoContextMenu key={menu.id ?? 'layout'} anchor={menu} controller={controller} close={closeMenu} locked={locked}>{editor(menu.id)}</BentoContextMenu>}
    {experience && <ExperienceEditor initial={experience === 'new' ? undefined : experience} onClose={() => setExperience(null)} onSave={entry => onPatch({ experienceEntries: [...(item.experienceEntries ?? []).filter(value => value.id !== entry.id), entry] })} />}
    {completion && <Modal title={completion === 'new' ? t('记录一次完成') : t('整理完成事件')} onClose={() => setCompletion(null)}>{completion === 'new' ? <CompletionRecordForm item={item} onPatch={onPatch} onCancel={() => setCompletion(null)} onRecorded={receipt => { setUndoable(receipt); setCompletion(null); setMessage('已记录一次完成。'); }} /> : <CompletionEvents item={item} onPatch={onPatch} />}</Modal>}
    {photo && <BentoLightbox item={item} initialId={photo} save={onPatch} close={() => setPhoto(null)} />}
  </div>;
}
