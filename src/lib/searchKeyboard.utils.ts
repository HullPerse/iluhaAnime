const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];

const COORDS = new Map<string, { x: number; y: number }>();
for (let y = 0; y < ROWS.length; y++) {
  const row = ROWS[y] ?? "";
  for (let x = 0; x < row.length; x++) {
    COORDS.set(row[x] ?? "", { x, y });
  }
}

const ADJACENT_MAX = 1.5;
const ADJACENT_COST = 0.4;

function coordOf(char: string): { x: number; y: number } | null {
  return COORDS.get(char.toLowerCase()) ?? null;
}

export function isKeyboardNeighbor(left: string, right: string): boolean {
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const a = coordOf(left);
  const b = coordOf(right);
  if (!a || !b) return false;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy) <= ADJACENT_MAX;
}

export function keyboardSubstitutionCost(left: string, right: string): number {
  if (left === right) return 0;
  if (left.toLowerCase() === right.toLowerCase()) return 0;
  return isKeyboardNeighbor(left, right) ? ADJACENT_COST : 1;
}

export function keyboardWordDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] ?? 0;
      const sub = diagonal + keyboardSubstitutionCost(a[i - 1] ?? "", b[j - 1] ?? "");
      const next = Math.min(above + 1, (prev[j - 1] ?? 0) + 1, sub);
      diagonal = above;
      prev[j] = next;
    }
  }
  return prev[b.length] ?? 0;
}
