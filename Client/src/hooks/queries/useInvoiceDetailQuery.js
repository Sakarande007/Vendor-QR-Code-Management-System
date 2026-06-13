import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

/**
 * @param {number|string} invoiceId
 * @param {object} [options]
 */
export function useInvoiceDetailQuery(invoiceId, options = {}) {
  const id = Number(invoiceId);

  return useQuery({
    queryKey: queryKeys.invoiceDetail(id),
    queryFn: () => vendorApi.getInvoiceDetails(id),
    enabled: Number.isFinite(id) && id > 0,
    ...options,
  });
}

/**
 * Poll while async submit is processing (INVOICE_QUEUE_ENABLED on server).
 */
export function useInvoiceDetailPolling(invoiceId) {
  return useInvoiceDetailQuery(invoiceId, {
    refetchInterval: (query) => {
      const status = query.state.data?.submitStatus;
      return status === "processing" ? 2000 : false;
    },
  });
}

export function useInvalidateInvoiceDetail() {
  const qc = useQueryClient();
  return (invoiceId) =>
    qc.invalidateQueries({ queryKey: queryKeys.invoiceDetail(Number(invoiceId)) });
}
