import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiEye, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const emptyParent = {
  fullName: "",
  phoneNumber: "",
  status: "ACTIVE",
  schoolId: "",
};

async function getAllSchools() {
  const schools = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const { data } = await api.get("/schools", {
      params: { page, limit: 100 },
    });
    schools.push(...(data.schools || []));
    page += 1;
    hasNextPage = page <= (data.pagination?.totalPages || 1);
  }
  return schools;
}

export default function Parents() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [parents, setParents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParent, setEditingParent] = useState(null);
  const [form, setForm] = useState(emptyParent);
  const [details, setDetails] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  const loadParents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/parents", {
        params: { page, limit: PAGE_SIZE },
      });
      setParents(data.parents || []);
      setPagination(
        data.pagination || {
          page,
          total: data.parents?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    let current = true;
    api
      .get("/parents", { params: { page, limit: PAGE_SIZE } })
      .then(({ data }) => {
        if (!current) return;
        setParents(data.parents || []);
        setPagination(
          data.pagination || {
            page,
            total: data.parents?.length || 0,
            totalPages: 1,
          },
        );
      })
      .catch((requestError) => {
        if (current) setError(getApiError(requestError));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    getAllSchools()
      .then(setSchools)
      .catch((requestError) => setError(getApiError(requestError)));
  }, [isSuperAdmin]);

  function openCreate() {
    setEditingParent(null);
    setForm(emptyParent);
    setError("");
    setModalOpen(true);
  }

  function openEdit(parent) {
    setEditingParent(parent);
    setForm({
      fullName: parent.fullName || "",
      phoneNumber: parent.phoneNumber || "",
      status: parent.status || "ACTIVE",
      schoolId: "",
    });
    setError("");
    setModalOpen(true);
  }

  async function saveParent(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      fullName: form.fullName.trim(),
      phoneNumber: form.phoneNumber.trim(),
      status: form.status,
    };
    try {
      if (editingParent) {
        await api.put(`/parents/${editingParent._id}`, payload);
        setSuccess("Parent updated successfully.");
        setModalOpen(false);
      } else {
        if (isSuperAdmin) payload.schoolId = form.schoolId;
        const { data } = await api.post("/parents", payload);
        setModalOpen(false);
        setCredentials(data.login || null);
      }
      await loadParents();
    } catch (requestError) {
      const message = getApiError(requestError);
      setError(
        message.toLowerCase().includes("phone number") &&
          message.toLowerCase().includes("already")
          ? "This phone number is already used by an account in this school."
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function viewDetails(parent) {
    setDetails({ loading: true, parent, students: [] });
    setError("");
    try {
      const { data } = await api.get(`/parents/${parent._id}`);
      setDetails({
        loading: false,
        parent: data.parent,
        students: data.students || [],
      });
    } catch (requestError) {
      setDetails(null);
      setError(getApiError(requestError));
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (resetForm.newPassword.length < 8) {
      setError("The new password must be at least 8 characters.");
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!window.confirm(`Reset the password for ${resetTarget.fullName}?`))
      return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put(
        `/parents/${resetTarget._id}/reset-password`,
        { newPassword: resetForm.newPassword },
      );
      setSuccess(
        data.message ||
          "Parent password reset. They must change it after login.",
      );
      setResetTarget(null);
      setResetForm({ newPassword: "", confirmPassword: "" });
      await loadParents();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateParent(parent) {
    if (!window.confirm(`Deactivate ${parent.fullName}?`)) return;
    setError("");
    setSuccess("");
    try {
      const { data } = await api.delete(`/parents/${parent._id}`);
      setSuccess(data.message || "Parent deactivated successfully.");
      await loadParents();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Academic records</span>
          <h2>Parents</h2>
          <p>Manage parent accounts and the students linked to them.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <FiPlus /> Add Parent
        </button>
      </div>
      {error && !modalOpen && !resetTarget && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="success-message page-message">
          {success}
        </div>
      )}
      {loading ? (
        <div className="school-loading">Loading parents…</div>
      ) : (
        <div className="school-table-card">
          <div className="users-table-title">
            <strong>Parent directory</strong>
            <span>{pagination.total} parents</span>
          </div>
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Parent Name</th>
                  <th>Phone Number</th>
                  <th>Children</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parents.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="table-message">
                      No parents found.
                    </td>
                  </tr>
                ) : (
                  parents.map((parent) => (
                    <tr key={parent._id}>
                      <td className="table-name">{parent.fullName}</td>
                      <td>{parent.phoneNumber}</td>
                      <td>{parent.students?.length || 0}</td>
                      <td>
                        <span
                          className={`status-pill status-${parent.status?.toLowerCase()}`}
                        >
                          {parent.status}
                        </span>
                      </td>
                      <td>
                        <div className="school-actions">
                          <button
                            className="edit-link"
                            type="button"
                            onClick={() => viewDetails(parent)}
                          >
                            <FiEye /> View
                          </button>
                          <button
                            className="edit-link"
                            type="button"
                            onClick={() => openEdit(parent)}
                          >
                            <FiEdit2 /> Edit
                          </button>
                          <button
                            className="status-action"
                            type="button"
                            onClick={() => {
                              setResetTarget(parent);
                              setError("");
                            }}
                          >
                            Reset Password
                          </button>
                          {parent.status === "ACTIVE" && (
                            <button
                              className="status-action"
                              type="button"
                              onClick={() => deactivateParent(parent)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
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
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((value) =>
                    Math.min(pagination.totalPages || 1, value + 1),
                  )
                }
                disabled={loading || page >= (pagination.totalPages || 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setModalOpen(false);
          }}
        >
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingParent ? "Update parent" : "New parent"}
                </span>
                <h2 id="parent-modal-title">
                  {editingParent ? "Edit parent" : "Add Parent"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>
            {!editingParent && (
              <p className="modal-description">
                A parent login account will be created automatically. The parent
                must change the initial password after first login.
              </p>
            )}
            <form onSubmit={saveParent}>
              {isSuperAdmin && !editingParent && (
                <>
                  <label htmlFor="parent-school">School</label>
                  <select
                    id="parent-school"
                    className="form-input"
                    value={form.schoolId}
                    onChange={(event) =>
                      setForm({ ...form, schoolId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select a school</option>
                    {schools.map((school) => (
                      <option key={school._id} value={school._id}>
                        {school.schoolName} ({school.schoolId})
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="parent-name">Full Name</label>
              <input
                id="parent-name"
                className="form-input"
                value={form.fullName}
                onChange={(event) =>
                  setForm({ ...form, fullName: event.target.value })
                }
                required
              />
              <label htmlFor="parent-phone">Phone Number</label>
              <input
                id="parent-phone"
                className="form-input"
                type="tel"
                value={form.phoneNumber}
                onChange={(event) =>
                  setForm({ ...form, phoneNumber: event.target.value })
                }
                required
              />
              <label htmlFor="parent-status">Status</label>
              <select
                id="parent-status"
                className="form-input"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editingParent
                      ? "Save changes"
                      : "Create Parent"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {details && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetails(null);
          }}
        >
          <section
            className="user-modal parent-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-details-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Parent details</span>
                <h2 id="parent-details-title">{details.parent.fullName}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                type="button"
                onClick={() => setDetails(null)}
              >
                ×
              </button>
            </div>
            {details.loading ? (
              <div className="school-loading">Loading parent details…</div>
            ) : (
              <>
                <div className="credential-details">
                  <p>
                    <span>Phone Number</span>
                    <strong>{details.parent.phoneNumber}</strong>
                  </p>
                  <p>
                    <span>Status</span>
                    <strong>{details.parent.status}</strong>
                  </p>
                </div>
                <h3 className="children-heading">
                  Children ({details.students.length})
                </h3>
                <div className="table-scroll">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Role Number</th>
                        <th>Class</th>
                        <th>Academic Year</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.students.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="table-message">
                            No students assigned to this parent.
                          </td>
                        </tr>
                      ) : (
                        details.students.map((student) => (
                          <tr key={student._id}>
                            <td className="table-name">{student.fullName}</td>
                            <td>{student.roleNumber}</td>
                            <td>
                              {student.currentEnrollment?.classId?.name || "—"}
                            </td>
                            <td>
                              {student.currentEnrollment?.academicYearId
                                ?.name || "—"}
                            </td>
                            <td>
                              <span
                                className={`status-pill status-${student.status?.toLowerCase()}`}
                              >
                                {student.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {resetTarget && (
        <div className="modal-backdrop">
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-reset-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Account security</span>
                <h2 id="parent-reset-title">Reset parent password</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                type="button"
                onClick={() => setResetTarget(null)}
                disabled={saving}
              >
                ×
              </button>
            </div>
            <p className="modal-description">
              {resetTarget.fullName} will be asked to change this password after
              logging in.
            </p>
            <form onSubmit={resetPassword}>
              <label htmlFor="parent-new-password">New Password</label>
              <input
                id="parent-new-password"
                className="form-input"
                type="password"
                minLength="8"
                value={resetForm.newPassword}
                onChange={(event) =>
                  setResetForm({
                    ...resetForm,
                    newPassword: event.target.value,
                  })
                }
                required
              />
              <label htmlFor="parent-confirm-password">
                Confirm New Password
              </label>
              <input
                id="parent-confirm-password"
                className="form-input"
                type="password"
                minLength="8"
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
                  className="secondary-button"
                  type="button"
                  onClick={() => setResetTarget(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Reset Password"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {credentials && (
        <div className="modal-backdrop">
          <section
            className="user-modal credential-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-credentials-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Parent created successfully</span>
                <h2 id="parent-credentials-title">Parent Login</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                type="button"
                onClick={() => setCredentials(null)}
              >
                ×
              </button>
            </div>
            <div className="credential-details">
              <p>
                <span>School ID</span>
                <strong>{credentials.schoolId}</strong>
              </p>
              <p>
                <span>Username</span>
                <strong>{credentials.username}</strong>
              </p>
              <p>
                <span>Initial Password</span>
                <strong>{credentials.password}</strong>
              </p>
            </div>
            <p className="modal-description">
              Share these details securely. The parent must change the initial
              password after first login.
            </p>
            <div className="modal-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => setCredentials(null)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
