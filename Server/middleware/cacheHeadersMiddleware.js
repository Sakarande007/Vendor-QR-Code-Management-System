/**
 * Sets Cache-Control for read-mostly API responses.
 * @type {import('express').RequestHandler}
 */
export function masterDataCacheHeaders(req, res, next) {
  if (req.method === "GET") {
    res.set(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=60"
    );
  }
  next();
}

/**
 * @param {number} maxAgeSec
 * @returns {import('express').RequestHandler}
 */
export function privateCacheHeaders(maxAgeSec) {
  return (req, res, next) => {
    if (req.method === "GET") {
      res.set("Cache-Control", `private, max-age=${maxAgeSec}`);
    }
    next();
  };
}

/**
 * Ensures caches vary on compression negotiation.
 * @type {import('express').RequestHandler}
 */
export function varyAcceptEncoding(req, res, next) {
  const existing = res.getHeader("Vary");
  const value = existing ? `${existing}, Accept-Encoding` : "Accept-Encoding";
  res.setHeader("Vary", value);
  next();
}
