import { normalizeSearchText } from "./normalize.utils";

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function wordMatchScore(queryWord: string, targetWord: string): number | null {
  if (targetWord === queryWord) return 200;
  if (targetWord.startsWith(queryWord)) {
    return 180 - Math.min(40, targetWord.length - queryWord.length);
  }
  if (targetWord.includes(queryWord)) {
    return 120 - Math.min(30, targetWord.indexOf(queryWord));
  }
  if (queryWord.length < 3) return null;

  let queryIndex = 0;
  let gaps = 0;
  for (const character of targetWord) {
    if (character === queryWord[queryIndex]) queryIndex++;
    else if (queryIndex > 0) gaps++;
    if (queryIndex === queryWord.length) {
      return 90 - Math.min(60, gaps * 8);
    }
  }

  if (
    Math.abs(targetWord.length - queryWord.length) <= Math.max(2, Math.floor(queryWord.length / 3))
  ) {
    const distance = levenshtein(queryWord, targetWord);
    if (distance <= Math.max(1, Math.floor(queryWord.length / 4))) {
      return 70 - distance * 15;
    }
  }

  return null;
}

function multiWordScore(queryWords: string[], target: string): number | null {
  const targetWords = target.split(" ");
  const used = new Set<number>();
  let total = 0;
  let previousIndex = -1;
  let orderPenalty = 0;

  for (const queryWord of queryWords) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index < targetWords.length; index++) {
      if (used.has(index)) continue;
      const score = wordMatchScore(queryWord, targetWords[index]);
      if (score != null && score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return null;
    used.add(bestIndex);
    if (previousIndex >= 0 && bestIndex < previousIndex) orderPenalty += 25;
    previousIndex = bestIndex;
    total += bestScore;
  }

  return 350 + total / queryWords.length - orderPenalty;
}

function scoreExact(q: string, target: string): number | null {
  return target === q ? 1_000 : null;
}

function scorePrefix(q: string, target: string): number | null {
  return target.startsWith(q) ? 900 - Math.min(120, target.length - q.length) : null;
}

function scoreMultiWord(q: string, target: string): number | null {
  const queryWords = q.split(" ");
  if (queryWords.length <= 1) return null;
  return multiWordScore(queryWords, target);
}

function scoreIncludes(q: string, target: string): number | null {
  return target.includes(q) ? 650 - Math.min(100, target.indexOf(q)) : null;
}

function scoreGapped(q: string, target: string): number | null {
  let queryIndex = 0;
  let gaps = 0;
  let firstMatchAtBoundary = false;
  for (let index = 0; index < target.length; index++) {
    const character = target[index];
    if (character === q[queryIndex]) {
      if (queryIndex === 0) firstMatchAtBoundary = index === 0 || target[index - 1] === " ";
      queryIndex++;
    } else if (queryIndex > 0) gaps++;
    if (queryIndex === q.length) {
      const boundaryBonus = firstMatchAtBoundary ? 40 : 0;
      return 430 - Math.min(180, gaps * 8) + boundaryBonus;
    }
  }
  return null;
}

function scoreLevenshtein(q: string, target: string): number | null {
  if (Math.abs(target.length - q.length) > Math.max(2, Math.floor(q.length / 3))) return null;
  const distance = levenshtein(q, target);
  if (distance > Math.max(1, Math.floor(q.length / 4))) return null;
  return 300 - distance * 35;
}

function normalizedMatchScore(q: string, target: string): number | null {
  return (
    scoreExact(q, target) ??
    scorePrefix(q, target) ??
    scoreMultiWord(q, target) ??
    scoreIncludes(q, target) ??
    (q.length < 3 ? null : (scoreGapped(q, target) ?? scoreLevenshtein(q, target)))
  );
}

export function fuzzyMatchScore(query: string, candidate: string): number | null {
  const q = normalizeSearchText(query);
  const target = normalizeSearchText(candidate);
  if (!q || !target) return null;
  return normalizedMatchScore(q, target);
}

export function fuzzyMatchScorePreNormalized(
  normalizedQuery: string,
  normalizedCandidate: string
): number | null {
  if (!normalizedQuery || !normalizedCandidate) return null;
  return normalizedMatchScore(normalizedQuery, normalizedCandidate);
}
