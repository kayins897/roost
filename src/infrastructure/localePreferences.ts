import type { InterfaceLocale } from '../shared/translate.ts';

export const LOCALE_PREFERENCE_KEY = 'qiyu.interface.locale.v1';
export function parseLocalePreference(value: string | null): InterfaceLocale {
  return value === 'en' ? 'en' : 'zh-CN';
}
function read(): InterfaceLocale {
  try { return parseLocalePreference(globalThis.localStorage?.getItem(LOCALE_PREFERENCE_KEY) ?? null); }
  catch { return 'zh-CN'; }
}
let current = read();
const listeners = new Set<() => void>();
export const getLocale = () => current;
export function subscribeLocale(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function apply(locale: InterfaceLocale) {
  current = locale;
  if (typeof document !== 'undefined') { document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'; document.documentElement.dir = 'ltr'; }
  for (const listener of listeners) listener();
}
export function setLocale(locale: InterfaceLocale) {
  if (locale !== 'en' && locale !== 'zh-CN') return;
  // Persist first: failed writes leave both the selector and the UI unchanged.
  globalThis.localStorage.setItem(LOCALE_PREFERENCE_KEY, locale);
  apply(locale);
}
export function initializeLocale() { apply(current); }
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (event.key === LOCALE_PREFERENCE_KEY || event.key === null) apply(read()); });
