import { Router } from "express";
import * as poUploadController from "../controllers/poUploadController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { sapExcelUploadHandler } from "../middleware/sapExcelUploadMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  poUploadBatchIdParamSchema,
  poUploadHistoryQuerySchema,
} from "../validators/poUploadValidators.js";

const router = Router();

router.use(authenticate);
router.use(adminOnly);

router.post(
  "/upload-excel",
  sapExcelUploadHandler,
  asyncHandler(poUploadController.uploadSAPExcel)
);

router.get(
  "/upload-history",
  validate({ query: poUploadHistoryQuerySchema }),
  asyncHandler(poUploadController.getUploadHistory)
);

router.get(
  "/upload-history/:batchId",
  validate({ params: poUploadBatchIdParamSchema }),
  asyncHandler(poUploadController.getUploadBatchDetails)
);

export default router;
