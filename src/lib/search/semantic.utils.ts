import { normalizeSearchText } from "./normalize.utils";

function tokenize(text: string): string[] {
  return normalizeSearchText(text).split(" ").filter(Boolean);
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [k, v] of tf) tf.set(k, v / tokens.length);
  return tf;
}

function buildIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    const uniq = new Set(doc);
    for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  const n = docs.length;
  for (const [term, cnt] of df) {
    idf.set(term, Math.log(1 + n / (1 + cnt)));
  }
  return idf;
}

function vectorize(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = termFreq(tokens);
  const vec = new Map<string, number>();
  for (const [term, f] of tf) {
    const w = f * (idf.get(term) ?? 0);
    if (w > 0) vec.set(term, w);
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const bv = b.get(k) ?? 0;
    dot += v * bv;
  }
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

let cachedIdf: Map<string, number> | null = null;
let cachedDocsHash = "";

function getIdf(titles: string[]): Map<string, number> {
  const hash = `${titles.length}:${titles.slice(0, 5).join("|")}`;
  if (cachedIdf && cachedDocsHash === hash) return cachedIdf;
  const docs = titles.map((t) => tokenize(t));
  cachedIdf = buildIdf(docs);
  cachedDocsHash = hash;
  return cachedIdf;
}

export function semanticScore(query: string, candidate: string, titles: string[]): number {
  if (!query || !candidate) return 0;
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const idf = getIdf(titles);
  const qVec = vectorize(qTokens, idf);
  const cVec = vectorize(tokenize(candidate), idf);
  return cosine(qVec, cVec);
}
