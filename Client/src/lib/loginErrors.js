import { parseApiError } from "../api/errors.js";

/**
 * @param {unknown} error
 * @returns {'locked'|'invalid'|'server'|'rate-limit'|'unknown'}
 */
export function getLoginErrorVariant(error) {
  const status = error?.response?.status;
  const message = parseApiError(error).message.toLowerCase();

  if (message.includes("locked")) {
    return "locked";
  }
  if (status === 429 || message.includes("too many")) {
    return "rate-limit";
  }
  if (status && status >= 500) {
    return "server";
  }
  if (status === 401 || message.includes("invalid") || message.includes("credential")) {
    return "invalid";
  }
  return "unknown";
}

/**
 * @param {'locked'|'invalid'|'server'|'rate-limit'|'unknown'} variant
 */
export function getLoginErrorContent(variant) {
  switch (variant) {
    case "locked":
      return {
        title: "Account temporarily locked",
        message:
          "Too many failed sign-in attempts. Please wait before trying again or contact your administrator.",
        alertVariant: "warning",
      };
    case "invalid":
      return {
        title: "Invalid credentials",
        message: "The vendor code or email and password you entered do not match our records.",
        alertVariant: "error",
      };
    case "server":
      return {
        title: "Server unavailable",
        message: "We could not complete your sign-in. Please try again in a few minutes.",
        alertVariant: "error",
      };
    case "rate-limit":
      return {
        title: "Too many attempts",
        message: "Please wait a moment before signing in again.",
        alertVariant: "warning",
      };
    default:
      return {
        title: "Sign-in failed",
        message: "Something went wrong. Please check your details and try again.",
        alertVariant: "error",
      };
  }
}
