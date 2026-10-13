import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const STUDENT_STATUSES = ["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"];
const emptyStudent = {
  fullName: "",
  roleNumber: "",
  dateOfBirth: "",
  gender: "",
  parentId: "",
  classId: "",
  academicYearId: "",
  status: "ACTIVE",
  schoolId: "",
};

async function getAllPages(path, key, params = {}) {
  const records = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const { data } = await api.get(path, {
      params: { ...params, page, limit: 100 },
    });
    records.push(...(data[key] || []));
    page += 1;
    hasNextPage = page <= (data.pagination?.totalPages || 1);
  }
  return records;
}

export default function Students() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
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
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState(emptyStudent);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/students", {
        params: { page, limit: PAGE_SIZE },
      });
      setStudents(data.students || []);
      setPagination(
        data.pagination || {
          page,
          total: data.students?.length || 0,
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
      .get("/students", { params: { page, limit: PAGE_SIZE } })
      .then(({ data }) => {
        if (!current) return;
        setStudents(data.students || []);
        setPagination(
          data.pagination || {
            page,
            total: data.students?.length || 0,
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

  const loadFormOptions = useCallback(
    async (schoolId = "") => {
      if (isSuperAdmin && !schoolId) {
        setParents([]);
        setClasses([]);
        return;
      }
      const params = isSuperAdmin ? { schoolId } : {};
      const [parentItems, classItems, yearItems] = await Promise.all([
        getAllPages("/parents", "parents", params),
        getAllPages("/classes", "classes", params),
        getAllPages("/academic-years", "academicYears", params),
      ]);
      setParents(parentItems.filter((parent) => parent.status === "ACTIVE"));
      setClasses(classItems.filter((item) => item.status === "ACTIVE"));
      setAcademicYears(yearItems);
    },
    [isSuperAdmin],
  );

  useEffect(() => {
    if (isSuperAdmin) {
      getAllPages("/schools", "schools")
        .then(setSchools)
        .catch((requestError) => setError(getApiError(requestError)));
    }
  }, [isSuperAdmin]);

  function openCreate() {
    setEditingStudent(null);
    setForm(emptyStudent);
    setError("");
    setModalOpen(true);
    if (!isSuperAdmin)
      loadFormOptions().catch((requestError) =>
        setError(getApiError(requestError)),
      );
  }

  function openEdit(student) {
    setEditingStudent(student);
    setForm({
      ...emptyStudent,
      fullName: student.fullName || "",
      roleNumber: student.roleNumber || "",
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
      gender: student.gender || "",
      parentId: student.parentId?._id || student.parentId || "",
      classId: student.currentEnrollment?.classId?._id || "",
      academicYearId: student.currentEnrollment?.academicYearId?._id || "",
      status: student.status || "ACTIVE",
      schoolId: student.schoolId?._id || student.schoolId || "",
    });
    setError("");
    setModalOpen(true);
    loadFormOptions(student.schoolId?._id || student.schoolId || "").catch(
      (requestError) => setError(getApiError(requestError)),
    );
  }

  async function saveStudent(event) {
    event.preventDefault();
    if (!form.parentId) {
      setError("Select a parent before saving the student.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const details = {
      fullName: form.fullName.trim(),
      roleNumber: form.roleNumber.trim(),
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || undefined,
      parentId: form.parentId,
      status: form.status,
    };
    try {
      if (editingStudent) {
        await api.put(`/students/${editingStudent._id}`, details);
        setSuccess("Student updated successfully.");
      } else {
        if (isSuperAdmin) details.schoolId = form.schoolId;
        details.classId = form.classId;
        details.academicYearId = form.academicYearId;
        const { data } = await api.post("/students", details);
        setModalOpen(false);
        setCredentials(data.login || null);
      }
      if (editingStudent) setModalOpen(false);
      await loadStudents();
    } catch (requestError) {
      const message = getApiError(requestError);
      setError(
        message.toLowerCase().includes("rolenumber") ||
          message.toLowerCase().includes("duplicate")
          ? "A student with this role number already exists in this school."
          : message,
      );
    } finally {
      setSaving(false);
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
        `/students/${resetTarget._id}/reset-password`,
        { newPassword: resetForm.newPassword },
      );
      setSuccess(
        data.message ||
          "Student password reset. They must change it after login.",
      );
      setResetTarget(null);
      setResetForm({ newPassword: "", confirmPassword: "" });
      await loadStudents();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateStudent(student) {
    if (
      !window.confirm(
        `Deactivate ${student.fullName}? The student will be marked transferred and their login disabled.`,
      )
    )
      return;
    setError("");
    setSuccess("");
    try {
      await api.delete(`/students/${student._id}`);
      setSuccess(
        "Student deactivated and marked transferred. The login account is disabled.",
      );
      await loadStudents();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Academic records</span>
          <h2>Students</h2>
          <p>
            Manage student profiles, parent links, and school login accounts.
          </p>
        </div>
        {canManage && (
          <button className="primary-button" type="button" onClick={openCreate}>
            <FiPlus /> Add Student
          </button>
        )}
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
        <div className="school-loading">Loading students…</div>
      ) : (
        <div className="school-table-card">
          <div className="users-table-title">
            <strong>Student directory</strong>
            <span>{pagination.total} students</span>
          </div>
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Role Number</th>
                  <th>Parent</th>
                  <th>Current Class</th>
                  <th>Academic Year</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="table-message">
                      No students found.
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr key={student._id}>
                      <td className="table-name">{student.fullName}</td>
                      <td>{student.roleNumber}</td>
                      <td>{student.parentId?.fullName || "—"}</td>
                      <td>{student.currentEnrollment?.classId?.name || "—"}</td>
                      <td>
                        {student.currentEnrollment?.academicYearId?.name || "—"}
                      </td>
                      <td>
                        <span
                          className={`status-pill status-${student.status?.toLowerCase()}`}
                        >
                          {student.status}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="school-actions">
                            <button
                              className="edit-link"
                              type="button"
                              onClick={() => openEdit(student)}
                            >
                              <FiEdit2 /> Edit
                            </button>
                            <button
                              className="status-action"
                              type="button"
                              onClick={() => {
                                setResetTarget(student);
                                setError("");
                              }}
                            >
                              Reset Password
                            </button>
                            {student.status !== "TRANSFERRED" && (
                              <button
                                className="status-action"
                                type="button"
                                onClick={() => deactivateStudent(student)}
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
            aria-labelledby="student-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingStudent ? "Update student" : "New student"}
                </span>
                <h2 id="student-modal-title">
                  {editingStudent ? "Edit student" : "Add Student"}
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
            {!editingStudent && (
              <p className="modal-description">
                A login account will be created automatically. The student must
                change the initial password after first login.
              </p>
            )}
            <form onSubmit={saveStudent}>
              {isSuperAdmin && !editingStudent && (
                <>
                  <label htmlFor="student-school">School</label>
                  <select
                    id="student-school"
                    className="form-input"
                    value={form.schoolId}
                    onChange={async (event) => {
                      const schoolId = event.target.value;
                      setForm({
                        ...form,
                        schoolId,
                        parentId: "",
                        classId: "",
                        academicYearId: "",
                      });
                      try {
                        await loadFormOptions(schoolId);
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
              <label htmlFor="student-name">Full Name</label>
              <input
                id="student-name"
                className="form-input"
                value={form.fullName}
                onChange={(event) =>
                  setForm({ ...form, fullName: event.target.value })
                }
                required
              />
              <label htmlFor="student-role-number">Role Number</label>
              <input
                id="student-role-number"
                className="form-input"
                value={form.roleNumber}
                onChange={(event) =>
                  setForm({ ...form, roleNumber: event.target.value })
                }
                required
              />
              <label htmlFor="student-birth-date">Date of Birth</label>
              <input
                id="student-birth-date"
                className="form-input"
                type="date"
                value={form.dateOfBirth}
                onChange={(event) =>
                  setForm({ ...form, dateOfBirth: event.target.value })
                }
              />
              <label htmlFor="student-gender">Gender</label>
              <select
                id="student-gender"
                className="form-input"
                value={form.gender}
                onChange={(event) =>
                  setForm({ ...form, gender: event.target.value })
                }
              >
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
              <label htmlFor="student-parent">
                Parent <span className="required-mark">*</span>
              </label>
              <select
                id="student-parent"
                className="form-input"
                value={form.parentId}
                onChange={(event) =>
                  setForm({ ...form, parentId: event.target.value })
                }
                required
              >
                <option value="">Select a parent</option>
                {parents.map((parent) => (
                  <option key={parent._id} value={parent._id}>
                    {parent.fullName} - {parent.phoneNumber}
                  </option>
                ))}
              </select>
              {parents.length === 0 && (
                <small className="input-hint">
                  Create an active parent before adding a student.
                </small>
              )}
              {!editingStudent ? (
                <>
                  <label htmlFor="student-year">Academic Year</label>
                  <select
                    id="student-year"
                    className="form-input"
                    value={form.academicYearId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        academicYearId: event.target.value,
                        classId: "",
                      })
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
                  <label htmlFor="student-class">Class</label>
                  <select
                    id="student-class"
                    className="form-input"
                    value={form.classId}
                    onChange={(event) =>
                      setForm({ ...form, classId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select a class</option>
                    {classes
                      .filter(
                        (item) =>
                          String(
                            item.academicYearId?._id || item.academicYearId,
                          ) === String(form.academicYearId),
                      )
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <p className="modal-description">
                  Current enrollment:{" "}
                  {editingStudent.currentEnrollment?.classId?.name ||
                    "No current class"}{" "}
                  ·{" "}
                  {editingStudent.currentEnrollment?.academicYearId?.name ||
                    "No academic year"}
                </p>
              )}
              <label htmlFor="student-status">Status</label>
              <select
                id="student-status"
                className="form-input"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
              >
                {STUDENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
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
                  disabled={saving || (!editingStudent && !parents.length)}
                >
                  {saving
                    ? "Saving…"
                    : editingStudent
                      ? "Save changes"
                      : "Create Student"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {resetTarget && (
        <div className="modal-backdrop">
          <section
            className="user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-reset-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Account security</span>
                <h2 id="student-reset-title">Reset student password</h2>
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
              <label htmlFor="student-new-password">New Password</label>
              <input
                id="student-new-password"
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
              <label htmlFor="student-confirm-password">
                Confirm New Password
              </label>
              <input
                id="student-confirm-password"
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
            aria-labelledby="student-credentials-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Student created successfully</span>
                <h2 id="student-credentials-title">Student Login</h2>
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
              Share these details securely. The student must change the initial
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
