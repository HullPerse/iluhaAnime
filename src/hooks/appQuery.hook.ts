import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  DefaultError,
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

import { QUERY_PRESETS } from "@/config/store/query.config";
import type { QueryPresetName } from "@/config/store/query.config";

export type { QueryPresetName };

export function useAppQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(preset: QueryPresetName, options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  return useQuery({ ...QUERY_PRESETS[preset], ...options });
}

export function useAppInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  preset: QueryPresetName,
  options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
) {
  return useInfiniteQuery({ ...QUERY_PRESETS[preset], ...options });
}
