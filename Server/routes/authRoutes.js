import { Router } from "express";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import * as authController from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/roleMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validators/authValidators.js";

const router = Router();

router.use(cookieParser());

/** 5 requests / 15 minutes per IP — brute-force protection on login */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

/** 20 requests / 15 minutes per IP — refresh token abuse */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REFRESH_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many refresh attempts. Try again later." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

/** 3 requests / hour per email — OTP flooding prevention (enforced in service + IP cap) */
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.FORGOT_PASSWORD_IP_MAX_PER_HOUR) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Try again later." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

router.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login)
);

router.post(
  "/refresh",
  refreshLimiter,
  asyncHandler(authController.refreshToken)
);

router.post("/logout", authenticate, asyncHandler(authController.logout));

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword)
);

router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword)
);

/**
 * Normal change requires Bearer token; first-login uses temp_token in body only.
 * @type {import('express').RequestHandler}
 */
function changePasswordAuth(req, res, next) {
  if (req.body?.temp_token) {
    return next();
  }
  return authenticate(req, res, next);
}

router.post(
  "/change-password",
  validate({ body: changePasswordSchema }),
  changePasswordAuth,
  asyncHandler(authController.changePassword)
);

router.post(
  "/register",
  authenticate,
  adminOnly,
  validate({ body: registerSchema }),
  asyncHandler(authController.register)
);

export default router;
