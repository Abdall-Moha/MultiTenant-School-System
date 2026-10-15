import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useState } from "react";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { getApiError } from "../services/api.js";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  usePageNotifications(error);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const value = identifier.trim();
      const credentials = value.includes("@")
        ? { email: value, password }
        : { username: value, password };
      const user = await login(credentials);
      navigate(user.mustChangePassword ? "/change-password" : "/dashboard", {
        replace: true,
      });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          Schomas
        </div>
        <span className="eyebrow">Welcome back</span>
        <h1>Sign in to your account</h1>
        <label htmlFor="identifier">Email / Username</label>
        <div className="input-wrap">
          <FiUser />
          <input
            id="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Enter your email or username"
            required
          />
        </div>
        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <FiLock />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />
          <button
            type="button"
            className="password-visibility-button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <button
          className="primary-button login-submit"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign In"} <FiArrowRight />
        </button>
      </form>
    </main>
  );
}
