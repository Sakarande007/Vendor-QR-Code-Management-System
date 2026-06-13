import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { requestIdMiddleware } from "./middleware/requestIdMiddleware.js";
import { requestTimeout } from "./middleware/requestTimeoutMiddleware.js";
import { auditMiddleware } from "./middleware/auditMiddleware.js";
import { apiSlidingRateLimit } from "./middleware/rateLimitMiddleware.js";
import {
  masterDataCacheHeaders,
  varyAcceptEncoding,
} from "./middleware/cacheHeadersMiddleware.js";
import { etagMiddleware } from "./middleware/etagMiddleware.js";
import { notFoundHandler, errorHandler } from "./middleware/errorMiddleware.js";
import { createRequestLogger, logger } from "./utils/logger.js";

import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import masterRoutes from "./routes/masterRoutes.js";
import poRoutes from "./routes/poRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import qrRoutes from "./routes/qrRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import poUploadRoutes from "./routes/poUploadRoutes.js";
import vendorDashboardRoutes from "./routes/vendorDashboardRoutes.js";
import adminDashboardRoutes from "./routes/adminDashboardRoutes.js";

const isProd = process.env.NODE_ENV === "production";
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const corsOrigins = [
  clientUrl,
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : []),
];
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS) || 30_000;

morgan.token("request-id", (req) => req.id ?? "-");

/**
 * Builds and configures the Express application (no listen).
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

  app.use(requestIdMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", clientUrl],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      hsts: isProd
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      xssFilter: true,
      noSniff: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  app.use(varyAcceptEncoding);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    })
  );

  app.use((req, res, next) => {
    req.log = createRequestLogger(res.locals.requestId);
    next();
  });

  morgan.format(
    "vendor-qr",
    ":request-id :remote-addr :method :url :status :res[content-length] - :response-time ms"
  );

  app.use(
    morgan("vendor-qr", {
      stream: {
        write: (message) => logger.http(message.trim()),
      },
      skip: (req) => req.path === "/api/health",
    })
  );

  const rateLimitDisabled =
    process.env.DISABLE_RATE_LIMIT === "true" ||
    (!isProd && process.env.DISABLE_RATE_LIMIT !== "false");

  if (!rateLimitDisabled) {
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || (isProd ? 100 : 10_000),
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many requests from this IP, please try again later.",
      },
      keyGenerator: (req) => req.ip ?? "unknown",
    });

    app.use(globalLimiter);
  }

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.use(requestTimeout(requestTimeoutMs));
  app.use(auditMiddleware);

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      message: "Vendor QR Code Management System API",
      version: process.env.npm_package_version ?? "1.0.0",
    });
  });

  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);

  app.use("/api", apiSlidingRateLimit);
  app.use("/api", etagMiddleware);

  app.use("/api/masters", masterDataCacheHeaders);
  app.use("/api/vendors", vendorRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/masters", masterRoutes);
  app.use("/api/pos", poRoutes);
  app.use("/api/invoices", invoiceRoutes);
  app.use("/api/qr", qrRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin", adminDashboardRoutes);
  app.use("/api/admin/po", poUploadRoutes);
  app.use("/api/vendor", vendorDashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
