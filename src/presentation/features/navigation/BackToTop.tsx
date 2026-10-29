import { t } from '../../i18n/index.ts';
import { ArrowUp } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import './navigation.css';
import { GlassLayers } from '../glass/GlassLayers.tsx';

export function BackToTop({ scrollRef, focusRef, onReturn }: { scrollRef: RefObject<HTMLDivElement | null>; focusRef: RefObject<HTMLInputElement | null>; onReturn: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      setVisible(element.scrollTop > 320);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    return () => element.removeEventListener('scroll', update);
  }, [scrollRef]);
  if (!visible) return null;
  function returnToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    onReturn();
    focusRef.current?.focus({ preventScroll: true });
  }
  return <button type="button" className="dock-back-top" data-material-glass="button" aria-label={t("回到顶部")} title={t("回到顶部")} aria-controls="library-content-scroll" onClick={returnToTop}><GlassLayers /><ArrowUp size={20} strokeWidth={1.7} /></button>;
}
