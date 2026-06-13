import { useCallback, useState } from "react";

const PRINT_BODY_CLASS = "is-printing-invoice";

/**
 * Opens the browser print dialog for the current invoice preview page.
 * @param {import('react').RefObject<HTMLElement|null>} contentRef
 * @param {object} [options]
 * @param {string} [options.documentTitle]
 */
export function usePrintDocument(contentRef, options = {}) {
  const [isPrinting, setIsPrinting] = useState(false);

  const print = useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    const previousTitle = document.title;
    if (options.documentTitle) {
      document.title = options.documentTitle;
    }

    const cleanup = () => {
      document.body.classList.remove(PRINT_BODY_CLASS);
      document.title = previousTitle;
      setIsPrinting(false);
      window.removeEventListener("afterprint", cleanup);
    };

    setIsPrinting(true);
    document.body.classList.add(PRINT_BODY_CLASS);
    window.addEventListener("afterprint", cleanup);

    window.requestAnimationFrame(() => {
      window.print();
    });
  }, [contentRef, options.documentTitle]);

  const downloadPdf = useCallback(() => {
    print();
  }, [print]);

  return {
    print,
    downloadPdf,
    isPrinting,
  };
}

/**
 * @param {object[]} invoiceLines
 * @param {object[]} poLines
 */
function mergePrintLines(invoiceLines, poLines) {
  const poMap = new Map((poLines ?? []).map((l) => [l.lineNo, l]));

  return (invoiceLines ?? []).map((line, index) => {
    const poLine = poMap.get(line.poLineNo);
    const invoiceQty = Number(line.invoiceQty);
    const unitPrice = Number(line.unitPrice ?? 0);

    return {
      srNo: index + 1,
      materialCode: line.materialCode,
      materialDescription: line.materialDescription,
      uom: line.uom,
      orderedQty: poLine?.orderedQty ?? null,
      pendingQty: poLine?.pendingQty ?? null,
      invoiceQty,
      unitPrice,
      lineTotal: invoiceQty * unitPrice,
      storageLocationCode: line.storageLocationCode,
    };
  });
}

export { mergePrintLines };
