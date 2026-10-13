import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiEdit2, FiEye, FiPlus } from "react-icons/fi";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const emptyTeacher = {
  fullName: "",
  phone: "",
  qualification: "",
  hireDate: "",
  status: "ACTIVE",
};

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
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
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [viewTeacher, setViewTeacher] = useState(null);
  const [form, setForm] = useState(emptyTeacher);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  useEffect(() => {
    let current = true;
    api
      .get("/teachers", {
        params: {
          page,
          limit: PAGE_SIZE,
          search,
          status: statusFilter || undefined,
        },
      })
      .then(({ data }) => {
        if (!current) return;
        setTeachers(data.teachers || []);
        setPagination(
          data.pagination || {
            page,
            total: data.teachers?.length || 0,
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
    setEditingTeacher(null);
    setForm(emptyTeacher);
    setError("");
    setModalOpen(true);
  }

  function openEdit(teacher) {
    setEditingTeacher(teacher);
    setForm({
      fullName: teacher.fullName || "",
      phone: teacher.phone || "",
      qualification: teacher.qualification || "",
      hireDate: teacher.hireDate ? teacher.hireDate.slice(0, 10) : "",
      status: teacher.status || "ACTIVE",
    });
    setError("");
    setModalOpen(true);
  }

  async function saveTeacher(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      qualification: form.qualification.trim(),
      hireDate: form.hireDate || null,
      status: form.status,
    };
    try {
      if (editingTeacher) {
        await api.put(`/teachers/${editingTeacher._id}`, payload);
        setSuccess("Teacher updated successfully.");
      } else {
        await api.post("/teachers", payload);
        setSuccess(
          "Teacher created successfully. A login account was created automatically.",
        );
      }
      setModalOpen(false);
      setPage(1);
      if (page === 1) refreshTeachers();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function refreshTeachers() {
    setLoading(true);
    try {
      const { data } = await api.get("/teachers", {
        params: {
          page,
          limit: PAGE_SIZE,
          search,
          status: statusFilter || undefined,
        },
      });
      setTeachers(data.teachers || []);
      setPagination(
        data.pagination || {
          page,
          total: data.teachers?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function viewDetails(teacher) {
    try {
      const { data } = await api.get(`/teachers/${teacher._id}`);
      setViewTeacher(data.teacher);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function deactivateTeacher(teacher) {
    if (
      !window.confirm(
        `Deactivate ${teacher.fullName}? Their login account will be disabled.`,
      )
    )
      return;
    setError("");
    setSuccess("");
    try {
      const { data } = await api.delete(`/teachers/${teacher._id}`);
      setSuccess(data.message || "Teacher deactivated successfully.");
      await refreshTeachers();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">School staff</span>
          <h2>Teachers</h2>
          <p>Manage teachers in your school.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <FiPlus /> Add Teacher
        </button>
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
              refreshTeachers();
              return;
            }
            setLoading(true);
            setPage(1);
            setSearch(nextSearch);
          }}
        >
          <label className="visually-hidden" htmlFor="teacher-search">
            Search teachers
          </label>
          <input
            id="teacher-search"
            className="form-input"
            placeholder="Search by name or phone"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button className="secondary-button" type="submit">
            Search
          </button>
        </form>
        <select
          className="form-input"
          aria-label="Filter teachers by status"
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
          <strong>Teacher directory</strong>
          <span>{pagination.total} teachers</span>
        </div>
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Phone</th>
                <th>Qualification</th>
                <th>Hire Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="table-message">
                    Loading teachers…
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="table-message">
                    No teachers found.
                  </td>
                </tr>
              ) : (
                teachers.map((teacher) => (
                  <tr key={teacher._id}>
                    <td className="table-name">{teacher.fullName}</td>
                    <td>{teacher.phone}</td>
                    <td>{teacher.qualification || "—"}</td>
                    <td>
                      {teacher.hireDate
                        ? new Date(teacher.hireDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`status-pill status-${teacher.status?.toLowerCase()}`}
                      >
                        {teacher.status}
                      </span>
                    </td>
                    <td>
                      <div className="school-actions">
                        <button
                          className="edit-link"
                          type="button"
                          onClick={() => viewDetails(teacher)}
                        >
                          <FiEye /> View
                        </button>
                        <button
                          className="edit-link"
                          type="button"
                          onClick={() => openEdit(teacher)}
                        >
                          <FiEdit2 /> Edit
                        </button>
                        {teacher.status === "ACTIVE" && (
                          <button
                            className="status-action"
                            type="button"
                            onClick={() => deactivateTeacher(teacher)}
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
            aria-labelledby="teacher-form-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingTeacher ? "Update teacher" : "New teacher"}
                </span>
                <h2 id="teacher-form-title">
                  {editingTeacher ? "Edit Teacher" : "Add Teacher"}
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
            {!editingTeacher && (
              <p className="modal-description">
                A teacher login account will be created automatically using
                their phone number.
              </p>
            )}
            <form onSubmit={saveTeacher}>
              <label htmlFor="teacher-name">Full Name</label>
              <input
                id="teacher-name"
                className="form-input"
                value={form.fullName}
                onChange={(event) =>
                  setForm({ ...form, fullName: event.target.value })
                }
                required
              />
              <label htmlFor="teacher-phone">Phone</label>
              <input
                id="teacher-phone"
                className="form-input"
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                required
              />
              <label htmlFor="teacher-qualification">Qualification</label>
              <input
                id="teacher-qualification"
                className="form-input"
                value={form.qualification}
                onChange={(event) =>
                  setForm({ ...form, qualification: event.target.value })
                }
              />
              <label htmlFor="teacher-hire-date">Hire Date</label>
              <input
                id="teacher-hire-date"
                className="form-input"
                type="date"
                value={form.hireDate}
                onChange={(event) =>
                  setForm({ ...form, hireDate: event.target.value })
                }
              />
              <label htmlFor="teacher-status">Status</label>
              <select
                id="teacher-status"
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
                    : editingTeacher
                      ? "Save changes"
                      : "Create Teacher"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {viewTeacher && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewTeacher(null);
          }}
        >
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-details-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Teacher details</span>
                <h2 id="teacher-details-title">{viewTeacher.fullName}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close"
                onClick={() => setViewTeacher(null)}
              >
                ×
              </button>
            </div>
            <div className="credential-details">
              <p>
                <span>Phone</span>
                <strong>{viewTeacher.phone}</strong>
              </p>
              <p>
                <span>Qualification</span>
                <strong>{viewTeacher.qualification || "—"}</strong>
              </p>
              <p>
                <span>Hire Date</span>
                <strong>
                  {viewTeacher.hireDate
                    ? new Date(viewTeacher.hireDate).toLocaleDateString()
                    : "—"}
                </strong>
              </p>
              <p>
                <span>Status</span>
                <strong>{viewTeacher.status}</strong>
              </p>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
