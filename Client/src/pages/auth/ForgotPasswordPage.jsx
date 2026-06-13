import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import * as authApi from "../../api/authApi.js";
import { AuthLayout } from "../../components/auth/AuthLayout.jsx";
import { OtpInput } from "../../components/auth/OtpInput.jsx";
import { PasswordStrengthMeter } from "../../components/auth/PasswordStrengthMeter.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { parseApiError } from "../../api/errors.js";
import {
  getPasswordStrength,
  PASSWORD_POLICY_REGEX,
} from "../../lib/passwordStrength.js";

const STEPS = [
  { id: 1, label: "Email" },
  { id: 2, label: "Verify" },
  { id: 3, label: "Reset" },
];

const RESEND_SECONDS = 60;

function StepIndicator({ currentStep }) {
  return (
    <nav aria-label="Password reset progress" className="mb-8">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, index) => {
          const done = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <li key={step.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center flex-1">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    done
                      ? "bg-accent text-white"
                      : active
                        ? "bg-navy text-white ring-4 ring-accent/20"
                        : "bg-slate-200 text-slate-500"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? "✓" : step.id}
                </span>
                <span
                  className={`mt-1 text-xs font-medium ${active ? "text-navy" : "text-slate-500"}`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 ${done ? "bg-accent" : "bg-slate-200"}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submittingReset, setSubmittingReset] = useState(false);

  const emailForm = useForm({
    defaultValues: { email: "" },
  });

  const passwordForm = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onChange",
  });

  const newPassword = passwordForm.watch("newPassword");

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const sendOtp = useCallback(async (emailValue) => {
    setSendingOtp(true);
    setFormError(null);
    try {
      await authApi.forgotPassword({ email: emailValue.trim().toLowerCase() });
      setFormSuccess({
        message:
          "If an account exists for this email, a 6-digit code has been sent. Check your inbox.",
      });
      setResendSeconds(RESEND_SECONDS);
      return true;
    } catch (err) {
      setFormError(parseApiError(err).message);
      return false;
    } finally {
      setSendingOtp(false);
    }
  }, []);

  const onEmailSubmit = async ({ email: emailValue }) => {
    const normalized = emailValue.trim().toLowerCase();
    setEmail(normalized);
    const ok = await sendOtp(normalized);
    if (ok) {
      setStep(2);
      setOtp("");
      setOtpError("");
    }
  };

  const onOtpContinue = () => {
    if (otp.length !== 6) {
      setOtpError("Enter the complete 6-digit code");
      return;
    }
    setOtpError("");
    setStep(3);
    setFormSuccess(null);
  };

  const onResend = async () => {
    if (resendSeconds > 0 || !email) return;
    await sendOtp(email);
  };

  const onResetSubmit = async ({ newPassword: pwd, confirmPassword }) => {
    setFormError(null);

    const strength = getPasswordStrength(pwd);
    if (strength.label === "weak" || !Object.values(strength.checks).every(Boolean)) {
      passwordForm.setError("newPassword", {
        message: "Password does not meet all requirements",
      });
      return;
    }

    if (pwd !== confirmPassword) {
      passwordForm.setError("confirmPassword", { message: "Passwords do not match" });
      return;
    }

    setSubmittingReset(true);
    try {
      await authApi.resetPassword({
        email,
        otp,
        newPassword: pwd,
      });
      navigate("/login", {
        replace: true,
        state: { message: "Password updated. Please sign in with your new password." },
      });
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.message.toLowerCase().includes("otp") || parsed.message.includes("code")) {
        setOtpError(parsed.message);
        setStep(2);
      } else {
        setFormError(parsed.message);
      }
    } finally {
      setSubmittingReset(false);
    }
  };

  const subtitles = {
    1: "We'll send a one-time code to your registered email.",
    2: "Enter the 6-digit code sent to your email.",
    3: "Choose a strong password for your account.",
  };

  return (
    <AuthLayout title="Reset your password" subtitle={subtitles[step]}>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <StepIndicator currentStep={step} />

        {formError && (
          <Alert variant="error" className="mb-6" onDismiss={() => setFormError(null)}>
            {formError}
          </Alert>
        )}

        {formSuccess && step < 3 && (
          <Alert variant="success" className="mb-6" onDismiss={() => setFormSuccess(null)}>
            {formSuccess.message}
          </Alert>
        )}

        {step === 1 && (
          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              error={emailForm.formState.errors.email?.message}
              {...emailForm.register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Enter a valid email address",
                },
              })}
            />
            <Button type="submit" fullWidth loading={sendingOtp} size="lg">
              Send verification code
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <p className="text-center text-sm text-slate-600">
              Code sent to <span className="font-medium text-navy">{email}</span>
            </p>
            <OtpInput value={otp} onChange={setOtp} error={otpError} disabled={sendingOtp} />
            <Button type="button" fullWidth size="lg" onClick={onOtpContinue}>
              Continue
            </Button>
            <div className="text-center">
              <button
                type="button"
                disabled={resendSeconds > 0 || sendingOtp}
                onClick={onResend}
                className="text-sm font-medium text-accent hover:text-accent-hover disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {resendSeconds > 0
                  ? `Resend code in ${resendSeconds}s`
                  : "Resend verification code"}
              </button>
            </div>
            <Button type="button" variant="ghost" fullWidth onClick={() => setStep(1)}>
              Change email
            </Button>
          </div>
        )}

        {step === 3 && (
          <form
            onSubmit={passwordForm.handleSubmit(onResetSubmit)}
            className="space-y-5"
          >
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register("newPassword", {
                required: "Password is required",
                minLength: { value: 8, message: "At least 8 characters" },
                validate: {
                  uppercase: (v) =>
                    PASSWORD_POLICY_REGEX.uppercase.test(v) || "Include an uppercase letter",
                  number: (v) => PASSWORD_POLICY_REGEX.number.test(v) || "Include a number",
                  special: (v) =>
                    PASSWORD_POLICY_REGEX.special.test(v) || "Include a special character",
                },
              })}
            />
            <PasswordStrengthMeter password={newPassword || ""} />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register("confirmPassword", {
                required: "Please confirm your password",
                validate: (v) =>
                  v === passwordForm.getValues("newPassword") || "Passwords do not match",
              })}
            />
            <Button type="submit" fullWidth loading={submittingReset} size="lg">
              Update password
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-slate-600">
          <Link
            to="/login"
            className="font-medium text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            ← Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
