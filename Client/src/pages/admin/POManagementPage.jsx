import { useCallback, useState } from "react";
import {
  useAdminUploadBatch,
  useAdminUploadHistory,
} from "../../hooks/queries/useAdminPOBalance.js";
import { useUploadPOExcelMutation } from "../../hooks/queries/useAdminMutations.js";
import { AdminSAPPOBalanceSection } from "../../components/admin/AdminSAPPOBalanceSection.jsx";
import { POExcelUploadModal } from "../../components/admin/POExcelUploadModal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { useApp } from "../../hooks/useApp.js";
import { formatDate } from "../../lib/format.js";

export function POManagementPage() {
  const { showToast } = useApp();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyBatchId, setHistoryBatchId] = useState(null);

  const uploadMutation = useUploadPOExcelMutation();
  const { data: historyData } = useAdminUploadHistory({ pageSize: 5 });
  const { data: batchDetail } = useAdminUploadBatch(historyBatchId);

  const uploadHistory = historyData?.batches ?? [];
  const lastFailedBatch = uploadHistory.find((b) => b.errorRows > 0);

  const handleUpload = useCallback(
    async (file, onProgress) => {
      const body = await uploadMutation.mutateAsync({ file, onProgress });
      showToast(body.message ?? "SAP Excel upload completed", "success");
      return body;
    },
    [uploadMutation, showToast]
  );

  return (
    <div className="space-y-4">
      {lastFailedBatch && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Last upload <strong>{lastFailedBatch.fileName}</strong> had{" "}
          <strong>{lastFailedBatch.errorRows}</strong> row errors.{" "}
          <button
            type="button"
            className="font-medium text-accent underline"
            onClick={() => setHistoryBatchId(lastFailedBatch.batchId)}
          >
            View details
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-2xl">
          Upload SAP BAR-code Excel (SR.NO, Vendor Code, PO Number, PO Date, Plant, PO Line
          Number, Material Code, Item Description, PO Qty, UOM, Item Store Location, Balance PO
          Qty). Unknown vendors and plants are created automatically.
        </p>
        <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
          Upload PO Excel
        </Button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
          Upload history (last 5)
        </h3>
        {uploadHistory.length === 0 ? (
          <p className="text-xs text-slate-500">No Excel uploads recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {uploadHistory.map((h) => (
              <li key={h.batchId}>
                <button
                  type="button"
                  className="flex w-full flex-wrap justify-between gap-2 py-2 text-left hover:bg-slate-50 rounded px-1"
                  onClick={() => setHistoryBatchId(h.batchId)}
                >
                  <span>{formatDate(h.uploadedAt)}</span>
                  <span className="font-medium">{h.fileName}</span>
                  <span>
                    {h.totalRows} rows · +{h.insertedRows} / ~{h.updatedRows}
                    {h.errorRows > 0 && (
                      <span className="ml-2 text-red-600">{h.errorRows} errors</span>
                    )}
                  </span>
                  <span className="capitalize text-slate-500">{h.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdminSAPPOBalanceSection
        title="Uploaded PO lines"
        groupByPo
        showToolbar
        exportFilename="sap-po-lines.csv"
        emptyMessage="No PO lines yet. Upload a BAR-code Excel file above."
      />

      <POExcelUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
      />

      <Modal
        open={Boolean(historyBatchId)}
        onClose={() => setHistoryBatchId(null)}
        title="Upload batch details"
        className="max-w-2xl"
      >
        {batchDetail?.batch ? (
          <BatchDetails batch={batchDetail.batch} />
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </Modal>
    </div>
  );
}

/**
 * @param {{ batch: object }} props
 */
function BatchDetails({ batch }) {
  const errors = batch.errors ?? [];
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <dt className="text-slate-500">File</dt>
        <dd>{batch.fileName}</dd>
        <dt className="text-slate-500">Rows</dt>
        <dd>
          {batch.totalRows} total · {batch.insertedRows} inserted · {batch.updatedRows} updated ·{" "}
          {batch.errorRows} errors
        </dd>
      </dl>
      {errors.length > 0 ? (
        <div className="max-h-64 overflow-auto rounded border border-red-200 text-xs">
          <table className="min-w-full">
            <thead className="bg-red-50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">Row</th>
                <th className="px-2 py-1 text-left">Field</th>
                <th className="px-2 py-1 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-t border-red-100 text-red-800">
                  <td className="px-2 py-1">{e.row}</td>
                  <td className="px-2 py-1 font-mono">{e.field}</td>
                  <td className="px-2 py-1">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No row-level errors recorded.</p>
      )}
    </div>
  );
}
