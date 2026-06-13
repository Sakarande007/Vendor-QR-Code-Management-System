import { Router } from "express";
import * as vendorDashboardController from "../controllers/vendorDashboardController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { forcePasswordChangeMiddleware } from "../middleware/forcePasswordChangeMiddleware.js";
import { vendorOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  vendorPOListQuerySchema,
  vendorPONumberParamSchema,
} from "../validators/vendorDashboardValidators.js";

const router = Router();

router.use(authenticate);
router.use(vendorOnly);
router.use(forcePasswordChangeMiddleware);

router.get(
  "/dashboard",
  asyncHandler(vendorDashboardController.getVendorDashboardSummary)
);

router.get(
  "/materials/balance",
  asyncHandler(vendorDashboardController.getVendorMaterialBalance)
);

router.get(
  "/pos",
  validate({ query: vendorPOListQuerySchema }),
  asyncHandler(vendorDashboardController.getVendorPOList)
);

router.get(
  "/pos/:poNumber",
  validate({ params: vendorPONumberParamSchema }),
  asyncHandler(vendorDashboardController.getVendorPODetail)
);

export default router;
