import { Router } from "express";
import * as invoiceController from "../controllers/invoiceController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { forcePasswordChangeMiddleware } from "../middleware/forcePasswordChangeMiddleware.js";
import { adminOnly, vendorOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  adminGenerateInvoiceFromPOLineSchema,
  adminInvoiceListQuerySchema,
  createInvoiceDraftSchema,
  invoiceIdParamSchema,
  persistInvoiceSchema,
  updateInvoiceStatusSchema,
  vendorInvoiceListQuerySchema,
} from "../validators/invoiceValidators.js";

const router = Router();

router.use(authenticate);
router.use(forcePasswordChangeMiddleware);

router.get(
  "/mine",
  vendorOnly,
  validate({ query: vendorInvoiceListQuerySchema }),
  asyncHandler(invoiceController.getMyInvoices)
);

router.post(
  "/draft",
  vendorOnly,
  validate({ body: createInvoiceDraftSchema }),
  asyncHandler(invoiceController.createInvoiceDraft)
);

router.post(
  "/persist",
  vendorOnly,
  validate({ body: persistInvoiceSchema }),
  asyncHandler(invoiceController.persistInvoice)
);

router.get(
  "/",
  adminOnly,
  validate({ query: adminInvoiceListQuerySchema }),
  asyncHandler(invoiceController.getAllInvoices)
);

router.post(
  "/generate-from-po-line",
  adminOnly,
  validate({ body: adminGenerateInvoiceFromPOLineSchema }),
  asyncHandler(invoiceController.generateInvoiceFromPOLine)
);

router.get(
  "/:invoiceId",
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(invoiceController.getInvoiceDetails)
);

router.post(
  "/:invoiceId/submit",
  vendorOnly,
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(invoiceController.submitInvoice)
);

router.patch(
  "/:invoiceId/status",
  adminOnly,
  validate({ params: invoiceIdParamSchema, body: updateInvoiceStatusSchema }),
  asyncHandler(invoiceController.updateInvoiceStatus)
);

export default router;
