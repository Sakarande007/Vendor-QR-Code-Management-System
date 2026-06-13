import * as masterService from "../services/masterService.js";
import { auditContextFromRequest } from "../utils/auditHelper.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { parseMaterialsCsv } from "../utils/csvParser.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * @param {import('express').Request} req
 * @returns {object}
 */
function auditFromReq(req) {
  return {
    actorUserId: req.user.userId,
    ...auditContextFromRequest(req),
  };
}

// ─── Plants ───────────────────────────────────────────────────────────────────

/** GET /api/masters/plants */
export async function getPlants(req, res) {
  const plants = await masterService.getActivePlants();
  return ApiResponse.success(res, { plants });
}

/** POST /api/masters/plants */
export async function createPlant(req, res) {
  const plant = await masterService.createPlant(req.body, auditFromReq(req));
  return ApiResponse.success(res, { plant }, "Plant created successfully", 201);
}

/** PUT /api/masters/plants/:plantCode */
export async function updatePlant(req, res) {
  const plant = await masterService.updatePlant(
    req.params.plantCode,
    req.body,
    auditFromReq(req)
  );
  return ApiResponse.success(res, { plant }, "Plant updated successfully");
}

/** DELETE /api/masters/plants/:plantCode */
export async function deletePlant(req, res) {
  const plant = await masterService.softDeletePlant(
    req.params.plantCode,
    auditFromReq(req)
  );
  return ApiResponse.success(res, { plant }, "Plant deactivated successfully");
}

// ─── Storage locations ────────────────────────────────────────────────────────

/** GET /api/masters/storage-locations */
export async function getStorageLocations(req, res) {
  const storageLocations = await masterService.getStorageLocationsByPlant(
    req.query.plantCode
  );
  return ApiResponse.success(res, { storageLocations });
}

/** POST /api/masters/storage-locations */
export async function createStorageLocation(req, res) {
  const storageLocation = await masterService.createStorageLocation(
    req.body,
    auditFromReq(req)
  );
  return ApiResponse.success(
    res,
    { storageLocation },
    "Storage location created successfully",
    201
  );
}

/** PUT /api/masters/storage-locations/:id */
export async function updateStorageLocation(req, res) {
  const storageLocation = await masterService.updateStorageLocation(
    Number(req.params.id),
    req.body,
    auditFromReq(req)
  );
  return ApiResponse.success(
    res,
    { storageLocation },
    "Storage location updated successfully"
  );
}

// ─── Materials ──────────────────────────────────────────────────────────────

/** GET /api/masters/materials */
export async function getMaterials(req, res) {
  const result = await masterService.listMaterials(req.query);
  return ApiResponse.success(res, {
    materials: result.materials,
    totalCount: result.totalCount,
    pagination: result.pagination,
  });
}

/** GET /api/masters/materials/:materialCode */
export async function getMaterialByCode(req, res) {
  const material = await masterService.getMaterialByCode(req.params.materialCode);
  return ApiResponse.success(res, { material });
}

/** POST /api/masters/materials */
export async function createMaterial(req, res) {
  const material = await masterService.createMaterial(req.body, auditFromReq(req));
  return ApiResponse.success(res, { material }, "Material created successfully", 201);
}

/** PUT /api/masters/materials/:materialCode */
export async function updateMaterial(req, res) {
  const material = await masterService.updateMaterial(
    req.params.materialCode,
    req.body,
    auditFromReq(req)
  );
  return ApiResponse.success(res, { material }, "Material updated successfully");
}

/**
 * POST /api/masters/materials/bulk-import
 * Accepts JSON { materials: [...] } or a raw array; optional text/csv body.
 */
export async function bulkImportMaterials(req, res) {
  let rows;

  if (typeof req.body === "string" || req.is("text/csv")) {
    rows = parseMaterialsCsv(
      typeof req.body === "string" ? req.body : String(req.body)
    );
    if (!rows.length) {
      throw ApiError.badRequest("CSV must include a header row and at least one data row");
    }
  } else if (Array.isArray(req.body)) {
    rows = req.body;
  } else if (req.body?.materials) {
    rows = req.body.materials;
  } else {
    throw ApiError.badRequest("Provide materials as JSON array or CSV");
  }

  const result = await masterService.bulkImportMaterials(rows, auditFromReq(req));

  const statusCode = result.errors.length > 0 ? 422 : 200;
  const message =
    result.errors.length > 0
      ? "Bulk import validation failed"
      : "Bulk import completed successfully";

  return res.status(statusCode).json({
    success: result.errors.length === 0,
    data: result,
    message,
    requestId: res.locals.requestId ?? null,
    timestamp: new Date().toISOString(),
  });
}
