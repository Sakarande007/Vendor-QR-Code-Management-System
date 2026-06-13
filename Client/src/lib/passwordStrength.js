/**
 * @param {string} password
 */
export function getPasswordStrength(password) {
  const value = password ?? "";

  if (!value) {
    return { score: 0, label: "weak", checks: defaultChecks(value) };
  }

  const checks = defaultChecks(value);
  let score = 0;

  if (checks.minLength) score += 1;
  if (checks.uppercase) score += 1;
  if (checks.number) score += 1;
  if (checks.special) score += 1;

  /** @type {'weak'|'medium'|'strong'|'very-strong'} */
  let label = "weak";
  if (score <= 1) label = "weak";
  else if (score === 2) label = "medium";
  else if (score === 3) label = "strong";
  else label = "very-strong";

  return { score, label, checks };
}

/**
 * @param {string} password
 */
function defaultChecks(password) {
  const value = password ?? "";
  return {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value),
  };
}

export const PASSWORD_POLICY_REGEX = {
  uppercase: /[A-Z]/,
  number: /\d/,
  special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
};
