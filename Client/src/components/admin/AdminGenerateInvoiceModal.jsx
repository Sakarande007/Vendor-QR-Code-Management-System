import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseApiError } from "../../api/errors.js";
import { useGenerateInvoiceFromPOLineMutation } from "../../hooks/queries/useAdminMutations.js";
import { useApp } from "../../hooks/useApp.js";
import { Button } from "../ui/Button.jsx";
import { Input } from "../ui/Input.jsx";
import { Modal } from "../ui/Modal.jsx";
import { formatCurrency, formatDate } from "../../lib/format.js";
import { todayInputDate } from "../../lib/dates.js";
import { getInvoicePrintPath } from "../../lib/printUrls.js";

/**
 * @param {object} row
 */
function lineKey(row) {
  return `${row.po_number}-${row.line_no}`;
}

/**
 * @param {string} value
 */
function parseQty(value) {
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {object} props
 * @param {object[]} props.lines
 * @param {() => void} props.onClose
 * @param {() => void} [props.onSuccess]
 */
export function AdminGenerateInvoiceModal({ lines, onClose, onSuccess }) {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const mutation = useGenerateInvoiceFromPOLineMutation();

  const [qtyByKey, setQtyByKey] = useState({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayInputDate());
  const [error, setError] = useState(null);

  const header = lines[0] ?? null;

  useEffect(() => {
    if (!lines.length) return;
    const initial = {};
    for (const row of lines) {
      initial[lineKey(row)] = "";
    }
    setQtyByKey(initial);
    setInvoiceNumber("");
    setInvoiceDate(todayInputDate());
    setError(null);
  }, [lines]);

  const lineStates = useMemo(() => {
    return lines.map((row) => {
      const key = lineKey(row);
      const balance = Number(row.balance_qty);
      const parsedQty = parseQty(qtyByKey[key] ?? "");
      const remainingQty =
        parsedQty > 0 && !Number.isNaN(parsedQty)
          ? Math.max(0, Math.round((balance - parsedQty) * 1000) / 1000)
          : balance;

      const unitPrice = Number(row.unit_price ?? 0);
      const lineAmount =
        parsedQty > 0 && !Number.isNaN(parsedQty)
          ? Math.round(parsedQty * unitPrice * 100) / 100
          : 0;

      return {
        row,
        key,
        balance,
        parsedQty,
        remainingQty,
        unitPrice,
        lineAmount,
        valid: parsedQty > 0 && parsedQty <= balance + 0.001 && !Number.isNaN(parsedQty),
      };
    });
  }, [lines, qtyByKey]);

  const invoiceTotal = useMemo(
    () =>
      Math.round(lineStates.reduce((sum, item) => sum + item.lineAmount, 0) * 100) / 100,
    [lineStates]
  );

  if (!lines.length || !header) return null;

  const vendorCode = header.vendor_code;
  const canSubmit =
    lineStates.length > 0 &&
    lineStates.every((item) => item.valid) &&
    !mutation.isPending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError("Enter a valid invoice quantity for each selected material.");
      return;
    }

    try {
      const result = await mutation.mutateAsync({
        vendorCode,
        poNumber: header.po_number,
        lines: lineStates.map(({ row, parsedQty }) => ({
          poLineNo: Number(row.line_no),
          plantCode: row.plant_code,
          storageLocationCode: row.store_location ?? null,
          invoiceQty: parsedQty,
          uom: row.uom,
        })),
        invoiceNumber: invoiceNumber.trim() || undefined,
        invoiceDate,
      });

      const summaries = result.balanceSummaries ?? [];
      showToast(
        summaries.length === 1
          ? `Invoice created. Remaining balance: ${Number(summaries[0].remainingQty).toLocaleString()}`
          : `Invoice created with ${summaries.length} materials.`,
        "success"
      );

      onSuccess?.();
      onClose();

      if (result.invoice?.invoiceId) {
        navigate(getInvoicePrintPath(result.invoice.invoiceId, true, { admin: true }));
      }
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        lines.length === 1
          ? "Generate invoice from PO line"
          : `Generate invoice (${lines.length} materials)`
      }
      className="max-w-3xl"
      closeOnBackdrop={!mutation.isPending}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">PO Number</dt>
            <dd className="font-mono font-medium">{header.po_number}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Vendor</dt>
            <dd>
              {header.vendor_code_sap ?? vendorCode} — {header.vendor_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">PO Date</dt>
            <dd>{formatDate(header.po_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Plant</dt>
            <dd>{header.plant_code}</dd>
          </div>
        </dl>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2">Invoice Qty</th>
                <th className="px-3 py-2 text-right">Line Amount</th>
                <th className="px-3 py-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {lineStates.map(({ row, key, balance, remainingQty, unitPrice, lineAmount, valid }) => (
                <tr key={key} className="border-t border-slate-100">
                  <td className="px-3 py-2 tabular-nums">{row.line_no}</td>
                  <td className="px-3 py-2 font-mono">{row.material_code}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate" title={row.item_description}>
                    {row.item_description}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-800">
                    {balance.toLocaleString()} {row.uom}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(unitPrice)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={`Max ${balance.toLocaleString()}`}
                      value={qtyByKey[key] ?? ""}
                      onChange={(e) =>
                        setQtyByKey((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={`h-8 w-28 rounded border px-2 text-sm ${
                        qtyByKey[key] && !valid
                          ? "border-red-400 focus:border-red-400"
                          : "border-slate-200"
                      }`}
                      required
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatCurrency(lineAmount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {remainingQty.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td colSpan={6} className="px-3 py-2 text-right">
                  Invoice total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(invoiceTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Invoice # (optional)"
            placeholder="Auto-generated if blank"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
          <Input
            label="Invoice date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
            Generate invoice & PDF
          </Button>
        </div>
      </form>
    </Modal>
  );
}
