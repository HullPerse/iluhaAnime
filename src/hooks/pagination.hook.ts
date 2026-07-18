import { useMemo } from "react";

export interface PaginationResult {
  total: number;
  from: number;
  to: number;
  lastPage: number;
  page: number;
  setPage: (page: number) => void;
}

export function usePagination(
  totalItems: number,
  pageSize: number,
  page: number,
  setPage: (page: number) => void,
): PaginationResult {
  const lastPage = Math.max(1, Math.ceil(totalItems / pageSize));
  const total = totalItems;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return useMemo(
    () => ({
      total,
      from,
      to,
      lastPage,
      page: Math.min(page, lastPage),
      setPage: (p: number) => setPage(Math.max(1, Math.min(p, lastPage))),
    }),
    [total, from, to, lastPage, page, setPage],
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
