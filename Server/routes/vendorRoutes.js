import { Router } from "express";
import * as vendorController from "../controllers/vendorController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createVendorSchema,
  resetVendorPasswordSchema,
  toggleVendorStatusSchema,
  updateVendorSchema,
  vendorCodeParamSchema,
  vendorListQuerySchema,
} from "../validators/vendorValidators.js";

const router = Router();

router.use(authenticate);
router.use(adminOnly);

router.get(
  "/",
  validate({ query: vendorListQuerySchema }),
  asyncHandler(vendorController.getAllVendors)
);

router.get(
  "/:vendorCode",
  validate({ params: vendorCodeParamSchema }),
  asyncHandler(vendorController.getVendorById)
);

router.post(
  "/",
  validate({ body: createVendorSchema }),
  asyncHandler(vendorController.createVendor)
);

router.patch(
  "/:vendorCode",
  validate({ params: vendorCodeParamSchema, body: updateVendorSchema }),
  asyncHandler(vendorController.updateVendor)
);

router.patch(
  "/:vendorCode/status",
  validate({ params: vendorCodeParamSchema, body: toggleVendorStatusSchema }),
  asyncHandler(vendorController.toggleVendorStatus)
);

router.post(
  "/:vendorCode/reset-password",
  validate({ params: vendorCodeParamSchema, body: resetVendorPasswordSchema }),
  asyncHandler(vendorController.resetVendorPassword)
);

export default router;
