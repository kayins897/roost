/** Offline tables only. This module never fetches a title or infers reading history. */
export interface BookTableRow { row: number; value: Record<string, unknown> }
export interface BookTable { rows: BookTableRow[]; skipped: { row: number; reason: string }[] }
const aliases: Record<string, string[]> = {
  title: ['书名', '作品名称', '名称', 'title', 'name'], creator: ['作者', '著者', 'author', 'creator'],
  originalTitle: ['原名', '原书名', 'originaltitle'], year: ['出版年份', '出版年', '年份', 'year'],
  publisher: ['出版社', 'publisher'], translator: ['译者', 'translator'], isbn: ['isbn', '书号'],
  description: ['简介', 'description'], sourceUrl: ['豆瓣链接', '豆瓣地址', '来源链接', '链接', 'url', 'sourceurl'],
  subcategory: ['书籍类型', '类型', 'type', 'subcategory'], tags: ['标签', 'tags'],
  personalScore: ['我的评分', '个人评分', 'personalscore'], doubanScore: ['豆瓣评分', 'doubanscore'],
  readingSources: ['阅读来源', 'readingsources'], metadataSource: ['资料来源', 'metadatasource'],
};
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
const headerKey = (value: string) => Object.entries(aliases).find(([, names]) => names.some(name => normalize(name) === normalize(value)))?.[0];

function records(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const result: { line: number; cells: string[] }[] = [];
  let line = 1, start = 1, field = '', cells: string[] = [], quoted = false, ended = false;
  const cell = () => { cells.push(field.trim()); field = ''; ended = false; };
  const row = () => { cell(); if (cells.some(Boolean)) result.push({ line: start, cells }); cells = []; start = line + 1; };
  const value = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quoted) {
      if (ch === '"' && value[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; ended = true; }
      else { field += ch; if (ch === '\n') line++; }
    } else if (ch === delimiter) cell();
    else if (ch === '\n') { row(); line++; }
    else if (ch === '"') {
      if (field.trim() || ended) throw new Error(`第 ${line} 行引号位置无效，请将整格用双引号包裹`);
      field = ''; quoted = true;
    } else {
      if (ended && ch.trim()) throw new Error(`第 ${line} 行引号后有多余内容`);
      if (!ended) field += ch;
    }
  }
  if (quoted) throw new Error('表格中有未闭合的双引号，请检查后重新导入');
  if (field || cells.length) row();
  return result;
}

export function readBookTable(text: string, maximumRows: number): BookTable | null {
  const firstLine = text.replace(/^\uFEFF/, '').trimStart().split(/\r?\n/)[0] ?? '';
  const delimiter = ['\t', ',', '|'].find(value => firstLine.includes(value)) ?? (headerKey(firstLine) === 'title' ? ',' : undefined);
  if (!delimiter) return null;
  // Ordinary TXT titles may contain commas and quotes. Only invoke strict CSV
  // parsing once the first line looks like a header, including one-column CSV.
  const hintKeys = firstLine.split(delimiter).map(cell => headerKey(cell.trim().replace(/^"|"$/g, '')));
  if (!hintKeys.includes('title')) {
    if (delimiter !== ',') throw new Error('表格第一行需要“书名”表头，可同时包含作者、出版社、豆瓣链接等列');
    return null;
  }
  try { records(firstLine, delimiter); }
  catch (error) { if (delimiter === ',' && !hintKeys[0]) return null; throw error; }
  const input = records(text.replace(/^\uFEFF/, ''), delimiter);
  const header = input[0];
  if (!header) return null;
  if (input.length - 1 > maximumRows) throw new Error(`一次最多导入 ${maximumRows} 件，请拆分清单`);
  const keys = header.cells.map(headerKey);
  if (!keys.includes('title')) {
    if (keys.some(Boolean) || delimiter !== ',') throw new Error('表格第一行需要“书名”表头，可同时包含作者、出版社、豆瓣链接等列');
    return null; // A comma in an ordinary book title is not automatically a table.
  }
  const known = keys.filter((key): key is string => Boolean(key));
  if (new Set(known).size !== known.length) throw new Error('表格存在重复字段，请每种资料只保留一列');
  const skipped: BookTable['skipped'] = [];
  const ignored = header.cells.filter((_, index) => !keys[index]);
  if (ignored.length) skipped.push({ row: header.line, reason: `未导入这些列：${ignored.join('、')}。阅读经历不会从未映射列推断` });
  const rows: BookTableRow[] = [];
  for (const record of input.slice(1)) {
    if (record.cells.length > keys.length) { skipped.push({ row: record.line, reason: '列数超过表头；含逗号的单元格请用双引号包裹' }); continue; }
    const value: Record<string, unknown> = { category: 'book' };
    const details: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      const cell = record.cells[index];
      if (!key || !cell) return;
      if (key === 'tags' || key === 'readingSources') {
        const tags = cell.split(/[,，;；、\n]/).map(part => part.trim()).filter(Boolean);
        if (key === 'tags') value.tags = tags; else details.readingSources = tags;
      } else if (key === 'personalScore') value.personalScore = Number(cell);
      else if (key === 'doubanScore') details.doubanScore = Number(cell);
      else if (['publisher', 'translator', 'isbn', 'description', 'metadataSource'].includes(key)) details[key] = cell;
      else value[key] = cell;
    });
    if (Object.keys(details).length) value.bookDetails = details;
    rows.push({ row: record.line, value });
  }
  return { rows, skipped };
}
