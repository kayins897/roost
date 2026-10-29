import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Work } from './model';
export function Cover({ work, small = false }: { work: Work; small?: boolean }) {
  return <div className={`rw-cover ${small ? 'rw-cover--small' : ''}`} style={{ background: work.tone, color: work.accent }} aria-label={`${work.title}示意封面`}><span className="rw-cover-line"/><span className="rw-cover-category">{work.category === 'book' ? 'QIYU · READING' : 'QIYU · COLLECTION'}</span><strong>{work.title}</strong><small>{work.subtitle}</small><span className="rw-cover-art" aria-hidden="true"/></div>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const el = ref.current, previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => { el?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`rw-dialog ${wide ? 'rw-dialog--wide' : ''}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}><header><h2 id={titleId}>{title}</h2><button className="rw-icon-button" aria-label="关闭" onClick={onClose}><X size={19}/></button></header>{children}</dialog>;
}
