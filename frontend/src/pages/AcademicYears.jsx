import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiEdit2, FiPlus, FiUsers } from "react-icons/fi";
import api, { getApiError } from "../services/api.js";

const blankYear = { name: "", startDate: "", endDate: "" };
const enrollmentStatuses = ["ACTIVE", "REPEATED", "TRANSFERRED", "GRADUATED"];

async function getAll(path, key, params = {}) {
  const records = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const { data } = await api.get(path, {
      params: { ...params, page, limit: 100 },
    });
    records.push(...(data[key] || []));
    totalPages = data.pagination?.totalPages || 1;
    page += 1;
  }
  return records;
}

function classSuggestion(previousName, classes) {
  if (!previousName) return "";
  const grade = previousName.match(/^(Grade\s+)(\d+)(.*)$/i);
  if (grade) {
    const nextName = `${grade[1]}${Number(grade[2]) + 1}${grade[3]}`;
    const promoted = classes.find(
      (item) => item.name.toLowerCase() === nextName.toLowerCase(),
    );
    if (promoted) return promoted._id;
  }
  return (
    classes.find(
      (item) => item.name.toLowerCase() === previousName.toLowerCase(),
    )?._id || ""
  );
}

export default function AcademicYears() {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankYear);
  const [enrollmentYear, setEnrollmentYear] = useState(null);
  const [enrollmentRows, setEnrollmentRows] = useState([]);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentSaving, setEnrollmentSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  usePageNotifications(error, notice);

  async function loadYears() {
    setLoading(true);
    try {
      const { data } = await api.get("/academic-years");
      setYears(data.academicYears || []);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .get("/academic-years")
      .then(({ data }) => {
        if (active) setYears(data.academicYears || []);
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(blankYear);
    setError("");
    setModal(true);
  }

  function openEdit(year) {
    setEditing(year);
    setForm({
      name: year.name,
      startDate: year.startDate?.slice(0, 10),
      endDate: year.endDate?.slice(0, 10),
    });
    setError("");
    setModal(true);
  }

  async function saveYear(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editing) await api.put(`/academic-years/${editing._id}`, form);
      else await api.post("/academic-years", form);
      setModal(false);
      setNotice(
        editing
          ? "Academic year updated."
          : "Academic year created. Enroll students separately when you are ready.",
      );
      await loadYears();
    } catch (requestError) {
      const message = getApiError(requestError);
      if (
        message.toLowerCase().includes("overlap") &&
        form.startDate &&
        form.endDate
      ) {
        const requestedStart = new Date(form.startDate);
        const requestedEnd = new Date(form.endDate);
        const conflictingYear = years.find(
          (year) =>
            requestedStart < new Date(year.endDate) &&
            requestedEnd > new Date(year.startDate),
        );
        if (conflictingYear) {
          setError(
            `${conflictingYear.name} already covers ${new Date(conflictingYear.startDate).toLocaleDateString()} to ${new Date(conflictingYear.endDate).toLocaleDateString()}. Edit that year's dates first, or choose a non-overlapping date range.`,
          );
          return;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function makeCurrent(year) {
    if (!window.confirm(`Set ${year.name} as the current academic year?`))
      return;
    setError("");
    setNotice("");
    try {
      await api.put(`/academic-years/${year._id}`, { isCurrent: true });
      setNotice(`${year.name} is now the current academic year.`);
      await loadYears();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function openEnrollment(year, promote = false) {
    setEnrollmentYear(year);
    setEnrollmentRows([]);
    setEnrollmentLoading(true);
    setError("");
    setNotice("");
    try {
      const [students, classes, enrollments] = await Promise.all([
        getAll("/students", "students", { status: "ACTIVE" }),
        getAll("/classes", "classes", { academicYearId: year._id }),
        getAll("/student-enrollments", "enrollments"),
      ]);
      const activeClasses = classes.filter((item) => item.status === "ACTIVE");
      const previousByStudent = new Map();
      for (const item of enrollments) {
        const priorYear = item.academicYearId;
        if (
          String(priorYear?._id) === String(year._id) ||
          new Date(priorYear?.startDate) >= new Date(year.startDate)
        )
          continue;
        const key = String(item.studentId?._id || item.studentId);
        const currentPrior = previousByStudent.get(key);
        if (
          !currentPrior ||
          new Date(priorYear.startDate) >
            new Date(currentPrior.academicYearId.startDate)
        )
          previousByStudent.set(key, item);
      }
      const existingByStudent = new Map(
        enrollments
          .filter(
            (item) => String(item.academicYearId?._id) === String(year._id),
          )
          .map((item) => [String(item.studentId?._id || item.studentId), item]),
      );
      setEnrollmentRows(
        students.map((student) => {
          const key = String(student._id);
          const previous = previousByStudent.get(key);
          const existing = existingByStudent.get(key);
          const previousClassName = previous?.classId?.name || "—";
          return {
            student,
            previousClassName,
            classId:
              existing?.classId?._id ||
              (promote
                ? classSuggestion(previousClassName, activeClasses)
                : ""),
            status: existing?.status || "ACTIVE",
            checked: promote && !existing && Boolean(previous),
            enrollmentId: existing?._id || "",
          };
        }),
      );
      setEnrollmentYear({
        ...year,
        availableClasses: activeClasses,
        promoteMode: promote,
      });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setEnrollmentLoading(false);
    }
  }

  function updateEnrollmentRow(studentId, values) {
    setEnrollmentRows((rows) =>
      rows.map((row) =>
        String(row.student._id) === String(studentId)
          ? { ...row, ...values }
          : row,
      ),
    );
  }

  async function saveEnrollments() {
    const selected = enrollmentRows.filter((row) => row.checked);
    if (!selected.length) {
      setError("Select at least one student to enroll.");
      return;
    }
    if (selected.some((row) => !row.classId)) {
      setError("Choose a class for every selected student.");
      return;
    }
    setEnrollmentSaving(true);
    setError("");
    setNotice("");
    let saved = 0;
    const failures = [];
    for (const row of selected) {
      try {
        const payload = {
          studentId: row.student._id,
          academicYearId: enrollmentYear._id,
          classId: row.classId,
          status: row.status,
        };
        if (row.enrollmentId)
          await api.put(`/student-enrollments/${row.enrollmentId}`, payload);
        else await api.post("/student-enrollments", payload);
        saved += 1;
      } catch (requestError) {
        failures.push(`${row.student.fullName}: ${getApiError(requestError)}`);
      }
    }
    setEnrollmentSaving(false);
    if (failures.length) setError(`${saved} saved. ${failures.join(" ")}`);
    else {
      setNotice(
        `${saved} student enrollment${saved === 1 ? "" : "s"} saved for ${enrollmentYear.name}.`,
      );
      setEnrollmentYear(null);
    }
  }

  function yearStatus(year) {
    if (year.isCurrent) return "CURRENT";
    const today = new Date();
    const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (year.endDate.slice(0, 10) < todayText) return "COMPLETED";
    if (year.startDate.slice(0, 10) > todayText) return "UPCOMING";
    return "PREVIOUS";
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">School setup</span>
          <h2>Academic Years</h2>
          <p>
            Manage the school calendar and enroll students into each year
            separately.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={openCreate}>
          <FiPlus /> Create Academic Year
        </button>
      </div>
      {error && !modal && !enrollmentYear && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success-message page-message">
          {notice}
        </div>
      )}
      {loading ? (
        <div className="school-loading">Loading academic years…</div>
      ) : (
        <div className="school-table-card">
          <div className="users-table-title">
            <strong>Academic year directory</strong>
            <span>{years.length} years</span>
          </div>
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Academic Year</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year._id}>
                    <td className="table-name">{year.name}</td>
                    <td>{new Date(year.startDate).toLocaleDateString()}</td>
                    <td>{new Date(year.endDate).toLocaleDateString()}</td>
                    <td>
                      <span
                        className={`status-pill status-${yearStatus(year).toLowerCase()}`}
                      >
                        {yearStatus(year)}
                      </span>
                    </td>
                    <td>
                      <div className="school-actions">
                        <button
                          type="button"
                          className="edit-link"
                          onClick={() => openEdit(year)}
                        >
                          <FiEdit2 /> Edit
                        </button>
                        <button
                          type="button"
                          className="status-action"
                          onClick={() => openEnrollment(year)}
                        >
                          <FiUsers /> Enroll Students
                        </button>
                        <button
                          type="button"
                          className="status-action"
                          onClick={() => openEnrollment(year, true)}
                          disabled={year.isCurrent}
                        >
                          Promote Students
                        </button>
                        {!year.isCurrent && (
                          <button
                            type="button"
                            className="status-action"
                            onClick={() => makeCurrent(year)}
                          >
                            Set Current
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!years.length && (
                  <tr>
                    <td colSpan="5" className="table-message">
                      No academic years found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="year-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">School calendar</span>
                <h2 id="year-modal-title">
                  {editing ? "Edit Academic Year" : "Create Academic Year"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveYear}>
              <label htmlFor="year-name">Academic Year Name</label>
              <input
                id="year-name"
                className="form-input"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. 2027-2028"
                required
              />
              <label htmlFor="year-start">Start Date</label>
              <input
                id="year-start"
                className="form-input"
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
                required
              />
              <label htmlFor="year-end">End Date</label>
              <input
                id="year-end"
                className="form-input"
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
                required
              />
              <p className="modal-description">
                Dates cannot overlap another academic year. Creating a year does
                not move or enroll students.
              </p>
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create year"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {enrollmentYear && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal enrollment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrollment-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {enrollmentYear.promoteMode
                    ? "Review suggested placements"
                    : "Student enrollment"}
                </span>
                <h2 id="enrollment-modal-title">
                  {enrollmentYear.promoteMode
                    ? "Promote Students"
                    : "Enroll Students"}{" "}
                  · {enrollmentYear.name}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEnrollmentYear(null)}
              >
                ×
              </button>
            </div>
            {enrollmentLoading ? (
              <div className="school-loading">
                Loading students and classes…
              </div>
            ) : (
              <>
                <p className="modal-description">
                  Select students, review each class and enrollment status, then
                  confirm. Previous-year records remain unchanged.
                </p>
                <div className="table-scroll">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Student</th>
                        <th>Previous Class</th>
                        <th>New Class</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollmentRows.map((row) => (
                        <tr key={row.student._id}>
                          <td>
                            <input
                              aria-label={`Select ${row.student.fullName}`}
                              type="checkbox"
                              checked={row.checked}
                              onChange={(event) =>
                                updateEnrollmentRow(row.student._id, {
                                  checked: event.target.checked,
                                })
                              }
                            />
                          </td>
                          <td className="table-name">{row.student.fullName}</td>
                          <td>{row.previousClassName}</td>
                          <td>
                            <select
                              className="form-input"
                              value={row.classId}
                              onChange={(event) =>
                                updateEnrollmentRow(row.student._id, {
                                  classId: event.target.value,
                                })
                              }
                            >
                              <option value="">Select class</option>
                              {enrollmentYear.availableClasses.map((item) => (
                                <option key={item._id} value={item._id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="form-input"
                              value={row.status}
                              onChange={(event) =>
                                updateEnrollmentRow(row.student._id, {
                                  status: event.target.value,
                                })
                              }
                            >
                              {enrollmentStatuses.map((status) => (
                                <option key={status}>{status}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {!enrollmentRows.length && (
                        <tr>
                          <td colSpan="5" className="table-message">
                            No active students found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {error && enrollmentYear && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEnrollmentYear(null)}
                disabled={enrollmentSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveEnrollments}
                disabled={
                  enrollmentLoading ||
                  enrollmentSaving ||
                  !enrollmentRows.length
                }
              >
                {enrollmentSaving
                  ? "Saving…"
                  : enrollmentYear.promoteMode
                    ? "Confirm Promotion"
                    : "Enroll Selected Students"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
