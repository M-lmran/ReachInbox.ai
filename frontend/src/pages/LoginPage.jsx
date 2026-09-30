import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, Info, MailCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/authService";
import { isValidEmail } from "@/utils/emailValidator";
import { getErrorMessage } from "@/lib/apiClient";
import { toast } from "sonner";

/**
 * Official Google "G" mark (four brand colours). Used unmodified, per Google's
 * branding requirements — this is the sign-in affordance, not decoration.
 */
const GoogleLogo = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const MIN_PASSWORD_LENGTH = 6;

/** Password input with a leading lock and a reveal toggle. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  testId,
  placeholder = "••••••••",
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          className="h-11 pl-9 pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          data-testid={`toggle-${testId}`}
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-rose-600" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loginDev, loginWithPassword } = useAuth();

  const [config, setConfig] = useState(null);
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const supabaseReady = Boolean(config?.supabaseConfigured);
  const isSignup = mode === "signup";

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    authService.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setFormError("");
    setConfirmationSent(false);
    setPassword("");
    setConfirmPassword("");
  };

  const handleGoogle = async () => {
    if (!supabaseReady || googleLoading) return;
    setGoogleLoading(true);
    setFormError("");
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      setFormError(getErrorMessage(err, "Google sign-in failed. Please try again."));
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");

    const nextErrors = {};
    if (!email.trim()) nextErrors.email = "Email address is required";
    else if (!isValidEmail(email)) nextErrors.email = "Enter a valid email address";
    if (!password) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await loginWithPassword(email.trim().toLowerCase(), password);
      toast.success("Signed in");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      // Supabase returns the same error for a bad password and an unknown
      // address; surface it without revealing which was wrong.
      const raw = getErrorMessage(err, "Sign-in failed. Please try again.");
      setFormError(
        /invalid login credentials/i.test(raw)
          ? "Incorrect email or password."
          : /email not confirmed/i.test(raw)
            ? "This email hasn't been confirmed yet. Check your inbox for the confirmation link."
            : raw,
      );
      // Fields are left in place so the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");

    const nextErrors = {};
    if (!email.trim()) nextErrors.email = "Email address is required";
    else if (!isValidEmail(email)) nextErrors.email = "Enter a valid email address";
    if (!password) nextErrors.password = "Password is required";
    else if (password.length < MIN_PASSWORD_LENGTH)
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (!confirmPassword) nextErrors.confirmPassword = "Please confirm your password";
    else if (password && confirmPassword !== password)
      nextErrors.confirmPassword = "Passwords do not match";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await authService.signUpWithPassword(email.trim().toLowerCase(), password);
      if (result.needsConfirmation) {
        // No session was issued: the account exists but cannot sign in yet.
        setConfirmationSent(true);
      } else {
        toast.success("Account created");
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      const raw = getErrorMessage(err, "Could not create your account. Please try again.");
      setFormError(
        /already registered|already exists/i.test(raw)
          ? "An account with this email already exists. Try signing in instead."
          : /rate limit|too many/i.test(raw)
            ? "Supabase's confirmation-email limit has been reached. Its built-in mailer only allows a couple of emails per hour — wait about an hour, or turn off email confirmation in your Supabase project (Authentication → Providers → Email) to sign up without one."
            : /password/i.test(raw) && /least|short/i.test(raw)
              ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
              : raw,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setSubmitting(true);
    setFormError("");
    try {
      await loginDev();
      toast.success("Signed in (demo mode)");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err, "Sign-in failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <Logo variant="mark" size={44} className="shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">ReachInbox</span>
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
            {confirmationSent
              ? "Confirm your email"
              : isSignup
                ? "Create your ReachInbox account"
                : "Welcome back to ReachInbox"}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {confirmationSent
              ? "One more step before you can sign in."
              : isSignup
                ? "Set up an account to start scheduling and tracking your campaigns."
                : "Sign in to manage your email campaigns, schedule messages, and track delivery activity."}
          </p>
        </div>

        {/* Card */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 surface-shadow sm:p-8">
          {confirmationSent ? (
            <div data-testid="confirm-sent" className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <MailCheck className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>.
                Open it to activate your account, then sign in.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                If an account already existed for that address, you&apos;ll receive a sign-in link
                instead. Didn&apos;t get anything? Check your spam folder.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => switchMode("signin")}
                data-testid="back-to-signin"
                className="mt-5 w-full gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Button>
            </div>
          ) : (
            <>
              {formError ? (
                <div
                  role="alert"
                  data-testid="login-error"
                  className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
                >
                  {formError}
                </div>
              ) : null}

              {/* Google — available for both sign-in and sign-up */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogle}
                disabled={!supabaseReady || googleLoading || submitting}
                data-testid="google-signin-button"
                className="h-11 w-full justify-center gap-3 text-sm font-semibold"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
                  </>
                ) : (
                  <>
                    <GoogleLogo /> Continue with Google
                  </>
                )}
              </Button>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isSignup ? "OR SIGN UP WITH EMAIL" : "OR CONTINUE WITH EMAIL"}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form
                onSubmit={isSignup ? handleSignUp : handleSignIn}
                className="space-y-4"
                noValidate
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="name@example.com"
                      data-testid="login-email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrors((p) => ({ ...p, email: undefined }));
                      }}
                      aria-invalid={Boolean(errors.email)}
                      className="h-11 pl-9"
                    />
                  </div>
                  {errors.email ? (
                    <p className="text-xs text-rose-600" data-testid="email-error">
                      {errors.email}
                    </p>
                  ) : null}
                </div>

                <PasswordField
                  id="password"
                  label="Password"
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  error={errors.password}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  testId="login-password"
                />

                {isSignup ? (
                  <PasswordField
                    id="confirmPassword"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={(v) => {
                      setConfirmPassword(v);
                      setErrors((p) => ({ ...p, confirmPassword: undefined }));
                    }}
                    error={errors.confirmPassword}
                    autoComplete="new-password"
                    testId="confirm-password"
                  />
                ) : null}

                {isSignup ? (
                  <p className="text-xs text-muted-foreground">
                    Use at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={submitting || googleLoading || !supabaseReady}
                  data-testid="login-submit"
                  className="h-11 w-full text-sm font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isSignup ? "Creating account…" : "Signing in…"}
                    </>
                  ) : isSignup ? (
                    "Create account"
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              {/* Supabase not configured: neither real flow can work. Say so plainly.
                  Dev sign-in is only offered when the server actually permits it. */}
              {config && !supabaseReady ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <p className="flex items-start gap-2 text-xs leading-snug text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Google and email sign-in are disabled because Supabase isn&apos;t configured on
                      the server. Add <code className="font-mono">SUPABASE_URL</code> and{" "}
                      <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to enable them.
                    </span>
                  </p>
                  {config.devLoginEnabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDemo}
                      disabled={submitting}
                      data-testid="demo-signin-button"
                      className="mt-3 w-full"
                    >
                      Continue in demo mode
                    </Button>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-amber-900">
                      Dev sign-in is disabled on this deployment, so no sign-in method is currently
                      available.
                    </p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
          {confirmationSent ? null : (
            <p data-testid="account-hint">
              {isSignup ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    data-testid="goto-signin"
                    className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    data-testid="goto-signup"
                    className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Create account
                  </button>
                </>
              )}
            </p>
          )}
          <p>
            By continuing, you agree to our{" "}
            <span className="font-medium text-foreground">Terms of Service</span> and{" "}
            <span className="font-medium text-foreground">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
