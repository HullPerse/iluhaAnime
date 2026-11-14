export function cacheRate(stats: { hits: number; misses: number }): number {
  const total = stats.hits + stats.misses;
  return total === 0 ? 0 : Math.round((stats.hits / total) * 100);
}
