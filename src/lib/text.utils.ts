const TAG_RX = /<[^>]*>/g;
const BLOCK_RX = /<\/?(?:br|p|div|li|ul|ol|h[1-6])\s*\/?>/gi;
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function flattenMarkup(html: string | null | undefined): string {
  if (html == null) return "";
  const withBreaks = html.replace(BLOCK_RX, "\n");
  const stripped = withBreaks.replace(TAG_RX, "");
  const decoded = Object.entries(ENTITIES).reduce(
    (text, [entity, replacement]) => text.replaceAll(entity, replacement),
    stripped
  );
  return decoded
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}
