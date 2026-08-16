export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safeSize;
  return items.slice(start, start + safeSize);
}
