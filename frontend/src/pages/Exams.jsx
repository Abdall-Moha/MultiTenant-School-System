import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiEdit2, FiFileText, FiPlus, FiTrash2 } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const blank = {
  classId: "",
  subjectId: "",
  teacherId: "",
  examDate: "",
  totalMarks: "",
  academicYearId: "",
  examinationId: "",
};

const allowedExtensions = [".pdf", ".doc", ".docx", ".txt"];
const maxFileSize = 10 * 1024 * 1024;

function getExamFileUrl(filePath) {
  const apiUrl = new URL(api.defaults.baseURL, window.location.origin);
  const backendPath = apiUrl.pathname
    .replace(/\/api\/?$/i, "")
    .replace(/\/$/, "");
  const fileName = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${apiUrl.origin}${backendPath}/${fileName}`;
}

function formatFileSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getId(value) {
  return String(value?._id || value || "");
}

export default function Exams() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [examinations, setExaminations] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState(blank);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(false);
  const [examinationModal, setExaminationModal] = useState(false);
  const [examinationForm, setExaminationForm] = useState({
    academicYearId: "",
    name: "",
  });
  const [filter, setFilter] = useState({
    classId: "",
    subjectId: "",
    teacherId: "",
    academicYearId: "",
    examinationId: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState("");
  usePageNotifications(error, notice);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const examParams = {
      limit: 100,
      ...Object.fromEntries(
        Object.entries(filter).filter(([, value]) => value),
      ),
    };
    const requests = [
      api.get("/classes", { params: { limit: 100 } }),
      api.get("/academic-years", { params: { limit: 100 } }),
      api.get("/examinations", { params: { limit: 100 } }),
      api.get("/subjects", { params: { limit: 100 } }),
      user?.role === "TEACHER"
        ? api.get("/teacher-assignments", { params: { limit: 100 } })
        : api.get("/teachers", { params: { limit: 100 } }),
      api.get("/exams", { params: examParams }),
    ];

    Promise.all(requests)
      .then((results) => {
        if (!active) return;
        setClasses(results[0].data.classes || []);
        const loadedYears = results[1].data.academicYears || [];
        setAcademicYears(
          user?.role === "TEACHER"
            ? loadedYears.filter((year) => year.isCurrent)
            : loadedYears,
        );
        setExaminations(results[2].data.examinations || []);
        setSubjects(results[3].data.subjects || []);
        if (user?.role === "TEACHER") {
          const ownAssignments = results[4].data.assignments || [];
          setAssignments(ownAssignments);
          const ownTeacher = ownAssignments[0]?.teacherId;
          setTeachers(ownTeacher ? [ownTeacher] : []);
        } else {
          setTeachers(results[4].data.teachers || []);
        }
        setExams(results[5].data.exams || []);
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
  }, [filter, user?.role]);

  const assignedPairs = new Set(
    assignments.map(
      (assignment) =>
        `${assignment.classId?._id || assignment.classId}:${assignment.subjectId?._id || assignment.subjectId}:${assignment.academicYearId?._id || assignment.academicYearId}`,
    ),
  );
  const formClasses =
    user?.role === "TEACHER"
      ? classes.filter(
          (classItem) =>
            String(
              classItem.academicYearId?._id || classItem.academicYearId,
            ) === String(form.academicYearId) &&
            assignments.some(
              (assignment) =>
                String(assignment.classId?._id || assignment.classId) ===
                  String(classItem._id) &&
                String(
                  assignment.academicYearId?._id || assignment.academicYearId,
                ) === String(form.academicYearId),
            ),
        )
      : classes.filter(
          (classItem) =>
            !form.academicYearId ||
            String(
              classItem.academicYearId?._id || classItem.academicYearId,
            ) === String(form.academicYearId),
        );
  const formExaminations = examinations.filter(
    (examination) =>
      String(examination.academicYearId?._id || examination.academicYearId) ===
      String(form.academicYearId),
  );
  const selectedClass = classes.find(
    (item) => String(item._id) === String(form.classId),
  );
  const formSubjects =
    user?.role === "TEACHER"
      ? subjects.filter((subject) =>
          assignments.some(
            (assignment) =>
              String(assignment.subjectId?._id || assignment.subjectId) ===
                String(subject._id) &&
              String(assignment.classId?._id || assignment.classId) ===
                String(form.classId) &&
              String(
                assignment.academicYearId?._id || assignment.academicYearId,
              ) === String(form.academicYearId),
          ),
        )
      : subjects.filter(
          (subject) =>
            subject.status === "ACTIVE" &&
            (!selectedClass ||
              getId(subject.schoolId) === getId(selectedClass.schoolId)),
        );
  const formTeachers =
    user?.role === "TEACHER"
      ? teachers
      : teachers.filter(
          (teacher) =>
            teacher.status === "ACTIVE" &&
            (!selectedClass ||
              getId(teacher.schoolId) === getId(selectedClass.schoolId)),
        );

  function open(exam) {
    setEditing(exam || null);
    setSelectedFile(null);
    setForm(
      exam
        ? {
            examinationId: exam.examinationId?._id || "",
            classId: exam.classId?._id || "",
            subjectId: exam.subjectId?._id || "",
            teacherId: exam.teacherId?._id || "",
            examDate: exam.examDate?.slice(0, 10) || "",
            totalMarks: exam.totalMarks,
            academicYearId:
              exam.classId?.academicYearId?._id ||
              exam.classId?.academicYearId ||
              academicYears.find((year) => year.name === exam.academicYear)
                ?._id ||
              "",
          }
        : {
            ...blank,
            teacherId: user?.role === "TEACHER" ? teachers[0]?._id || "" : "",
          },
    );
    setError("");
    setFieldErrors({});
    setModal(true);
  }

  function selectFile(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    const extension = `.${file.name.split(".").pop().toLowerCase()}`;
    if (!allowedExtensions.includes(extension)) {
      setError("Only PDF, DOC, DOCX and TXT files are allowed.");
      setFieldErrors((current) => ({
        ...current,
        examFile: "Only PDF, DOC, DOCX and TXT files are allowed.",
      }));
      event.target.value = "";
      setSelectedFile(null);
      return;
    }
    if (file.size > maxFileSize) {
      setError("File size cannot exceed 10 MB.");
      setFieldErrors((current) => ({
        ...current,
        examFile: "File size cannot exceed 10 MB.",
      }));
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    setError("");
    setFieldErrors((current) => ({ ...current, examFile: "" }));
    setSelectedFile(file);
  }

  function removeSelectedFile() {
    setSelectedFile(null);
    const input = document.getElementById("exam-file");
    if (input) input.value = "";
  }

  function updateFormField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "academicYearId"
        ? {
            classId: "",
            subjectId: "",
            teacherId: user?.role === "TEACHER" ? teachers[0]?._id || "" : "",
          }
        : {}),
      ...(field === "academicYearId" ? { examinationId: "" } : {}),
      ...(field === "classId"
        ? {
            subjectId: "",
            teacherId: user?.role === "TEACHER" ? teachers[0]?._id || "" : "",
          }
        : {}),
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: "",
      ...(field === "academicYearId"
        ? { classId: "", subjectId: "", teacherId: "" }
        : {}),
      ...(field === "academicYearId" ? { examinationId: "" } : {}),
      ...(field === "classId" ? { subjectId: "", teacherId: "" } : {}),
    }));
  }

  async function save(event) {
    event.preventDefault();
    const validationErrors = {};
    if (!form.academicYearId)
      validationErrors.academicYearId = "Please select an academic year.";
    if (!form.examinationId)
      validationErrors.examinationId = "Please select an examination name.";
    if (!form.classId) validationErrors.classId = "Please select a class.";
    if (!form.subjectId)
      validationErrors.subjectId = "Please select a subject.";
    if (!form.teacherId)
      validationErrors.teacherId = "Please select a teacher.";
    if (!form.examDate)
      validationErrors.examDate = "Please select an exam date.";
    if (
      !form.totalMarks ||
      !Number.isFinite(Number(form.totalMarks)) ||
      Number(form.totalMarks) <= 0
    )
      validationErrors.totalMarks =
        "Please enter a total mark greater than zero.";
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError("Please correct the highlighted fields.");
      return;
    }
    if (
      user?.role === "TEACHER" &&
      !assignedPairs.has(
        `${form.classId}:${form.subjectId}:${form.academicYearId}`,
      )
    ) {
      setError("You are not assigned to this class and subject.");
      return;
    }
    if (selectedFile && selectedFile.size > maxFileSize) {
      setError("File size cannot exceed 10 MB.");
      setFieldErrors((current) => ({
        ...current,
        examFile: "File size cannot exceed 10 MB.",
      }));
      return;
    }
    if (selectedFile) {
      const extension = `.${selectedFile.name.split(".").pop().toLowerCase()}`;
      if (!allowedExtensions.includes(extension)) {
        setError("Only PDF, DOC, DOCX and TXT files are allowed.");
        setFieldErrors((current) => ({
          ...current,
          examFile: "Only PDF, DOC, DOCX and TXT files are allowed.",
        }));
        return;
      }
    }

    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      // FormData carries normal exam fields and the optional file in one request.
      const formData = new FormData();
      formData.append("examinationId", form.examinationId);
      formData.append("classId", form.classId);
      formData.append("subjectId", form.subjectId);
      formData.append("teacherId", form.teacherId);
      formData.append("examDate", form.examDate);
      formData.append("totalMarks", String(Number(form.totalMarks)));
      formData.append("academicYearId", form.academicYearId);
      if (user?.role === "SUPER_ADMIN") {
        const year = academicYears.find(
          (item) => String(item._id) === String(form.academicYearId),
        );
        if (year?.schoolId)
          formData.append("schoolId", year.schoolId._id || year.schoolId);
      }
      if (selectedFile) formData.append("examFile", selectedFile);

      // Clear the API helper's JSON default so the browser adds the multipart boundary.
      const requestOptions = { headers: { "Content-Type": null } };
      if (editing)
        await api.put(`/exams/${editing._id}`, formData, requestOptions);
      else await api.post("/exams", formData, requestOptions);

      setModal(false);
      setNotice(editing ? "Exam updated." : "Exam created.");
      const params = {
        limit: 100,
        ...Object.fromEntries(
          Object.entries(filter).filter(([, value]) => value),
        ),
      };
      const { data } = await api.get("/exams", { params });
      setExams(data.exams || []);
      const examinationResponse = await api.get("/examinations", {
        params: { limit: 100 },
      });
      setExaminations(examinationResponse.data.examinations || []);
    } catch (requestError) {
      const message = getApiError(requestError);
      setError(
        message?.trim() ||
          "Unable to save the exam. Please check your inputs and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveExamination(event) {
    event.preventDefault();
    const year = academicYears.find(
      (item) => String(item._id) === String(examinationForm.academicYearId),
    );
    if (!year || !examinationForm.name.trim()) {
      setError("Choose an academic year and enter an examination name.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const body = {
        academicYearId: examinationForm.academicYearId,
        name: examinationForm.name.trim(),
      };
      if (user?.role === "SUPER_ADMIN") {
        body.schoolId = year.schoolId?._id || year.schoolId;
      }
      const { data } = await api.post("/examinations", body);
      setExaminations((current) => [
        { ...data.examination, academicYearId: year },
        ...current,
      ]);
      setExaminationForm({ academicYearId: "", name: "" });
      setExaminationModal(false);
      setNotice("Examination registered.");
    } catch (requestError) {
      setError(
        getApiError(requestError)?.trim() ||
          "Unable to register the examination.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(exam) {
    if (!window.confirm(`Delete ${exam.title}?`)) return;
    setError("");
    try {
      await api.delete(`/exams/${exam._id}`);
      setExams((currentExams) =>
        currentExams.filter((item) => item._id !== exam._id),
      );
      setNotice("Exam deleted.");
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  function openExamFile(filePath) {
    const fileUrl = getExamFileUrl(filePath);
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Academic planning</span>
          <h2>Examinations</h2>
          <p>
            Register shared examinations and manage their class subject papers.
          </p>
        </div>
        <div className="school-actions">
          {(user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setExaminationModal(true)}
            >
              <FiPlus /> Add Examination
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={() => open()}
            disabled={user?.role === "TEACHER" && academicYears.length === 0}
          >
            <FiPlus /> Add Subject Exam
          </button>
        </div>
      </div>

      {error && !modal && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success-message page-message">
          {notice}
        </div>
      )}
      {user?.role === "TEACHER" && !loading && academicYears.length === 0 && (
        <div role="status" className="form-error page-message">
          No current academic year is available. Ask the administrator to set
          one and assign your classes.
        </div>
      )}

      <div className="school-table-card">
        <div className="school-card-heading">
          <div>
            <span className="eyebrow">Shared examination names</span>
            <h3>Registered Examinations</h3>
          </div>
        </div>
        {loading ? (
          <div className="school-loading">Loading examinations...</div>
        ) : (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Examination Name</th>
                  <th>Academic Year</th>
                </tr>
              </thead>
              <tbody>
                {examinations.map((examination) => (
                  <tr key={examination._id}>
                    <td className="table-name">{examination.name}</td>
                    <td>{examination.academicYearId?.name || "—"}</td>
                  </tr>
                ))}
                {!examinations.length && (
                  <tr>
                    <td colSpan="2" className="table-message">
                      No examinations have been registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="school-table-card">
        <div className="school-card-heading">
          <div>
            <span className="eyebrow">Class and subject papers</span>
            <h3>Subject Exams</h3>
          </div>
        </div>
        <div className="page-filters">
          {[
            ["examinationId", "All examinations", examinations, "name"],
            ["classId", "All classes", classes, "name"],
            ["subjectId", "All subjects", subjects, "name"],
            ...(user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
              ? [["teacherId", "All teachers", teachers, "fullName"]]
              : []),
          ].map(([key, label, options, field]) => (
            <select
              key={key}
              aria-label={label}
              className="form-input"
              value={filter[key]}
              onChange={(event) =>
                setFilter({ ...filter, [key]: event.target.value })
              }
            >
              <option value="">{label}</option>
              {options.map((option) => (
                <option key={option._id} value={option._id}>
                  {option[field]}
                </option>
              ))}
            </select>
          ))}
          <select
            aria-label="Filter by academic year"
            className="form-input"
            value={filter.academicYearId}
            onChange={(event) =>
              setFilter({ ...filter, academicYearId: event.target.value })
            }
          >
            <option value="">All academic years</option>
            {academicYears.map((year) => (
              <option key={year._id} value={year._id}>
                {year.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="school-loading">Loading exams…</div>
        ) : (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Examination Name</th>
                  <th>Academic Year</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Date</th>
                  <th>Total Marks</th>
                  <th>File</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam._id}>
                    <td className="table-name">
                      {exam.examinationId?.name || exam.title}
                    </td>
                    <td>
                      {exam.classId?.academicYearId?.name || exam.academicYear}
                    </td>
                    <td>{exam.classId?.name || "—"}</td>
                    <td>{exam.subjectId?.name || "—"}</td>
                    <td>{exam.teacherId?.fullName || "—"}</td>
                    <td>
                      {exam.examDate
                        ? new Date(exam.examDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>{exam.totalMarks}</td>
                    <td>
                      {exam.filePath ? (
                        <button
                          type="button"
                          className="edit-link"
                          onClick={() => openExamFile(exam.filePath)}
                        >
                          <FiFileText /> View File
                        </button>
                      ) : (
                        "No File"
                      )}
                    </td>
                    <td>
                      <div className="school-actions">
                        <button
                          type="button"
                          className="edit-link"
                          onClick={() => open(exam)}
                        >
                          <FiEdit2 /> Edit
                        </button>
                        <button
                          type="button"
                          className="status-action"
                          onClick={() => remove(exam)}
                        >
                          <FiTrash2 /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!exams.length && (
                  <tr>
                    <td colSpan="9" className="table-message">
                      No exams found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-modal-title"
          >
            <div className="modal-heading">
              <h2 id="exam-modal-title">
                {editing ? "Edit subject exam" : "Add subject exam"}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setModal(false)}
                disabled={busy}
              >
                ×
              </button>
            </div>
            <form onSubmit={save} noValidate>
              <label htmlFor="exam-academic-year">Academic Year</label>
              <select
                id="exam-academic-year"
                className="form-input"
                aria-invalid={Boolean(fieldErrors.academicYearId)}
                aria-describedby={
                  fieldErrors.academicYearId ? "exam-year-error" : undefined
                }
                value={form.academicYearId}
                onChange={(event) =>
                  updateFormField("academicYearId", event.target.value)
                }
              >
                <option value="">Select Academic Year</option>
                {academicYears.map((year) => (
                  <option key={year._id} value={year._id}>
                    {year.name}
                  </option>
                ))}
              </select>
              {fieldErrors.academicYearId && (
                <small id="exam-year-error" className="form-error">
                  {fieldErrors.academicYearId}
                </small>
              )}

              <label htmlFor="exam-examination">Examination Name</label>
              <select
                id="exam-examination"
                className="form-input"
                aria-invalid={Boolean(fieldErrors.examinationId)}
                aria-describedby={
                  fieldErrors.examinationId
                    ? "exam-examination-error"
                    : undefined
                }
                value={form.examinationId}
                disabled={!form.academicYearId}
                onChange={(event) =>
                  updateFormField("examinationId", event.target.value)
                }
              >
                <option value="">Select Examination Name</option>
                {formExaminations.map((examination) => (
                  <option key={examination._id} value={examination._id}>
                    {examination.name}
                  </option>
                ))}
              </select>
              {fieldErrors.examinationId && (
                <small id="exam-examination-error" className="form-error">
                  {fieldErrors.examinationId}
                </small>
              )}

              {[
                ["classId", "Class", formClasses],
                ["subjectId", "Subject", formSubjects],
                ["teacherId", "Teacher", formTeachers],
              ].map(([key, label, options]) => (
                <div key={key}>
                  <label htmlFor={`exam-${key}`}>{label}</label>
                  <select
                    id={`exam-${key}`}
                    className="form-input"
                    disabled={
                      (key === "subjectId" || key === "teacherId") &&
                      (!form.classId || !options.length)
                    }
                    aria-invalid={Boolean(fieldErrors[key])}
                    aria-describedby={
                      fieldErrors[key] ? `exam-${key}-error` : undefined
                    }
                    value={form[key]}
                    onChange={(event) =>
                      updateFormField(key, event.target.value)
                    }
                  >
                    <option value="">
                      {!form.classId && key !== "classId"
                        ? "Select a class first"
                        : options.length
                          ? `Select ${label.toLowerCase()}`
                          : `No active ${label.toLowerCase()}s available`}
                    </option>
                    {options.map((option) => (
                      <option key={option._id} value={option._id}>
                        {option.name || option.fullName}
                      </option>
                    ))}
                  </select>
                  {fieldErrors[key] && (
                    <small id={`exam-${key}-error`} className="form-error">
                      {fieldErrors[key]}
                    </small>
                  )}
                </div>
              ))}

              <label htmlFor="exam-date">Exam Date</label>
              <input
                id="exam-date"
                className="form-input"
                type="date"
                aria-invalid={Boolean(fieldErrors.examDate)}
                aria-describedby={
                  fieldErrors.examDate ? "exam-date-error" : undefined
                }
                value={form.examDate}
                onChange={(event) =>
                  updateFormField("examDate", event.target.value)
                }
              />
              {fieldErrors.examDate && (
                <small id="exam-date-error" className="form-error">
                  {fieldErrors.examDate}
                </small>
              )}

              <label htmlFor="exam-total-marks">Total Marks</label>
              <input
                id="exam-total-marks"
                className="form-input"
                type="number"
                min="1"
                aria-invalid={Boolean(fieldErrors.totalMarks)}
                aria-describedby={
                  fieldErrors.totalMarks ? "exam-total-marks-error" : undefined
                }
                value={form.totalMarks}
                onChange={(event) =>
                  updateFormField("totalMarks", event.target.value)
                }
              />
              {fieldErrors.totalMarks && (
                <small id="exam-total-marks-error" className="form-error">
                  {fieldErrors.totalMarks}
                </small>
              )}

              {editing?.filePath && (
                <div className="exam-current-file">
                  <span>Current File</span>
                  <button
                    type="button"
                    className="edit-link"
                    onClick={() => openExamFile(editing.filePath)}
                  >
                    <FiFileText /> View File
                  </button>
                </div>
              )}

              <div>
                <label
                  htmlFor="exam-file"
                  className="block mb-2 text-sm font-medium text-gray-700"
                >
                  {editing ? "Replace File" : "Exam File"}
                </label>

                <div className="flex items-center gap-3">
                  <label
                    htmlFor="exam-file"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 cursor-pointer hover:border-blue-500 hover:text-blue-600 transition"
                  >
                    <i className="fa-solid fa-upload"></i>
                    Choose File
                  </label>

                  <span className="text-sm text-gray-500">
                    {selectedFile?.name ||
                      (editing?.filePath
                        ? "Current file will be kept"
                        : "No file chosen")}
                  </span>

                  <input
                    id="exam-file"
                    className="hidden"
                    type="file"
                    required={false}
                    accept=".pdf,.doc,.docx,.txt"
                    aria-invalid={Boolean(fieldErrors.examFile)}
                    aria-describedby={
                      fieldErrors.examFile ? "exam-file-error" : undefined
                    }
                    onChange={selectFile}
                  />
                </div>

                <small className="block mt-2 text-xs text-gray-500">
                  Optional: PDF, DOC, DOCX or TXT — Maximum 10 MB
                </small>
              </div>
              {fieldErrors.examFile && (
                <small id="exam-file-error" className="form-error">
                  {fieldErrors.examFile}
                </small>
              )}
              {selectedFile && (
                <div className="exam-selected-file">
                  <span>
                    <strong>Selected:</strong> {selectedFile.name} ·{" "}
                    {formatFileSize(selectedFile.size)}
                  </span>
                  <button
                    type="button"
                    className="status-action"
                    onClick={removeSelectedFile}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
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
                  onClick={() => setModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create Subject Exam"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {examinationModal && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shared-examination-title"
          >
            <div className="modal-heading">
              <h2 id="shared-examination-title">Register Examination</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setExaminationModal(false)}
                disabled={busy}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveExamination} noValidate>
              <label htmlFor="shared-examination-year">Academic Year</label>
              <select
                id="shared-examination-year"
                className="form-input"
                value={examinationForm.academicYearId}
                onChange={(event) =>
                  setExaminationForm({
                    ...examinationForm,
                    academicYearId: event.target.value,
                  })
                }
              >
                <option value="">Select Academic Year</option>
                {academicYears.map((year) => (
                  <option key={year._id} value={year._id}>
                    {year.name}
                  </option>
                ))}
              </select>
              <label htmlFor="shared-examination-name">Examination Name</label>
              <input
                id="shared-examination-name"
                className="form-input"
                value={examinationForm.name}
                onChange={(event) =>
                  setExaminationForm({
                    ...examinationForm,
                    name: event.target.value,
                  })
                }
                maxLength={100}
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
                  onClick={() => setExaminationModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={busy}>
                  {busy ? "Registering..." : "Register Examination"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
