/** A validated edition identity only. Never rewrite the user's original ISBN text. */
export function canonicalIsbn(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.normalize('NFKC').toUpperCase().replace(/[\s\u002d\u2010-\u2015]/g, '');
  if (/^(?:978|979)\d{10}$/.test(text)) {
    const sum = [...text].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0 ? text : undefined;
  }
  if (!/^\d{9}[\dX]$/.test(text) || /^0+$/.test(text)) return undefined;
  const sum = [...text].reduce((total, digit, index) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
  if (sum % 11 !== 0) return undefined;
  const prefix = `978${text.slice(0, 9)}`;
  const weighted = [...prefix].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return prefix + ((10 - weighted % 10) % 10);
}
