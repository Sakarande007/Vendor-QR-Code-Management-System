import { cn } from "../../lib/cn.js";
import { Table } from "../ui/Table.jsx";

const columns = [
  { key: "lineNo", label: "Line" },
  { key: "materialCode", label: "Material" },
  { key: "description", label: "Description" },
  { key: "orderedQty", label: "Ordered" },
  { key: "receivedQty", label: "Received" },
  { key: "pendingQty", label: "Pending" },
  { key: "uom", label: "UOM" },
  { key: "storage", label: "Storage Loc." },
];

/**
 * @param {object} props
 * @param {Array<object>} props.lines
 * @param {boolean} [props.loading]
 */
export function POLineTable({ lines, loading = false }) {
  return (
    <Table
      caption="Purchase order line items"
      columns={columns}
      loading={loading}
      skeletonRows={6}
      data={lines}
      emptyMessage="No line items on this purchase order."
      renderRow={(line) => {
        const muted = Number(line.pendingQty) <= 0.001;
        return (
          <tr
            key={line.lineNo}
            className={cn(muted && "bg-slate-50/80 text-slate-400")}
          >
            <td className="px-4 py-3 text-sm font-medium">{line.lineNo}</td>
            <td className="px-4 py-3 text-sm font-mono text-xs">{line.materialCode}</td>
            <td className="px-4 py-3 text-sm max-w-xs truncate" title={line.materialDescription}>
              {line.materialDescription}
            </td>
            <td className="px-4 py-3 text-sm tabular-nums">{line.orderedQty}</td>
            <td className="px-4 py-3 text-sm tabular-nums">{line.receivedQty}</td>
            <td className="px-4 py-3 text-sm tabular-nums font-medium">
              {line.pendingQty}
            </td>
            <td className="px-4 py-3 text-sm">{line.uom}</td>
            <td className="px-4 py-3 text-sm">{line.storageLocationCode || "—"}</td>
          </tr>
        );
      }}
    />
  );
}
