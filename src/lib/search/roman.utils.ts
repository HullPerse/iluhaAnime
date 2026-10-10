// Canonical Latin numerals only (I, II, III, IV, ... XL, CM, MIX): each symbol
// appears in the right place at most once, so malformed runs like "IIII" or
// "VX" are still treated as typos.
const ROMAN_NUMERAL_RE = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;

/**
 * True when the token is a valid Roman numeral. Spell correction skips these
 * so a title like "Frieren II" is never offered as a typo and a trailing
 * season numeral is never highlighted as an error.
 */
export function isRomanNumeral(value: string): boolean {
  const word = value.trim().toLowerCase();
  return word.length > 0 && ROMAN_NUMERAL_RE.test(word);
}
