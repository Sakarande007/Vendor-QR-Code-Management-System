import { Router } from "express";
import multer from "multer";
import * as poController from "../controllers/poController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { forcePasswordChangeMiddleware } from "../middleware/forcePasswordChangeMiddleware.js";
import { adminOnly, vendorOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  adminPOListQuerySchema,
  poNumberParamSchema,
  poSyncBodySchema,
  vendorPOListQuerySchema,
} from "../validators/poValidators.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.originalname.match(/\.(csv|xlsx|xls)$/i);

    if (!allowed) {
      return cb(new Error("Only CSV and Excel files are allowed"));
    }
    return cb(null, true);
  },
});

router.use(authenticate);
router.use(forcePasswordChangeMiddleware);

router.get(
  "/mine",
  vendorOnly,
  validate({ query: vendorPOListQuerySchema }),
  asyncHandler(poController.getMyPOs)
);

router.get(
  "/mine/:poNumber",
  vendorOnly,
  validate({ params: poNumberParamSchema }),
  asyncHandler(poController.getPODetails)
);

router.get(
  "/",
  adminOnly,
  validate({ query: adminPOListQuerySchema }),
  asyncHandler(poController.getAllPOs)
);

router.post(
  "/sync",
  adminOnly,
  validate({ body: poSyncBodySchema }),
  asyncHandler(poController.syncPOFromERP)
);

router.post(
  "/upload",
  adminOnly,
  upload.single("file"),
  asyncHandler(poController.bulkUploadPO)
);

export default router;
