export function uniqueTitles(title: string, altTitles: string[]): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const raw of [title, ...altTitles]) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(value);
  }
  return rows;
}
