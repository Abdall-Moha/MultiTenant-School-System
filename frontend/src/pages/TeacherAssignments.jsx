import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiEdit2, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const emptyAssignment = {
  teacherId: "",
  classId: "",
  subjectId: "",
  academicYearId: "",
};

async function loadAll(path, key) {
  const items = [];
  let page = 1;
  let hasMorePages = true;
  while (hasMorePages) {
    const { data } = await api.get(path, { params: { page, limit: 100 } });
    items.push(...(data[key] || []));
    page += 1;
    hasMorePages = page <= (data.pagination?.totalPages || 1);
  }
  return items;
}

export default function TeacherAssignments() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [filters, setFilters] = useState({
    teacherId: "",
    classId: "",
    subjectId: "",
    academicYearId: "",
  });
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [form, setForm] = useState(emptyAssignment);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  useEffect(() => {
    let current = true;
    async function fetchOptions() {
      setOptionsLoading(true);
      try {
        const requests = [
          loadAll("/classes", "classes"),
          loadAll("/subjects", "subjects"),
          loadAll("/academic-years", "academicYears"),
        ];
        if (canManage) requests.push(loadAll("/teachers", "teachers"));
        const [classItems, subjectItems, yearItems, teacherItems = []] =
          await Promise.all(requests);
        if (!current) return;
        setClasses(classItems.filter((item) => item.status === "ACTIVE"));
        setSubjects(subjectItems.filter((item) => item.status === "ACTIVE"));
        setAcademicYears(yearItems);
        setTeachers(teacherItems.filter((item) => item.status === "ACTIVE"));
        if (user?.role === "TEACHER") {
          const currentYear = yearItems.find((year) => year.isCurrent);
          if (currentYear)
            setFilters((value) => ({
              ...value,
              academicYearId: currentYear._id,
            }));
        }
      } catch (requestError) {
        if (current) setError(getApiError(requestError));
      } finally {
        if (current) setOptionsLoading(false);
      }
    }
    fetchOptions();
    return () => {
      current = false;
    };
  }, [canManage, user?.role]);

  useEffect(() => {
    if (user?.role === "TEACHER" && optionsLoading) return;
    let current = true;
    const params = { page, limit: PAGE_SIZE };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    api
      .get("/teacher-assignments", { params })
      .then(({ data }) => {
        if (!current) return;
        setAssignments(data.assignments || []);
        setPagination(
          data.pagination || {
            page,
            total: data.assignments?.length || 0,
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
  }, [page, filters, optionsLoading, user?.role]);

  function updateFilter(name, value) {
    setLoading(true);
    setPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function openCreate() {
    setEditingAssignment(null);
    setForm(emptyAssignment);
    setError("");
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditingAssignment(item);
    setForm({
      teacherId: item.teacherId?._id || "",
      classId: item.classId?._id || "",
      subjectId: item.subjectId?._id || "",
      academicYearId: item.academicYearId?._id || "",
    });
    setError("");
    setModalOpen(true);
  }

  async function saveAssignment(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingAssignment) {
        await api.put(`/teacher-assignments/${editingAssignment._id}`, form);
        setSuccess("Teacher assignment updated successfully.");
      } else {
        await api.post("/teacher-assignments", form);
        setSuccess("Teacher assignment created successfully.");
      }
      setModalOpen(false);
      await refreshAssignments();
    } catch (requestError) {
      const message = getApiError(requestError);
      setError(
        message.toLowerCase().includes("already exists") ||
          message.includes("duplicate")
          ? "This exact teacher, class, subject, and academic year assignment already exists."
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function refreshAssignments() {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    try {
      const { data } = await api.get("/teacher-assignments", { params });
      setAssignments(data.assignments || []);
      setPagination(
        data.pagination || {
          page,
          total: data.assignments?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function deleteAssignment(item) {
    if (
      !window.confirm(
        `Delete the ${item.subjectId?.name || "subject"} assignment for ${item.teacherId?.fullName || "this teacher"}?`,
      )
    )
      return;
    setError("");
    setSuccess("");
    try {
      const { data } = await api.delete(`/teacher-assignments/${item._id}`);
      setSuccess(data.message || "Teacher assignment deleted successfully.");
      await refreshAssignments();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  const visibleAssignments =
    user?.role === "TEACHER"
      ? assignments.filter((item) => item.academicYearId?.isCurrent)
      : assignments;

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Academic records</span>
          <h2>Teacher Assignments</h2>
          <p>Assign teachers to classes and subjects.</p>
        </div>
        {canManage && (
          <button
            className="primary-button"
            type="button"
            onClick={openCreate}
            disabled={optionsLoading}
          >
            <FiPlus /> Add Assignment
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
      <div className="assignment-filters">
        {canManage && (
          <select
            className="form-input"
            aria-label="Filter by teacher"
            value={filters.teacherId}
            onChange={(event) => updateFilter("teacherId", event.target.value)}
          >
            <option value="">All teachers</option>
            {teachers.map((teacher) => (
              <option key={teacher._id} value={teacher._id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        )}
        <select
          className="form-input"
          aria-label="Filter by class"
          value={filters.classId}
          onChange={(event) => updateFilter("classId", event.target.value)}
        >
          <option value="">All classes</option>
          {classes.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="form-input"
          aria-label="Filter by subject"
          value={filters.subjectId}
          onChange={(event) => updateFilter("subjectId", event.target.value)}
        >
          <option value="">All subjects</option>
          {subjects.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        {user?.role !== "TEACHER" && (
          <select
            className="form-input"
            aria-label="Filter by academic year"
            value={filters.academicYearId}
            onChange={(event) =>
              updateFilter("academicYearId", event.target.value)
            }
          >
            <option value="">All academic years</option>
            {academicYears.map((year) => (
              <option key={year._id} value={year._id}>
                {year.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="school-table-card">
        <div className="users-table-title">
          <strong>Assignments</strong>
          <span>
            {user?.role === "TEACHER"
              ? visibleAssignments.length
              : pagination.total}{" "}
            assignments
          </span>
        </div>
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Academic Year</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="table-message">
                    Loading assignments…
                  </td>
                </tr>
              ) : visibleAssignments.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="table-message">
                    No assignments found.
                  </td>
                </tr>
              ) : (
                visibleAssignments.map((item) => (
                  <tr key={item._id}>
                    <td className="table-name">
                      {item.teacherId?.fullName || "—"}
                    </td>
                    <td>{item.classId?.name || "—"}</td>
                    <td>{item.subjectId?.name || "—"}</td>
                    <td>{item.academicYearId?.name || "—"}</td>
                    {canManage && (
                      <td>
                        <div className="school-actions">
                          <button
                            className="edit-link"
                            type="button"
                            onClick={() => openEdit(item)}
                          >
                            <FiEdit2 /> Edit
                          </button>
                          <button
                            className="status-action"
                            type="button"
                            onClick={() => deleteAssignment(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
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
            aria-labelledby="assignment-form-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingAssignment ? "Update assignment" : "New assignment"}
                </span>
                <h2 id="assignment-form-title">
                  {editingAssignment ? "Edit Assignment" : "Add Assignment"}
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
            <p className="modal-description">
              A teacher may have multiple subjects in the same class. Only an
              exact duplicate assignment is rejected.
            </p>
            <form onSubmit={saveAssignment}>
              <label htmlFor="assignment-teacher">Teacher</label>
              <select
                id="assignment-teacher"
                className="form-input"
                value={form.teacherId}
                onChange={(event) =>
                  setForm({ ...form, teacherId: event.target.value })
                }
                required
              >
                <option value="">Select a teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher._id} value={teacher._id}>
                    {teacher.fullName}
                  </option>
                ))}
              </select>
              <label htmlFor="assignment-class">Class</label>
              <select
                id="assignment-class"
                className="form-input"
                value={form.classId}
                onChange={(event) =>
                  setForm({ ...form, classId: event.target.value })
                }
                required
              >
                <option value="">Select a class</option>
                {classes.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name} · {item.academicYearId?.name || ""}
                  </option>
                ))}
              </select>
              <label htmlFor="assignment-subject">Subject</label>
              <select
                id="assignment-subject"
                className="form-input"
                value={form.subjectId}
                onChange={(event) =>
                  setForm({ ...form, subjectId: event.target.value })
                }
                required
              >
                <option value="">Select a subject</option>
                {subjects.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <label htmlFor="assignment-year">Academic Year</label>
              <select
                id="assignment-year"
                className="form-input"
                value={form.academicYearId}
                onChange={(event) =>
                  setForm({ ...form, academicYearId: event.target.value })
                }
                required
              >
                <option value="">Select an academic year</option>
                {academicYears.map((year) => (
                  <option key={year._id} value={year._id}>
                    {year.name}
                  </option>
                ))}
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
                  disabled={
                    saving ||
                    !teachers.length ||
                    !classes.length ||
                    !subjects.length
                  }
                >
                  {saving
                    ? "Saving…"
                    : editingAssignment
                      ? "Save changes"
                      : "Create Assignment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
