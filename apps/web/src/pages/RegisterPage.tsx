import { storage } from "../lib/storage";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api-client";
import { IS_NEW_KEY } from "../lib/onboarding-helpers";
import GoogleSignInButton from "../components/GoogleSignInButton";
import GitHubSignInButton from "../components/GitHubSignInButton";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const data = await apiPost<{ token?: string; created?: boolean }>("/auth/register", { email, password });

      // Auto-login: backend already returns a token on successful registration.
      if (data.token) {
        storage.set("token", data.token);
        if (data.created) storage.set(IS_NEW_KEY, "1");
        navigate("/");
      } else {
        navigate("/login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_30rem)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/logo/app-icon-gradient.svg"
            alt="Roundtable"
            className="mx-auto mb-4 h-14 w-14 rounded-3xl shadow-2xl"
          />
          <h1 className="heading text-3xl">Create account</h1>
          <p className="text-sm text-gray-500 mt-2">Get started with Roundtable</p>
        </div>

        {error && (
          <div className="card-dark border-red-500/30 bg-red-900/5 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="input-dark w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="input-dark w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Repeat your password"
              className="input-dark w-full"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full text-base py-2.5"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="dot-pulse"><span /><span /><span /></span>
                Creating account...
              </span>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-gray-500">
          <div className="h-px flex-1 bg-gray-700/60" />
          <span>or</span>
          <div className="h-px flex-1 bg-gray-700/60" />
        </div>

        <GoogleSignInButton onError={setError} />
        <div className="mt-3">
          <GitHubSignInButton onError={setError} />
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
