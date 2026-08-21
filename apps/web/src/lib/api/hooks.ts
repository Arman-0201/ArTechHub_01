'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { PaginationMeta } from '@academy/types';
import { api, apiFetch, apiRequest } from './client';
import type { ApiError } from './types';

/**
 * Query helpers for the admin panel.
 *
 * The admin screens are genuinely client-owned — filters, pagination and
 * mutations all change without a navigation — so TanStack Query manages that
 * state here. Public pages stay server-rendered and do not use these.
 */

export interface ListResult<T> {
  items: T[];
  meta: PaginationMeta | undefined;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Stable cache key: the path plus its normalised query. */
function listKey(path: string, params?: QueryParams) {
  const normalised = Object.fromEntries(
    Object.entries(params ?? {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return [path, normalised] as const;
}

export function useApiList<T>(
  path: string,
  params?: QueryParams,
  options?: Partial<UseQueryOptions<ListResult<T>, ApiError>>,
) {
  return useQuery<ListResult<T>, ApiError>({
    queryKey: listKey(path, params),
    queryFn: async () => {
      const result = await apiRequest<T[]>(path, { query: params });
      return { items: result.data, meta: result.meta };
    },
    placeholderData: (previous) => previous,
    ...options,
  });
}

export function useApiResource<T>(
  path: string | null,
  options?: Partial<UseQueryOptions<T, ApiError>>,
) {
  return useQuery<T, ApiError>({
    queryKey: [path],
    queryFn: () => api.get<T>(path as string),
    // A null path means "not ready yet" — do not fire a request for `/null`.
    enabled: Boolean(path),
    ...options,
  });
}

/**
 * Mutation that invalidates the given key prefixes on success, so lists and
 * detail views refresh without every call site remembering to do it.
 */
export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidateKeys: string[] = [],
  options?: Partial<UseMutationOptions<TData, ApiError, TVariables>>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    ...options,
    onSuccess: async (data, variables, context) => {
      await Promise.all(
        invalidateKeys.map((key) =>
          queryClient.invalidateQueries({
            predicate: (query) => String(query.queryKey[0] ?? '').startsWith(key),
          }),
        ),
      );
      await options?.onSuccess?.(data, variables, context, { client: queryClient, meta: undefined });
    },
  });
}

export { api, apiFetch };
