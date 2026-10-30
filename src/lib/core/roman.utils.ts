const ROMAN_NUMERAL_RE = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;

export function isRomanNumeral(value: string): boolean {
  const word = value.trim().toLowerCase();
  return word.length > 0 && ROMAN_NUMERAL_RE.test(word);
}
