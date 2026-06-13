import { Router } from "express";
import * as adminDashboardController from "../controllers/adminDashboardController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  adminMaterialBalanceQuerySchema,
  adminPOBalanceExportQuerySchema,
  adminPOBalanceQuerySchema,
  adminVendorCodeParamSchema,
} from "../validators/adminDashboardValidators.js";

const router = Router();

router.use(authenticate);
router.use(adminOnly);

/** PO/balance dashboard — does not replace GET /api/admin/dashboard (stats/charts). */
router.get(
  "/dashboard/balance",
  asyncHandler(adminDashboardController.getAdminDashboardSummary)
);

router.get(
  "/vendors/:vendorCode/po-balance",
  validate({ params: adminVendorCodeParamSchema }),
  asyncHandler(adminDashboardController.getAdminVendorPOBalance)
);

router.get(
  "/po-balance/export",
  validate({ query: adminPOBalanceExportQuerySchema }),
  asyncHandler(adminDashboardController.exportPOBalanceExcel)
);

router.get(
  "/po-balance",
  validate({ query: adminPOBalanceQuerySchema }),
  asyncHandler(adminDashboardController.getAdminAllPOBalance)
);

router.get(
  "/materials/balance",
  validate({ query: adminMaterialBalanceQuerySchema }),
  asyncHandler(adminDashboardController.getAdminMaterialBalanceSummary)
);

export default router;
