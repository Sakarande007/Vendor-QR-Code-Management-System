import { getPasswordStrength } from "../../lib/passwordStrength.js";
import { cn } from "../../lib/cn.js";

const barColors = {
  weak: "bg-red-500",
  medium: "bg-amber-500",
  strong: "bg-blue-500",
  "very-strong": "bg-emerald-500",
};

const labels = {
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
  "very-strong": "Very strong",
};

/**
 * @param {object} props
 * @param {string} props.password
 * @param {string} [props.id]
 */
export function PasswordStrengthMeter({ password, id = "password-strength" }) {
  const { label, checks } = getPasswordStrength(password);
  const filledBars = { weak: 1, medium: 2, strong: 3, "very-strong": 4 }[label];

  const requirements = [
    { key: "minLength", label: "At least 8 characters", met: checks.minLength },
    { key: "uppercase", label: "One uppercase letter", met: checks.uppercase },
    { key: "number", label: "One number", met: checks.number },
    { key: "special", label: "One special character", met: checks.special },
  ];

  return (
    <div id={id} className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((segment) => (
            <div
              key={segment}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                segment <= filledBars && password
                  ? barColors[label]
                  : "bg-slate-200"
              )}
            />
          ))}
        </div>
        {password && (
          <span className="text-xs font-medium text-slate-600">{labels[label]}</span>
        )}
      </div>

      <ul className="space-y-1.5 text-sm" aria-label="Password requirements">
        {requirements.map((req) => (
          <li
            key={req.key}
            className={cn(
              "flex items-center gap-2",
              req.met ? "text-emerald-700" : "text-slate-500"
            )}
          >
            <span aria-hidden="true">{req.met ? "✓" : "○"}</span>
            <span>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
