import { useState } from 'react';
import { DEFAULT_COVER_MATERIAL, loadCoverMaterial, saveCoverMaterial, type CoverMaterialPreferences } from '../../../infrastructure/coverMaterialPreferences.ts';
export function CoverMaterialSettings() {
  const [prefs, setPrefs] = useState(loadCoverMaterial), [error, setError] = useState('');
  function update(next: CoverMaterialPreferences) { try { saveCoverMaterial(next); setPrefs(next); setError(''); } catch { setError('设置未能保存，请重试'); } }
  return <div className="settings-card cover-material-settings"><p>8.0–8.9 闪箔 · 9.0–9.4 镭射 · 9.5–10 多彩</p>{([['strength', '纹理强度'], ['filter', '底色滤镜'], ['speed', '流动速度']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input aria-label={label} type="range" min="0" max="100" step="1" value={Math.round(prefs[key] * 100)} onChange={event => update({ ...prefs, [key]: Number(event.target.value) / 100 })} /><output>{Math.round(prefs[key] * 100)}%</output></label>)}<label>三角切面<input aria-label="三角切面" type="checkbox" checked={prefs.facets} onChange={event => update({ ...prefs, facets: event.target.checked })} /></label><button className="button button--secondary" onClick={() => update({ ...DEFAULT_COVER_MATERIAL })}>恢复卡面默认</button>{error && <p role="alert">{error}</p>}</div>;
}
