import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale } from '../../infrastructure/localePreferences.ts';
import { translateMessage } from '../../shared/translate.ts';

export function useLocale() { return useSyncExternalStore(subscribeLocale, getLocale, () => 'zh-CN' as const); }
export function uiLocale() { return getLocale() === 'en' ? 'en-US' : 'zh-CN'; }
export function t(message: string, values?: readonly (string | number | undefined | null)[]) { return translateMessage(message, getLocale(), values); }
