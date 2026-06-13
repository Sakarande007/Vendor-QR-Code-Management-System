import { useCallback, useEffect, useRef, useState } from "react";
import { parseApiError } from "../api/errors.js";

/**
 * Wraps an async API call with loading/error state and abort support.
 * @template T
 * @param {() => Promise<T>} apiFn
 * @param {object} [options]
 * @param {boolean} [options.immediate=true] Run on mount
 * @param {unknown[]} [options.deps] Dependency array for immediate execution
 */
export function useApi(apiFn, options = {}) {
  const { immediate = true, deps = [] } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const apiFnRef = useRef(apiFn);
  apiFnRef.current = apiFn;

  const execute = useCallback(async (...args) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await apiFnRef.current(...args);

      if (!controller.signal.aborted) {
        setData(result);
      }

      return result;
    } catch (err) {
      if (!controller.signal.aborted) {
        const parsed = parseApiError(err);
        setError(parsed.message);
      }
      throw err;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (immediate) {
      execute().catch(() => {});
    }

    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, execute, reset, setData };
}
