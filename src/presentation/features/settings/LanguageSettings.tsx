import { Languages } from 'lucide-react';
import { useState } from 'react';
import { setLocale } from '../../../infrastructure/localePreferences.ts';
import { t, useLocale } from '../../i18n/index.ts';

export function LanguageSettings() {
  const locale = useLocale(), [error, setError] = useState('');
  return <div className="settings-card settings-choice"><div className="settings-row-icon"><Languages size={19}/></div><div><h4>{t('界面语言')}</h4><p>{t('即时切换，作品和个人记录保持原文。')}</p>{error && <p className="form-error" role="alert">{t(error)}</p>}</div><select aria-label={t('界面语言')} value={locale} onChange={event => { try { setLocale(event.target.value as 'en' | 'zh-CN'); setError(''); } catch { setError('无法保存语言设置，请稍后重试。'); } }}><option value="zh-CN">{t("简体中文")}</option><option value="en">English</option></select></div>;
}
