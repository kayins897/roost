import type { CSSProperties } from 'react';
import type { DetailWidgetId, DetailWidgetPreference } from '../../../infrastructure/detailLayout.ts';

export const WIDGET_LABELS: Record<DetailWidgetId, string> = {
  cover: '游戏封面', grade: '通关评分', hours: '游玩时长', platform: '拥有平台', facts: '作品资料',
  impression: '一句话印象', footprint: '体验与足迹', gallery: '我的截图', tags: '标签', count: '完成次数', review: '长文测评',
};
export const WIDGET_SIZES: Record<DetailWidgetId, Partial<Record<DetailWidgetPreference['size'], readonly [number, number, number]>>> = {
  cover: { small: [1, 2, 420], medium: [2, 3, 690], large: [2, 4, 860] },
  grade: { small: [1, 1, 250], medium: [2, 1, 270], large: [2, 2, 440] },
  hours: { medium: [1, 1, 190], large: [2, 1, 190] }, platform: { medium: [1, 1, 190], large: [2, 1, 190] },
  facts: { small: [1, 1, 270], medium: [2, 1, 250], large: [4, 1, 240] },
  impression: { small: [1, 1, 180], medium: [3, 1, 190], large: [4, 2, 340] },
  footprint: { small: [1, 1, 200], medium: [1, 2, 490], large: [2, 2, 440] },
  gallery: { small: [2, 1, 200], medium: [2, 1, 300], large: [4, 2, 440] },
  tags: { small: [1, 1, 210], medium: [1, 1, 270], large: [4, 1, 210] },
  count: { medium: [1, 1, 160], large: [2, 1, 160] }, review: { small: [2, 1, 80], medium: [4, 1, 80] },
};
export const FIELD_LABELS: Record<string, string> = {
  original: '作品名称', year: '发行年份', date: '收录日期', creator: '创作者', source: '来源链接',
  tag0: '玩法', tag1: '题材', tag2: '游玩场景', tag3: '其他',
};
export const SIZE_LABELS = { small: '紧凑', medium: '标准', large: '加大' };
export const WIDGET_COLORS = ['#202124', '#1665ed', '#8a19ef', '#f12483', '#ff850a', '#136d5b', '#d8c6ef', '#faf6e8'];

/** Custom colors replace the default surface; text contrast follows relative luminance. */
export function widgetStyle(card: DetailWidgetPreference): CSSProperties {
  const [columns, rows, height] = WIDGET_SIZES[card.id][card.size] ?? WIDGET_SIZES[card.id].medium!;
  const style = {
    '--bento-columns': columns, '--bento-rows': rows, '--bento-height': `${height}px`,
    '--bento-medium-columns': card.size === 'medium' && ['cover', 'grade', 'gallery'].includes(card.id) ? 1 : Math.min(columns, 2),
    '--bento-medium-rows': card.size === 'medium' && ['cover', 'footprint'].includes(card.id) ? rows : 1,
  } as CSSProperties;
  if (/^#[0-9a-f]{6}$/i.test(card.color)) {
    const channels = [1, 3, 5].map(offset => parseInt(card.color.slice(offset, offset + 2), 16) / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    const light = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .37;
    Object.assign(style, {
      background: card.color, color: light ? '#17202b' : '#f7f8fc',
      '--bento-muted': light ? '#354155' : '#e3e7ef', '--bento-control': light ? '#00000012' : '#ffffff18',
      '--bento-border': light ? '#00000028' : '#ffffff35',
    });
  }
  return style;
}
