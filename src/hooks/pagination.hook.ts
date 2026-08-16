import { useMemo } from "react";

import type { PaginationResult } from "@/types";

export function usePagination(
  totalItems: number,
  pageSize: number,
  page: number,
  setPage: (page: number) => void
): PaginationResult {
  const lastPage = Math.max(1, Math.ceil(totalItems / pageSize));
  const total = totalItems;
  const safePage = Math.min(Math.max(1, page), lastPage);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return useMemo(
    () => ({
      from,
      lastPage,
      page: safePage,
      setPage: (p: number) => setPage(Math.max(1, Math.min(p, lastPage))),
      to,
      total,
    }),
    [total, from, to, lastPage, safePage, setPage]
  );
}
