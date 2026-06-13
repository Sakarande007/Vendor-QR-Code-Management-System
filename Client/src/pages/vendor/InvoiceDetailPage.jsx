import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as qrApi from "../../api/qrApi.js";
import { parseApiError } from "../../api/errors.js";
import { useApp } from "../../hooks/useApp.js";
import {
  useInvoiceDetailPolling,
} from "../../hooks/queries/useInvoiceDetailQuery.js";
import { useSubmitInvoiceMutation } from "../../hooks/queries/useInvoiceMutations.js";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { InvoiceLinesReadOnly } from "../../components/vendor/invoice/InvoiceLinesReadOnly.jsx";
import { InvoiceStatusBadge } from "../../components/vendor/InvoiceStatusBadge.jsx";
import { ConfirmSubmitModal } from "../../components/vendor/invoice/ConfirmSubmitModal.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { QrImage } from "../../components/ui/QrImage.jsx";
import { PageSpinner } from "../../components/ui/Spinner.jsx";
import { formatCurrency, formatDate } from "../../lib/format.js";
import { openInvoicePrintTab } from "../../lib/printUrls.js";

function mapDetailLines(lines) {
  return (lines ?? []).map((line) => ({
    poLineNo: line.poLineNo,
    materialCode: line.materialCode,
    materialDescription: line.materialDescription,
    pendingQty: line.invoiceQty,
    invoiceQty: line.invoiceQty,
    uom: line.uom,
    storageLocationCode: line.storageLocationCode,
    isDisabled: false,
  }));
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useApp();
  const submitLockRef = useRef(false);

  const [qrUrl, setQrUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useInvoiceDetailPolling(invoiceId, undefined);

  const submitMutation = useSubmitInvoiceMutation();

  const invoice = data?.invoice;
  const submitStatus = data?.submitStatus;
  const isProcessing = submitStatus === "processing";

  const showQr =
    invoice &&
    (invoice.status === "qr_generated" ||
      invoice.status === "verified" ||
      invoice.qrGenerated);

  useEffect(() => {
    if (!showQr || !invoiceId) {
      setQrUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl = null;

    (async () => {
      setQrLoading(true);
      try {
        const blob = await qrApi.getQRImage(Number(invoiceId));
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setQrUrl(objectUrl);
      } catch {
        if (!cancelled) setQrUrl(null);
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [showQr, invoiceId]);

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    try {
      const result = await submitMutation.mutateAsync(Number(invoiceId));
      if (result?.submitStatus === "processing") {
        showToast("Invoice submission is processing…", "info");
      } else {
        showToast("Invoice submitted and QR code generated.", "success");
      }
      setConfirmOpen(false);
      refetch();
    } catch (err) {
      showToast(parseApiError(err).message, "error");
      submitLockRef.current = false;
    }
  };

  if (isLoading && !data) {
    return <PageSpinner message="Loading invoice…" />;
  }

  if (isError && !data) {
    return (
      <ApiErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  if (!invoice) {
    return null;
  }

  const lineTotal = (data.lines ?? []).reduce(
    (sum, l) => sum + Number(l.invoiceQty) * Number(l.unitPrice ?? 0),
    0
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:max-w-none">
      <Link
        to="/invoices"
        className="inline-flex text-sm font-medium text-accent hover:text-accent-hover print:hidden"
      >
        ← Back to invoices
      </Link>

      {isProcessing && (
        <Alert variant="info" title="Processing">
          Your invoice is being submitted. This page will update automatically.
        </Alert>
      )}

      {data.submitError && (
        <Alert variant="error" title="Submission failed">
          {data.submitError}
        </Alert>
      )}

      {invoice.status === "rejected" && invoice.rejectionReason && (
        <Alert variant="error" title="Invoice rejected">
          {invoice.rejectionReason}
        </Alert>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">System ID</p>
            <h2 className="font-mono text-xl font-semibold text-navy">{invoice.systemInvoiceId}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Vendor invoice #{invoice.invoiceNumber}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="text-slate-500">PO Number</dt>
            <dd className="font-mono font-medium">
              <Link to={`/pos/${encodeURIComponent(invoice.poNumber)}`} className="text-accent">
                {invoice.poNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Invoice date</dt>
            <dd className="font-medium">{formatDate(invoice.invoiceDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Lines</dt>
            <dd className="font-medium">{data.lines?.length ?? 0}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Line value</dt>
            <dd className="font-medium">{formatCurrency(lineTotal)}</dd>
          </div>
        </dl>

        {invoice.status === "draft" && !isProcessing && (
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={submitMutation.isPending}
            >
              Submit & Generate QR
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/invoices/create?po=${encodeURIComponent(invoice.poNumber)}`)}
            >
              Create another
            </Button>
          </div>
        )}
      </section>

      <section className="print:hidden">
        <h3 className="mb-3 text-base font-semibold text-navy">Line items</h3>
        <InvoiceLinesReadOnly lines={mapDetailLines(data.lines)} />
      </section>

      {showQr && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
          <h3 className="text-base font-semibold text-navy">QR Code</h3>
          <div className="mt-6 flex justify-center">
            {qrLoading ? (
              <PageSpinner message="Loading QR code…" />
            ) : (
              <QrImage src={qrUrl} alt={`QR code for invoice ${invoice.systemInvoiceId}`} size={256} />
            )}
          </div>
          <Button
            type="button"
            className="mt-6"
            variant="secondary"
            onClick={() => openInvoicePrintTab(invoiceId, true)}
          >
            Print Invoice
          </Button>
        </section>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onClose={() => !submitMutation.isPending && setConfirmOpen(false)}
        onConfirm={handleSubmit}
        loading={submitMutation.isPending}
      />
    </div>
  );
}

