import { useEffect, useState } from 'react';
import { startGlassMaterials } from './features/glass/glassController.ts';
import { glassDefaults, normalizeGlass, type GlassSettings } from './features/glass/glassOptions.ts';
export type { GlassMode } from './features/glass/glassOptions.ts';

const preferenceKey = 'qiyu.glass.v1';
type GlassPreference = GlassSettings & { error: string };
function readPreference(): GlassPreference {
  try {
    const raw = localStorage.getItem(preferenceKey);
    if (raw === null) return { ...glassDefaults, error: '' };
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && 'mode' in value && (value.mode === 'liquid' || value.mode === 'frosted')) {
      return { ...normalizeGlass(value as Partial<GlassSettings>), error: '' };
    }
    return { ...glassDefaults, error: '玻璃材质设置无法识别，已使用液态玻璃。' };
  } catch { return { ...glassDefaults, error: '玻璃材质设置暂时无法读取，已使用液态玻璃。' }; }
}
export function useGlassPreference() {
  const [state, setState] = useState(readPreference);
  useEffect(() => {
    const storage = (event: StorageEvent) => { if (event.key === preferenceKey || event.key === null) setState(readPreference()); };
    window.addEventListener('storage', storage); return () => window.removeEventListener('storage', storage);
  }, []);
  function choose(next: Partial<Omit<GlassPreference, 'error'>>) {
    const merged = normalizeGlass(next, state);
    let error = '';
    try {
      let preserved: object = {};
      try { const raw = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) preserved = raw; } catch { /* Explicit choices can replace unreadable preferences. */ }
      localStorage.setItem(preferenceKey, JSON.stringify({ ...preserved, ...merged }));
    } catch { error = '玻璃材质已切换，但偏好暂时无法保存。'; }
    setState({ ...merged, error });
  }
  return { ...state, choose, reset: () => choose(glassDefaults) };
}
export function useGlassKit(settings: GlassSettings) {
  const { mode, tint, refraction, blur, dispersion, depth, elasticity, actionsEnabled, actionBlur, actionOpacity } = settings;
  useEffect(() => {
    document.documentElement.dataset.glassMode = mode;
    const dispose = startGlassMaterials({ ...glassDefaults, mode, refraction, blur, dispersion, depth, elasticity });
    return () => { dispose(); delete document.documentElement.dataset.glassMode; };
  }, [mode, refraction, blur, dispersion, depth, elasticity]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.actionGlass = actionsEnabled ? 'on' : 'off';
    root.style.setProperty('--action-glass-blur', `${actionBlur}px`);
    root.style.setProperty('--action-glass-opacity', `${actionOpacity}%`);
    return () => { delete root.dataset.actionGlass; root.style.removeProperty('--action-glass-blur'); root.style.removeProperty('--action-glass-opacity'); };
  }, [actionsEnabled, actionBlur, actionOpacity]);
  useEffect(() => {
    const root = document.documentElement;
    const coatings = {
      smoke: '',
      'deep-mint': 'linear-gradient(125deg, rgb(19 92 77 / .62), rgb(4 42 35 / .42) 52%, rgb(0 18 16 / .76))',
      champagne: 'linear-gradient(125deg, rgb(103 79 35 / .52), rgb(42 31 15 / .42) 52%, rgb(16 12 7 / .76))',
    };
    root.dataset.glassTint = tint;
    if (coatings[tint]) root.style.setProperty('--material-coating', coatings[tint]);
    else root.style.removeProperty('--material-coating');
    return () => { delete root.dataset.glassTint; root.style.removeProperty('--material-coating'); };
  }, [tint]);
}
