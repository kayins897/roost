import { useEffect, useState } from 'react';
import { ambientHue, normalizeLook } from './ambientPalette.ts';
import { applyThemeTone } from './themeTone.ts';
import { ambientSettingsDefaults, normalizeAmbientSettings, type AmbientSettings } from './ambientSettings.ts';
const preferenceKey = 'qiyu.background.v1';
type AmbientPreference = AmbientSettings & { enabled: boolean; hue: number; strength: number; depth: number; speed: number; swirl: number; error: string };
const defaults: AmbientPreference = { ...ambientSettingsDefaults, enabled: true, hue: 33, strength: 60, depth: 22, speed: 14, swirl: 12, error: '' };
function readPreference(): AmbientPreference {
  try {
    const raw = localStorage.getItem(preferenceKey);
    if (raw === null) return defaults;
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && 'enabled' in value && typeof value.enabled === 'boolean') return {
      ...normalizeAmbientSettings(value as Partial<AmbientSettings>),
      enabled: value.enabled,
      hue: normalizeLook('hue' in value ? value.hue : undefined, defaults.hue),
      strength: normalizeLook('strength' in value ? value.strength : undefined, defaults.strength),
      depth: normalizeLook('depth' in value ? value.depth : undefined, defaults.depth),
      speed: normalizeLook('speed' in value ? value.speed : undefined, defaults.speed),
      swirl: normalizeLook('swirl' in value ? value.swirl : undefined, defaults.swirl), error: '',
    };
  } catch { /* Startup only reads preferences, never normalizes storage. */ }
  return { ...defaults, enabled: false, error: '背景偏好暂时无法读取，已使用静态背景。' };
}
export function useAmbientMotion() {
  const [preference, setPreference] = useState(readPreference);
  useEffect(() => applyThemeTone(document.documentElement, preference.paletteHue ?? ambientHue(preference.hue)), [preference.hue, preference.paletteHue]);
  useEffect(() => {
    const storage = (event: StorageEvent) => { if (event.key === preferenceKey || event.key === null) setPreference(readPreference()); };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, []);
  function save(next: Omit<AmbientPreference, 'error'>) {
    let error = '';
    try {
      let preserved: object = {};
      try { const raw: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) preserved = raw; } catch { /* A deliberate choice can replace an unreadable preference. */ }
      localStorage.setItem(preferenceKey, JSON.stringify({ ...preserved, ...next }));
    } catch { error = '背景已切换，但偏好暂时无法保存。'; }
    setPreference({ ...next, error });
  }
  function choose(enabled: boolean) { const { error: _error, ...next } = preference; save({ ...next, enabled }); }
  function chooseLook(look: Partial<AmbientSettings> & { hue?: number; strength?: number; depth?: number; speed?: number; swirl?: number }) {
    save({ ...normalizeAmbientSettings({ ...preference, ...look }), enabled: preference.enabled, hue: normalizeLook(look.hue, preference.hue), strength: normalizeLook(look.strength, preference.strength), depth: normalizeLook(look.depth, preference.depth), speed: normalizeLook(look.speed, preference.speed), swirl: normalizeLook(look.swirl, preference.swirl) });
  }
  function reset() { const { error: _error, ...next } = defaults; save(next); }
  return { ...preference, choose, chooseLook, reset };
}
