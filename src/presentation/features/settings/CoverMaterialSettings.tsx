import { t } from '../../i18n/index.ts';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  coverRangeError, DEFAULT_COVER_MATERIAL, DEFAULT_COVER_RANGES, loadCoverMaterial,
  saveCoverMaterial, subscribeCoverMaterial, type CoverMaterialPreferences, type CoverMaterialRange,
} from '../../../infrastructure/coverMaterialPreferences.ts';

type DraftRange = { min: string; max: string; finish: CoverMaterialRange['finish'] };
const draftOf = (ranges: readonly CoverMaterialRange[]): DraftRange[] => ranges.map(range => ({ ...range, min: String(range.min), max: String(range.max) }));
const finishNames = { standard: '原始封面', holographic: '镭射', prismatic: '多彩' } as const;

export function CoverMaterialSettings() {
  const prefs = useSyncExternalStore(subscribeCoverMaterial, loadCoverMaterial, loadCoverMaterial);
  const [ranges, setRanges] = useState(() => draftOf(prefs.ranges));
  const [error, setError] = useState(''), [rangeError, setRangeError] = useState('');
  const savedRanges = JSON.stringify(prefs.ranges);
  useEffect(() => { setRanges(draftOf(JSON.parse(savedRanges) as CoverMaterialRange[])); setRangeError(''); }, [savedRanges]);
  function update(next: CoverMaterialPreferences) {
    try { saveCoverMaterial(next); setError(''); return true; }
    catch { setError('设置未能保存，请重试。区间草稿已保留。'); return false; }
  }
  function applyRanges() {
    const next = ranges.map(range => ({ min: range.min.trim() ? Number(range.min) : NaN, max: range.max.trim() ? Number(range.max) : NaN, finish: range.finish }));
    const issue = coverRangeError(next);
    setRangeError(issue ?? '');
    if (!issue) update({ ...prefs, ranges: next });
  }
  function editRange(index: number, patch: Partial<DraftRange>) {
    setRanges(previous => previous.map((range, i) => i === index ? { ...range, ...patch } : range)); setRangeError('');
  }
  return <div className="settings-card cover-material-settings">
    <label className="settings-toggle"><span>{t("封面反光")}<span className="cover-material-note">{t("仅影响游戏封面材质，倾斜和状态边框保持原样")}</span></span><input aria-label={t("封面反光")} type="checkbox" checked={prefs.enabled} onChange={event => update({ ...prefs, enabled: event.target.checked })} /></label>
    <fieldset disabled={!prefs.enabled} className="cover-material-controls">
      <label className="cover-material-choice"><span>{t("材质规则")}</span><select aria-label={t("材质规则")} value={prefs.mode} onChange={event => update({ ...prefs, mode: event.target.value as CoverMaterialPreferences['mode'] })}>
        <option value="default">{t("原默认")}</option><option value="uniform">{t("统一材质")}</option><option value="ranges">{t("按评分区间")}</option>
      </select></label>
      {prefs.mode === 'default' && <p>{t("9.0–9.4 分使用多彩，9.5–10 分使用镭射；历史字母评级沿用原规则。")}</p>}
      {prefs.mode === 'uniform' && <label className="cover-material-choice"><span>{t("所有游戏封面")}<span className="cover-material-note">{t("包括未评分游戏")}</span></span><select aria-label={t("统一反光材质")} value={prefs.uniformFinish} onChange={event => update({ ...prefs, uniformFinish: event.target.value as CoverMaterialPreferences['uniformFinish'] })}><option value="holographic">{t("镭射")}</option><option value="prismatic">{t("多彩")}</option></select></label>}
      {prefs.mode === 'ranges' && <div className="cover-material-ranges">
        <p>{t("上下界均包含，精确到 0.1 分，区间不能重叠。仅匹配可评分游戏的数字评分，未评分或未覆盖范围显示原图。")}</p>
        <div className="cover-material-presets"><button className="text-button" onClick={() => { setRanges(draftOf(DEFAULT_COVER_RANGES)); setRangeError(''); }}>{t("原默认区间")}</button><button className="text-button" onClick={() => { setRanges(draftOf(Array.from({ length: 10 }, (_, i) => ({ min: i, max: i === 9 ? 10 : i + .9, finish: i === 9 ? 'holographic' : 'standard' })))); setRangeError(''); }}>{t("整数分段")}</button></div>
        {ranges.map((range, index) => <div className="cover-material-range" key={index}>
          <input aria-label={t("区间 {0} 最低分", [index + 1])} type="number" min="0" max="10" step="0.1" value={range.min} onChange={event => editRange(index, { min: event.target.value })} /><span>{t("至")}</span>
          <input aria-label={t("区间 {0} 最高分", [index + 1])} type="number" min="0" max="10" step="0.1" value={range.max} onChange={event => editRange(index, { max: event.target.value })} />
          <select aria-label={t("区间 {0} 材质", [index + 1])} value={range.finish} onChange={event => editRange(index, { finish: event.target.value as DraftRange['finish'] })}>{Object.entries(finishNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <button className="text-button" aria-label={t("删除区间 {0}", [index + 1])} onClick={() => { setRanges(previous => previous.filter((_, i) => i !== index)); setRangeError(''); }}>{t("删除")}</button>
        </div>)}
        {!ranges.length && <p>{t("未设置区间，所有评分均显示原始封面。")}</p>}
        <div className="cover-material-actions"><button className="button button--secondary" disabled={ranges.length >= 20} onClick={() => setRanges(previous => [...previous, { min: '', max: '', finish: 'holographic' }])}>{t("添加区间")}</button><button className="button button--primary" onClick={applyRanges}>{t("应用区间")}</button></div>
        <p className="cover-material-note">{t("区间草稿应用后生效；非法输入不会覆盖当前规则。")}</p>{rangeError && <p role="alert">{rangeError}</p>}
      </div>}
      <div className="cover-material-sliders">{([['strength', '纹理强度'], ['filter', '底色滤镜'], ['speed', '流动速度']] as const).map(([key, label]) => <label key={key}><span>{t(label)}</span><input aria-label={label} type="range" min="0" max="100" step="1" value={Math.round(prefs[key] * 100)} onChange={event => update({ ...prefs, [key]: Number(event.target.value) / 100 })} /><output>{Math.round(prefs[key] * 100)}%</output></label>)}</div>
      <label className="settings-toggle"><span>{t("三角切面")}</span><input aria-label={t("三角切面")} type="checkbox" checked={prefs.facets} onChange={event => update({ ...prefs, facets: event.target.checked })} /></label>
    </fieldset>
    <div className="cover-material-actions"><button className="button button--secondary" onClick={() => { if (update({ ...prefs, ...DEFAULT_COVER_MATERIAL })) { setRanges(draftOf(DEFAULT_COVER_RANGES)); setRangeError(''); } }}>{t("恢复卡面默认")}</button></div>
    {error && <p role="alert">{t(error)}</p>}
  </div>;
}
