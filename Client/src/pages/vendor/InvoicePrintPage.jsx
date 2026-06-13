import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { InvoicePrintDocument } from "../../components/vendor/invoice/InvoicePrintDocument.jsx";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { PageSpinner } from "../../components/ui/Spinner.jsx";
import { useInvoicePrintQuery } from "../../hooks/queries/useInvoicePrintQuery.js";
import { usePrintDocument } from "../../hooks/usePrint.js";
import "./InvoicePrint.css";

export function InvoicePrintPage() {
  const { invoiceId } = useParams();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get("auto") === "1";
  const adminPrint = isAdmin || location.pathname.startsWith("/admin/");
  const closePath = adminPrint ? "/admin/invoices" : `/invoices/${invoiceId}`;

  const contentRef = useRef(null);
  const {
    isLoading: loading,
    error: queryError,
    data,
    refetch: reload,
  } = useInvoicePrintQuery(invoiceId);
  const error = queryError
    ? queryError.message || "Failed to load invoice"
    : null;

  const documentTitle = data?.invoice?.systemInvoiceId
    ? `Tax Invoice ${data.invoice.systemInvoiceId}`
    : "Tax Invoice";

  const { print, downloadPdf, isPrinting } = usePrintDocument(contentRef, {
    documentTitle,
  });

  useEffect(() => {
    if (!autoPrint || loading || !data) return;

    const timer = window.setTimeout(() => {
      print();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [autoPrint, loading, data, print]);

  if (loading) {
    return (
      <div className="invoice-print-page">
        <PageSpinner message="Preparing invoice for print…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="invoice-print-page p-6">
        <ApiErrorState message={error || "Invoice not found"} onRetry={reload} />
        <p className="mt-4 text-center text-sm">
          <Link to={closePath} className="text-accent underline">
            {adminPrint ? "Back to invoices" : "Back to invoice"}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="invoice-print-page">
      <div className="print-toolbar no-print" role="toolbar" aria-label="Print actions">
        <p className="text-sm font-medium">Invoice print preview — {data.invoice.systemInvoiceId}</p>
        <div className="print-toolbar__actions">
          <button
            type="button"
            className="print-toolbar__primary"
            onClick={() => print()}
            disabled={isPrinting}
          >
            {isPrinting ? "Printing…" : "Print Invoice"}
          </button>
          <button
            type="button"
            className="print-toolbar__secondary"
            onClick={() => downloadPdf()}
            disabled={isPrinting}
            title="Opens print dialog — choose Save as PDF or Microsoft Print to PDF"
          >
            Save as PDF
          </button>
          <Link
            to={closePath}
            className="print-toolbar__ghost"
            style={{ display: "inline-flex", alignItems: "center", padding: "0.5rem 1rem" }}
          >
            Close
          </Link>
        </div>
      </div>

      <div className="print-preview-wrap">
        <div ref={contentRef} id="invoice-print-root">
          <InvoicePrintDocument data={data} />
        </div>
      </div>
    </div>
  );
}
