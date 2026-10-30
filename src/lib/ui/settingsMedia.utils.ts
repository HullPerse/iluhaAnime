export function parseExtensions(raw: string): string[] | null {
  const list = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((part) => part.trim().toLowerCase().replace(/^\.+/, ""))
        .filter(Boolean)
    ),
  ];
  return list.length > 0 ? list : null;
}
