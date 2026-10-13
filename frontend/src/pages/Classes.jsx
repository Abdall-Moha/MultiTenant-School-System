import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiEye, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const emptyClass = {
  name: "",
  academicYearId: "",
  numberOfPeriods: 7,
  status: "ACTIVE",
  schoolId: "",
};

export default function Classes() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);
  const [classes, setClasses] = useState([]);
  const [schools, setSchools] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [filterYearId, setFilterYearId] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [form, setForm] = useState(emptyClass);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/classes", {
        params: {
          page,
          limit: PAGE_SIZE,
          academicYearId: filterYearId || undefined,
        },
      });
      setClasses(data.classes || []);
      setPagination(
        data.pagination || {
          page,
          total: data.classes?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, filterYearId]);

  useEffect(() => {
    let current = true;
    api
      .get("/classes", {
        params: {
          page,
          limit: PAGE_SIZE,
          academicYearId: filterYearId || undefined,
        },
      })
      .then(({ data }) => {
        if (!current) return;
        setClasses(data.classes || []);
        setPagination(
          data.pagination || {
            page,
            total: data.classes?.length || 0,
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
  }, [page, filterYearId]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let current = true;
    api
      .get("/schools", { params: { page: 1, limit: 100 } })
      .then(({ data }) => {
        if (current) setSchools(data.schools || []);
      })
      .catch((requestError) => {
        if (current) setError(getApiError(requestError));
      });
    return () => {
      current = false;
    };
  }, [isSuperAdmin]);

  async function loadAcademicYears(schoolId = "") {
    const { data } = await api.get("/academic-years", {
      params: isSuperAdmin ? { schoolId, limit: 100 } : { limit: 100 },
    });
    setAcademicYears(data.academicYears || []);
  }

  useEffect(() => {
    api
      .get("/academic-years", { params: { limit: 100 } })
      .then(({ data }) => {
        const availableYears = data.academicYears || [];
        setAcademicYears(availableYears);
        if (user?.role === "TEACHER") {
          const currentYear = availableYears.find((year) => year.isCurrent);
          if (currentYear) setFilterYearId(currentYear._id);
        }
      })
      .catch((requestError) => setError(getApiError(requestError)));
  }, [isSuperAdmin, user?.role]);

  function openCreate() {
    setEditingClass(null);
    setForm(emptyClass);
    setError("");
    setModalOpen(true);
    if (isSuperAdmin) setAcademicYears([]);
  }

  function openEdit(classItem) {
    setEditingClass(classItem);
    setForm({
      name: classItem.name || "",
      academicYearId:
        classItem.academicYearId?._id || classItem.academicYearId || "",
      numberOfPeriods: classItem.numberOfPeriods || 7,
      status: classItem.status || "ACTIVE",
      schoolId: "",
    });
    setError("");
    setModalOpen(true);
    if (isSuperAdmin)
      loadAcademicYears(
        classItem.schoolId?._id || classItem.schoolId || "",
      ).catch((requestError) => setError(getApiError(requestError)));
  }

  async function saveClass(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const details = {
      name: form.name.trim(),
      academicYearId: form.academicYearId,
      numberOfPeriods: Number(form.numberOfPeriods),
      status: form.status,
    };
    try {
      if (editingClass) {
        await api.put(`/classes/${editingClass._id}`, details);
        setSuccess("Class updated successfully.");
      } else {
        if (isSuperAdmin) details.schoolId = form.schoolId;
        await api.post("/classes", details);
        setSuccess("Class created successfully.");
      }
      setModalOpen(false);
      await loadClasses();
    } catch (requestError) {
      const message = getApiError(requestError);
      setError(
        message.toLowerCase().includes("already exists") ||
          message.includes("duplicate")
          ? "This class already exists for this academic year."
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateClass(classItem) {
    if (!window.confirm(`Deactivate ${classItem.name}?`)) return;
    setError("");
    setSuccess("");
    try {
      const { data } = await api.delete(`/classes/${classItem._id}`);
      setSuccess(data.message || "Class deactivated successfully.");
      await loadClasses();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function viewClassStudents(classItem) {
    setClassDetails({ classItem, students: [], loading: true, error: "" });
    try {
      const enrollments = [];
      let pageNumber = 1;
      let totalPages = 1;
      while (pageNumber <= totalPages) {
        const { data } = await api.get("/student-enrollments", {
          params: {
            classId: classItem._id,
            academicYearId:
              classItem.academicYearId?._id || classItem.academicYearId,
            page: pageNumber,
            limit: 100,
          },
        });
        enrollments.push(...(data.enrollments || []));
        totalPages = data.pagination?.totalPages || 1;
        pageNumber += 1;
      }
      setClassDetails({
        classItem,
        students: enrollments,
        loading: false,
        error: "",
      });
    } catch (requestError) {
      setClassDetails({
        classItem,
        students: [],
        loading: false,
        error: getApiError(requestError),
      });
    }
  }

  const visibleClasses =
    user?.role === "TEACHER"
      ? classes.filter(
          (item) =>
            String(item.academicYearId?._id || item.academicYearId) ===
            String(filterYearId),
        )
      : classes;

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Academic records</span>
          <h2>Classes</h2>
          <p>Manage class names, academic years, and status.</p>
        </div>
        {canManage && (
          <button className="primary-button" type="button" onClick={openCreate}>
            <FiPlus /> Add Class
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
      {loading ? (
        <div className="school-loading">Loading classes…</div>
      ) : (
        <div className="school-table-card">
          <div className="users-table-title">
            <strong>Class directory</strong>
            <div className="page-filters">
              {user?.role !== "TEACHER" && (
                <select
                  aria-label="Filter classes by academic year"
                  className="form-input"
                  value={filterYearId}
                  onChange={(event) => {
                    setFilterYearId(event.target.value);
                    setPage(1);
                    setLoading(true);
                  }}
                >
                  <option value="">All academic years</option>
                  {academicYears.map((year) => (
                    <option key={year._id} value={year._id}>
                      {year.name}
                    </option>
                  ))}
                </select>
              )}
              <span>{pagination.total} classes</span>
            </div>
          </div>
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Class Name</th>
                  {isSuperAdmin && <th>School</th>}
                  <th>Academic Year</th>
                  <th>Periods</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visibleClasses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(isSuperAdmin ? 4 : 3) + Number(canManage)}
                      className="table-message"
                    >
                      No classes found.
                    </td>
                  </tr>
                ) : (
                  visibleClasses.map((item) => (
                    <tr key={item._id}>
                      <td className="table-name">{item.name}</td>
                      {isSuperAdmin && (
                        <td>{item.schoolId?.schoolName || "—"}</td>
                      )}
                      <td>{item.academicYearId?.name || "—"}</td>
                      <td>{item.numberOfPeriods}</td>
                      <td>
                        <span
                          className={`status-pill status-${item.status?.toLowerCase()}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="school-actions">
                            <button
                              className="edit-link"
                              type="button"
                              onClick={() => viewClassStudents(item)}
                            >
                              <FiEye /> View Students
                            </button>
                            <button
                              className="edit-link"
                              type="button"
                              onClick={() => openEdit(item)}
                            >
                              <FiEdit2 /> Edit
                            </button>
                            {item.status === "ACTIVE" && (
                              <button
                                className="status-action"
                                type="button"
                                onClick={() => deactivateClass(item)}
                              >
                                Deactivate
                              </button>
                            )}
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
            aria-labelledby="class-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingClass ? "Update class" : "New class"}
                </span>
                <h2 id="class-modal-title">
                  {editingClass ? "Edit class" : "Add Class"}
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
            <form onSubmit={saveClass}>
              {isSuperAdmin && !editingClass && (
                <>
                  <label htmlFor="class-school">School</label>
                  <select
                    id="class-school"
                    className="form-input"
                    value={form.schoolId}
                    onChange={async (event) => {
                      const schoolId = event.target.value;
                      setForm({ ...form, schoolId, academicYearId: "" });
                      try {
                        await loadAcademicYears(schoolId);
                      } catch (requestError) {
                        setError(getApiError(requestError));
                      }
                    }}
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
              <label htmlFor="class-name">Class Name</label>
              <input
                id="class-name"
                className="form-input"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. Grade 7A"
                required
              />
              <label htmlFor="class-year">Academic Year</label>
              <select
                id="class-year"
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
              <label htmlFor="class-periods">Number of Periods</label>
              <input
                id="class-periods"
                className="form-input"
                type="number"
                min="1"
                max="12"
                value={form.numberOfPeriods}
                onChange={(event) =>
                  setForm({ ...form, numberOfPeriods: event.target.value })
                }
                required
              />
              <label htmlFor="class-status">Status</label>
              <select
                id="class-status"
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
                    : editingClass
                      ? "Save changes"
                      : "Create Class"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {classDetails && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClassDetails(null);
          }}
        >
          <section
            className="user-modal school-modal enrollment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-students-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Class enrollment</span>
                <h2 id="class-students-title">
                  {classDetails.classItem.name} ·{" "}
                  {classDetails.classItem.academicYearId?.name ||
                    "Academic Year"}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close"
                onClick={() => setClassDetails(null)}
              >
                ×
              </button>
            </div>
            {classDetails.loading ? (
              <div className="school-loading">Loading students…</div>
            ) : classDetails.error ? (
              <div role="alert" className="form-error">
                {classDetails.error}
              </div>
            ) : (
              <div className="table-scroll">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Role Number</th>
                      <th>Student Status</th>
                      <th>Enrollment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classDetails.students.map((enrollment) => (
                      <tr key={enrollment._id}>
                        <td className="table-name">
                          {enrollment.studentId?.fullName || "Student"}
                        </td>
                        <td>{enrollment.studentId?.roleNumber || "—"}</td>
                        <td>{enrollment.studentId?.status || "—"}</td>
                        <td>{enrollment.status}</td>
                      </tr>
                    ))}
                    {!classDetails.students.length && (
                      <tr>
                        <td colSpan="4" className="table-message">
                          No students are enrolled in this class for this
                          academic year.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
