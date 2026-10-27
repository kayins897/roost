import type { GameScreenshot } from './types.ts';

export function isPersonalScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-8;
}
export function isLastPlayedAt(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z)?$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value.slice(0, 10);
}
export function isGameScreenshot(value: unknown): value is GameScreenshot {
  if (!value || typeof value !== 'object') return false;
  const image = value as Record<string, unknown>;
  return typeof image.id === 'string' && image.id.length > 0 && image.id.length <= 100 &&
    typeof image.assetId === 'string' && /^[a-f0-9]{64}$/.test(image.assetId) &&
    typeof image.filename === 'string' && image.filename.length > 0 && image.filename.length <= 255 && !/[\\/\0]/.test(image.filename) &&
    ['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType as string) &&
    typeof image.width === 'number' && Number.isSafeInteger(image.width) && image.width > 0 && image.width <= 20000 &&
    typeof image.height === 'number' && Number.isSafeInteger(image.height) && image.height > 0 && image.height <= 20000 &&
    typeof image.addedAt === 'string' && Number.isFinite(Date.parse(image.addedAt)) &&
    (image.caption === undefined || (typeof image.caption === 'string' && image.caption.length <= 500));
}
