import { Router } from "express";
import express from "express";
import * as masterController from "../controllers/masterController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  bulkImportMaterialsSchema,
  createMaterialSchema,
  createPlantSchema,
  createStorageLocationSchema,
  materialCodeParamSchema,
  materialListQuerySchema,
  plantCodeParamSchema,
  storageLocationIdParamSchema,
  storageLocationQuerySchema,
  updateMaterialSchema,
  updatePlantSchema,
  updateStorageLocationSchema,
} from "../validators/masterValidators.js";

const router = Router();

router.use(authenticate);

// ─── Plants ───────────────────────────────────────────────────────────────────
router.get("/plants", asyncHandler(masterController.getPlants));

router.post(
  "/plants",
  adminOnly,
  validate({ body: createPlantSchema }),
  asyncHandler(masterController.createPlant)
);

router.put(
  "/plants/:plantCode",
  adminOnly,
  validate({ params: plantCodeParamSchema, body: updatePlantSchema }),
  asyncHandler(masterController.updatePlant)
);

router.delete(
  "/plants/:plantCode",
  adminOnly,
  validate({ params: plantCodeParamSchema }),
  asyncHandler(masterController.deletePlant)
);

// ─── Storage locations ────────────────────────────────────────────────────────
router.get(
  "/storage-locations",
  validate({ query: storageLocationQuerySchema }),
  asyncHandler(masterController.getStorageLocations)
);

router.post(
  "/storage-locations",
  adminOnly,
  validate({ body: createStorageLocationSchema }),
  asyncHandler(masterController.createStorageLocation)
);

router.put(
  "/storage-locations/:id",
  adminOnly,
  validate({ params: storageLocationIdParamSchema, body: updateStorageLocationSchema }),
  asyncHandler(masterController.updateStorageLocation)
);

// ─── Materials ──────────────────────────────────────────────────────────────
router.get(
  "/materials",
  validate({ query: materialListQuerySchema }),
  asyncHandler(masterController.getMaterials)
);

router.post(
  "/materials/bulk-import",
  adminOnly,
  (req, res, next) => {
    if (req.is("text/csv") || req.is("text/plain")) {
      return express.text({ type: ["text/csv", "text/plain"], limit: "5mb" })(
        req,
        res,
        next
      );
    }
    return validate({ body: bulkImportMaterialsSchema })(req, res, next);
  },
  asyncHandler(masterController.bulkImportMaterials)
);

router.get(
  "/materials/:materialCode",
  validate({ params: materialCodeParamSchema }),
  asyncHandler(masterController.getMaterialByCode)
);

router.post(
  "/materials",
  adminOnly,
  validate({ body: createMaterialSchema }),
  asyncHandler(masterController.createMaterial)
);

router.put(
  "/materials/:materialCode",
  adminOnly,
  validate({ params: materialCodeParamSchema, body: updateMaterialSchema }),
  asyncHandler(masterController.updateMaterial)
);

export default router;
