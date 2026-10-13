import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useState } from "react";
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { getApiError } from "../services/api.js";

export default function ChangePassword() {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState({
    current: false,
    next: false,
    confirmation: false,
  });
  const [error, setError] = useState("");
  usePageNotifications(error);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation)
      return setError("The new passwords do not match.");
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="password-page">
      <form className="password-card" onSubmit={handleSubmit}>
        <div className="password-icon">
          <FiLock />
        </div>
        <span className="eyebrow">Account security</span>
        <h1>Choose a new password</h1>
        <p>Your account requires a password change before you can continue.</p>
        <label htmlFor="currentPassword">Current password</label>
        <div className="password-field">
          <input
            className="form-input"
            id="currentPassword"
            type={visible.current ? "text" : "password"}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <button
            className="password-visibility-button"
            type="button"
            aria-label={
              visible.current
                ? "Hide current password"
                : "Show current password"
            }
            onClick={() =>
              setVisible((state) => ({ ...state, current: !state.current }))
            }
          >
            {visible.current ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        <label htmlFor="newPassword">New password</label>
        <div className="password-field">
          <input
            className="form-input"
            id="newPassword"
            type={visible.next ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <button
            className="password-visibility-button"
            type="button"
            aria-label={
              visible.next ? "Hide new password" : "Show new password"
            }
            onClick={() =>
              setVisible((state) => ({ ...state, next: !state.next }))
            }
          >
            {visible.next ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        <span className="input-hint">Use at least 8 characters.</span>
        <label htmlFor="confirmation">Confirm new password</label>
        <div className="password-field">
          <input
            className="form-input"
            id="confirmation"
            type={visible.confirmation ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
          <button
            className="password-visibility-button"
            type="button"
            aria-label={
              visible.confirmation ? "Hide confirmation" : "Show confirmation"
            }
            onClick={() =>
              setVisible((state) => ({
                ...state,
                confirmation: !state.confirmation,
              }))
            }
          >
            {visible.confirmation ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? "Updating…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
