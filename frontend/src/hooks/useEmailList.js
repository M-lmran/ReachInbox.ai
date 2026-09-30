import { useCallback, useEffect, useState } from "react";
import { emailService } from "@/services/emailService";

export function useEmailList(mode, { limit = 10 } = {}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);

  const fetcher = mode === "sent" ? emailService.getSentEmails : emailService.getScheduledEmails;

  const load = useCallback(
    async (nextPage = page, showLoader = true) => {
      if (showLoader) setLoading(true);
      setError(false);
      try {
        const res = await fetcher({ page: nextPage, limit });
        setItems(res.data);
        setPagination(res.pagination);
      } catch (_e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, limit, mode]
  );

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, mode]);

  return {
    items,
    pagination,
    loading,
    error,
    page,
    setPage,
    refresh: () => load(page, false),
    reload: () => load(page, true),
  };
}
