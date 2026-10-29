import { uiLocale, t } from '../../i18n/index.ts';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { IMPRESSION_MAX_LENGTH, writingLength } from '../../../domain/personalWriting.ts';
import type { usePersonalWriting } from './usePersonalWriting.ts';

export function PersonalWritingFields({ writing, locked }: { writing: ReturnType<typeof usePersonalWriting>; locked: boolean }) {
  const id = useId(), { draft, dirty, legacy, validation, saveError, edit, save } = writing;
  return <section className="detail-writing" aria-label={t("个人感受")}>
    {legacy && <p className="detail-legacy-note">{t("原有长文字已完整显示在测评中。仅编辑并保存感受时才拆分记录，不会自动截断。")}</p>}
    <div className="detail-writing-heading"><label htmlFor={`${id}-impression`}>{t("一句话印象")}</label><span id={`${id}-count`} className={validation ? 'detail-writing-error' : ''}>{writingLength(draft.impression)} / {IMPRESSION_MAX_LENGTH} {" "}{t("字")}</span></div>
    <input id={`${id}-impression`} className="detail-one-line" type="text" readOnly={locked} aria-label={t("一句话印象")} aria-describedby={`${id}-count${validation ? ` ${id}-error` : ''}`} aria-invalid={Boolean(validation)} placeholder={t("用一句话，留下它给你的感觉。")} value={draft.impression} onChange={event => edit('impression', event.target.value)} />
    <div className="detail-writing-heading detail-review-heading"><label htmlFor={`${id}-review`}>{t("长文测评")}</label><span>{writingLength(draft.review).toLocaleString(uiLocale())} {" "}{t("字")}</span></div>
    <textarea id={`${id}-review`} className="detail-review-input" rows={9} readOnly={locked} aria-label={t("长文测评")} placeholder={t("哪些地方打动了你？有哪些遗憾？在这里慢慢写。")} value={draft.review} onChange={event => edit('review', event.target.value)} />
    {(validation || saveError) && <p id={`${id}-error`} className="form-error" role="alert">{validation || saveError}</p>}
    <div className="detail-writing-footer"><span role="status">{dirty ? t('未保存 · 关闭时保存，失败会保留此窗口') : t('已保存 · 本地')}</span>{dirty && !locked && <button className="button button--primary" onClick={save}><Check size={14} />{t("保存感受")}</button>}</div>
  </section>;
}

/** Both cards share the original writing controller and its leave/save guard. */
export function BentoWritingFields({ writing, locked }: { writing: ReturnType<typeof usePersonalWriting>; locked: boolean }) {
  const id = useId(), [reviewOpen, setReviewOpen] = useState(false);
  const { draft, dirty, legacy, validation, saveError, edit, save } = writing;
  return <>
    <section className="detail-bento-card bento-impression detail-writing" aria-label={t("一句话印象")}>
      <div className="detail-writing-heading"><label htmlFor={`${id}-impression`}>{t("一句话印象")}</label><span id={`${id}-count`} className={validation ? 'detail-writing-error' : ''}>{writingLength(draft.impression)} / {IMPRESSION_MAX_LENGTH} {" "}{t("字")}</span></div>
      <input id={`${id}-impression`} className="detail-one-line" type="text" readOnly={locked} aria-label={t("一句话印象")} aria-describedby={`${id}-count${validation || saveError ? ` ${id}-error` : ''}`} aria-invalid={Boolean(validation)} placeholder={t("点击这里，留下一句话印象。")} value={draft.impression} onChange={event => edit('impression', event.target.value)} />
      <div className="bento-writing-message">{(validation || saveError) && <p id={`${id}-error`} className="form-error" role="alert">{validation || saveError}</p>}</div>
      <div className="detail-writing-footer"><span role="status">{dirty ? t('未保存 · 关闭时保存') : t('已保存 · 本地')}</span>{!locked && <button className="button button--secondary" disabled={!dirty} onClick={save}><Check size={13} />{t("保存感受")}</button>}</div>
    </section>
    <section className="detail-bento-card bento-review" aria-label={t("长文测评")}>
      <button className="bento-review-toggle" aria-label={reviewOpen ? t('收起长文测评') : t('展开长文测评')} aria-expanded={reviewOpen} aria-controls={`${id}-review-panel`} onClick={() => setReviewOpen(open => !open)}><span>{t("长文测评")}</span><small>{writingLength(draft.review).toLocaleString(uiLocale())} {" "}{t("字")}</small><ChevronDown size={16} /></button>
      <div id={`${id}-review-panel`} className="bento-review-body" hidden={!reviewOpen}>
        {legacy && <p className="detail-legacy-note">{t("原有长文字完整保留。仅编辑并保存感受时才拆分记录，不会自动截断。")}</p>}
        <textarea className="detail-review-input" rows={7} readOnly={locked} aria-label={t("长文测评")} placeholder={t("哪些地方打动了你？有哪些遗憾？在这里慢慢写。")} value={draft.review} onChange={event => edit('review', event.target.value)} />
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <div className="detail-writing-footer"><span>{dirty ? t('草稿保留在当前窗口，收起不会丢失') : t('已保存 · 本地')}</span>{!locked && <button className="button button--secondary" disabled={!dirty} onClick={save}>{t("保存测评")}</button>}</div>
      </div>
    </section>
  </>;
}
