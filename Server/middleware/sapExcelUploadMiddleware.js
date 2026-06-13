import path from "node:path";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);

const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

/**
 * Multer middleware for SAP PO Excel upload (memory storage, field: po_file).
 */
export const sapExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        ApiError.badRequest("Only .xlsx and .xls files are allowed")
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        ApiError.badRequest(
          "Invalid file MIME type. Upload a valid Excel (.xlsx or .xls) file"
        )
      );
    }

    return cb(null, true);
  },
}).single("po_file");

/**
 * @param {unknown} err
 * @param {import('express').NextFunction} next
 */
function forwardUploadError(err, next) {
  if (!err) {
    return;
  }

  if (err instanceof ApiError) {
    next(err);
    return;
  }

  if (/** @type {{ code?: string }} */ (err).code === "LIMIT_FILE_SIZE") {
    next(ApiError.badRequest("File exceeds maximum size of 10MB"));
    return;
  }

  if (/** @type {{ code?: string }} */ (err).code === "LIMIT_UNEXPECTED_FILE") {
    next(
      ApiError.badRequest(
        "Unexpected file field. Use form field name: po_file"
      )
    );
    return;
  }

  next(err);
}

/**
 * Runs multer upload and forwards errors to Express error middleware.
 * @type {import('express').RequestHandler}
 */
export function sapExcelUploadHandler(req, res, next) {
  sapExcelUpload(req, res, (err) => {
    if (err) {
      forwardUploadError(err, next);
      return;
    }
    next();
  });
}
