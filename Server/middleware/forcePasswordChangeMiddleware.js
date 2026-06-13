const CHANGE_PASSWORD_PATH = "/api/auth/change-password";

/**
 * Blocks vendor API access when JWT indicates mandatory password change.
 * Allows only POST /api/auth/change-password (forced first-login flow).
 * @type {import('express').RequestHandler}
 */
export function forcePasswordChangeMiddleware(req, res, next) {
  if (req.user?.role !== "vendor") {
    return next();
  }

  const path = req.originalUrl.split("?")[0];
  if (path === CHANGE_PASSWORD_PATH || path.endsWith("/change-password")) {
    return next();
  }

  if (req.user.mustChangePassword) {
    return res.status(403).json({
      success: false,
      must_change_password: true,
      message: "Please change your password first",
      data: null,
      requestId: res.locals.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  return next();
}
