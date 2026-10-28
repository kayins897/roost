import { useState, useSyncExternalStore } from 'react';
import { Check, Type } from 'lucide-react';
import { loadTypography, saveTypography, subscribeTypography, type InterfaceFont } from '../../../infrastructure/typographyPreferences.ts';
import { t } from '../../i18n/index.ts';
import './typography.css';

const choices: { id: InterfaceFont; title: string; detail: string }[] = [
  { id: 'sans', title: '现代黑体', detail: 'Inter · Noto Sans SC' },
  { id: 'serif', title: '书卷宋体', detail: 'Noto Serif SC' },
  { id: 'system', title: '系统字体', detail: '使用设备默认界面字体' },
];

export function TypographySettings() {
  const prefs = useSyncExternalStore(subscribeTypography, loadTypography, loadTypography);
  const [error, setError] = useState('');
  function choose(family: InterfaceFont) {
    if (family === prefs.family) return;
    try { saveTypography({ family }); setError(''); }
    catch { setError('字体设置未能保存，请重试。'); }
  }
  return <div className="settings-card typography-settings">
    <div className="typography-heading"><Type size={19} aria-hidden="true" /><div><h4>{t('界面字体')}</h4><p>{t('选择适合自己的阅读风格，即时生效。')}</p></div></div>
    <div className="typography-options" role="group" aria-label={t('界面字体')}>
      {choices.map(choice => <button key={choice.id} type="button" data-font-preview={choice.id} className={prefs.family === choice.id ? 'is-selected' : ''} aria-pressed={prefs.family === choice.id} onClick={() => choose(choice.id)}>
        <span className="typography-sample" aria-hidden="true">栖 Aa</span><strong>{t(choice.title)}</strong><small>{t(choice.detail)}</small>{prefs.family === choice.id && <Check size={16} aria-hidden="true" />}
      </button>)}
    </div>
    <p className="typography-license">{t('内置字体均可免费使用，随应用离线提供。更换字体不影响收藏和个人记录。')}</p>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
  </div>;
}
