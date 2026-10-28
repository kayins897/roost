import type { Work } from '../reading-workspace/model';

export type FacetKey = 'author' | 'publisher' | 'personalScore' | 'doubanScore' | 'bookType' | 'readingSource' | 'metadataSource';
export type FacetSelection = Partial<Record<FacetKey, string[]>>;
export interface BookMetadata {
  author?: string;
  publisher?: string;
  personalScore?: number;
  doubanScore?: number;
  bookType?: string;
  readingSource: string[];
  metadataSource: string[];
}
export interface FacetOption { value: string; label: string; count: number }

export const FACET_KEYS: FacetKey[] = ['author', 'publisher', 'personalScore', 'doubanScore', 'bookType', 'readingSource', 'metadataSource'];
export const FACET_LABELS: Record<FacetKey, string> = {
  author: '作者', publisher: '出版社', personalScore: '我的评分', doubanScore: '豆瓣评分',
  bookType: '书籍类型', readingSource: '阅读来源', metadataSource: '资料来源',
};
export const UNKNOWN_FACET_VALUE = '__unknown__';

// In-memory UI fixtures, not verified bibliography or fetched Douban ratings.
// Publisher names intentionally identify themselves as synthetic examples.
const DEMO_METADATA: Record<string, Partial<BookMetadata>> = {
  b1: { publisher: '示例出版社·远方', personalScore: 9.4, doubanScore: 9.1, readingSource: ['汉王电纸书', '纸质书'], metadataSource: ['豆瓣'] },
  b2: { publisher: '示例出版社·远方', personalScore: 10, doubanScore: 8.9, readingSource: ['纸质书'], metadataSource: ['豆瓣', '手动录入'] },
  b3: { publisher: '示例出版社·日常', personalScore: 8.5, doubanScore: 8.4, readingSource: ['汉王电纸书'], metadataSource: ['手动录入'] },
  b4: { personalScore: 0, readingSource: ['微信读书'], metadataSource: ['微信读书'] },
  b5: { publisher: '示例出版社·日常', personalScore: 7.9, doubanScore: 8.5, readingSource: ['微信读书'], metadataSource: ['微信读书'] },
  b6: { publisher: '示例出版社·观察', doubanScore: 9.0, readingSource: ['纸质书'], metadataSource: ['豆瓣'] },
  b7: {},
  b8: { publisher: '示例出版社·远方', personalScore: 8.9, doubanScore: 9.2, readingSource: ['汉王电纸书'], metadataSource: ['豆瓣'] },
};

/** Preview-only metadata: no Work or production storage fields are changed. */
export function metadataOf(work: Work): BookMetadata {
  const sample = DEMO_METADATA[work.id];
  return {
    author: work.subtitle.trim() || undefined,
    bookType: work.format?.trim() || undefined,
    publisher: sample?.publisher,
    personalScore: sample?.personalScore,
    doubanScore: sample?.doubanScore,
    readingSource: [...sample?.readingSource ?? []],
    metadataSource: [...sample?.metadataSource ?? []],
  };
}

function scoreValue(score: number | undefined): string {
  return score === undefined || !Number.isFinite(score) || score < 0 || score > 10
    ? UNKNOWN_FACET_VALUE : `score:${Math.min(9, Math.floor(score))}`;
}

function valuesOf(work: Work, key: FacetKey): string[] {
  const value = metadataOf(work)[key];
  if (key === 'personalScore' || key === 'doubanScore') return [scoreValue(value as number | undefined)];
  const values = (Array.isArray(value) ? value : value ? [value] : []) as string[];
  const cleaned = [...new Set(values.map(item => item.trim()).filter(Boolean))];
  return cleaned.length ? cleaned : [UNKNOWN_FACET_VALUE];
}

export function facetValueLabel(key: FacetKey, value: string): string {
  if (value === UNKNOWN_FACET_VALUE) return key === 'personalScore' ? '未评分' : '未记录';
  if (key === 'personalScore' || key === 'doubanScore') {
    const match = /^score:([0-9])$/.exec(value);
    if (match) return match[1] === '9' ? '9–10 分' : `${match[1]}–${match[1]}.9 分`;
  }
  return value;
}

/** OR within a facet, AND between facets; skip supports disjunctive option counts. */
export function matchesFacets(work: Work, selection: FacetSelection, skip?: FacetKey): boolean {
  return FACET_KEYS.every(key => key === skip || !selection[key]?.length
    || selection[key]!.some(value => valuesOf(work, key).includes(value)));
}

/** Unknown remains a selectable option even when the current scope has none. */
export function facetOptions(works: Work[], key: FacetKey): FacetOption[] {
  const counts = new Map<string, number>([[UNKNOWN_FACET_VALUE, 0]]);
  const seen = new Set<string>();
  for (const work of works) {
    if (seen.has(work.id)) continue;
    seen.add(work.id);
    for (const value of valuesOf(work, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, label: facetValueLabel(key, value), count }))
    .sort((a, b) => {
      if (a.value === UNKNOWN_FACET_VALUE) return 1;
      if (b.value === UNKNOWN_FACET_VALUE) return -1;
      return key === 'personalScore' || key === 'doubanScore'
        ? Number(b.value.slice(6)) - Number(a.value.slice(6)) : a.label.localeCompare(b.label, 'zh-CN');
    });
}
