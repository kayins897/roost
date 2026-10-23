import { desktopBridge } from '../../../infrastructure/repository.ts';
import './window-chrome.css';

/** Native caption controls stay in Electron; only their safe drag area is drawn here. */
export function WindowChrome() {
  return desktopBridge ? <div className="window-chrome" aria-hidden="true" /> : null;
}
