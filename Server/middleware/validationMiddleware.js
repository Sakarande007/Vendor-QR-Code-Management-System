import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";

/**
 * Formats Zod issues into field-level error objects.
 * @param {ZodError} error
 * @returns {Array<{ field: string, message: string }>}
 */
function formatZodErrors(error) {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "_root",
    message: issue.message,
  }));
}

/**
 * Express 5 makes req.query / req.params read-only getters; replace via defineProperty.
 * @param {import('express').Request} req
 * @param {'body'|'query'|'params'} key
 * @param {object} value
 */
function setRequestField(req, key, value) {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

/**
 * Factory for request validation using Zod schemas.
 * @param {object} schemas
 * @param {import('zod').ZodTypeAny} [schemas.body]
 * @param {import('zod').ZodTypeAny} [schemas.query]
 * @param {import('zod').ZodTypeAny} [schemas.params]
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        setRequestField(req, "body", schemas.body.parse(req.body));
      }
      if (schemas.query) {
        setRequestField(req, "query", schemas.query.parse(req.query));
      }
      if (schemas.params) {
        setRequestField(req, "params", schemas.params.parse(req.params));
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          ApiError.unprocessable("Validation failed", formatZodErrors(err))
        );
      }
      return next(err);
    }
  };
}
