import { useEffect } from 'react';

/** Dark workspace for the current material direction. Legacy preference remains untouched for rollback. */
export function initializeAppearance() {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#08090b');
}
export function useAppearance() {
  useEffect(initializeAppearance, []);
  return { effective: 'dark' as const };
}
