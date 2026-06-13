import { Router } from "express";
import * as qrController from "../controllers/qrController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { forcePasswordChangeMiddleware } from "../middleware/forcePasswordChangeMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { qrVerifyRateLimit } from "../middleware/qrVerifyMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  invoiceIdParamSchema,
  verifyQRSchema,
} from "../validators/qrValidators.js";

const router = Router();

router.post(
  "/verify",
  qrVerifyRateLimit,
  validate({ body: verifyQRSchema }),
  asyncHandler(qrController.verifyQR)
);

router.use(authenticate);
router.use(forcePasswordChangeMiddleware);

router.get(
  "/:invoiceId/image",
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(qrController.getQRImage)
);

router.get(
  "/:invoiceId/lines",
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(qrController.getInvoiceLineQRs)
);

router.post(
  "/:invoiceId/regenerate",
  adminOnly,
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(qrController.regenerateQR)
);

export default router;
