import crypto from "node:crypto";

/**
 * Weak ETag support for JSON GET responses via res.json patch.
 * Returns 304 when If-None-Match matches body hash.
 * @type {import('express').RequestHandler}
 */
export function etagMiddleware(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function jsonWithEtag(body) {
    try {
      const payload = JSON.stringify(body);
      const hash = crypto.createHash("sha1").update(payload).digest("hex");
      const tag = `W/"${hash}"`;

      res.setHeader("ETag", tag);

      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch === tag || ifNoneMatch === hash) {
        res.status(304);
        return res.end();
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(payload);
    } catch {
      return originalJson(body);
    }
  };

  next();
}
