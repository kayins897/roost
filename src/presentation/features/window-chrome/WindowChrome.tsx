import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { desktopBridge, desktopInfo } from '../../../infrastructure/repository.ts';
import { GlassLayers } from '../glass/GlassLayers.tsx';
import type { WindowState } from '../../../shared/ipc-contract.ts';
import './window-chrome.css';

/** Custom Windows caption; other desktop platforms retain their native controls. */
export function WindowChrome() {
  const [state, setState] = useState<WindowState>({ maximized: false, minimized: false, fullscreen: false, focused: true });
  useEffect(() => {
    if (!desktopInfo?.customWindowControls) return;
    const release = desktopBridge?.onWindowState?.(setState);
    const current = desktopBridge?.getWindowState?.();
    if (current?.ok && current.value) setState(current.value);
    return release;
  }, []);
  if (!desktopInfo?.customWindowControls) return desktopBridge ? <div className="window-chrome" aria-hidden="true" /> : null;
  return <div className="window-chrome window-chrome--custom" data-fullscreen={state.fullscreen} data-focused={state.focused}>
    <div className="window-caption-actions" role="group" aria-label="窗口控制">
      <button className="window-caption-button" type="button" data-material-glass="button" aria-label="最小化窗口" title="最小化" onClick={() => desktopBridge?.windowCommand?.('minimize')}><GlassLayers /><Minus size={15} /></button>
      <button className="window-caption-button" type="button" data-material-glass="button" aria-label={state.maximized ? '还原窗口' : '最大化窗口'} title={state.maximized ? '还原' : '最大化'} onClick={() => desktopBridge?.windowCommand?.('toggle-maximize')}><GlassLayers />{state.maximized ? <Copy size={13} /> : <Square size={13} />}</button>
      <button className="window-caption-button window-caption-button--close" type="button" data-material-glass="button" aria-label="关闭窗口" title="关闭" onClick={() => desktopBridge?.windowCommand?.('close')}><GlassLayers /><X size={16} /></button>
    </div>
  </div>;
}
