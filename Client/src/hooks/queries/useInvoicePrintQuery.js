import { useQuery } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi.js";
import * as vendorApi from "../../api/vendorApi.js";
import * as qrApi from "../../api/qrApi.js";
import { blobToBase64 } from "../../lib/blob.js";
import { companyConfig } from "../../lib/companyConfig.js";
import { queryKeys } from "../../lib/queryKeys.js";
import { useAuth } from "../useAuth.js";

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
      poLineNo: line.poLineNo,
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

async function fetchPrintPayload(invoiceId, { isAdmin = false } = {}) {
  const id = Number(invoiceId);
  const invoiceData = isAdmin
    ? await adminApi.getInvoiceDetails(id)
    : await vendorApi.getInvoiceDetails(id);
  const invoice = invoiceData.invoice;

  const [poData, profileData] = await Promise.all([
    isAdmin
      ? adminApi
          .getAllPOBalance({ vendor_code: invoice.vendorCode, pageSize: 100 })
          .then((balance) => {
            const rows = (balance.lines ?? []).filter(
              (line) => String(line.po_number) === String(invoice.poNumber)
            );
            if (!rows.length) return null;
            return {
              header: {
                poNumber: invoice.poNumber,
                plantCode: rows[0].plant_code,
                plantName: rows[0].plant_code,
              },
              lines: rows.map((line) => ({
                lineNo: Number(line.line_no),
                orderedQty: Number(line.po_qty),
                pendingQty: Number(line.balance_qty),
              })),
            };
          })
          .catch(() => null)
      : vendorApi.getPODetails(invoice.poNumber).catch(() => null),
    isAdmin
      ? adminApi.getVendorByCode(invoice.vendorCode).catch(() => null)
      : vendorApi.getMyProfile().catch(() => null),
  ]);

  const vendor = isAdmin
    ? profileData?.vendor ??
      (invoice.vendorName
        ? {
            vendorName: invoice.vendorName,
            vendorCode: invoice.vendorCode,
            address: null,
            gstNo: null,
            phone: null,
          }
        : null)
    : (profileData?.profile ?? profileData)?.vendor ??
      (invoice.vendorName
        ? {
            vendorName: invoice.vendorName,
            vendorCode: invoice.vendorCode,
            address: null,
            gstNo: null,
            phone: null,
          }
        : null);

  let qrBase64 = null;
  let lineQrByPoLine = new Map();
  const canShowQr =
    invoice.status === "qr_generated" ||
    invoice.status === "verified" ||
    invoice.qrGenerated;

  if (canShowQr) {
    const [invoiceQrResult, lineQrResult] = await Promise.allSettled([
      qrApi.getQRImage(id).then(blobToBase64),
      qrApi.getInvoiceLineQRs(id),
    ]);

    if (invoiceQrResult.status === "fulfilled") {
      qrBase64 = invoiceQrResult.value;
    }

    if (lineQrResult.status === "fulfilled") {
      lineQrByPoLine = new Map(
        (lineQrResult.value?.lines ?? []).map((l) => [
          Number(l.poLineNo),
          l.qrImageBase64,
        ])
      );
    }
  }

  const lines = mergePrintLines(invoiceData.lines, poData?.lines).map((line, index) => ({
    ...line,
    qrBase64: lineQrByPoLine.get(Number(invoiceData.lines?.[index]?.poLineNo)) ?? null,
  }));
  const subtotal = lines.reduce((sum, row) => sum + row.lineTotal, 0);
  const storageLocations = [
    ...new Set(lines.map((l) => l.storageLocationCode).filter(Boolean)),
  ].join(", ");

  return {
    invoice,
    vendor,
    company: companyConfig,
    po: poData?.header ?? null,
    plant:
      poData?.header?.plantName ||
      poData?.header?.plantCode ||
      invoiceData.lines?.[0]?.plantCode ||
      "—",
    storageLocations: storageLocations || "—",
    lines,
    subtotal,
    qrBase64,
  };
}

/**
 * @param {number|string|undefined} invoiceId
 */
export function useInvoicePrintQuery(invoiceId) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.invoicePrint(invoiceId), isAdmin ? "admin" : "vendor"],
    queryFn: () => fetchPrintPayload(invoiceId, { isAdmin }),
    enabled: Boolean(invoiceId),
  });
}
