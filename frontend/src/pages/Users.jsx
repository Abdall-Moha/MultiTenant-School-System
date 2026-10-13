import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;

export default function Users() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(
    () => user?.role === "SUPER_ADMIN",
  );
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [resetSaving, setResetSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    schoolId: "",
  });
  const [statusChanges, setStatusChanges] = useState({});

  useEffect(() => {
    let isCurrentPage = true;
    api
      .get("/users", { params: { page, limit: PAGE_SIZE } })
      .then(({ data }) => {
        if (!isCurrentPage) return;
        setUsers(data.users || []);
        setPagination(
          data.pagination || {
            page,
            total: data.users?.length || 0,
            totalPages: 1,
          },
        );
      })
      .catch((requestError) => {
        if (isCurrentPage) setError(getApiError(requestError));
      })
      .finally(() => {
        if (isCurrentPage) setLoading(false);
      });
    return () => {
      isCurrentPage = false;
    };
  }, [page, reloadCount]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api
      .get("/schools", { params: { page: 1, limit: 100 } })
      .then(async ({ data }) => {
        const pages = Array.from(
          { length: Math.max(0, (data.pagination?.totalPages || 1) - 1) },
          (_, index) => index + 2,
        );
        const remainingPages = await Promise.all(
          pages.map((schoolPage) =>
            api.get("/schools", { params: { page: schoolPage, limit: 100 } }),
          ),
        );
        setSchools([
          ...(data.schools || []),
          ...remainingPages.flatMap((response) => response.data.schools || []),
        ]);
      })
      .catch((requestError) => setError(getApiError(requestError)))
      .finally(() => setSchoolsLoading(false));
  }, [isSuperAdmin]);

  const activeSchools = useMemo(
    () => schools.filter((school) => school.status === "ACTIVE"),
    [schools],
  );
  const schoolNames = useMemo(
    () =>
      new Map(schools.map((school) => [String(school._id), school.schoolName])),
    [schools],
  );

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function createAdmin(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const newUser = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: "ADMIN",
      };
      // The backend derives an Admin's school from the authenticated account.
      if (isSuperAdmin) newUser.schoolId = form.schoolId;
      const { data } = await api.post("/users", newUser);
      setShowForm(false);
      setForm({ name: "", email: "", password: "", schoolId: "" });
      setSuccess(data.message || "School Admin created successfully.");
      setLoading(true);
      if (page !== 1) setPage(1);
      else setReloadCount((count) => count + 1);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus(targetUser) {
    const status = statusChanges[targetUser._id] || targetUser.status;
    if (status === targetUser.status) return;
    setError("");
    setSuccess("");
    try {
      await api.put(`/users/${targetUser._id}`, { status });
      setSuccess("User status updated.");
      setLoading(true);
      setReloadCount((count) => count + 1);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setResetSaving(true);
    try {
      const { data } = await api.put(
        `/users/${resetTarget._id}/reset-password`,
        { newPassword: resetForm.newPassword },
      );
      setResetTarget(null);
      setResetForm({ newPassword: "", confirmPassword: "" });
      setSuccess(
        `${data.message || "Password reset successfully."} The user must change it after signing in.`,
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <section className="users-page">
      <div className="users-heading">
        <div>
          <span className="eyebrow">System access</span>
          <h2>Users</h2>
          <p>Manage system accounts and access status.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setError("");
            setSuccess("");
            setShowForm(true);
          }}
        >
          <FiPlus /> {isSuperAdmin ? "Add School Admin" : "Add User"}
        </button>
      </div>
      {error && (
        <div role="alert" className="form-error users-message">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="success-message users-message">
          {success}
        </div>
      )}

      <div className="users-table-card">
        <div className="users-table-title">
          <strong>All users</strong>
          <span>{pagination.total ?? 0} accounts</span>
        </div>
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>School</th>
                <th>Status</th>
                <th>Update status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="table-message">
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="8" className="table-message">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((item) => {
                  const schoolName = isSuperAdmin
                    ? schoolNames.get(String(item.schoolId)) ||
                      (item.schoolId ? "School" : "Platform")
                    : "Your school";
                  const isSelf =
                    String(item._id) === String(user?.id || user?._id);
                  return (
                    <tr key={item._id}>
                      <td className="table-name">{item.name || "—"}</td>
                      <td>{item.email || "—"}</td>
                      <td>{item.username || "—"}</td>
                      <td>
                        <span className="role-pill">{item.role}</span>
                      </td>
                      <td>{schoolName}</td>
                      <td>
                        <span
                          className={`status-pill status-${(item.status || "").toLowerCase()}`}
                        >
                          {item.status || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="status-control">
                          <select
                            aria-label={`Status for ${item.name}`}
                            value={statusChanges[item._id] || item.status}
                            onChange={(event) =>
                              setStatusChanges({
                                ...statusChanges,
                                [item._id]: event.target.value,
                              })
                            }
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="SUSPENDED">SUSPENDED</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => saveStatus(item)}
                            disabled={
                              (statusChanges[item._id] || item.status) ===
                              item.status
                            }
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td>
                        {!isSelf && (
                          <button
                            className="reset-password-action"
                            type="button"
                            onClick={() => {
                              setError("");
                              setResetForm({
                                newPassword: "",
                                confirmPassword: "",
                              });
                              setResetTarget(item);
                            }}
                          >
                            Reset Password
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>
            Page {pagination.page || page} of {pagination.totalPages || 1}
          </span>
          <div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setPage((current) =>
                  Math.min(pagination.totalPages || 1, current + 1),
                );
              }}
              disabled={loading || page >= (pagination.totalPages || 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setShowForm(false);
          }}
        >
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-admin-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">New account</span>
                <h2 id="add-admin-title">
                  {isSuperAdmin ? "Add School Admin" : "Add User"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                <FiX />
              </button>
            </div>
            <p className="modal-description">
              {isSuperAdmin
                ? "Create an administrator account for one active school."
                : "Create an administrator account for your school."}
            </p>
            <form onSubmit={createAdmin}>
              <label htmlFor="admin-name">Name</label>
              <input
                id="admin-name"
                className="form-input"
                name="name"
                value={form.name}
                onChange={updateForm}
                required
              />
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                className="form-input"
                name="email"
                type="email"
                value={form.email}
                onChange={updateForm}
                required
              />
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                className="form-input"
                name="password"
                type="password"
                minLength={8}
                value={form.password}
                onChange={updateForm}
                required
              />
              <span className="input-hint">Use at least 8 characters.</span>
              {isSuperAdmin && (
                <>
                  <label htmlFor="admin-school">School</label>
                  <select
                    id="admin-school"
                    className="form-input"
                    name="schoolId"
                    value={form.schoolId}
                    onChange={updateForm}
                    required
                    disabled={schoolsLoading}
                  >
                    <option value="">
                      {schoolsLoading ? "Loading schools…" : "Select a school"}
                    </option>
                    {activeSchools.map((school) => (
                      <option key={school._id} value={school._id}>
                        {school.schoolName} ({school.schoolId})
                      </option>
                    ))}
                  </select>
                  {!schoolsLoading && activeSchools.length === 0 && (
                    <p className="input-hint">
                      No active schools are available.
                    </p>
                  )}
                </>
              )}
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    saving ||
                    (isSuperAdmin &&
                      (schoolsLoading || activeSchools.length === 0))
                  }
                >
                  {saving ? "Creating…" : "Create Admin"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {resetTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !resetSaving)
              setResetTarget(null);
          }}
        >
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-user-password-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Account security</span>
                <h2 id="reset-user-password-title">Reset Password</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setResetTarget(null)}
                disabled={resetSaving}
              >
                <FiX />
              </button>
            </div>
            <p className="modal-description">
              Set a temporary password for {resetTarget.name}. They will need to
              change it after signing in.
            </p>
            <form onSubmit={resetPassword}>
              <label htmlFor="reset-new-password">New Password</label>
              <input
                id="reset-new-password"
                className="form-input"
                type="password"
                minLength={8}
                value={resetForm.newPassword}
                onChange={(event) =>
                  setResetForm({
                    ...resetForm,
                    newPassword: event.target.value,
                  })
                }
                required
              />
              <span className="input-hint">Use at least 8 characters.</span>
              <label htmlFor="reset-confirm-password">
                Confirm New Password
              </label>
              <input
                id="reset-confirm-password"
                className="form-input"
                type="password"
                minLength={8}
                value={resetForm.confirmPassword}
                onChange={(event) =>
                  setResetForm({
                    ...resetForm,
                    confirmPassword: event.target.value,
                  })
                }
                required
              />
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setResetTarget(null)}
                  disabled={resetSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={resetSaving}
                >
                  {resetSaving ? "Resetting…" : "Reset Password"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
