/** Axis-aligned bounding box; the canonical shape every collision query funnels through. */
export interface CollisionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Strict area overlap (DE-9IM `intersects` minus touching): boxes sharing
 * only an edge or a corner do NOT intersect. Settled neighbors sit exactly
 * edge-to-edge, so touching must read as resolved, not colliding. (RBush
 * counts touching as intersecting; that convention would keep a resolved
 * layout "colliding" forever here.)
 */
export function intersectsBox(a: CollisionBox, b: CollisionBox): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

/** DE-9IM `contains`: every edge of `b` sits inside or on the edge of `a`. */
export function containsBox(a: CollisionBox, b: CollisionBox): boolean {
  return a.minX <= b.minX && a.minY <= b.minY && b.maxX <= a.maxX && b.maxY <= a.maxY;
}
