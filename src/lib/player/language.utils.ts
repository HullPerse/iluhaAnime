import { attemptSync } from "@/lib/utils/attempt.utils";

const ISO_639_2_TO_1: Record<string, string> = {
  ara: "ar",
  bel: "be",
  bul: "bg",
  ces: "cs",
  chi: "zh",
  cze: "cs",
  dan: "da",
  deu: "de",
  dut: "nl",
  eng: "en",
  fin: "fi",
  fra: "fr",
  fre: "fr",
  ger: "de",
  hin: "hi",
  hrv: "hr",
  hun: "hu",
  ind: "id",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  nld: "nl",
  nor: "no",
  pol: "pl",
  por: "pt",
  ron: "ro",
  rum: "ro",
  rus: "ru",
  slk: "sk",
  slo: "sk",
  slv: "sl",
  spa: "es",
  srp: "sr",
  swe: "sv",
  tha: "th",
  tur: "tr",
  ukr: "uk",
  vie: "vi",
  zho: "zh",
};

const UNKNOWN_CODES = new Set(["", "mis", "mul", "und", "unknown", "zxx"]);

export function normalizeLangCode(code: string | undefined): string {
  if (!code) return "";
  const lower = code.trim().toLowerCase();
  if (UNKNOWN_CODES.has(lower)) return "";
  return ISO_639_2_TO_1[lower] ?? lower;
}

let cachedNames: Intl.DisplayNames | null;
{
  // oxlint-disable-next-line react-doctor/js-hoist-intl -- runs once at module init, not per call
  const [displayNames] = attemptSync(() => new Intl.DisplayNames(["en"], { type: "language" }));
  cachedNames = displayNames;
}

function displayNamesEn(): Intl.DisplayNames | null {
  return cachedNames;
}

export function languageName(code: string | undefined): string {
  const normalized = normalizeLangCode(code);
  if (!normalized) return "";
  const names = displayNamesEn();
  if (!names) return normalized.toUpperCase();
  const [name] = attemptSync(() => names.of(normalized));
  if (!name || name.toLowerCase() === normalized.toLowerCase()) {
    return normalized.toUpperCase();
  }
  return name;
}
