/**
 * Wraps async route handlers so rejected promises reach Express error middleware.
 * @template {import('express').RequestHandler} T
 * @param {T} fn
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
