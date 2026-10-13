import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import { usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const editableRoles = ["ADMIN", "SUPER_ADMIN", "TEACHER"];

// Follow the pagination returned by the API so summaries use every record.
async function loadAll(path, key, params = {}) {
  const result = [];
  let page = 1;
  while (true) {
    const { data } = await api.get(path, {
      params: { ...params, page, limit: 100 },
    });
    result.push(...(data[key] || []));
    const totalPages = data.pagination?.totalPages || 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return result;
}

function idOf(value) {
  return String(value?._id || value || "");
}

export default function Marks() {
  const { user } = useAuth();
  const canManage = editableRoles.includes(user?.role);
  const isTeacher = user?.role === "TEACHER";
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [examsScope, setExamsScope] = useState("");
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentScope, setEnrollmentScope] = useState("");
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [enrollmentLoadError, setEnrollmentLoadError] = useState("");
  const [marks, setMarks] = useState([]);
  const [marksScope, setMarksScope] = useState("");
  const [familyChildren, setFamilyChildren] = useState([]);
  const [familyStudentId, setFamilyStudentId] = useState("");
  const [familyYearId, setFamilyYearId] = useState("");
  const [familyYears, setFamilyYears] = useState([]);
  const [familyExams, setFamilyExams] = useState([]);
  const [familyExamId, setFamilyExamId] = useState("");
  const [familyResults, setFamilyResults] = useState([]);
  const familyRequestId = useRef(0);
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [examinationId, setExaminationId] = useState("");
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState({});
  const [markFieldErrors, setMarkFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examLoadError, setExamLoadError] = useState("");
  const [savingMarks, setSavingMarks] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      try {
        setLoading(true);
        setOptionsLoading(true);
        const loadedYears = await loadAll("/academic-years", "academicYears");
        const availableYears = isTeacher
          ? loadedYears.filter((year) => year.isCurrent)
          : loadedYears;
        let availableClasses = [];
        if (isTeacher) {
          const assignments = await loadAll(
            "/teacher-assignments",
            "assignments",
          );
          const uniqueClasses = new Map();
          assignments.forEach((assignment) => {
            if (assignment.classId?._id)
              uniqueClasses.set(idOf(assignment.classId), assignment.classId);
          });
          availableClasses = [...uniqueClasses.values()];
        } else if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
          availableClasses = await loadAll("/classes", "classes");
        }
        if (!active) return;
        setYears(availableYears);
        setClasses(availableClasses);
        // A teacher starts in the current year and cannot choose another year.
        const currentYear = availableYears.find((year) => year.isCurrent);
        setYearId(currentYear?._id || "");
      } catch (requestError) {
        if (active) setError(getApiError(requestError));
      } finally {
        if (active) {
          setLoading(false);
          setOptionsLoading(false);
        }
      }
    }
    if (canManage) loadOptions();
    return () => {
      active = false;
    };
  }, [canManage, isTeacher, user?.role]);

  const schoolId = idOf(years.find((year) => idOf(year) === yearId)?.schoolId);

  const availableClasses = useMemo(
    () =>
      classes.filter(
        (item) => idOf(item.academicYearId) === yearId,
      ),
    [classes, yearId],
  );

  useEffect(() => {
    if (!canManage || !yearId || !classId) return undefined;
    let active = true;
    async function loadExams() {
      try {
        setExamsLoading(true);
        setExamLoadError("");
        const params = { academicYearId: yearId, classId, limit: 100 };
        if (user?.role === "SUPER_ADMIN" && schoolId) params.schoolId = schoolId;
        const loaded = await loadAll("/exams", "exams", params);
        if (active) {
          setExams(loaded);
          setExamsScope(`${yearId}:${classId}`);
        }
      } catch (requestError) {
        if (active) {
          const message = getApiError(requestError);
          setExamLoadError(message?.trim() || "Unable to load exams. Please try again.");
          setError(message?.trim() || "Unable to load exams. Please try again.");
        }
      } finally {
        if (active) setExamsLoading(false);
      }
    }
    loadExams();
    return () => {
      active = false;
    };
  }, [canManage, classId, schoolId, user?.role, yearId]);

  useEffect(() => {
    if (!canManage || !classId || !yearId || !examId || !subjectId) return undefined;
    let active = true;
    async function loadEnrolledStudents() {
      try {
        setEnrollmentsLoading(true);
        setEnrollmentLoadError("");
        const params = {
          academicYearId: yearId,
          classId,
          status: "ACTIVE",
        };
        if (user?.role === "SUPER_ADMIN" && schoolId) params.schoolId = schoolId;
        const loaded = await loadAll(
          "/student-enrollments",
          "enrollments",
          params,
        );
        if (active) {
          setEnrollments(loaded);
          setEnrollmentScope(`${yearId}:${classId}:${examId}:${subjectId}`);
        }
      } catch (requestError) {
        if (active) {
          const message = getApiError(requestError);
          setEnrollmentLoadError(message?.trim() || "Unable to load students. Please try again.");
          setError(message?.trim() || "Unable to load students. Please try again.");
        }
      } finally {
        if (active) setEnrollmentsLoading(false);
      }
    }
    loadEnrolledStudents();
    return () => {
      active = false;
    };
  }, [canManage, classId, examId, schoolId, subjectId, user?.role, yearId]);

  useEffect(() => {
    if (!canManage || !examId || !subjectId) return undefined;
    let active = true;
    async function loadExamMarks() {
      try {
        setLoading(true);
        const params = { examId, subjectId };
        if (user?.role === "SUPER_ADMIN" && schoolId) params.schoolId = schoolId;
        const loadedMarks = await loadAll("/marks", "marks", params);
        if (!active) return;
        setMarks(loadedMarks);
        setMarksScope(`${examId}:${subjectId}`);
        setDrafts(
          Object.fromEntries(
            loadedMarks.map((mark) => [
              idOf(mark.studentId),
              String(mark.marksObtained),
            ]),
          ),
        );
        setError("");
      } catch (requestError) {
        if (active) setError(getApiError(requestError));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    loadExamMarks();
    return () => {
      active = false;
    };
  }, [canManage, examId, schoolId, subjectId, user?.role]);

  // Load only exams and results the signed-in student or parent is allowed to see.
  const loadFamilyResults = useCallback(async (studentId = "", academicYearId = "", selectedExamId = "") => {
    const requestId = ++familyRequestId.current;
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (studentId) params.studentId = studentId;
      if (academicYearId) params.academicYearId = academicYearId;
      if (selectedExamId) params.examinationId = selectedExamId;
      const { data } = await api.get("/marks/student-results", { params });
      if (requestId !== familyRequestId.current) return;
      setFamilyChildren(data.children || []);
      setFamilyStudentId(idOf(data.selectedStudentId));
      setFamilyYears(data.academicYears || []);
      setFamilyYearId(idOf(data.selectedAcademicYearId));
      setFamilyExams(data.examinations || []);
      setFamilyResults(data.results || []);
    } catch (requestError) {
      if (requestId === familyRequestId.current) {
        setError(getApiError(requestError)?.trim() || "Unable to load results. Please try again.");
      }
    } finally {
      if (requestId === familyRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) return;
    const requestId = ++familyRequestId.current;
    api.get("/marks/student-results")
      .then(({ data }) => {
        if (requestId !== familyRequestId.current) return;
        setFamilyChildren(data.children || []);
        setFamilyStudentId(idOf(data.selectedStudentId));
        setFamilyYears(data.academicYears || []);
        setFamilyYearId(idOf(data.selectedAcademicYearId));
        setFamilyExams(data.examinations || []);
        setFamilyResults(data.results || []);
      })
      .catch((requestError) => {
        if (requestId === familyRequestId.current) {
          setError(getApiError(requestError)?.trim() || "Unable to load results. Please try again.");
        }
      })
      .finally(() => {
        if (requestId === familyRequestId.current) setLoading(false);
      });
    return () => {
      familyRequestId.current += 1;
    };
  }, [canManage]);

  const currentExams = examsScope === `${yearId}:${classId}` ? exams : [];
  const examinationOptions = [...new Map(
    currentExams
      .map((subjectExam) => subjectExam.examinationId)
      .filter((item) => item?._id)
      .map((item) => [idOf(item), item]),
  ).values()];
  const examsForSelectedExamination = currentExams.filter(
    (subjectExam) => idOf(subjectExam.examinationId) === examinationId,
  );
  const currentEnrollments = enrollmentScope === `${yearId}:${classId}:${examId}:${subjectId}`
    ? enrollments
    : [];
  const currentMarks = canManage
    ? marksScope === `${examId}:${subjectId}` ? marks : []
    : marksScope === "own" ? marks : [];
  const selectedExam = examsForSelectedExamination.find((exam) => idOf(exam) === examId);
  const selectedExamSubjectId = idOf(selectedExam?.subjectId);
  const canShowClassMarks = Boolean(
    yearId && classId && examinationId && examId && subjectId && subjectId === selectedExamSubjectId,
  );
  const markByStudent = new Map(
    currentMarks.map((mark) => [idOf(mark.studentId), mark]),
  );
  const enrolledStudents = currentEnrollments
    .map((enrollment) => enrollment.studentId)
    .filter((student) => student && student.status === "ACTIVE");
  const filteredStudents = enrolledStudents.filter((student) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      student.fullName?.toLowerCase().includes(query) ||
      student.roleNumber?.toLowerCase().includes(query)
    );
  });
  const visibleStudents = filteredStudents.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const recordedMarks = currentMarks.filter((mark) =>
    enrolledStudents.some((student) => idOf(student) === idOf(mark.studentId)),
  );
  const totalObtained = recordedMarks.reduce(
    (total, mark) => total + Number(mark.marksObtained),
    0,
  );
  const percentages = recordedMarks
    .filter(() => Number(selectedExam?.totalMarks) > 0)
    .map((mark) => (Number(mark.marksObtained) / selectedExam.totalMarks) * 100);

  function hasUnsavedMark(student) {
    const studentId = idOf(student);
    const value = drafts[studentId];
    const savedMark = markByStudent.get(studentId);

    if (value === undefined) return false;
    if (!savedMark) return value.trim() !== "";
    if (value.trim() === "") return true;
    return Number(value) !== Number(savedMark.marksObtained);
  }

  const changedStudents = enrolledStudents.filter(hasUnsavedMark);

  async function saveMarks() {
    const errors = {};
    const changedMarks = [];

    for (const student of changedStudents) {
      const studentId = idOf(student);
      const value = drafts[studentId] ?? "";
      const numericValue = Number(value);

      if (value.trim() === "") {
        errors[studentId] = "Enter a mark or restore the saved value.";
      } else if (!Number.isFinite(numericValue) || numericValue < 0) {
        errors[studentId] = "Enter a valid non-negative mark.";
      } else if (numericValue > Number(selectedExam?.totalMarks)) {
        errors[studentId] = `Marks cannot exceed ${selectedExam.totalMarks}.`;
      } else {
        changedMarks.push({ studentId, marksObtained: numericValue });
      }
    }

    setMarkFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Correct the highlighted marks before saving.");
      return;
    }
    if (!changedMarks.length) return;

    setSavingMarks(true);
    setError("");
    setSuccess("");
    try {
      const body = {
        examId,
        examinationId,
        academicYearId: yearId,
        classId,
        subjectId,
        marks: changedMarks,
      };
      const params = { examId, subjectId };
      if (user?.role === "SUPER_ADMIN" && schoolId) {
        body.schoolId = schoolId;
        params.schoolId = schoolId;
      }
      await api.post("/marks/bulk", body);
      const refreshed = await loadAll("/marks", "marks", params);
      setMarks(refreshed);
      setMarksScope(`${examId}:${subjectId}`);
      setDrafts(
        Object.fromEntries(
          refreshed.map((mark) => [idOf(mark.studentId), String(mark.marksObtained)]),
        ),
      );
      setMarkFieldErrors({});
      setSuccess(`${changedMarks.length} mark${changedMarks.length === 1 ? "" : "s"} saved successfully.`);
    } catch (requestError) {
      const message = getApiError(requestError);
      setError(message?.trim() || "Unable to save marks. Your unsaved entries are still here.");
    } finally {
      setSavingMarks(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const summaryCount = recordedMarks.length;
  const average = percentages.length
    ? (percentages.reduce((total, value) => total + value, 0) / percentages.length).toFixed(2)
    : null;

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Assessment</span>
          <h2>Marks</h2>
          <p>Review recorded results and enter marks for class exams.</p>
        </div>

      </div>

      {error && <div role="alert" className="form-error page-message">{error}</div>}
      {success && <div role="status" className="success-message page-message">{success}</div>}

      {canManage ? (
        <>
          <div className="school-table-card">
            <div className="page-filters marks-selection-row">
              <select
                className="form-input"
                aria-label="Academic year"
                value={yearId}
                disabled={optionsLoading || !years.length}
                onChange={(event) => {
                  setYearId(event.target.value);
                  setClassId("");
                  setExaminationId("");
                  setExamId("");
                  setSubjectId("");
                  setDrafts({});
                  setEnrollments([]);
                  setEnrollmentScope("");
                  setMarks([]);
                  setMarksScope("");
                  setMarkFieldErrors({});
                  setLoading(false);
                  setExamLoadError("");
                  setExamsLoading(false);
                  setEnrollmentsLoading(false);
                  setEnrollmentLoadError("");
                  setPage(1);
                }}
              >
                <option value="">Select Academic Year</option>
                {years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}
              </select>
              <select
                className="form-input"
                aria-label="Class"
                value={classId}
                disabled={!yearId || optionsLoading}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setExaminationId("");
                  setExamId("");
                  setSubjectId("");
                  setDrafts({});
                  setEnrollments([]);
                  setEnrollmentScope("");
                  setMarks([]);
                  setMarksScope("");
                  setMarkFieldErrors({});
                  setLoading(false);
                  setExamLoadError("");
                  setExamsLoading(false);
                  setEnrollmentsLoading(false);
                  setEnrollmentLoadError("");
                  setPage(1);
                }}
              >
                <option value="">Select Class</option>
                {availableClasses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
              <select
                className="form-input"
                aria-label="Examination name"
                value={examinationId}
                disabled={!classId || examsLoading}
                onChange={(event) => {
                  setExaminationId(event.target.value);
                  setExamId("");
                  setSubjectId("");
                  setDrafts({});
                  setEnrollments([]);
                  setEnrollmentScope("");
                  setMarks([]);
                  setMarksScope("");
                  setMarkFieldErrors({});
                  setLoading(false);
                  setPage(1);
                }}
              >
                <option value="">{examsLoading ? "Loading examinations..." : "Select Examination Name"}</option>
                {examinationOptions.map((examination) => (
                  <option key={examination._id} value={examination._id}>
                    {examination.name}
                  </option>
                ))}
              </select>
              <select
                className="form-input"
                aria-label="Subject name"
                value={subjectId}
                disabled={!examinationId || !examsForSelectedExamination.length}
                onChange={(event) => {
                  const selectedSubjectId = event.target.value;
                  const selectedSubjectExam = examsForSelectedExamination.find(
                    (item) => idOf(item.subjectId) === selectedSubjectId,
                  );
                  setSubjectId(selectedSubjectId);
                  setExamId(idOf(selectedSubjectExam));
                  setDrafts({});
                  setMarkFieldErrors({});
                  setEnrollments([]);
                  setEnrollmentScope("");
                  setMarks([]);
                  setMarksScope("");
                  setPage(1);
                }}
              >
                <option value="">Select Subject Name</option>
                {examsForSelectedExamination.map((subjectExam) => (
                  <option key={subjectExam._id} value={idOf(subjectExam.subjectId)}>
                    {subjectExam.subjectId?.name}
                  </option>
                ))}
              </select>
              {examLoadError && <span className="form-error">{examLoadError}</span>}
            </div>
            {canShowClassMarks && (
              <div className="page-filters marks-search-row">
                <label className="marks-search">
                  <FiSearch />
                  <input
                    className="form-input"
                    aria-label="Search students"
                    placeholder="Search name or role number"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  />
                </label>
              </div>
            )}
          </div>

          {!optionsLoading && !years.length && (
            <div role="status" className="table-message page-message">
              No academic years are available for your account.
            </div>
          )}
          {yearId && !optionsLoading && !availableClasses.length && (
            <div role="status" className="table-message page-message">
              No classes are available for the selected academic year.
            </div>
          )}

          {classId && !examsLoading && !examLoadError && !currentExams.length && (
            <div role="status" className="table-message page-message">
              No exams are available for the selected class and academic year.
            </div>
          )}

          {canShowClassMarks && (
            <div className="report-summary marks-summary">
              <article><span>Students in class</span><strong>{enrolledStudents.length}</strong></article>
              <article><span>Marks recorded</span><strong>{summaryCount}</strong></article>
              <article><span>Total obtained</span><strong>{totalObtained.toFixed(2)}</strong></article>
              <article><span>Average</span><strong>{average === null ? "—" : `${average}%`}</strong></article>
            </div>
          )}

          <div className="school-table-card">
            {loading ? <div className="school-loading">Loading marks…</div> : (
              <div className="table-scroll">
                <table className="users-table">
                  <thead><tr><th>Role number</th><th>Student Name</th><th>Marks Obtained</th><th>Percentage</th><th>Status</th></tr></thead>
                  <tbody>
                    {!canShowClassMarks ? <tr><td colSpan="5" className="table-message">Select an academic year, class, exam name, and subject to view marks.</td></tr> : null}
                    {canShowClassMarks && visibleStudents.map((student) => {
                      const studentId = idOf(student);
                      const mark = markByStudent.get(studentId);
                      const value = drafts[studentId] ?? (mark ? String(mark.marksObtained) : "");
                      const score = value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
                      const percent = score !== null && Number(selectedExam?.totalMarks) > 0
                        ? `${((score / selectedExam.totalMarks) * 100).toFixed(2)}%`
                        : null;
                      const isDirty = hasUnsavedMark(student);
                      return (
                        <tr key={student._id}>
                          <td>{student.roleNumber}</td>
                          <td className="table-name">{student.fullName}</td>
                          <td>
                            <input
                              className="form-input marks-entry"
                              type="number"
                              min="0"
                              max={selectedExam?.totalMarks}
                              step="any"
                              aria-label={`Mark for ${student.fullName}`}
                              aria-invalid={Boolean(markFieldErrors[studentId])}
                              aria-describedby={markFieldErrors[studentId] ? `mark-error-${student._id}` : undefined}
                              value={value}
                              onChange={(event) => {
                                setDrafts((current) => ({ ...current, [studentId]: event.target.value }));
                                setMarkFieldErrors((current) => ({ ...current, [studentId]: "" }));
                              }}
                            />
                            {markFieldErrors[studentId] && (
                              <small id={`mark-error-${student._id}`} className="form-error">
                                {markFieldErrors[studentId]}
                              </small>
                            )}
                          </td>
                          <td>{percent || "\u2014"}</td>
                          <td>{isDirty ? "Unsaved" : mark ? "Saved" : "Not entered"}</td>
                        </tr>
                      );
                    })}
                    {canShowClassMarks && enrollmentLoadError && <tr><td colSpan="5" className="table-message">{enrollmentLoadError}</td></tr>}
                    {canShowClassMarks && (enrollmentsLoading || loading) && <tr><td colSpan="5" className="table-message">Loading enrolled students and marks...</td></tr>}
                    {canShowClassMarks && !enrollmentsLoading && !loading && !enrollmentLoadError && !filteredStudents.length && <tr><td colSpan="5" className="table-message">No active students are enrolled in this class and year.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {canShowClassMarks && filteredStudents.length > PAGE_SIZE && <div className="marks-pagination"><span>Page {page} of {pageCount}</span><div><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className="secondary-button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div></div>}
          </div>
          {canShowClassMarks && (
            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!changedStudents.length || savingMarks || loading || enrollmentsLoading || Boolean(enrollmentLoadError)}
                onClick={saveMarks}
              >
                {savingMarks ? "Saving marks..." : "Save Marks"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="school-table-card">
            {user?.role === "PARENT" && familyChildren.length > 1 && (
              <div className="page-filters marks-parent-selector">
                <select
                  className="form-input"
                  aria-label="Select child"
                  value={familyStudentId}
                  onChange={(event) => {
                    const studentId = event.target.value;
                    setFamilyStudentId(studentId);
                    setFamilyYearId("");
                    setFamilyExamId("");
                    setFamilyYears([]);
                    setFamilyExams([]);
                    setFamilyResults([]);
                    loadFamilyResults(studentId);
                  }}
                >
                  {familyChildren.map((child) => (
                    <option key={child._id} value={child._id}>
                      {child.fullName} ({child.roleNumber})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="page-filters marks-family-selection-row">
              <select
                className="form-input"
                aria-label="Academic year"
                value={familyYearId}
                disabled={!familyYears.length || !familyStudentId}
                onChange={(event) => {
                  const academicYearId = event.target.value;
                  setFamilyYearId(academicYearId);
                  setFamilyExamId("");
                  setFamilyExams([]);
                  setFamilyResults([]);
                  loadFamilyResults(familyStudentId, academicYearId);
                }}
              >
                <option value="">Select Academic Year</option>
                {familyYears.map((year) => (
                  <option key={year._id} value={year._id}>{year.name}</option>
                ))}
              </select>
              <select
                className="form-input"
                aria-label="Exam name"
                value={familyExamId}
                disabled={!familyYearId || !familyExams.length}
                onChange={(event) => {
                  const selectedId = event.target.value;
                  setFamilyExamId(selectedId);
                  setFamilyResults([]);
                  if (selectedId) loadFamilyResults(familyStudentId, familyYearId, selectedId);
                }}
              >
                <option value="">Select Exam Name</option>
                {familyExams.map((exam) => (
                  <option key={exam._id} value={exam._id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>

            {!loading && !familyStudentId && (
              <div className="table-message page-message">No linked student records were found for this account.</div>
            )}
            {!loading && familyStudentId && !familyYears.length && (
              <div className="table-message page-message">No academic years are available for this student's enrollment history.</div>
            )}
            {!loading && familyYears.length > 0 && !familyYearId && (
              <div className="table-message page-message">Select an academic year to view exams.</div>
            )}
            {!loading && familyYearId && !familyExams.length && (
              <div className="table-message page-message">No exams are available for the selected academic year.</div>
            )}
            {loading && <div className="school-loading">Loading results...</div>}
            {!loading && familyYearId && familyExams.length > 0 && !familyExamId && (
              <div className="table-message page-message">Select an exam to view its result.</div>
            )}
            {!loading && familyExamId && familyResults.length > 0 && (
              <div className="table-scroll">
                <table className="users-table">
                  <thead><tr><th>Subject</th><th>Marks Obtained</th><th>Total Marks</th><th>Percentage</th><th>Remarks</th><th>Status</th></tr></thead>
                  <tbody>
                    {familyResults.map((result) => (
                      <tr key={result.subjectExamId}>
                        <td className="table-name">{result.subjectName}</td>
                        <td>{result.status === "RECORDED" ? result.marksObtained : "\u2014"}</td>
                        <td>{result.totalMarks}</td>
                        <td>{result.percentage ? `${result.percentage}%` : "\u2014"}</td>
                        <td>{result.remarks || "\u2014"}</td>
                        <td>{result.status === "RECORDED" ? "Recorded" : "Pending"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && familyExamId && !familyResults.length && (
              <div className="table-message page-message">No subject exams are registered for this examination and class.</div>
            )}
          </div>
        </>
      )}


    </section>
  );
}
