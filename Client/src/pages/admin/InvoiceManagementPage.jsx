import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseApiError } from "../../api/errors.js";
import { useAdminInvoicesQuery } from "../../hooks/queries/useAdminInvoicesQuery.js";
import { useAdminVendorsLookupQuery } from "../../hooks/queries/useAdminVendorsQuery.js";
import * as adminApi from "../../api/adminApi.js";
import { useUpdateInvoiceStatusMutation } from "../../hooks/queries/useAdminMutations.js";
import { AdminSAPPOBalanceSection } from "../../components/admin/AdminSAPPOBalanceSection.jsx";
import { AdminGenerateInvoiceModal } from "../../components/admin/AdminGenerateInvoiceModal.jsx";
import { DataTable } from "../../components/admin/DataTable.jsx";
import { InvoiceStatusBadge } from "../../components/vendor/InvoiceStatusBadge.jsx";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { useApp } from "../../hooks/useApp.js";
import { downloadCsv } from "../../lib/csvExport.js";
import { formatCurrency, formatDate } from "../../lib/format.js";
import { getInvoicePrintPath } from "../../lib/printUrls.js";

const STATUS_OPTIONS = [
  "",
  "draft",
  "submitted",
  "qr_generated",
  "verified",
  "rejected",
];

export function InvoiceManagementPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState([null]);
  const [vendorCode, setVendorCode] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);

  const statusMutation = useUpdateInvoiceStatusMutation();
  const pageSize = 20;
  const cursor = cursorStack[page - 1] ?? null;

  const { data, isLoading: loading, error, refetch } = useAdminInvoicesQuery({
    cursor,
    vendorCode,
    status,
    dateFrom,
    dateTo,
    pageSize,
  });
  const { data: vendorsData } = useAdminVendorsLookupQuery();

  const invoices = data?.invoices ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasMore = data?.pagination?.hasMore ?? false;
  const nextCursor = data?.pagination?.nextCursor ?? null;
  const vendors = vendorsData?.vendors ?? [];
  const errorMessage = error ? parseApiError(error).message : null;

  useEffect(() => {
    setCursorStack([null]);
    setPage(1);
  }, [vendorCode, status, dateFrom, dateTo]);

  const handleVerify = async (invoiceId) => {
    setActionLoading(invoiceId);
    try {
      await statusMutation.mutateAsync({
        invoiceId,
        payload: { status: "verified" },
      });
      showToast("Invoice verified", "success");
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim() || rejectLoading) return;
    setRejectLoading(true);
    setRejectError("");
    try {
      const result = await statusMutation.mutateAsync({
        invoiceId: rejectTarget.invoiceId,
        payload: { status: "rejected", reason: rejectReason.trim() },
      });
      const restored = result?.revertedLines?.length ?? 0;
      showToast(
        restored
          ? `Invoice rejected. PO quantities restored for ${restored} line(s).`
          : "Invoice rejected",
        "success"
      );
      setRejectTarget(null);
      setRejectReason("");
      setRejectError("");
    } catch (err) {
      const message = parseApiError(err).message;
      setRejectError(message);
      showToast(message, "error");
    } finally {
      setRejectLoading(false);
    }
  };

  const exportFiltered = async () => {
    try {
      const data = await adminApi.getAllInvoices({
        pageSize: 500,
        vendorCode: vendorCode || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const rows = data.invoices ?? [];
      downloadCsv(
        "invoices-export.csv",
        ["System ID", "Invoice #", "Vendor", "PO", "Date", "Amount", "Status", "Rejection reason"],
        rows.map((r) => [
          r.systemInvoiceId,
          r.invoiceNumber,
          r.vendorCode,
          r.poNumber,
          r.invoiceDate,
          r.totalAmount,
          r.status,
          r.rejectionReason ?? "",
        ])
      );
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    }
  };

  const goNext = () => {
    if (!hasMore || !nextCursor) return;
    setCursorStack((s) => [...s, nextCursor]);
    setPage((p) => p + 1);
  };

  const goPrev = () => {
    if (page <= 1) return;
    setCursorStack((s) => s.slice(0, -1));
    setPage((p) => p - 1);
  };

  return (
    <div className="space-y-6">
      <AdminSAPPOBalanceSection
        title="SAP PO lines (invoice source data)"
        description="Same SAP Excel data as Purchase Orders — plant, PO, vendor, material, quantities and balance available for invoicing."
        groupByPo
        showToolbar
        exportFilename="sap-po-invoice-source.csv"
        enableInvoiceGenerate
        onGenerateLines={setInvoiceLines}
        selectionResetKey={selectionResetKey}
      />

      <AdminGenerateInvoiceModal
        lines={invoiceLines}
        onClose={() => setInvoiceLines([])}
        onSuccess={() => {
          setInvoiceLines([]);
          setSelectionResetKey((key) => key + 1);
        }}
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-navy">Vendor invoices</h2>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Vendor</label>
          <select
            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value)}
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.vendorCode} value={v.vendorCode}>
                {v.vendorCode}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
          <select
            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
        </div>
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div className="flex items-end">
          <Button type="button" variant="secondary" size="sm" fullWidth onClick={exportFiltered}>
            Export Excel (CSV)
          </Button>
        </div>
        </div>
      </div>

      {errorMessage && !invoices.length ? (
        <ApiErrorState message={errorMessage} onRetry={() => refetch()} />
      ) : (
      <DataTable
        dense
        loading={loading}
        columns={[
          { key: "systemInvoiceId", label: "System ID", sortable: true },
          { key: "invoiceNumber", label: "Invoice #", sortable: true, filterable: true },
          { key: "vendorCode", label: "Vendor", sortable: true },
          { key: "poNumber", label: "PO", sortable: true },
          { key: "invoiceDate", label: "Date", sortable: true },
          { key: "totalAmount", label: "Amount", sortable: true },
          { key: "status", label: "Status", sortable: true },
          { key: "rejectionReason", label: "Rejection reason", filterable: true },
          { key: "actions", label: "Actions" },
        ]}
        data={invoices}
        exportFilename="invoices.csv"
        pagination={{
          page,
          pageSize,
          totalCount,
          hasMore,
          loading,
          onPrevious: goPrev,
          onNext: goNext,
        }}
        renderRow={(row) => {
          const canAct = ["submitted", "qr_generated"].includes(row.status);
          return (
            <tr key={row.invoiceId} className="hover:bg-slate-50/80">
              <td className="px-3 py-2 font-mono text-xs">{row.systemInvoiceId}</td>
              <td className="px-3 py-2 text-xs">{row.invoiceNumber}</td>
              <td className="px-3 py-2 text-xs">{row.vendorCode}</td>
              <td className="px-3 py-2 text-xs">{row.poNumber}</td>
              <td className="px-3 py-2 text-xs">{formatDate(row.invoiceDate)}</td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {formatCurrency(row.totalAmount, row.currency)}
              </td>
              <td className="px-3 py-2">
                <InvoiceStatusBadge status={row.status} />
              </td>
              <td className="px-3 py-2 text-xs">
                {row.status === "rejected" && row.rejectionReason ? (
                  <p className="max-w-[14rem] text-red-700" title={row.rejectionReason}>
                    {row.rejectionReason}
                  </p>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {["qr_generated", "verified", "submitted"].includes(row.status) && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        navigate(getInvoicePrintPath(row.invoiceId, false, { admin: true }))
                      }
                    >
                      PDF
                    </Button>
                  )}
                  {canAct ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        loading={actionLoading === row.invoiceId}
                        onClick={() => handleVerify(row.invoiceId)}
                      >
                        Verify
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setRejectTarget(row);
                          setRejectReason("");
                          setRejectError("");
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  ) : !["qr_generated", "verified", "submitted"].includes(row.status) ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        }}
      />
      )}

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          if (rejectLoading) return;
          setRejectTarget(null);
          setRejectReason("");
          setRejectError("");
        }}
        title="Reject invoice"
      >
        <p className="mb-2 text-sm text-slate-600">
          Rejecting {rejectTarget?.invoiceNumber}. Reason is required.
        </p>
        <textarea
          className="w-full rounded-lg border border-slate-200 p-2 text-sm"
          rows={3}
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value);
            if (rejectError) setRejectError("");
          }}
          placeholder="Rejection reason…"
        />
        {rejectError ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {rejectError}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={rejectLoading}
            onClick={() => {
              setRejectTarget(null);
              setRejectReason("");
              setRejectError("");
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={rejectLoading}
            disabled={!rejectReason.trim() || rejectLoading}
            onClick={handleReject}
          >
            Reject
          </Button>
        </div>
      </Modal>
    </div>
  );
}
