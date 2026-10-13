import { useEffect, useMemo, useState } from "react";
import { FiPrinter, FiSearch } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import { usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const reportNames = {
  overview: "School overview",
  students: "Students and enrollment",
  attendance: "Attendance",
  performance: "Academic performance",
  fees: "Fees",
  payments: "Payments",
  people: "Teachers and staff",
  classes: "Classes and subjects",
};

function number(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

function Summary({ items }) {
  return (
    <div className="report-summary">
      {items.map(([label, value]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}

function Table({ columns, rows, empty = "No records match these filters." }) {
  return (
    <div className="table-scroll report-table-wrap">
      <table className="users-table">
        <thead>
          <tr>
            {columns.map((item) => (
              <th key={item.label}>{item.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row._id || row.id || index}>
              {columns.map((item) => (
                <td key={item.label}>{item.value(row)}</td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="table-message" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceResults({ report }) {
  const columns = [
    ...(report.subject
      ? [
          {
            label: "Exam",
            value: (row) =>
              `${row.exam?.title || "Exam"} · ${date(row.exam?.date)}`,
          },
        ]
      : []),
    { label: "Student", value: (row) => row.student?.fullName || "—" },
    { label: "Role number", value: (row) => row.student?.roleNumber || "—" },
    {
      label: "Marks",
      value: (row) =>
        `${number(row.marksObtained)} / ${number(row.totalMarks)}`,
    },
    {
      label: "Normalized score",
      value: (row) =>
        row.percentage === null ? "N/A" : `${number(row.percentage)}%`,
    },
    { label: "Remarks", value: (row) => row.remarks || "—" },
  ];
  const summary = [
    ...(report.subject ? [["Exams", number(report.summary.examCount)]] : []),
    ["Marks recorded", number(report.summary.markCount)],
    [
      "Average normalized score",
      report.summary.averagePercentage === null
        ? "N/A"
        : `${number(report.summary.averagePercentage)}%`,
    ],
  ];
  return (
    <>
      <Summary items={summary} />
      <p className="report-note">
        Scores are normalized as marks obtained divided by each exam maximum.
        Average is the average of normalized percentages. Students without marks
        are not included. No pass/fail rule is configured.
      </p>
      <Table columns={columns} rows={report.records || []} />
    </>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const role = user?.role;
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isManager = ["SUPER_ADMIN", "ADMIN"].includes(role);
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [options, setOptions] = useState({
    academicYears: [],
    classes: [],
    students: [],
    exams: [],
    subjects: [],
  });
  const [category, setCategory] = useState("attendance");
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [examId, setExamId] = useState("");
  const [performanceView, setPerformanceView] = useState("exam");
  const [subjectId, setSubjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [periodNumber, setPeriodNumber] = useState("");
  const [status, setStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [report, setReport] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  usePageNotifications(error, "");

  const categories = useMemo(() => {
    if (isManager) return Object.keys(reportNames);
    if (role === "TEACHER")
      return ["students", "attendance", "performance", "classes"];
    return ["attendance", "performance", "fees", "payments"];
  }, [isManager, role]);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    let active = true;
    async function loadSchools() {
      try {
        const allSchools = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
          const { data } = await api.get("/schools", {
            params: { page, limit: 100 },
          });
          allSchools.push(...(data.schools || []));
          totalPages = data.pagination?.totalPages || 1;
          page += 1;
        }
        if (active) setSchools(allSchools);
      } catch (requestError) {
        if (active) setError(getApiError(requestError));
      }
    }
    loadSchools();
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin && !schoolId) return undefined;
    let active = true;
    api
      .get("/reports/options", { params: isSuperAdmin ? { schoolId } : {} })
      .then(({ data }) => {
        if (!active) return;
        setOptions({
          academicYears: data.academicYears || [],
          classes: data.classes || [],
          students: data.students || [],
          exams: data.exams || [],
          subjects: data.subjects || [],
        });
        const currentYear = (data.academicYears || []).find(
          (year) => year.isCurrent,
        );
        setAcademicYearId(currentYear?._id || "");
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin, schoolId]);

  function changeCategory(value) {
    setCategory(value);
    setReport(null);
    setError("");
  }

  async function loadReport(event) {
    event.preventDefault();
    if (from && to && from > to) {
      setError("Start date must be before or equal to end date.");
      return;
    }
    if (category === "performance" && performanceView === "exam" && !examId) {
      setError("Select an exam to view its marks.");
      return;
    }
    if (
      category === "performance" &&
      performanceView === "subject" &&
      !subjectId
    ) {
      setError("Select a subject to view its performance.");
      return;
    }
    if (isSuperAdmin && !schoolId) {
      setError("Select a school first.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    const params = {};
    if (isSuperAdmin) params.schoolId = schoolId;
    if (
      [
        "overview",
        "students",
        "attendance",
        "performance",
        "classes",
        "people",
      ].includes(category) &&
      academicYearId
    )
      params.academicYearId = academicYearId;
    if (
      ["students", "attendance", "performance", "classes"].includes(category) &&
      classId
    )
      params.classId = classId;
    if (
      ["students", "attendance", "fees", "payments"].includes(category) &&
      studentId
    )
      params.studentId = studentId;
    if (category === "attendance" || category === "payments") {
      if (from) params.from = from;
      if (to) params.to = to;
    }
    if (category === "attendance" && periodNumber)
      params.periodNumber = periodNumber;
    if (category === "attendance" && status) params.status = status;
    if (category === "payments" && paymentMethod)
      params.paymentMethod = paymentMethod;
    if (category === "performance") {
      if (performanceView === "subject") params.subjectId = subjectId;
      else params.examId = examId;
      if (classId) params.classId = classId;
      if (studentId) params.studentId = studentId;
    }
    try {
      const { data } = await api.get(`/reports/${category}`, { params });
      setReport(data);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  function printReport() {
    window.print();
  }

  const academicYearName = options.academicYears.find(
    (item) => item._id === academicYearId,
  )?.name;
  const className = options.classes.find((item) => item._id === classId)?.name;
  const studentName = options.students.find(
    (item) => item._id === studentId,
  )?.fullName;
  const subjectName = options.subjects.find(
    (item) => item._id === subjectId,
  )?.name;
  const periodLabel = [
    !["fees", "payments"].includes(category) &&
      academicYearName &&
      `Academic year: ${academicYearName}`,
    ["students", "attendance", "performance", "classes"].includes(category) &&
      className &&
      `Class: ${className}`,
    category === "performance" &&
      performanceView === "subject" &&
      subjectName &&
      `Subject: ${subjectName}`,
    ["students", "attendance", "fees", "payments", "performance"].includes(
      category,
    ) &&
      studentName &&
      `Student: ${studentName}`,
    ["attendance", "payments"].includes(category) && from && `From: ${from}`,
    ["attendance", "payments"].includes(category) && to && `To: ${to}`,
    category === "attendance" && periodNumber && `Period: ${periodNumber}`,
    category === "attendance" && status && `Status: ${status}`,
    category === "payments" && paymentMethod && `Method: ${paymentMethod}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="school-page reports-page">
      <div className="school-heading report-heading">
        <div>
          <span className="eyebrow">School information</span>
          <h2>Reports</h2>
          <p>
            Review school data using the records and filters available to your
            role.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button report-print-button"
          onClick={printReport}
          disabled={!report}
        >
          <FiPrinter /> Print report
        </button>
      </div>
      <div className="school-table-card report-controls-card">
        <form className="report-filters" onSubmit={loadReport}>
          <label>
            Report
            <select
              className="form-input"
              value={category}
              onChange={(event) => changeCategory(event.target.value)}
            >
              {categories.map((key) => (
                <option key={key} value={key}>
                  {reportNames[key]}
                </option>
              ))}
            </select>
          </label>
          {isSuperAdmin && (
            <label>
              School
              <select
                className="form-input"
                value={schoolId}
                onChange={(event) => {
                  setSchoolId(event.target.value);
                  setReport(null);
                  setOptions({
                    academicYears: [],
                    classes: [],
                    students: [],
                    exams: [],
                    subjects: [],
                  });
                  setLoadingOptions(Boolean(event.target.value));
                }}
                required
              >
                <option value="">Select a school</option>
                {schools.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.schoolName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!["fees", "payments"].includes(category) && (
            <label>
              Academic year
              <select
                className="form-input"
                value={academicYearId}
                onChange={(event) => {
                  setAcademicYearId(event.target.value);
                  setReport(null);
                }}
              >
                <option value="">
                  {category === "overview"
                    ? "Current / all years"
                    : "All academic years"}
                </option>
                {options.academicYears.map((year) => (
                  <option key={year._id} value={year._id}>
                    {year.name}
                    {year.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {["attendance", "students", "performance", "classes"].includes(
            category,
          ) && (
            <label>
              Class
              <select
                className="form-input"
                value={classId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setReport(null);
                }}
              >
                <option value="">All classes</option>
                {options.classes
                  .filter(
                    (item) =>
                      !academicYearId ||
                      String(
                        item.academicYearId?._id || item.academicYearId,
                      ) === academicYearId,
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {[
            "students",
            "attendance",
            "fees",
            "payments",
            "performance",
          ].includes(category) &&
            ["SUPER_ADMIN", "ADMIN", "PARENT"].includes(role) && (
              <label>
                Student
                <select
                  className="form-input"
                  value={studentId}
                  onChange={(event) => {
                    setStudentId(event.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">All students</option>
                  {options.students.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.fullName}
                      {item.roleNumber ? ` — ${item.roleNumber}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          {category === "performance" && (
            <label>
              Performance report
              <select
                className="form-input"
                value={performanceView}
                onChange={(event) => {
                  setPerformanceView(event.target.value);
                  setReport(null);
                }}
              >
                <option value="exam">Marks by exam</option>
                <option value="subject">Subject performance</option>
              </select>
            </label>
          )}
          {category === "performance" && performanceView === "exam" && (
            <label>
              Exam
              <select
                className="form-input"
                value={examId}
                onChange={(event) => {
                  setExamId(event.target.value);
                  setReport(null);
                }}
                required
              >
                <option value="">Select an exam</option>
                {options.exams
                  .filter(
                    (item) =>
                      (!classId ||
                        String(item.classId?._id || item.classId) ===
                          classId) &&
                      (!academicYearId ||
                        String(
                          item.classId?.academicYearId?._id ||
                            item.classId?.academicYearId,
                        ) === academicYearId),
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title} — {item.classId?.name} —{" "}
                      {item.subjectId?.name} ({date(item.examDate)})
                    </option>
                  ))}
              </select>
            </label>
          )}
          {category === "performance" && performanceView === "subject" && (
            <label>
              Subject
              <select
                className="form-input"
                value={subjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  setReport(null);
                }}
                required
              >
                <option value="">Select a subject</option>
                {options.subjects.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {category === "attendance" && (
            <>
              <label>
                Start date
                <input
                  className="form-input"
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setReport(null);
                  }}
                />
              </label>
              <label>
                End date
                <input
                  className="form-input"
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setReport(null);
                  }}
                />
              </label>
              <label>
                Period
                <select
                  className="form-input"
                  value={periodNumber}
                  onChange={(event) => {
                    setPeriodNumber(event.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">All periods</option>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      Period {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  className="form-input"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                  <option value="LATE">Late</option>
                  <option value="EXCUSED">Excused</option>
                </select>
              </label>
            </>
          )}
          {category === "payments" && (
            <>
              <label>
                Start date
                <input
                  className="form-input"
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setReport(null);
                  }}
                />
              </label>
              <label>
                End date
                <input
                  className="form-input"
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setReport(null);
                  }}
                />
              </label>
              <label>
                Method
                <select
                  className="form-input"
                  value={paymentMethod}
                  onChange={(event) => {
                    setPaymentMethod(event.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">All methods</option>
                  <option value="EVC">EVC</option>
                  <option value="E-Dahab">E-Dahab</option>
                  <option value="BANK">BANK</option>
                </select>
              </label>
            </>
          )}
          <button
            type="submit"
            className="primary-button report-generate-button"
            disabled={loading || loadingOptions || (isSuperAdmin && !schoolId)}
          >
            <FiSearch /> {loading ? "Loading report…" : "Generate report"}
          </button>
        </form>
      </div>
      {error && (
        <div role="alert" className="form-error report-error">
          {error}
        </div>
      )}
      {loadingOptions && !(isSuperAdmin && !schoolId) && (
        <div className="school-loading">Loading report filters…</div>
      )}
      {loading && <div className="school-loading">Generating report…</div>}
      {!loading && !report && !loadingOptions && (
        <div className="school-loading">
          Choose report filters, then select Generate report.
        </div>
      )}
      {report && (
        <div className="report-results" id="report-results">
          <div className="report-title">
            <span className="eyebrow">{periodLabel || "Filtered report"}</span>
            <h2>{reportNames[category]}</h2>
            {category === "overview" && (
              <p>
                Student, teacher, staff and fee counts are all time. Enrollment
                records, class counts, and attendance use{" "}
                {report.period?.name || "all academic years"}.
              </p>
            )}
            {category === "performance" && (
              <p>
                {report.subject
                  ? `${report.subject.name} subject report · ${report.summary.examCount} exams`
                  : `${report.exam?.title} · ${report.exam?.class?.name} · ${report.exam?.subject?.name} · Maximum score ${number(report.exam?.totalMarks)}`}
              </p>
            )}
          </div>
          {category === "overview" && (
            <>
              <Summary
                items={[
                  ["Unique students", number(report.summary.uniqueStudents)],
                  ["Active students", number(report.summary.activeStudents)],
                  [
                    report.period?.isCurrent
                      ? "Currently enrolled"
                      : "Active enrollment records in period",
                    number(report.summary.activeEnrollmentRecords),
                  ],
                  ["Active teachers", number(report.summary.activeTeachers)],
                  ["Active staff", number(report.summary.activeStaff)],
                  ["Active classes", number(report.summary.activeClasses)],
                  ["Fees assigned", number(report.summary.fees.totalFees)],
                  [
                    "Collected toward fees",
                    number(report.summary.fees.totalPaid),
                  ],
                  [
                    "Outstanding balance",
                    number(report.summary.fees.totalRemaining),
                  ],
                  [
                    "Recorded attendance",
                    number(report.summary.attendance.total),
                  ],
                  [
                    "Attendance percentage",
                    `${number(report.summary.attendance.percentage)}%`,
                  ],
                  [
                    "Fee status mismatches",
                    number(report.summary.fees.inconsistentStatuses),
                  ],
                ]}
              />
              <p className="report-note">
                Attendance percentage counts PRESENT records divided by recorded
                entries. Enrollment count is for the selected academic-year
                period. Fee totals use Fee records; fees are not filtered by
                academic year because Fee has no academic-year reference.
              </p>
            </>
          )}
          {category === "students" && (
            <>
              <Summary
                items={[
                  ["Unique students", number(report.summary.uniqueStudents)],
                  ["Active students", number(report.summary.activeStudents)],
                  [
                    "Enrollment records",
                    number(report.summary.enrollmentRecords),
                  ],
                  [
                    "Active enrollment records",
                    number(report.summary.activeEnrollments),
                  ],
                  ["Male", number(report.summary.countsByGender.MALE)],
                  ["Female", number(report.summary.countsByGender.FEMALE)],
                  [
                    "Unspecified gender",
                    number(report.summary.countsByGender.unspecified),
                  ],
                  [
                    "Active enrollment",
                    number(report.summary.enrollmentStatusCounts.ACTIVE),
                  ],
                  [
                    "Repeated enrollment",
                    number(report.summary.enrollmentStatusCounts.REPEATED),
                  ],
                  [
                    "Transferred enrollment",
                    number(report.summary.enrollmentStatusCounts.TRANSFERRED),
                  ],
                  [
                    "Graduated enrollment",
                    number(report.summary.enrollmentStatusCounts.GRADUATED),
                  ],
                ]}
              />
              <h3>Student directory</h3>
              <Table
                columns={[
                  { label: "Student", value: (row) => row.fullName },
                  { label: "Role number", value: (row) => row.roleNumber },
                  { label: "Gender", value: (row) => row.gender || "—" },
                  { label: "Status", value: (row) => row.status },
                ]}
                rows={report.students || []}
              />
              <h3>Enrollment in selected year</h3>
              <Table
                columns={[
                  {
                    label: "Student",
                    value: (row) =>
                      row.studentId?.fullName || "Student unavailable",
                  },
                  {
                    label: "Role number",
                    value: (row) => row.studentId?.roleNumber || "—",
                  },
                  { label: "Class", value: (row) => row.classId?.name || "—" },
                  {
                    label: "Academic year",
                    value: (row) => row.academicYearId?.name || "—",
                  },
                  { label: "Enrollment status", value: (row) => row.status },
                ]}
                rows={report.enrollments || []}
              />
            </>
          )}
          {category === "attendance" && (
            <>
              <Summary
                items={[
                  ["Recorded entries", number(report.summary.total)],
                  ["Present", number(report.summary.present)],
                  ["Absent", number(report.summary.absent)],
                  ["Late", number(report.summary.late)],
                  ["Excused", number(report.summary.excused)],
                  [
                    "Present percentage",
                    `${number(report.summary.percentage)}%`,
                  ],
                ]}
              />
              <p className="report-note">
                Present percentage counts PRESENT entries divided by all
                recorded entries. LATE, ABSENT, and EXCUSED remain in the
                denominator; missing attendance is excluded.
              </p>
              <h3>Summary by class</h3>
              <Table
                columns={[
                  { label: "Class", value: (row) => row.className },
                  { label: "Entries", value: (row) => number(row.total) },
                  { label: "Present", value: (row) => number(row.present) },
                  { label: "Absent", value: (row) => number(row.absent) },
                  { label: "Late", value: (row) => number(row.late) },
                  { label: "Excused", value: (row) => number(row.excused) },
                  {
                    label: "Present %",
                    value: (row) => `${number(row.percentage)}%`,
                  },
                ]}
                rows={report.byClass || []}
              />
              <h3>Summary by student</h3>
              <Table
                columns={[
                  { label: "Student", value: (row) => row.studentName },
                  { label: "Role number", value: (row) => row.roleNumber },
                  { label: "Entries", value: (row) => number(row.total) },
                  { label: "Present", value: (row) => number(row.present) },
                  { label: "Absent", value: (row) => number(row.absent) },
                  { label: "Late", value: (row) => number(row.late) },
                  { label: "Excused", value: (row) => number(row.excused) },
                  {
                    label: "Present %",
                    value: (row) => `${number(row.percentage)}%`,
                  },
                ]}
                rows={report.byStudent || []}
              />
              <h3>Attendance records</h3>
              <Table
                columns={[
                  { label: "Date", value: (row) => date(row.date) },
                  {
                    label: "Student",
                    value: (row) => row.studentId?.fullName || "—",
                  },
                  {
                    label: "Role number",
                    value: (row) => row.studentId?.roleNumber || "—",
                  },
                  { label: "Class", value: (row) => row.classId?.name || "—" },
                  {
                    label: "Year",
                    value: (row) => row.academicYearId?.name || "—",
                  },
                  { label: "Period", value: (row) => row.periodNumber },
                  { label: "Status", value: (row) => row.status },
                ]}
                rows={report.records || []}
              />
            </>
          )}
          {category === "performance" && <PerformanceResults report={report} />}
          {category === "fees" && (
            <>
              <Summary
                items={[
                  ["Fees assigned", number(report.summary.totalFees)],
                  ["Paid toward fees", number(report.summary.totalPaid)],
                  [
                    "Outstanding balance",
                    number(report.summary.totalRemaining),
                  ],
                  ["Fee records", number(report.summary.numberOfFees)],
                  ["Unpaid", number(report.summary.unpaid)],
                  ["Partial", number(report.summary.partial)],
                  ["Paid", number(report.summary.paid)],
                  [
                    "Status mismatches",
                    number(report.summary.inconsistentStatuses),
                  ],
                ]}
              />
              <p className="report-note">
                Fee status mismatches compare the saved status with amount and
                paidAmount. The report displays saved statuses without changing
                them.
              </p>
              <Table
                columns={[
                  {
                    label: "Student",
                    value: (row) => row.studentId?.fullName || "—",
                  },
                  {
                    label: "Role number",
                    value: (row) => row.studentId?.roleNumber || "—",
                  },
                  {
                    label: "Description",
                    value: (row) => row.description || "—",
                  },
                  { label: "Fee", value: (row) => number(row.amount) },
                  { label: "Paid", value: (row) => number(row.paidAmount) },
                  {
                    label: "Remaining",
                    value: (row) => number(row.amount - row.paidAmount),
                  },
                  { label: "Saved status", value: (row) => row.status },
                ]}
                rows={report.records || []}
              />
            </>
          )}
          {category === "payments" && (
            <>
              <Summary
                items={[
                  ["Transactions", number(report.summary.count)],
                  ["Payment amounts", number(report.summary.totalAmount)],
                  ...Object.entries(report.summary.byMethod).map(
                    ([method, data]) => [
                      `${method} transactions`,
                      `${number(data.count)} · ${number(data.total)}`,
                    ],
                  ),
                ]}
              />
              <Table
                columns={[
                  {
                    label: "Payment date",
                    value: (row) => date(row.paymentDate),
                  },
                  {
                    label: "Student",
                    value: (row) => row.studentId?.fullName || "—",
                  },
                  {
                    label: "Role number",
                    value: (row) => row.studentId?.roleNumber || "—",
                  },
                  { label: "Amount", value: (row) => number(row.amount) },
                  { label: "Method", value: (row) => row.paymentMethod },
                  { label: "Receipt", value: (row) => row.receiptNumber },
                  {
                    label: "Fee description",
                    value: (row) => row.feeId?.description || "—",
                  },
                  {
                    label: "Received by",
                    value: (row) => row.receivedBy?.name || "—",
                  },
                ]}
                rows={report.records || []}
              />
            </>
          )}
          {category === "people" && (
            <>
              <Summary
                items={[
                  ["Teachers", number(report.summary.teachers)],
                  ["Active teachers", number(report.summary.activeTeachers)],
                  [
                    "Inactive teachers",
                    number(report.summary.inactiveTeachers),
                  ],
                  ["Staff", number(report.summary.staff)],
                  ["Active staff", number(report.summary.activeStaff)],
                  ["Inactive staff", number(report.summary.inactiveStaff)],
                  [
                    "Teacher assignments",
                    number(report.summary.teacherAssignments),
                  ],
                ]}
              />
              <h3>Teachers</h3>
              <Table
                columns={[
                  { label: "Name", value: (row) => row.fullName },
                  { label: "Phone", value: (row) => row.phone },
                  {
                    label: "Qualification",
                    value: (row) => row.qualification || "—",
                  },
                  { label: "Status", value: (row) => row.status },
                  { label: "Hire date", value: (row) => date(row.hireDate) },
                ]}
                rows={report.teachers || []}
              />
              <h3>Staff</h3>
              <Table
                columns={[
                  { label: "Name", value: (row) => row.fullName },
                  { label: "Position", value: (row) => row.position },
                  { label: "Phone", value: (row) => row.phoneNumber || "—" },
                  { label: "Status", value: (row) => row.status },
                  { label: "Hire date", value: (row) => date(row.hireDate) },
                ]}
                rows={report.staff || []}
              />
              <h3>Teacher assignments</h3>
              <Table
                columns={[
                  {
                    label: "Teacher",
                    value: (row) => row.teacherId?.fullName || "—",
                  },
                  { label: "Class", value: (row) => row.classId?.name || "—" },
                  {
                    label: "Subject",
                    value: (row) => row.subjectId?.name || "—",
                  },
                  {
                    label: "Academic year",
                    value: (row) => row.academicYearId?.name || "—",
                  },
                ]}
                rows={report.assignments || []}
              />
            </>
          )}
          {category === "classes" && (
            <>
              <Summary
                items={[
                  ["Classes", number(report.classes?.length)],
                  ["Subjects", number(report.subjects?.length)],
                  ["Teacher assignments", number(report.assignments?.length)],
                  [
                    "Enrollment records",
                    number(
                      (report.classes || []).reduce(
                        (sum, item) => sum + item.enrollmentCount,
                        0,
                      ),
                    ),
                  ],
                ]}
              />
              <h3>Classes</h3>
              <Table
                columns={[
                  { label: "Class", value: (row) => row.name },
                  {
                    label: "Academic year",
                    value: (row) => row.academicYearId?.name || "—",
                  },
                  {
                    label: "Enrollment count",
                    value: (row) => number(row.enrollmentCount),
                  },
                  { label: "Status", value: (row) => row.status },
                ]}
                rows={report.classes || []}
              />
              <h3>Subjects</h3>
              <Table
                columns={[
                  { label: "Subject", value: (row) => row.name },
                  { label: "Status", value: (row) => row.status },
                ]}
                rows={report.subjects || []}
              />
              <h3>Teacher assignments</h3>
              <Table
                columns={[
                  {
                    label: "Teacher",
                    value: (row) => row.teacherId?.fullName || "—",
                  },
                  { label: "Class", value: (row) => row.classId?.name || "—" },
                  {
                    label: "Subject",
                    value: (row) => row.subjectId?.name || "—",
                  },
                  {
                    label: "Academic year",
                    value: (row) => row.academicYearId?.name || "—",
                  },
                ]}
                rows={report.assignments || []}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
