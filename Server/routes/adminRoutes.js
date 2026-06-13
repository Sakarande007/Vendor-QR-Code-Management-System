import { Router } from "express";
import * as adminController from "../controllers/adminController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { auditLogListQuerySchema } from "../validators/adminValidators.js";

const router = Router();

router.use(authenticate);
router.use(adminOnly);

router.get("/dashboard", asyncHandler(adminController.getDashboard));
router.get(
  "/audit-logs",
  validate({ query: auditLogListQuerySchema }),
  asyncHandler(adminController.getAuditLogs)
);
router.get("/po-sync-history", asyncHandler(adminController.getPOSyncHistory));

export default router;
