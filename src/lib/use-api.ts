import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { errorMessage } from './api';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Runs an async loader when the dependencies change. Cancels stale responses. */
export function useApi<T>(loader: () => Promise<T>, deps: DependencyList): ApiState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loader()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error: errorMessage(error), loading: false });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
