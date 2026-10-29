import { readImportTable, type BookTable } from './bookImportTable.ts';

const aliases: Record<string, string[]> = {
  title: ['片名', '作品名称', '名称', 'title', 'name'], creator: ['导演', 'director', 'creator'],
  originalTitle: ['原名', '原片名', 'originaltitle'], year: ['发行年份', '上映年份', '年份', 'year'],
  subcategory: ['影视类型', '作品类型', '类型', 'type', 'subcategory'], tags: ['标签', 'tags'],
  actors: ['演员', '主演', 'actors'], regions: ['地区', '制片地区', 'regions'],
  durationMinutes: ['片长', '片长分钟', '片长（分钟）', '单集片长', 'durationminutes'],
  episodeCount: ['集数', '总集数', 'episodecount'], description: ['简介', 'description'],
  personalScore: ['我的评分', '个人评分', 'personalscore'], doubanScore: ['豆瓣评分', 'doubanscore'],
  viewingSources: ['观看来源', 'viewingsources'], metadataSource: ['资料来源', 'metadatasource'],
  sourceUrl: ['豆瓣链接', '豆瓣地址', '来源链接', '链接', 'url', 'sourceurl'],
};
const kinds: Record<string, string> = { '电影': '电影', movie: '电影', '连续剧': '连续剧', '电视剧': '连续剧', series: '连续剧', tvseries: '连续剧', '番剧': '番剧', anime: '番剧' };
const texts = (value: string) => value.split(/[,，;；、\n]/).map(part => part.trim()).filter(Boolean);
// Units are explicit in the template: decimal minutes/counts and 0–10 scores.
// Invalid text remains a string so the domain validator rejects rather than guesses.
const number = (value: string, score = false) => (score ? /^\d+(?:\.\d)?$/ : /^\d+$/).test(value) ? Number(value) : value;

/** Offline metadata, never a source of inferred viewing dates, progress or time spent. */
export function readScreenTable(text: string, maximumRows: number): BookTable | null {
  const table = readImportTable(text, maximumRows, aliases, '表格第一行需要“片名”表头，可同时包含导演、年份、类型、豆瓣链接等列', '观看经历不会从未映射列推断');
  if (!table) return null;
  const { keys, skipped } = table;
  const rows: BookTable['rows'] = [];
  for (const record of table.records) {
    if (record.cells.length > keys.length) { skipped.push({ row: record.line, reason: '列数超过表头；含逗号的单元格请用双引号包裹' }); continue; }
    const value: Record<string, unknown> = { category: 'screen' }, details: Record<string, unknown> = {};
    let invalidKind = false;
    keys.forEach((key, index) => {
      const cell = record.cells[index];
      if (!key || !cell) return;
      if (key === 'subcategory') {
        const kind = Object.hasOwn(kinds, cell.toLocaleLowerCase()) ? kinds[cell.toLocaleLowerCase()] : undefined;
        if (!kind) invalidKind = true; else value.subcategory = kind;
      } else if (key === 'tags') value.tags = texts(cell);
      else if (['actors', 'regions', 'viewingSources'].includes(key)) details[key] = texts(cell);
      else if (key === 'personalScore') value.personalScore = number(cell, true);
      else if (key === 'doubanScore') details.doubanScore = number(cell, true);
      else if (key === 'durationMinutes' || key === 'episodeCount') details[key] = number(cell);
      else if (key === 'description' || key === 'metadataSource') details[key] = cell;
      else value[key] = cell;
    });
    if (invalidKind) { skipped.push({ row: record.line, reason: '影视类型请填写电影、连续剧或番剧；题材请放在标签列' }); continue; }
    if (Object.keys(details).length) value.screenDetails = details;
    rows.push({ row: record.line, value });
  }
  return { rows, skipped };
}
