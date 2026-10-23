import { useEffect,useRef,type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea, select, a[href]';

// 弹层键盘行为的单一实现：Escape 关闭（经 closeRef 追踪最新回调）、Tab 在首尾控件间循环、
// 挂载聚焦初始控件、卸载恢复先前焦点。选择器与可见性过滤按调用方原样传入，保持既有行为。
export function useDialogKeyboard(
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  options?: {
    selector?: string;
    filterVisible?: boolean;
    initialFocus?: (panel: HTMLElement) => HTMLElement | null;
  },
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const selector = options?.selector ?? FOCUSABLE;
    const initial = options?.initialFocus
      ? (panel.current ? options.initialFocus(panel.current) : null)
      : panel.current?.querySelector<HTMLElement>('input, textarea, select') ?? null;
    initial?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (dialogs.length && dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      let controls = [...(panel.current?.querySelectorAll<HTMLElement>(selector) ?? [])];
      if (options?.filterVisible) controls = controls.filter(element => element.offsetParent !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
}
