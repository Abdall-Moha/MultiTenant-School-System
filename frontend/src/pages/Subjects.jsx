import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiEdit2, FiEye, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const emptySubject = { name: "", status: "ACTIVE" };

export default function Subjects() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";
  const [subjects, setSubjects] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [viewSubject, setViewSubject] = useState(null);
  const [form, setForm] = useState(emptySubject);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  useEffect(() => {
    let current = true;
    api
      .get("/subjects", {
        params: {
          page,
          limit: PAGE_SIZE,
          search,
          status: statusFilter || undefined,
        },
      })
      .then(({ data }) => {
        if (!current) return;
        setSubjects(data.subjects || []);
        setPagination(
          data.pagination || {
            page,
            total: data.subjects?.length || 0,
            totalPages: 1,
          },
        );
        setError("");
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
  }, [page, search, statusFilter]);

  function openCreate() {
    setEditingSubject(null);
    setForm(emptySubject);
    setError("");
    setModalOpen(true);
  }

  function openEdit(subject) {
    setEditingSubject(subject);
    setForm({ name: subject.name || "", status: subject.status || "ACTIVE" });
    setError("");
    setModalOpen(true);
  }

  async function saveSubject(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = { name: form.name.trim(), status: form.status };
    try {
      if (editingSubject) {
        await api.put(`/subjects/${editingSubject._id}`, payload);
        setSuccess("Subject updated successfully.");
      } else {
        await api.post("/subjects", payload);
        setSuccess("Subject created successfully.");
      }
      setModalOpen(false);
      setPage(1);
      if (page === 1) refreshSubjects();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function refreshSubjects() {
    setLoading(true);
    try {
      const { data } = await api.get("/subjects", {
        params: {
          page,
          limit: PAGE_SIZE,
          search,
          status: statusFilter || undefined,
        },
      });
      setSubjects(data.subjects || []);
      setPagination(
        data.pagination || {
          page,
          total: data.subjects?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function viewDetails(subject) {
    try {
      const { data } = await api.get(`/subjects/${subject._id}`);
      setViewSubject(data.subject);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function deactivateSubject(subject) {
    if (!window.confirm(`Deactivate ${subject.name}?`)) return;
    setError("");
    setSuccess("");
    try {
      const { data } = await api.delete(`/subjects/${subject._id}`);
      setSuccess(data.message || "Subject deactivated successfully.");
      await refreshSubjects();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Academic records</span>
          <h2>Subjects</h2>
          <p>Manage the subjects offered by your school.</p>
        </div>
        {canManage && (
          <button className="primary-button" type="button" onClick={openCreate}>
            <FiPlus /> Add Subject
          </button>
        )}
      </div>
      {error && !modalOpen && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="success-message page-message">
          {success}
        </div>
      )}
      <div className="directory-filters">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const nextSearch = searchInput.trim();
            if (nextSearch === search) {
              refreshSubjects();
              return;
            }
            setLoading(true);
            setPage(1);
            setSearch(nextSearch);
          }}
        >
          <label className="visually-hidden" htmlFor="subject-search">
            Search subjects
          </label>
          <input
            id="subject-search"
            className="form-input"
            placeholder="Search by subject name"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button className="secondary-button" type="submit">
            Search
          </button>
        </form>
        <select
          className="form-input"
          aria-label="Filter subjects by status"
          value={statusFilter}
          onChange={(event) => {
            setLoading(true);
            setPage(1);
            setStatusFilter(event.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
      </div>
      <div className="school-table-card">
        <div className="users-table-title">
          <strong>Subject directory</strong>
          <span>{pagination.total} subjects</span>
        </div>
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Subject Name</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="table-message">
                    Loading subjects…
                  </td>
                </tr>
              ) : subjects.length === 0 ? (
                <tr>
                  <td colSpan="4" className="table-message">
                    No subjects found.
                  </td>
                </tr>
              ) : (
                subjects.map((subject) => (
                  <tr key={subject._id}>
                    <td className="table-name">{subject.name}</td>
                    <td>
                      <span
                        className={`status-pill status-${subject.status?.toLowerCase()}`}
                      >
                        {subject.status}
                      </span>
                    </td>
                    <td>
                      {subject.createdAt
                        ? new Date(subject.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <div className="school-actions">
                        <button
                          className="edit-link"
                          type="button"
                          onClick={() => viewDetails(subject)}
                        >
                          <FiEye /> View
                        </button>
                        {canManage && (
                          <>
                            <button
                              className="edit-link"
                              type="button"
                              onClick={() => openEdit(subject)}
                            >
                              <FiEdit2 /> Edit
                            </button>
                            {subject.status === "ACTIVE" && (
                              <button
                                className="status-action"
                                type="button"
                                onClick={() => deactivateSubject(subject)}
                              >
                                Deactivate
                              </button>
                            )}
                          </>
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
              onClick={() => {
                setLoading(true);
                setPage((value) => Math.max(1, value - 1));
              }}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setPage((value) =>
                  Math.min(pagination.totalPages || 1, value + 1),
                );
              }}
              disabled={loading || page >= (pagination.totalPages || 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

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
            aria-labelledby="subject-form-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingSubject ? "Update subject" : "New subject"}
                </span>
                <h2 id="subject-form-title">
                  {editingSubject ? "Edit Subject" : "Add Subject"}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveSubject}>
              <label htmlFor="subject-name">Subject Name</label>
              <input
                id="subject-name"
                className="form-input"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
              <label htmlFor="subject-status">Status</label>
              <select
                id="subject-status"
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
                    : editingSubject
                      ? "Save changes"
                      : "Create Subject"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {viewSubject && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewSubject(null);
          }}
        >
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subject-details-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Subject details</span>
                <h2 id="subject-details-title">{viewSubject.name}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close"
                onClick={() => setViewSubject(null)}
              >
                ×
              </button>
            </div>
            <div className="credential-details">
              <p>
                <span>Status</span>
                <strong>{viewSubject.status}</strong>
              </p>
              <p>
                <span>Created</span>
                <strong>
                  {viewSubject.createdAt
                    ? new Date(viewSubject.createdAt).toLocaleDateString()
                    : "—"}
                </strong>
              </p>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
