import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export interface ApiState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
  /** Reload (shows the pull-to-refresh spinner, keeps current data). */
  refresh: () => Promise<void>;
  /** Retry after an error (shows the full loading state). */
  retry: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Load data for a screen. `deps` re-run the loader; `reloadOnFocus` refreshes
 * silently when the screen regains focus (e.g. after finishing a quiz).
 */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = [], opts: { reloadOnFocus?: boolean } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reqId = useRef(0);
  const mounted = useRef(true);
  const firstFocus = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++reqId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await loaderRef.current();
      if (!mounted.current || id !== reqId.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (!mounted.current || id !== reqId.current) return;
      // keep showing stale data on a silent/refresh failure, but surface the error
      setError(e);
    } finally {
      if (mounted.current && id === reqId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (opts.reloadOnFocus) void run('silent');
    }, [opts.reloadOnFocus, run]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => run('refresh'),
    retry: () => run('initial'),
    setData,
  };
}
