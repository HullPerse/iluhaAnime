export interface CollisionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function intersectsBox(a: CollisionBox, b: CollisionBox): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

export function containsBox(a: CollisionBox, b: CollisionBox): boolean {
  return a.minX <= b.minX && a.minY <= b.minY && b.maxX <= a.maxX && b.maxY <= a.maxY;
}
