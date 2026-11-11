import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, errorMessage, type Query } from './client';
import { useToast } from '../components/Toast';

/** Query key convention: [path, query?]. Invalidate by path prefix. */
export function useGet<T>(path: string | null, query?: Query, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: [path, query ?? {}],
    queryFn: ({ signal }) => api.get<T>(path!, query, signal),
    enabled: Boolean(path) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    ...options,
  } as UseQueryOptions<T>);
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: string[]) =>
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === 'string' && prefixes.some((p) => k.startsWith(p));
      },
    });
}

interface MutateOptions<TData> {
  /** Path prefixes whose queries are refetched on success. */
  invalidate?: string[];
  success?: string | ((data: TData) => string);
  /** Show failure as a toast (default true). Forms that render errors inline pass false. */
  toastError?: boolean;
  onSuccess?: (data: TData) => void;
}

export function useMutate<TVars, TData = unknown>(fn: (vars: TVars) => Promise<TData>, opts: MutateOptions<TData> = {}) {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: async (data) => {
      if (opts.invalidate?.length) await invalidate(...opts.invalidate);
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(data) : opts.success);
      opts.onSuccess?.(data);
    },
    onError: (e) => {
      if (opts.toastError !== false) toast.error(errorMessage(e));
    },
  });
}
