export type InterfaceFont = 'sans' | 'serif' | 'system';
export interface TypographyPreferences { family: InterfaceFont }

export const DEFAULT_TYPOGRAPHY: Readonly<TypographyPreferences> = Object.freeze({ family: 'sans' });
const KEY = 'qiyu.typography.v1', EVENT = 'qiyu:typography';
const fonts: readonly InterfaceFont[] = ['sans', 'serif', 'system'];
let cachedRaw: string | null | undefined, cached: Readonly<TypographyPreferences> = DEFAULT_TYPOGRAPHY;

/** Local appearance only. Loading a missing/invalid preference never writes to storage. */
export function loadTypography(): Readonly<TypographyPreferences> {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return cached; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<TypographyPreferences> | null;
    cached = value && typeof value === 'object' && fonts.includes(value.family as InterfaceFont)
      ? Object.freeze({ family: value.family! }) : DEFAULT_TYPOGRAPHY;
  } catch { cached = DEFAULT_TYPOGRAPHY; }
  return cached;
}

function applyTypography() {
  if (typeof document !== 'undefined') document.documentElement.dataset.interfaceFont = loadTypography().family;
}

export function saveTypography(value: TypographyPreferences): void {
  if (!value || !fonts.includes(value.family)) throw new Error('Invalid interface font');
  // Persist first: a storage error must not claim the new font was saved.
  localStorage.setItem(KEY, JSON.stringify({ family: value.family }));
  applyTypography();
  window.dispatchEvent(new Event(EVENT));
}

const listeners = new Set<() => void>();
function notify() { applyTypography(); listeners.forEach(listener => listener()); }
function storageChanged(event: StorageEvent) { if (event.key === KEY || event.key === null) notify(); }
export function subscribeTypography(listener: () => void): () => void {
  if (!listeners.size) { window.addEventListener(EVENT, notify); window.addEventListener('storage', storageChanged); }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', storageChanged); }
  };
}

/** Call once before rendering; the returned cleanup also stops cross-window synchronization. */
export function initializeTypography(): () => void {
  applyTypography();
  return subscribeTypography(() => {});
}
