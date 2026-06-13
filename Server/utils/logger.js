import path from "node:path";
import { fileURLToPath } from "node:url";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const reqPart = requestId ? ` [${requestId}]` : "";
    return `${timestamp} ${level}${reqPart}: ${message}${metaStr}`;
  })
);

/** @type {winston.transport[]} */
const transports = [
  new winston.transports.Console({
    format: isProd ? jsonFormat : consoleFormat,
  }),
];

if (isProd) {
  const logsDir = path.join(__dirname, "..", "logs");

  transports.push(
    new DailyRotateFile({
      dirname: logsDir,
      filename: "app-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
      format: jsonFormat,
      level: logLevel,
    }),
    new DailyRotateFile({
      dirname: logsDir,
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
      zippedArchive: true,
      format: jsonFormat,
      level: "error",
    })
  );
}

/**
 * Application-wide structured logger.
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: "vendor-qr-api" },
  transports,
  exitOnError: false,
});

/**
 * Creates a child logger bound to a request ID.
 * @param {string} requestId
 * @returns {winston.Logger}
 */
function createRequestLogger(requestId) {
  return logger.child({ requestId });
}

export { logger, createRequestLogger };
