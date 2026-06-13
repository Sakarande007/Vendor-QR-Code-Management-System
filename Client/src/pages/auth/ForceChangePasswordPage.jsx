import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { AuthLayout } from "../../components/auth/AuthLayout.jsx";
import { PasswordStrengthMeter } from "../../components/auth/PasswordStrengthMeter.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { PageSpinner } from "../../components/ui/Spinner.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { parseApiError } from "../../api/errors.js";
import { PASSWORD_POLICY_REGEX } from "../../lib/passwordStrength.js";

/**
 * @typedef {{ newPassword: string, confirmPassword: string }} FormValues
 */

export function ForceChangePasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { completeFirstLoginPassword, isAuthenticated, isAdmin, isLoading } = useAuth();
  const [formError, setFormError] = useState(null);

  const tempToken = location.state?.tempToken;
  const vendorUser = location.state?.user;
  const loginMessage = location.state?.message;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onChange",
  });

  const newPassword = watch("newPassword");

  if (isLoading) {
    return <PageSpinner message="Checking session…" />;
  }

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? "/admin/dashboard" : "/dashboard"} replace />;
  }

  if (!tempToken) {
    return <Navigate to="/login" replace />;
  }

  /** @param {FormValues} values */
  const onSubmit = async (values) => {
    setFormError(null);

    if (values.newPassword !== values.confirmPassword) {
      setFormError({ message: "Passwords do not match" });
      return;
    }

    try {
      const user = await completeFirstLoginPassword({
        tempToken,
        newPassword: values.newPassword,
      });

      const target =
        user.role === "admin" || user.role === "superadmin"
          ? "/admin/dashboard"
          : "/dashboard";
      navigate(target, { replace: true });
    } catch (err) {
      setFormError(parseApiError(err));
    }
  };

  const displayName =
    vendorUser?.vendorName ||
    vendorUser?.vendor_name ||
    vendorUser?.vendorCode ||
    vendorUser?.vendor_code ||
    "your account";

  return (
    <AuthLayout
      title="Set your new password"
      subtitle="For security, you must choose a new password before using the vendor portal."
    >
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {loginMessage && (
          <Alert variant="info" className="mb-6">
            {loginMessage}
          </Alert>
        )}

        <p className="mb-6 text-sm text-slate-600">
          Welcome, <strong>{displayName}</strong>. Your temporary password from the admin cannot be
          used going forward — choose a new one that meets the policy below.
        </p>

        {formError && (
          <Alert variant="error" className="mb-6" onDismiss={() => setFormError(null)}>
            {formError.message}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              error={errors.newPassword?.message}
              {...register("newPassword", {
                required: "New password is required",
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
          </div>

          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmPassword?.message}
            {...register("confirmPassword", {
              required: "Please confirm your password",
              validate: (value) =>
                value === newPassword || "Passwords do not match",
            })}
          />

          <Button type="submit" fullWidth loading={isSubmitting} size="lg">
            Save and continue
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
