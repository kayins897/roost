import { english as baseEnglish } from './locales/en.ts';
import { interfaceEnglish } from './locales/enInterface.ts';
import { intakeEnglish } from './locales/enIntake.ts';
const english = { ...baseEnglish, ...interfaceEnglish, ...intakeEnglish };

export type InterfaceLocale = 'zh-CN' | 'en';
type Value = string | number | undefined | null;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(english).filter(([key]) => key.includes('{0}') && /[\u3400-\u9fff]/.test(key)).sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length).map(([key, value]) => {
  const indices: number[] = [];
  const pieces = key.split(/(\{\d+\})/g).map(part => /^\{\d+\}$/.test(part) ? (indices.push(Number(part.slice(1, -1))), '(.+?)') : escape(part));
  return { expression: new RegExp('^' + pieces.join('') + '$'), value, indices };
});

/** Translate interface copy only. User content and persisted classification values stay untouched. */
export function translateMessage(message: string, locale: InterfaceLocale, values?: readonly Value[]): string {
  let result = locale === 'en' && Object.hasOwn(english, message) ? english[message] : message;
  if (locale === 'en' && !values && result === message && /[\u3400-\u9fff]/.test(message)) {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(message);
      if (match) {
        result = pattern.value.replace(/\{(\d+)\}/g, (token, index) => {
          const position = pattern.indices.indexOf(Number(index));
          return position < 0 ? token : match[position + 1];
        });
        break;
      }
    }
  }
  return values ? result.replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[Number(index)] ?? '') : token) : result;
}
