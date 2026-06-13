import { useQuery } from "@tanstack/react-query";
import * as vendorApi from "../../api/vendorApi.js";
import { queryKeys } from "../../lib/queryKeys.js";

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.vendorDashboardSummary,
    queryFn: async () => {
      const data = await vendorApi.getVendorDashboardSummary();
      const summary = data.summary ?? {};

      return {
        stats: {
          openPOs: summary.total_open_pos ?? 0,
          pendingInvoiceValue: Number(summary.pending_invoice_value ?? 0),
          invoicesThisMonth: summary.invoices_this_month ?? 0,
          qrGeneratedCount: summary.qr_generated_count ?? 0,
          draftInvoices: summary.pending_invoices ?? 0,
          openPoBalanceQty: Number(summary.total_balance_qty ?? 0),
        },
        recentInvoices: (data.recent_invoices ?? []).map((inv) => ({
          invoiceId: inv.invoice_id ?? inv.invoiceId,
          systemInvoiceId: inv.system_invoice_id ?? inv.systemInvoiceId,
          invoiceNumber: inv.invoice_number ?? inv.invoiceNumber,
          poNumber: inv.po_number ?? inv.poNumber,
          invoiceDate: inv.invoice_date ?? inv.invoiceDate,
          status: inv.status,
        })),
        recentPos: data.recent_pos ?? [],
      };
    },
    // Live dashboard still refreshes every 60s, but a stale window avoids
    // redundant refetches on rapid tab focus toggles, and we don't poll while
    // the tab is hidden.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
