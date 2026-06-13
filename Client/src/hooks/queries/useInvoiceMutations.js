import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

function invalidateInvoiceCaches(qc, invoiceId) {
  if (invoiceId) {
    qc.invalidateQueries({ queryKey: queryKeys.invoiceDetail(Number(invoiceId)) });
  }
  qc.invalidateQueries({ queryKey: ["vendor", "invoices"] });
  qc.invalidateQueries({ queryKey: queryKeys.vendorDashboardSummary });
  qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  qc.invalidateQueries({ queryKey: ["vendor", "pos"] });
  qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
  qc.invalidateQueries({ queryKey: ["admin", "po-balance"] });
}

export function useSubmitInvoiceMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId) => {
      const result = await vendorApi.submitInvoice(invoiceId);
      if (result.httpStatus === 202) {
        return { submitStatus: "processing", invoiceId, ...result };
      }
      return result;
    },
    onSuccess: (_data, invoiceId) => {
      invalidateInvoiceCaches(qc, invoiceId);
    },
  });
}

export function useCreateInvoiceDraftMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload) => vendorApi.createInvoiceDraft(payload),
    onSuccess: () => {
      invalidateInvoiceCaches(qc);
    },
  });
}

/** Create draft, submit, or append partial invoice in one flow (invoice wizard). */
export function usePersistInvoiceMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ payload, mode }) => {
      const result = await vendorApi.persistInvoice(payload, mode);
      const invoiceId = result?.invoice?.invoiceId;
      if (!invoiceId) {
        throw new Error("Invoice was saved but no ID was returned");
      }
      return { invoiceId, mode, partialAppend: result.partialAppend ?? false, regeneratedFromRejected: result.regeneratedFromRejected ?? false };
    },
    onSuccess: ({ invoiceId }) => {
      invalidateInvoiceCaches(qc, invoiceId);
    },
  });
}
