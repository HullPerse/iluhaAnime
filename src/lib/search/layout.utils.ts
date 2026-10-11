const EN_TO_RU: Record<string, string> = {
  q: "й",
  w: "ц",
  e: "у",
  r: "к",
  t: "е",
  y: "н",
  u: "г",
  i: "ш",
  o: "щ",
  p: "з",
  "[": "х",
  "]": "ъ",
  a: "ф",
  s: "ы",
  d: "в",
  f: "а",
  g: "п",
  h: "р",
  j: "о",
  k: "л",
  l: "д",
  ";": "ж",
  "'": "э",
  z: "я",
  x: "ч",
  c: "с",
  v: "м",
  b: "и",
  n: "т",
  m: "ь",
  ",": "б",
  ".": "ю",
};

const RU_TO_EN = new Map<string, string>();
for (const [en, ru] of Object.entries(EN_TO_RU)) {
  RU_TO_EN.set(ru, en);
  RU_TO_EN.set(ru.toUpperCase(), en.toUpperCase());
  EN_TO_RU[en.toUpperCase()] = ru.toUpperCase();
}

const CYRILLIC_RE = /[\u0400-\u04FF]/;

/** True when the text contains Cyrillic letters. */
export function looksCyrillic(value: string): boolean {
  return CYRILLIC_RE.test(value);
}

function flipChar(char: string, toEnglish: boolean): string {
  if (toEnglish) return RU_TO_EN.get(char) ?? char;
  return EN_TO_RU[char] ?? EN_TO_RU[char.toLowerCase()]?.toUpperCase() ?? char;
}

/**
 * Re-maps text typed in the wrong keyboard layout (ghbdtn -> привет).
 * Direction follows the input: Cyrillic input maps to English, anything else
 * maps to Russian. Characters outside both layouts pass through untouched.
 */
export function flipLayout(value: string): string {
  const toEnglish = looksCyrillic(value);
  return [...value].map((char) => flipChar(char, toEnglish)).join("");
}
