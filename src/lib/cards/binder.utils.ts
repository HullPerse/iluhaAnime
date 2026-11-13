export const BINDER_COLUMNS = 4;
export const BINDER_ROWS = 3;
export const BINDER_PAGE_SIZE = BINDER_COLUMNS * BINDER_ROWS;

export interface BinderPage<T> {
  slots: (T | null)[];
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
}

/** Pads one binder page to twelve pockets and clamps the requested page. */
export function buildBinderPage<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = BINDER_PAGE_SIZE
): BinderPage<T> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("binder page size must be a positive integer");
  }
  const total = items.length;
  const pageCount = Math.ceil(total / pageSize);
  const page = pageCount === 0 ? 0 : Math.min(Math.max(0, requestedPage), pageCount - 1);
  const start = page * pageSize;
  const slots = Array.from({ length: pageSize }, (_, index) => items[start + index] ?? null);
  return {
    slots,
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

/** Stable pocket index for a 4x3 page. */
export function binderPocketIndex(column: number, row: number): number {
  return row * BINDER_COLUMNS + column;
}
