import { useCallback, useState } from "react";

/**
 * Cursor-based pagination state for list endpoints.
 * @param {object} [initialParams]
 */
export function usePagination(initialParams = {}) {
  const [params, setParams] = useState({ pageSize: 20, ...initialParams });
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    pageSize: 20,
    hasMore: false,
    nextCursor: null,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * @param {() => Promise<{ items: unknown[], pagination: object, totalCount?: number }>} fetchPage
   * @param {boolean} [append=false]
   */
  const fetchPage = useCallback(
    async (fetchPageFn, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchPageFn();

        setItems((prev) =>
          append ? [...prev, ...(result.items ?? [])] : result.items ?? []
        );
        setPagination(
          result.pagination ?? { pageSize: 20, hasMore: false, nextCursor: null }
        );
        if (result.totalCount !== undefined) {
          setTotalCount(result.totalCount);
        }
      } catch (err) {
        setError(err?.userMessage || err?.message || "Failed to load data");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadMore = useCallback(
    async (fetchPageFn) => {
      if (!pagination.hasMore || !pagination.nextCursor) {
        return;
      }

      const nextParams = { ...params, cursor: pagination.nextCursor };
      await fetchPage(
        () => fetchPageFn(nextParams),
        true
      );
      setParams(nextParams);
    },
    [params, pagination, fetchPage]
  );

  const reset = useCallback((newParams = {}) => {
    setParams({ pageSize: 20, ...newParams });
    setItems([]);
    setPagination({ pageSize: 20, hasMore: false, nextCursor: null });
    setTotalCount(0);
    setError(null);
  }, []);

  const updateParams = useCallback((updates) => {
    setParams((prev) => ({ ...prev, ...updates, cursor: undefined }));
    setItems([]);
    setPagination({ pageSize: 20, hasMore: false, nextCursor: null });
  }, []);

  return {
    params,
    items,
    pagination,
    totalCount,
    loading,
    error,
    fetchPage,
    loadMore,
    reset,
    updateParams,
    setItems,
  };
}
