import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { AuthLayout } from "../../components/auth/AuthLayout.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { PageSpinner } from "../../components/ui/Spinner.jsx";
import { REMEMBER_VENDOR_CODE_KEY } from "../../constants/storageKeys.js";
import { useAuth } from "../../hooks/useAuth.js";
import { getLoginErrorContent, getLoginErrorVariant } from "../../lib/loginErrors.js";
import { parseApiError } from "../../api/errors.js";

/**
 * @typedef {{ identifier: string, password: string, rememberVendor: boolean }} LoginFormValues
 */

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />
      <path
        d="M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-4.42M9.88 5.09A10.94 10.94 0 0112 5c6 0 10 7 10 7a18.82 18.82 0 01-4.12 5.12M6.12 6.12A18.8 18.8 0 002 12s4 7 10 7a10.9 10.9 0 005.88-1.71"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const identifierRef = useRef(null);
  const { login, isAuthenticated, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;
  const successMessage = location.state?.message;

  const savedVendorCode =
    typeof window !== "undefined"
      ? localStorage.getItem(REMEMBER_VENDOR_CODE_KEY) || ""
      : "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      identifier: savedVendorCode,
      password: "",
      rememberVendor: Boolean(savedVendorCode),
    },
  });

  const identifierField = register("identifier", {
    required: "Vendor code or email is required",
    maxLength: { value: 255, message: "Must be 255 characters or less" },
  });

  const passwordField = register("password", {
    required: "Password is required",
  });

  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  if (isLoading) {
    return <PageSpinner message="Checking session…" />;
  }

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? "/admin/dashboard" : "/dashboard"} replace />;
  }

  /** @param {LoginFormValues} data */
  const onSubmit = async (data) => {
    setLoginError(null);

    try {
      const result = await login({
        identifier: data.identifier.trim(),
        password: data.password,
      });

      if (data.rememberVendor && !data.identifier.includes("@")) {
        localStorage.setItem(REMEMBER_VENDOR_CODE_KEY, data.identifier.trim());
      } else {
        localStorage.removeItem(REMEMBER_VENDOR_CODE_KEY);
      }

      if (result.mustChangePassword) {
        navigate("/change-password", {
          replace: true,
          state: {
            tempToken: result.tempToken,
            user: result.user,
            message: result.message,
          },
        });
        return;
      }

      const user = result.user;
      const target =
        from ||
        (user.role === "admin" || user.role === "superadmin"
          ? "/admin/dashboard"
          : "/dashboard");
      navigate(target, { replace: true });
    } catch (err) {
      const variant = getLoginErrorVariant(err);
      const content = getLoginErrorContent(variant);
      setLoginError({
        ...content,
        alertVariant: content.alertVariant,
        technical: import.meta.env.DEV ? parseApiError(err) : null,
      });
    }
  };

  return (
    <AuthLayout
      title="Sign in to your account"
      subtitle="Enter your vendor code or email and password to continue."
    >
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {successMessage && (
          <Alert variant="success" className="mb-6">
            {successMessage}
          </Alert>
        )}
        {loginError && (
          <Alert
            variant={loginError.alertVariant}
            title={loginError.title}
            className="mb-6"
            onDismiss={() => setLoginError(null)}
          >
            <p>{loginError.message}</p>
          </Alert>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
          aria-label="Sign in form"
        >
          <Input
            label="Vendor code or email"
            type="text"
            autoComplete="username"
            required
            error={errors.identifier?.message}
            name={identifierField.name}
            onBlur={identifierField.onBlur}
            onChange={identifierField.onChange}
            ref={(el) => {
              identifierField.ref(el);
              identifierRef.current = el;
            }}
          />

          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            error={errors.password?.message}
            icon={
              <button
                type="button"
                className="text-slate-500 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            }
            iconPosition="right"
            name={passwordField.name}
            onBlur={passwordField.onBlur}
            onChange={passwordField.onChange}
            ref={passwordField.ref}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                {...register("rememberVendor")}
                onChange={(e) => {
                  register("rememberVendor").onChange(e);
                  if (!e.target.checked) {
                    localStorage.removeItem(REMEMBER_VENDOR_CODE_KEY);
                  }
                }}
              />
              Remember vendor code
            </label>
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={isSubmitting} size="lg">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Protected access for authorized vendors and administrators only.
        </p>
      </div>
    </AuthLayout>
  );
}
