import { cn } from "../../../lib/cn.js";
import { formatCurrency } from "../../../lib/format.js";
import { validateInvoiceLineQty } from "../../../validation/invoiceSchemas.js";

/**
 * @param {object} props
 * @param {Array<object>} props.lines
 * @param {Record<string, unknown>} props.register
 * @param {object} props.errors
 * @param {(index: number) => void} [props.onQtyBlur]
 * @param {(index: number, value: string) => void} props.onQtyChange
 * @param {boolean} [props.selectable]
 * @param {(index: number, selected: boolean) => void} [props.onLineSelect]
 */
export function InvoiceLineItemsEditor({
  lines,
  register,
  errors,
  onQtyBlur,
  onQtyChange,
  selectable = false,
  onLineSelect,
}) {
  const lineErrors = errors?.lines;

  let invoiceTotal = 0;
  lines.forEach((line) => {
    if (!line.isDisabled && line.selected) {
      const q = Number(line.invoiceQty);
      const price = Number(line.unitPrice ?? 0);
      if (!Number.isNaN(q) && q > 0) {
        invoiceTotal += q * price;
      }
    }
  });

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Invoice line items</caption>
          <thead className="bg-slate-50">
            <tr>
              {selectable && (
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Include
                </th>
              )}
              {[
                "PO Line",
                "Material",
                "Description",
                "Available",
                "Invoice Qty",
                "Unit Price",
                "Amount",
                "UOM",
                "Storage",
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {lines.map((line, index) => {
              const muted = line.isDisabled || line.pendingQty <= 0;
              const rowActive = selectable ? line.selected && !muted : !muted;
              const liveCheck = validateInvoiceLineQty(line);
              const fieldError = lineErrors?.[index]?.invoiceQty?.message;
              const hasError = rowActive && (!liveCheck.valid || fieldError);
              const borderClass = hasError ? "border-red-400 ring-1 ring-red-200" : "border-slate-200";
              const qty = Number(line.invoiceQty);
              const unitPrice = Number(line.unitPrice ?? 0);
              const lineAmount =
                !Number.isNaN(qty) && qty > 0 ? Math.round(qty * unitPrice * 100) / 100 : 0;

              return (
                <tr
                  key={line.poLineNo}
                  className={cn((muted || (selectable && !line.selected)) && "bg-slate-50/90 text-slate-400")}
                >
                  {selectable && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                        disabled={muted}
                        checked={Boolean(line.selected)}
                        aria-label={`Include line ${line.poLineNo}`}
                        onChange={(e) => onLineSelect?.(index, e.target.checked)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">{line.poLineNo}</td>
                  <td className="px-3 py-2 font-mono text-xs">{line.materialCode}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate" title={line.materialDescription}>
                    {line.materialDescription}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{line.pendingQty}</td>
                  <td className="px-3 py-2">
                    <div>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max={line.pendingQty}
                        disabled={muted || (selectable && !line.selected)}
                        aria-invalid={hasError ? "true" : undefined}
                        aria-describedby={
                          hasError ? `line-qty-error-${index}` : undefined
                        }
                        className={cn(
                          "w-24 rounded-md border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-slate-100 disabled:cursor-not-allowed",
                          borderClass,
                          !muted && "text-navy"
                        )}
                        {...register(`lines.${index}.invoiceQty`, {
                          onChange: (e) => onQtyChange(index, e.target.value),
                          onBlur: () => onQtyBlur?.(index),
                        })}
                      />
                      {hasError && (
                        <p
                          id={`line-qty-error-${index}`}
                          role="alert"
                          className="mt-1 text-xs text-red-600 max-w-[140px]"
                        >
                          {fieldError || liveCheck.message}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(unitPrice)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">
                    {formatCurrency(lineAmount)}
                  </td>
                  <td className="px-3 py-2">{line.uom}</td>
                  <td className="px-3 py-2">{line.storageLocationCode || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Invoice total:{" "}
        <span className="font-semibold text-navy tabular-nums">{formatCurrency(invoiceTotal)}</span>
      </p>
    </div>
  );
}
