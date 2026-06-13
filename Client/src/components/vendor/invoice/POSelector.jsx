import { useMemo, useState } from "react";
import { parseApiError } from "../../../api/errors.js";
import { useOpenPOsQuery } from "../../../hooks/queries/useOpenPOsQuery.js";
import { Input } from "../../ui/Input.jsx";
import { Spinner } from "../../ui/Spinner.jsx";
import { formatDate } from "../../../lib/format.js";
import { POStatusBadge } from "../POStatusBadge.jsx";

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(poNumber: string) => void} props.onChange
 * @param {string} [props.error]
 */
export function POSelector({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: purchaseOrders = [], isLoading: loading, error: fetchError } = useOpenPOsQuery();
  const loadError = fetchError ? parseApiError(fetchError).message : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchaseOrders;
    return purchaseOrders.filter((po) => po.poNumber.toLowerCase().includes(q));
  }, [purchaseOrders, search]);

  const selected = purchaseOrders.find((po) => po.poNumber === value);

  return (
    <div className="relative">
      <label htmlFor="po-selector-trigger" className="mb-1.5 block text-sm font-medium text-slate-700">
        Purchase order <span className="text-red-500">*</span>
      </label>
      <button
        id="po-selector-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-left text-sm ${
          error ? "border-red-400" : "border-slate-200"
        } focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent`}
      >
        <span className={value ? "text-navy" : "text-slate-400"}>
          {selected ? `${selected.poNumber} — ${selected.plantName || selected.plantCode}` : "Search and select a PO…"}
        </span>
        <span aria-hidden="true" className="text-slate-400">
          ▾
        </span>
      </button>
      {error && (
        <p className="mt-1.5 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO number…"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {loading && (
              <li className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                <Spinner size="sm" />
                Loading POs…
              </li>
            )}
            {loadError && (
              <li className="px-3 py-4 text-sm text-red-600" role="alert">
                {loadError}
              </li>
            )}
            {!loading && !loadError && filtered.length === 0 && (
              <li className="px-3 py-4 text-sm text-slate-500">No open purchase orders found.</li>
            )}
            {filtered.map((po) => (
              <li key={po.poNumber}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === po.poNumber}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 focus:bg-accent/5 focus:outline-none"
                  onClick={() => {
                    onChange(po.poNumber);
                    setOpen(false);
                  }}
                >
                  <span>
                    <span className="font-medium text-navy font-mono">{po.poNumber}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {formatDate(po.poDate)} · {po.plantName || po.plantCode}
                    </span>
                  </span>
                  <POStatusBadge status={po.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
