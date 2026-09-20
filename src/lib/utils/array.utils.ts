export function uniqueById<T>(items: T[], idOf: (item: T) => number): T[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
