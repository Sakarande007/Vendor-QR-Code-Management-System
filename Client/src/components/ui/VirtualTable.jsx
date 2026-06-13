import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/cn.js";

/**
 * Windowed table body — only visible rows are mounted (10k+ row safe).
 * @param {object} props
 * @param {number} props.rowCount
 * @param {number} [props.rowHeight]
 * @param {number} [props.maxHeight]
 * @param {import('react').ReactNode} props.header
 * @param {(index: number) => import('react').ReactNode} props.renderRow
 * @param {string} [props.className]
 * @param {string} [props.emptyMessage]
 */
export function VirtualTable({
  rowCount,
  rowHeight = 52,
  maxHeight = 560,
  header,
  renderRow,
  className,
  emptyMessage = "No records found.",
}) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  if (rowCount === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500",
          className
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", className)}
    >
      {header}
      <div ref={parentRef} style={{ maxHeight, overflow: "auto" }} className="relative w-full">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(virtualRow.index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
