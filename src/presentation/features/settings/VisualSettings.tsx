import { t } from '../../i18n/index.ts';
import type { useAmbientMotion } from '../../AmbientScene.tsx';
import { ambientHue, backgroundPalettes } from '../ambient/ambientPalette.ts';
import type { useGlassPreference } from '../../glassKit.ts';

export type AmbientControls = ReturnType<typeof useAmbientMotion>;
export type GlassControls = ReturnType<typeof useGlassPreference>;
export function SettingRange({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className="settings-range"><span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))} /></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle"><span>{label}</span><input type="checkbox" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}
export function BackgroundSettings({ ambient, searching }: { ambient: AmbientControls; searching: boolean }) {
  const hue = ambient.paletteHue ?? ambientHue(ambient.hue);
  return <>
    <div className="settings-card"><Toggle label={t("动态背景")} checked={ambient.enabled} onChange={ambient.choose} /><p>{t("关闭后保留静态画面。系统减少动态时也会停止运动。")}</p><div className="settings-toggle-pair"><Toggle label={t("流体板")} checked={ambient.fluidEnabled} onChange={fluidEnabled => ambient.chooseLook({ fluidEnabled })} /><Toggle label={t("星河")} checked={ambient.starsEnabled} onChange={starsEnabled => ambient.chooseLook({ starsEnabled })} /></div>{ambient.error && <p className="form-error" role="alert">{t(ambient.error)}</p>}</div>
    <div className="settings-card settings-ranges">
      <SettingRange label={t("视差幅度")} value={ambient.parallax} min={0} max={150} step={5} unit="%" onChange={parallax => ambient.chooseLook({ parallax })} />
      <SettingRange label={t("粒子密度")} value={ambient.density} min={10} max={100} step={5} onChange={density => ambient.chooseLook({ density })} />
      <SettingRange label={t("背景明暗")} value={ambient.strength} min={0} max={100} unit="%" onChange={strength => ambient.chooseLook({ strength })} />
    </div>
    <div className="settings-card"><h4>{t("环境光色相")}</h4><p>{t("原示例的五套色调，或选择自己的色相。")}</p><div className="settings-palettes" role="group" aria-label={t("环境光色相")}>{backgroundPalettes.map(p => <button type="button" key={p.label} className={Math.abs(hue - p.hue) < 1 ? 'is-selected' : ''} aria-pressed={Math.abs(hue - p.hue) < 1} onClick={() => ambient.chooseLook({ hue: p.legacy, paletteHue: p.hue })}><i style={{ background: `hsl(${p.hue} 85% 55%)` }} />{t(p.label)}</button>)}</div><SettingRange label={t("自定义色相")} value={hue} min={0} max={360} unit="°" onChange={paletteHue => ambient.chooseLook({ paletteHue })} /></div>
    <details className="settings-advanced" open={searching || undefined}><summary>{t("流体板高级选项")}</summary><div className="settings-card settings-ranges">
      <SettingRange label={t("流体色深")} value={ambient.depth} min={0} max={100} onChange={depth => ambient.chooseLook({ depth })} />
      <SettingRange label={t("流体流速")} value={ambient.speed} min={2} max={40} onChange={speed => ambient.chooseLook({ speed })} />
      <SettingRange label={t("流体涡旋")} value={ambient.swirl} min={0} max={30} onChange={swirl => ambient.chooseLook({ swirl })} />
      <SettingRange label={t("流体扭曲")} value={ambient.distortion} min={0} max={60} onChange={distortion => ambient.chooseLook({ distortion })} />
      <SettingRange label={t("笔刷力度")} value={ambient.brushStrength} min={0} max={2.5} step={.1} onChange={brushStrength => ambient.chooseLook({ brushStrength })} />
      <SettingRange label={t("笔刷半径")} value={ambient.brushRadius} min={.05} max={.5} step={.01} onChange={brushRadius => ambient.chooseLook({ brushRadius })} />
    </div></details>
  </>;
}
export function GlassSettings({ glass, searching }: { glass: GlassControls; searching: boolean }) {
  const liquid = glass.mode === 'liquid';
  return <>
    <div className="settings-card settings-choice"><div><h4>{t("玻璃材质")}</h4><p>{t("应用于 Dock 和搜索框，文字保持清晰。")}</p></div><select aria-label={t("玻璃材质")} value={glass.mode} onChange={event => glass.choose({ mode: event.target.value as 'liquid' | 'frosted' })}><option value="liquid">{t("液态玻璃")}</option><option value="frosted">{t("磨砂玻璃")}</option></select></div>
    <div className="settings-card settings-choice"><div><h4>{t("渐变色调")}</h4><p>{t("染色与折射叠加，保留深色玻璃的通透感。")}</p></div><select aria-label={t("导航玻璃色调")} value={glass.tint} onChange={event => glass.choose({ tint: event.target.value as 'smoke' | 'deep-mint' | 'champagne' })}><option value="smoke">{t("透明烟晶")}</option><option value="deep-mint">{t("深薄荷渐变")}</option><option value="champagne">{t("香槟渐变")}</option></select></div>
    {glass.error && <p className="form-error" role="alert">{t(glass.error)}</p>}
    <details className="settings-advanced" open={searching || undefined}><summary>{t("玻璃材质高级选项")}</summary><div className="settings-card settings-ranges">
      <SettingRange label={t("玻璃模糊")} value={glass.blur} min={0} max={12} onChange={blur => glass.choose({ blur })} />
      <SettingRange label={t("玻璃折射强度")} value={glass.refraction} min={0} max={100} step={5} unit="%" disabled={!liquid} onChange={refraction => glass.choose({ refraction })} />
      <SettingRange label={t("玻璃色散")} value={glass.dispersion} min={0} max={100} step={5} unit="%" disabled={!liquid} onChange={dispersion => glass.choose({ dispersion })} />
      <SettingRange label={t("透镜深度")} value={glass.depth} min={2} max={20} disabled={!liquid} onChange={depth => glass.choose({ depth })} />
      <SettingRange label={t("玻璃弹性")} value={glass.elasticity} min={0} max={50} step={5} unit="%" onChange={elasticity => glass.choose({ elasticity })} />
    </div></details><p className="settings-footnote">{t("减少动态时停用弹性跟随；减少透明度时切换为实底。")}</p>
  </>;
}
export function ActionGlassSettings({ glass }: { glass: GlassControls }) {
  return <><div className="settings-card"><Toggle label={t("操作按钮毛玻璃")} checked={glass.actionsEnabled} onChange={actionsEnabled => glass.choose({ actionsEnabled })} /><p>{t("较柔和的模糊与透光，让导航保持视觉重心。")}</p></div><div className="settings-card settings-ranges"><SettingRange label={t("按钮模糊")} value={glass.actionBlur} min={0} max={20} disabled={!glass.actionsEnabled} onChange={actionBlur => glass.choose({ actionBlur })} /><SettingRange label={t("按钮不透明度")} value={glass.actionOpacity} min={0} max={100} unit="%" disabled={!glass.actionsEnabled} onChange={actionOpacity => glass.choose({ actionOpacity })} /></div></>;
}
