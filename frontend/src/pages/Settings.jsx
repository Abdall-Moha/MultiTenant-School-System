import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useState } from "react";
import { FiLock, FiUser } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import { getApiError } from "../services/api.js";

export default function Settings() {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);
  const [saving, setSaving] = useState(false);

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submitPassword(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.newPassword !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSuccess("Password changed successfully.");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-heading">
        <span className="eyebrow">Preferences</span>
        <h2>Settings</h2>
        <p>Manage your account details and password.</p>
      </div>
      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon">
            <FiUser />
          </span>
          <div>
            <h3>My Account</h3>
            <p>Your signed-in account information.</p>
          </div>
        </div>
        <div className="account-details">
          <AccountDetail label="Name" value={user?.name} />
          <AccountDetail
            label="Email / Username"
            value={user?.email || user?.username}
          />
          <AccountDetail
            label="Role"
            value={user?.role?.replaceAll("_", " ")}
          />
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon">
            <FiLock />
          </span>
          <div>
            <h3>Change Password</h3>
            <p>Choose a new password for your account.</p>
          </div>
        </div>
        <form className="settings-password-form" onSubmit={submitPassword}>
          <label htmlFor="settings-current-password">Current Password</label>
          <input
            className="form-input"
            id="settings-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={updateForm}
            required
          />
          <label htmlFor="settings-new-password">New Password</label>
          <input
            className="form-input"
            id="settings-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.newPassword}
            onChange={updateForm}
            required
          />
          <span className="input-hint">Use at least 8 characters.</span>
          <label htmlFor="settings-confirm-password">
            Confirm New Password
          </label>
          <input
            className="form-input"
            id="settings-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.confirmPassword}
            onChange={updateForm}
            required
          />
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="success-message">
              {success}
            </div>
          )}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Updating…" : "Change Password"}
          </button>
        </form>
      </section>
    </section>
  );
}

function AccountDetail({ label, value }) {
  return (
    <div className="account-detail">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}
