import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Attaches a UUID v4 request ID to each request and response headers.
 * @type {import('express').RequestHandler}
 */
export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === "string" && incoming.length > 0 && incoming.length <= 64
      ? incoming
      : randomUUID();

  req.id = requestId;
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}

export { REQUEST_ID_HEADER };
