import { cn } from "../../../lib/cn.js";
import { formatCurrency } from "../../../lib/format.js";
import { validateInvoiceLineQty } from "../../../validation/invoiceSchemas.js";

/**
 * @param {object} props
 * @param {Array<object>} props.lines
 * @param {boolean} [props.highlightIssues]
 */
export function InvoiceLinesReadOnly({ lines, highlightIssues = false }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">Invoice line items</caption>
        <thead className="bg-slate-50">
          <tr>
            {[
              "PO Line",
              "Material",
              "Description",
              "Pending",
              "Invoice Qty",
              "Unit Price",
              "Amount",
              "UOM",
              "Storage",
            ].map(
              (h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line) => {
            const muted = line.isDisabled || line.pendingQty <= 0;
            const check = validateInvoiceLineQty(line);
            const hasIssue = highlightIssues && !muted && !check.valid;
            const qty = Number(line.invoiceQty);
            const unitPrice = Number(line.unitPrice ?? 0);
            const lineAmount =
              !Number.isNaN(qty) && qty > 0 ? Math.round(qty * unitPrice * 100) / 100 : 0;

            return (
              <tr
                key={line.poLineNo}
                className={cn(
                  muted && "text-slate-400 bg-slate-50/80",
                  hasIssue && "bg-red-50"
                )}
              >
                <td className="px-3 py-2">{line.poLineNo}</td>
                <td className="px-3 py-2 font-mono text-xs">{line.materialCode}</td>
                <td className="px-3 py-2">{line.materialDescription}</td>
                <td className="px-3 py-2 tabular-nums">{line.pendingQty}</td>
                <td
                  className={cn(
                    "px-3 py-2 tabular-nums font-medium",
                    hasIssue && "text-red-700"
                  )}
                >
                  {line.invoiceQty || "—"}
                  {hasIssue && (
                    <span className="block text-xs font-normal text-red-600">
                      {check.message}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatCurrency(unitPrice)}</td>
                <td className="px-3 py-2 tabular-nums font-medium">{formatCurrency(lineAmount)}</td>
                <td className="px-3 py-2">{line.uom}</td>
                <td className="px-3 py-2">{line.storageLocationCode || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
