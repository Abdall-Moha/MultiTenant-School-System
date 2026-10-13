import { usePageNotifications } from "../context/NotificationContext.jsx";

import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

// Attendance statuses
const statuses = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

// Build a local calendar date
function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Choose the correct date for an academic year
function dateForYear(year) {
  const today = localDate();

  return today >= year.startDate.slice(0, 10) &&
    today <= year.endDate.slice(0, 10)
    ? today
    : year.startDate.slice(0, 10);
}

export default function Attendance() {
  const { user } = useAuth();

  // Get the current user's role
  const role = user?.role;
  const teacher = role === "TEACHER";
  const manager = ["ADMIN", "SUPER_ADMIN", "TEACHER"].includes(role);

  // ==================== STATE ====================

  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [children, setChildren] = useState([]);

  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(localDate());

  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState("");

  const [editingAttendance, setEditingAttendance] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [studentView, setStudentView] = useState(null);
  const [marks, setMarks] = useState({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  usePageNotifications(error, notice);

  // ==================== LOAD PAGE OPTIONS ====================

  useEffect(() => {
    let active = true;

    async function loadOptions() {
      setLoading(true);

      try {
        // ADMIN, SUPER_ADMIN and TEACHER
        if (manager) {
          // Get academic years
          const yearResponse = await api.get("/academic-years", {
            params: { limit: 100 },
          });

          const availableYears = yearResponse.data.academicYears || [];

          const selectableYears = teacher
            ? availableYears.filter((item) => item.isCurrent)
            : availableYears;

          if (!active) return;

          setYears(selectableYears);

          // Teachers may only use the current year. Managers can use any year.
          const current =
            selectableYears.find((item) => item.isCurrent) ||
            (teacher ? null : selectableYears[0]);

          if (current) {
            setYearId(current._id);
            setDate(dateForYear(current));
          }

          // TEACHER
          if (teacher) {
            if (current) {
              const { data } = await api.get("/teacher-assignments", {
                params: {
                  limit: 100,
                  academicYearId: current._id,
                },
              });

              if (!active) return;

              // A teacher can have multiple subjects
              // assigned to the same class.
              // Show each class only once.
              const unique = new Map();

              (data.assignments || []).forEach((item) => {
                const assignedClass = item.classId;

                if (assignedClass?._id) {
                  unique.set(String(assignedClass._id), assignedClass);
                }
              });

              setClasses([...unique.values()]);
            }
          } else {
            // ADMIN / SUPER_ADMIN get all classes
            const { data } = await api.get("/classes", {
              params: { limit: 100 },
            });

            if (active) {
              setClasses(data.classes || []);
            }
          }
        }

        // ==================== PARENT ====================
        else if (role === "PARENT") {
          const [studentResponse, yearResponse] = await Promise.all([
            api.get("/students", {
              params: { limit: 100 },
            }),

            api.get("/academic-years", {
              params: { limit: 100 },
            }),
          ]);

          if (active) {
            const availableYears = yearResponse.data.academicYears || [];

            setChildren(studentResponse.data.students || []);

            setYears(availableYears);

            // Select first child by default
            if (studentResponse.data.students?.[0]) {
              setSelectedChild(studentResponse.data.students[0]._id);
            }

            // Select current academic year
            const current =
              availableYears.find((item) => item.isCurrent) ||
              availableYears[0];

            if (current) {
              setYearId(current._id);
              setDate(dateForYear(current));
            }
          }
        }

        // ==================== STUDENT ====================
        else if (role === "STUDENT") {
          const { data } = await api.get("/academic-years", {
            params: { limit: 100 },
          });

          if (active) {
            const availableYears = data.academicYears || [];

            setYears(availableYears);

            // Select current academic year
            const current =
              availableYears.find((item) => item.isCurrent) ||
              availableYears[0];

            if (current) {
              setYearId(current._id);
              setDate(dateForYear(current));
            }
          }
        }
      } catch (requestError) {
        if (active) {
          setError(getApiError(requestError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadOptions();

    return () => {
      active = false;
    };
  }, [manager, role, teacher]);

  // ==================== LOAD PERIODS ====================

  useEffect(() => {
    if (!manager || !classId || !yearId) return;

    let active = true;

    const selectedDate = teacher ? localDate() : date;

    // Period totals come from the selected class configuration
    api
      .get("/attendance/period-summary", {
        params: {
          academicYearId: yearId,
          classId,
          date: selectedDate,
        },
      })
      .then(({ data }) => {
        if (active) {
          setPeriods(data.periods || []);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getApiError(requestError));
        }
      });

    return () => {
      active = false;
    };
  }, [manager, teacher, classId, yearId, date]);

  // ==================== LOAD STUDENT / PARENT ATTENDANCE ====================

  useEffect(() => {
    if (manager || !date || (role === "PARENT" && !selectedChild)) {
      return;
    }

    let active = true;

    const params = {
      date,
    };

    if (yearId) {
      params.academicYearId = yearId;
    }

    if (role === "PARENT") {
      params.studentId = selectedChild;
    }

    api
      .get("/attendance", { params })
      .then(({ data }) => {
        if (active) {
          setStudentView(data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getApiError(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [manager, role, date, selectedChild, yearId]);

  // ==================== OPEN ATTENDANCE PERIOD ====================

  async function openPeriod(periodNumber) {
    setError("");
    setNotice("");

    setPeriod(String(periodNumber));
    setEditingAttendance(false);
    setLoading(true);

    try {
      const { data } = await api.get("/attendance", {
        params: {
          academicYearId: yearId,
          classId,
          date: teacher ? localDate() : date,
          periodNumber,
        },
      });

      const attendanceRows = data.attendance || [];

      setRows(attendanceRows);

      // Put each student's current status into marks
      setMarks(
        Object.fromEntries(
          attendanceRows.map((row) => [row.student._id, row.status]),
        ),
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  // ==================== SAVE ATTENDANCE ====================

  async function saveAttendance() {
    // Recalculate the date when saving
    // so a teacher cannot submit an old day.
    const submitDate = teacher ? localDate() : date;

    if (!classId || !yearId || !period) {
      return;
    }

    // Every student must have a status
    if (rows.some((row) => marks[row.student._id] === "NOT_RECORDED")) {
      setError("Choose an attendance status for every student before saving.");

      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      // Separate new attendance from existing attendance
      const newRows = rows.filter((row) => !row.attendance?._id);

      const oldRows = rows.filter((row) => row.attendance?._id);

      // Update existing attendance records
      for (const row of oldRows) {
        await api.put(`/attendance/${row.attendance._id}`, {
          status: marks[row.student._id],
        });
      }

      // Create new attendance records
      if (newRows.length) {
        await api.post("/attendance", {
          academicYearId: yearId,
          classId,
          date: submitDate,
          periodNumber: Number(period),

          attendance: newRows.map((row) => ({
            studentId: row.student._id,
            status: marks[row.student._id],
          })),
        });
      }

      setEditingAttendance(false);

      // Reload the selected period
      await openPeriod(Number(period));

      setNotice("Attendance saved.");

      // Reload period summary
      const { data } = await api.get("/attendance/period-summary", {
        params: {
          academicYearId: yearId,
          classId,
          date: submitDate,
        },
      });

      setPeriods(data.periods || []);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  // ==================== PAGE VARIABLES ====================

  const todayLabel = new Date(`${localDate()}T12:00:00`).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  const readonly = role === "PARENT" || role === "STUDENT";

  // ==================== PAGE ====================

  return (
    <section className="min-h-full bg-slate-50 px-4 py-6 md:px-6 lg:px-8">
      {/* ==================== PAGE HEADER ==================== */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">
            Daily Records
          </p>

          <h2 className="text-2xl font-bold text-slate-900">Attendance</h2>

          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {teacher
              ? `Today: ${todayLabel}`
              : readonly
                ? "View attendance for your account."
                : "Record and review attendance by academic year, class, date, and period."}
          </p>
        </div>

        {/* ==================== MESSAGES ==================== */}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600"
          >
            {notice}
          </div>
        )}

        {/* ==================== MAIN CARD ==================== */}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* ==================== FILTERS ==================== */}

          <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
            {/* Academic Year for managers */}
            {manager && (
              <select
                className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                aria-label="Academic year"
                value={yearId}
                onChange={(event) => {
                  const selectedYear = years.find(
                    (item) => item._id === event.target.value,
                  );
                  setYearId(event.target.value);
                  setClassId("");
                  setPeriod("");
                  if (selectedYear) setDate(dateForYear(selectedYear));
                }}
              >
                <option value="">
                  {teacher
                    ? "Select current academic year"
                    : "Select academic year"}
                </option>

                {years.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                    {item.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            )}

            {teacher && !loading && years.length === 0 && (
              <p role="status" className="text-sm text-amber-700">
                No current academic year is available. Ask the administrator to
                set one and assign your classes.
              </p>
            )}

            {/* Class */}
            {manager && (
              <select
                className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                aria-label="Class"
                value={classId}
                disabled={!yearId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setPeriod("");
                }}
              >
                <option value="">Select class</option>

                {classes
                  .filter(
                    (item) =>
                      !yearId ||
                      String(
                        item.academicYearId?._id || item.academicYearId,
                      ) === String(yearId),
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            )}

            {/* Date for Admin / Super Admin */}
            {manager && !teacher && (
              <input
                aria-label="Date"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                type="date"
                value={date}
                min={years
                  .find((item) => item._id === yearId)
                  ?.startDate?.slice(0, 10)}
                max={years
                  .find((item) => item._id === yearId)
                  ?.endDate?.slice(0, 10)}
                onChange={(event) => {
                  setDate(event.target.value);
                  setPeriod("");
                }}
              />
            )}

            {/* Parent Child */}
            {role === "PARENT" && (
              <select
                className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                aria-label="Child"
                value={selectedChild}
                onChange={(event) => setSelectedChild(event.target.value)}
              >
                <option value="">Select child</option>

                {children.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            )}

            {/* Academic Year for Parent / Student */}
            {readonly && (
              <select
                className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                aria-label="Academic year"
                value={yearId}
                onChange={(event) => {
                  const selected = years.find(
                    (item) => item._id === event.target.value,
                  );

                  setYearId(event.target.value);

                  if (selected) {
                    setDate(dateForYear(selected));
                  }
                }}
              >
                <option value="">Select academic year</option>

                {years.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                    {item.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            )}

            {/* Date for Parent / Student */}
            {readonly && (
              <input
                aria-label="Date"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            )}
          </div>

          {/* ==================== PERIODS ==================== */}

          {manager && classId && (
            <div className="border-b border-slate-200 p-4">
              <h3 className="mb-3 text-base font-semibold text-slate-800">
                Periods ·{" "}
                {
                  classes.find((item) => String(item._id) === String(classId))
                    ?.name
                }{" "}
                · {teacher ? todayLabel : date}
              </h3>

              <div className="flex flex-wrap gap-2">
                {periods.map((item) => {
                  const selected = String(item.periodNumber) === period;

                  return (
                    <button
                      key={item.periodNumber}
                      type="button"
                      className={
                        selected
                          ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                          : "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-blue-600 hover:text-blue-600"
                      }
                      onClick={() => openPeriod(item.periodNumber)}
                    >
                      Period {item.periodNumber} ·{" "}
                      {item.recorded ? "Recorded" : "Not Recorded"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== MANAGER ATTENDANCE TABLE ==================== */}

          {manager && period && (
            <div className="p-4">
              <h3 className="mb-4 text-base font-semibold text-slate-800">
                Period {period} attendance
              </h3>

              {loading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading attendance…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Student
                        </th>

                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Role number
                        </th>

                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Attendance
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.student._id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {row.student.fullName}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {row.student.roleNumber}
                          </td>

                          <td className="px-4 py-3">
                            {editingAttendance ? (
                              <select
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                                value={marks[row.student._id] || row.status}
                                onChange={(event) =>
                                  setMarks({
                                    ...marks,
                                    [row.student._id]: event.target.value,
                                  })
                                }
                              >
                                {row.status === "NOT_RECORDED" && (
                                  <option value="NOT_RECORDED">
                                    NOT_RECORDED
                                  </option>
                                )}

                                {statuses.map((status) => (
                                  <option key={status}>{status}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                  row.status === "PRESENT"
                                    ? "bg-green-100 text-green-700"
                                    : row.status === "ABSENT"
                                      ? "bg-red-100 text-red-700"
                                      : row.status === "LATE"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : row.status === "EXCUSED"
                                          ? "bg-blue-100 text-blue-700"
                                          : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {row.status.replaceAll("_", " ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {!rows.length && (
                        <tr>
                          <td
                            colSpan="3"
                            className="px-4 py-10 text-center text-sm text-slate-500"
                          >
                            No students enrolled in this class for the selected
                            year.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ==================== ATTENDANCE ACTION ==================== */}

              {rows.length > 0 && (
                <div className="mt-4 flex justify-end">
                  {editingAttendance ? (
                    <button
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        saving ||
                        loading ||
                        rows.some(
                          (row) => marks[row.student._id] === "NOT_RECORDED",
                        )
                      }
                      onClick={saveAttendance}
                    >
                      {saving
                        ? "Saving…"
                        : rows.some((row) => row.attendance?._id)
                          ? "Save Changes"
                          : "Save Attendance"}
                    </button>
                  ) : rows.some((row) => row.attendance?._id) ? (
                    <button
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                      onClick={() => setEditingAttendance(true)}
                    >
                      Edit Attendance
                    </button>
                  ) : (
                    <button
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                      onClick={() => setEditingAttendance(true)}
                    >
                      Mark Attendance
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== PARENT / STUDENT TABLE ==================== */}

          {readonly && (
            <div className="p-4">
              <h3 className="mb-4 text-base font-semibold text-slate-800">
                {studentView?.class?.name
                  ? `${studentView.class.name} · ${studentView.academicYear}`
                  : "Attendance records"}
              </h3>

              {loading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading attendance…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Period
                        </th>

                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Student
                        </th>

                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Date
                        </th>

                        <th className="px-4 py-3 font-semibold text-slate-600">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(studentView?.periods || []).map((item) => (
                        <tr
                          key={item.periodNumber}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-3 text-slate-600">
                            Period {item.periodNumber}
                          </td>

                          <td className="px-4 py-3 font-medium text-slate-800">
                            {studentView.student?.fullName}
                          </td>

                          <td className="px-4 py-3 text-slate-600">{date}</td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                item.status === "PRESENT"
                                  ? "bg-green-100 text-green-700"
                                  : item.status === "ABSENT"
                                    ? "bg-red-100 text-red-700"
                                    : item.status === "LATE"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : item.status === "EXCUSED"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {!studentView?.periods?.length && (
                        <tr>
                          <td
                            colSpan="4"
                            className="px-4 py-10 text-center text-sm text-slate-500"
                          >
                            No attendance found for this date.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
