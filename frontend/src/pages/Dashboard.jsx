import { useEffect, useState } from "react";
import {
  FiActivity,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiLayers,
  FiUsers,
} from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const iconByLabel = {
  "Registered Schools": FiBookOpen,
  "Active Schools": FiCheckCircle,
  "Suspended Schools": FiClock,
  "Registered Users": FiUsers,
  "School Administrators": FiUsers,
  "Total Students": FiUsers,
  "Active Students": FiCheckCircle,
  Teachers: FiUsers,
  Parents: FiUsers,
  Staff: FiUsers,
  "Current Year Classes": FiLayers,
  "Assigned Classes": FiLayers,
  "Assigned Subjects": FiBookOpen,
  "Students in Assigned Classes": FiUsers,
  Subjects: FiBookOpen,
  "Subject Exams": FiCalendar,
  "School Events": FiCalendar,
  "Active Subscriptions": FiCreditCard,
  "Subscription Payments": FiDollarSign,
  "Attendance rate": FiCheckCircle,
  "Fees collected": FiDollarSign,
  "Fees outstanding": FiClock,
  "Linked children": FiUsers,
  "Recent marks average": FiActivity,
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatAmount(value) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Panel({ title, subtitle, children, className = "" }) {
  return (
    <section className={`dashboard-panel ${className}`}>
      <div className="dashboard-panel-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyMessage({ children }) {
  return <p className="dashboard-empty">{children}</p>;
}

function StatCards({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="dashboard-stats">
      {items.map((item) => {
        const Icon = iconByLabel[item.label] || FiActivity;
        let value = item.value;
        if (value === null || value === undefined) value = "—";
        else if (item.format === "currency") value = formatAmount(value);
        else value = Number(value).toLocaleString();

        return (
          <article className="dashboard-stat-card" key={item.label}>
            <span className="dashboard-stat-icon"><Icon /></span>
            <div>
              <span>{item.label}</span>
              <strong>{value}{item.suffix && value !== "—" ? item.suffix : ""}</strong>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function BarTrend({ title, subtitle, items = [], valueKey = "count" }) {
  const chartItems = Array.isArray(items) ? items : null;
  const highestValue = Math.max(0, ...(chartItems || []).map((item) => item[valueKey] || 0));

  return (
    <Panel title={title} subtitle={subtitle}>
      {!chartItems ? (
        <EmptyMessage>This chart is temporarily unavailable.</EmptyMessage>
      ) : !highestValue ? (
        <EmptyMessage>No records are available for these months.</EmptyMessage>
      ) : (
        <div className="dashboard-chart" role="img" aria-label={title}>
          {items.map((item, index) => {
            const value = item[valueKey] || 0;
            const height = value ? Math.max(5, (value / highestValue) * 100) : 0;
            return (
              <div className="dashboard-chart-column" key={`${item.label}-${index}`} title={`${item.label}: ${value}`}>
                <span className="dashboard-chart-value">{value}</span>
                <div className="dashboard-chart-bar-area">
                  <span className="dashboard-chart-bar" style={{ height: `${height}%` }} />
                </div>
                <span className="dashboard-chart-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function AttendanceTrend({ items = [] }) {
  const chartItems = Array.isArray(items) ? items : null;
  const totals = (chartItems || []).map((item) => item.present + item.absent + item.late + item.excused);
  const highestValue = Math.max(0, ...totals);
  const legend = [
    { key: "present", label: "Present", color: "#2b4593" },
    { key: "absent", label: "Absent", color: "#d66a6a" },
    { key: "late", label: "Late", color: "#dfa43b" },
    { key: "excused", label: "Excused", color: "#93a2bd" },
  ];

  return (
    <Panel title="Attendance by month" subtitle="Current academic year · recorded periods">
      {!chartItems ? (
        <EmptyMessage>Attendance trends are temporarily unavailable.</EmptyMessage>
      ) : !highestValue ? (
        <EmptyMessage>No attendance has been recorded in this period.</EmptyMessage>
      ) : (
        <>
          <div className="dashboard-chart dashboard-stacked-chart" role="img" aria-label="Attendance statuses by month">
            {chartItems.map((item) => {
              const total = item.present + item.absent + item.late + item.excused;
              return (
                <div className="dashboard-chart-column" key={item.label} title={`${item.label}: ${total} records`}>
                  <span className="dashboard-chart-value">{total}</span>
                  <div className="dashboard-chart-bar-area">
                    <span className="dashboard-stacked-bar" style={{ height: `${total ? Math.max(5, (total / highestValue) * 100) : 0}%` }}>
                      {legend.map((part) => (
                        item[part.key] > 0 && (
                          <i
                            key={part.key}
                            style={{
                              backgroundColor: part.color,
                              flexGrow: item[part.key],
                            }}
                          />
                        )
                      ))}
                    </span>
                  </div>
                  <span className="dashboard-chart-label">{item.label}</span>
                </div>
              );
            })}
          </div>
          <div className="dashboard-chart-legend">
            {legend.map((part) => (
              <span key={part.key}><i style={{ backgroundColor: part.color }} />{part.label}</span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function DonutChart({ title, values = [] }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const colors = ["#2b4593", "#d66a6a", "#dfa43b", "#93a2bd"];
  let currentPercentage = 0;
  const segments = values.map((item, index) => {
    const percentage = total ? (item.value / total) * 100 : 0;
    const segment = `${colors[index % colors.length]} ${currentPercentage}% ${currentPercentage + percentage}%`;
    currentPercentage += percentage;
    return { ...item, color: colors[index % colors.length], segment };
  });

  return (
    <Panel title={title}>
      {!total ? (
        <EmptyMessage>No data is available yet.</EmptyMessage>
      ) : (
        <div className="dashboard-donut-layout">
          <div
            className="dashboard-donut"
            role="img"
            aria-label={segments.map((item) => `${item.label}: ${item.value}`).join(", ")}
            style={{ background: `conic-gradient(${segments.map((item) => item.segment).join(", ")})` }}
          >
            <span><strong>{total.toLocaleString()}</strong><small>Total</small></span>
          </div>
          <div className="dashboard-donut-legend">
            {segments.map((item) => (
              <div key={item.label}>
                <span><i style={{ backgroundColor: item.color }} />{item.label}</span>
                <strong>{item.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function SubscriptionPlans({ plans = [] }) {
  const planItems = Array.isArray(plans) ? plans : null;
  const largestPlan = Math.max(0, ...(planItems || []).map((plan) => plan.count));
  return (
    <Panel title="Subscriptions by plan" subtitle="All subscription records by saved plan name">
      {!planItems ? (
        <EmptyMessage>Subscription details are temporarily unavailable.</EmptyMessage>
      ) : !largestPlan ? (
        <EmptyMessage>No subscription records are available.</EmptyMessage>
      ) : (
        <div className="dashboard-plan-list">
          {planItems.map((plan) => (
            <div className="dashboard-plan-row" key={plan.name}>
              <div><strong>{plan.name}</strong><span>{plan.active} active of {plan.count}</span></div>
              <div className="dashboard-plan-track" aria-label={`${plan.name}: ${plan.count}`}>
                <span style={{ width: `${(plan.count / largestPlan) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function UpcomingExams({ exams = [] }) {
  return (
    <Panel title="Upcoming examinations" subtitle="Next scheduled subject exams">
      {exams.length ? (
        <div className="dashboard-record-list">
          {exams.map((exam) => (
            <article className="dashboard-record" key={exam._id}>
              <div>
                <strong>{exam.examinationId?.name || exam.title}</strong>
                <span>{[exam.classId?.name, exam.subjectId?.name].filter(Boolean).join(" · ") || "Subject exam"}</span>
              </div>
              <time>{formatDate(exam.examDate)}</time>
            </article>
          ))}
        </div>
      ) : <EmptyMessage>No upcoming exams are scheduled.</EmptyMessage>}
    </Panel>
  );
}

function UpcomingEvents({ events = [] }) {
  return (
    <Panel title="Upcoming school events" subtitle="Coming up at your school">
      {events.length ? (
        <div className="dashboard-record-list">
          {events.map((event) => (
            <article className="dashboard-record" key={event._id}>
              <div>
                <strong>{event.title}</strong>
                <span>{event.location || event.description || "School event"}</span>
              </div>
              <time>{formatDate(event.eventDate)}</time>
            </article>
          ))}
        </div>
      ) : <EmptyMessage>No upcoming events are scheduled.</EmptyMessage>}
    </Panel>
  );
}

function AttendanceOverview({ attendance }) {
  if (!attendance?.recorded) {
    return <EmptyMessage>No attendance has been recorded in the current period.</EmptyMessage>;
  }
  return (
    <div className="dashboard-attendance">
      <div className="dashboard-attendance-topline">
        <strong>{attendance.presentPercentage === null ? "—" : `${attendance.presentPercentage}%`}</strong>
        <span>Present rate · {attendance.recorded.toLocaleString()} records</span>
      </div>
      <div className="dashboard-attendance-track" aria-hidden="true">
        <span style={{ width: `${attendance.presentPercentage || 0}%` }} />
      </div>
      <div className="dashboard-attendance-counts">
        <span>Present: {attendance.present}</span>
        <span>Absent: {attendance.absent}</span>
        <span>Late: {attendance.late}</span>
        <span>Excused: {attendance.excused}</span>
      </div>
    </div>
  );
}

function AttendanceRecords({ attendance, title = "Recent attendance" }) {
  return (
    <Panel title={title} subtitle="Attendance from the last 30 days">
      <AttendanceOverview attendance={attendance} />
      {attendance?.records?.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>Date</th><th>Class</th><th>Period</th><th>Status</th></tr></thead>
            <tbody>
              {attendance.records.map((record) => (
                <tr key={record._id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{record.classId?.name || "—"}</td>
                  <td>{record.periodNumber}</td>
                  <td><span className={`dashboard-status status-${record.status?.toLowerCase()}`}>{record.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function RecentMarks({ marks = [], title = "Recent marks" }) {
  return (
    <Panel title={title} subtitle="Latest results recorded for this student">
      {marks.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>Examination</th><th>Subject</th><th>Mark</th><th>Percent</th></tr></thead>
            <tbody>
              {marks.map((mark) => (
                <tr key={mark._id}>
                  <td>{mark.examinationName}</td>
                  <td>{mark.subjectName}</td>
                  <td>{mark.marksObtained}{mark.totalMarks === null ? "" : ` / ${mark.totalMarks}`}</td>
                  <td>{mark.percentage === null ? "—" : `${mark.percentage}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No marks have been recorded yet.</EmptyMessage>}
    </Panel>
  );
}

function RecentSchools({ schools = [] }) {
  return (
    <Panel title="Recent school registrations" subtitle="The newest schools added to the platform">
      {schools.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>School</th><th>School ID</th><th>Status</th><th>Registered</th></tr></thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school._id}>
                  <td className="table-name">{school.schoolName}</td>
                  <td>{school.schoolId}</td>
                  <td><span className={`dashboard-status status-${school.status?.toLowerCase()}`}>{school.status}</span></td>
                  <td>{formatDate(school.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No schools have been registered yet.</EmptyMessage>}
    </Panel>
  );
}

function RecentSubscriptions({ subscriptions = [] }) {
  const records = Array.isArray(subscriptions) ? subscriptions : null;
  return (
    <Panel title="Recent subscription activity" subtitle="Latest subscription updates across schools">
      {!records ? (
        <EmptyMessage>Subscription activity is temporarily unavailable.</EmptyMessage>
      ) : records.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>School</th><th>Plan</th><th>Status</th><th>Paid</th><th>Updated</th></tr></thead>
            <tbody>
              {records.map((subscription) => (
                <tr key={subscription._id}>
                  <td className="table-name">{subscription.schoolId?.schoolName || "School"}</td>
                  <td>{subscription.planName}</td>
                  <td><span className={`dashboard-status status-${subscription.status?.toLowerCase()}`}>{subscription.status}</span></td>
                  <td>{formatAmount(subscription.amountPaid)}</td>
                  <td>{formatDate(subscription.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No subscription activity is available.</EmptyMessage>}
    </Panel>
  );
}

function ClassEnrollment({ classes = [] }) {
  return (
    <Panel title="Current class enrollment" subtitle="Active students by class this academic year">
      {classes.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>Class</th><th>Active students</th></tr></thead>
            <tbody>
              {classes.map((item) => (
                <tr key={item._id}><td className="table-name">{item.name}</td><td>{item.students}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No active classes are available for the current academic year.</EmptyMessage>}
    </Panel>
  );
}

function TeacherAssignments({ classes = [], subjects = [], attendance }) {
  return (
    <Panel title="Your teaching assignments" subtitle="Classes and subjects for the current academic year">
      {!classes.length && !subjects.length ? (
        <EmptyMessage>No teaching assignments are available for this academic year.</EmptyMessage>
      ) : (
        <div className="dashboard-assignment-details">
          <div>
            <span>Assigned classes</span>
            <strong>{classes.map((item) => item.name).join(", ") || "None"}</strong>
          </div>
          <div>
            <span>Assigned subjects</span>
            <strong>{subjects.map((item) => item.name).join(", ") || "None"}</strong>
          </div>
          <AttendanceOverview attendance={attendance} />
        </div>
      )}
    </Panel>
  );
}

function RecentEnrollments({ enrollments = [] }) {
  const records = Array.isArray(enrollments) ? enrollments : null;
  return (
    <Panel title="Recent enrollments" subtitle="Latest student enrollments this academic year">
      {!records ? (
        <EmptyMessage>Recent enrollment details are temporarily unavailable.</EmptyMessage>
      ) : records.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>Student</th><th>Role number</th><th>Class</th><th>Enrolled</th></tr></thead>
            <tbody>
              {records.map((enrollment) => (
                <tr key={enrollment._id}>
                  <td className="table-name">{enrollment.studentId?.fullName || "Student"}</td>
                  <td>{enrollment.studentId?.roleNumber || "—"}</td>
                  <td>{enrollment.classId?.name || "—"}</td>
                  <td>{formatDate(enrollment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No student enrollments are available for this year.</EmptyMessage>}
    </Panel>
  );
}

function FeeSummary({ summary, subtitle = "Totals across fee records at your school" }) {
  const collectedPercent = summary?.billed
    ? Math.min(100, (summary.paid / summary.billed) * 100)
    : 0;

  return (
    <Panel title="Fee collection" subtitle={subtitle}>
      {!summary ? (
        <EmptyMessage>Fee totals are temporarily unavailable.</EmptyMessage>
      ) : !summary.feeCount ? (
        <EmptyMessage>No fee records have been created yet.</EmptyMessage>
      ) : (
        <div className="dashboard-fee-summary">
          <div className="dashboard-fee-total"><span>Total billed</span><strong>{formatAmount(summary.billed)}</strong></div>
          <div className="dashboard-fee-total"><span>Collected</span><strong>{formatAmount(summary.paid)}</strong></div>
          <div className="dashboard-fee-total"><span>Outstanding</span><strong>{formatAmount(summary.outstanding)}</strong></div>
          <div className="dashboard-attendance-track" aria-label={`${collectedPercent.toFixed(1)} percent of billed fees collected`}>
            <span style={{ width: `${collectedPercent}%` }} />
          </div>
          <small>{collectedPercent.toFixed(1)}% of billed fees collected · {summary.feeCount} fee records</small>
        </div>
      )}
    </Panel>
  );
}

function ChildOverview({ child }) {
  return (
    <section className="dashboard-child-card" key={child._id}>
      <div className="dashboard-child-heading">
        <div>
          <span className="eyebrow">Role number {child.roleNumber}</span>
          <h3>{child.fullName}</h3>
        </div>
        <span>{child.currentClass?.name || "No active class"}</span>
      </div>
      <div className="dashboard-child-content">
        <AttendanceRecords attendance={child.attendance} title="Attendance" />
        <UpcomingExams exams={child.upcomingExams} />
        <RecentMarks marks={child.recentMarks} />
        <FeeSummary summary={child.feeSummary} subtitle="Fees linked to this student" />
      </div>
    </section>
  );
}

function addRoleSummary(dashboard, role) {
  const items = [...(dashboard.summary || [])];

  if (role === "ADMIN") {
    items.push(
      {
        label: "Attendance rate",
        value: dashboard.attendance?.recorded ? dashboard.attendance.presentPercentage : null,
        suffix: "%",
      },
      { label: "Fees collected", value: dashboard.feeSummary?.paid || 0, format: "currency" },
      { label: "Fees outstanding", value: dashboard.feeSummary?.outstanding || 0, format: "currency" },
    );
  }

  if (role === "STUDENT") {
    const percentages = (dashboard.recentMarks || [])
      .map((mark) => mark.percentage)
      .filter((percentage) => percentage !== null && percentage !== undefined);
    const marksAverage = percentages.length
      ? Number((percentages.reduce((sum, value) => sum + value, 0) / percentages.length).toFixed(1))
      : null;

    items.push(
      {
        label: "Attendance rate",
        value: dashboard.attendance?.recorded ? dashboard.attendance.presentPercentage : null,
        suffix: "%",
      },
      { label: "Recent marks average", value: marksAverage, suffix: "%" },
      {
        label: "Fees outstanding",
        value: dashboard.feeSummary?.outstanding ?? null,
        format: "currency",
      },
    );
  }

  if (role === "PARENT") {
    const children = dashboard.children || [];
    const recordedChildren = children.filter((child) => child.attendance?.recorded);
    const totalRecorded = recordedChildren.reduce((sum, child) => sum + child.attendance.recorded, 0);
    const totalPresent = recordedChildren.reduce((sum, child) => sum + child.attendance.present, 0);
    const attendanceAverage = totalRecorded
      ? Number(((totalPresent / totalRecorded) * 100).toFixed(1))
      : null;
    const feeSummaries = children.map((child) => child.feeSummary).filter(Boolean);
    const totalOutstanding = feeSummaries.length
      ? feeSummaries.reduce((sum, fees) => sum + fees.outstanding, 0)
      : null;

    items.push(
      { label: "Linked children", value: children.length },
      { label: "Attendance rate", value: attendanceAverage, suffix: "%" },
      { label: "Fees outstanding", value: totalOutstanding, format: "currency" },
    );
  }

  return items;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");
        const { data } = await api.get("/dashboard");
        if (active) setDashboard(data);
      } catch (requestError) {
        if (active) setError(getApiError(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => { active = false; };
  }, [refreshCount]);

  if (loading) {
    return (
      <section className="dashboard-page" aria-busy="true" aria-label="Loading dashboard">
        <div className="dashboard-loading-heading" />
        <div className="dashboard-stats">
          {Array.from({ length: 4 }, (_, index) => <div className="dashboard-skeleton" key={index} />)}
        </div>
        <div className="dashboard-content-grid">
          <div className="dashboard-skeleton dashboard-skeleton-panel" />
          <div className="dashboard-skeleton dashboard-skeleton-panel" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <div role="alert" className="dashboard-error">
        <span>{error}</span>
        <button type="button" className="secondary-button" onClick={() => setRefreshCount((count) => count + 1)}>
          Try again
        </button>
      </div>
    );
  }

  const role = dashboard?.role || user?.role;
  const displayName = dashboard?.student?.fullName
    || dashboard?.teacher?.fullName
    || dashboard?.parent?.fullName
    || user?.name
    || "there";
  const roleLabel = role === "SUPER_ADMIN" ? "Platform overview" : "School workspace";
  const summary = addRoleSummary(dashboard, role);

  return (
    <section className={`dashboard-page dashboard-${role?.toLowerCase() || "user"}`}>
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">{roleLabel}</span>
          <h2>Welcome, {displayName}</h2>
          <p>
            {dashboard.currentAcademicYear?.name
              ? `Current academic year: ${dashboard.currentAcademicYear.name}`
              : role === "SUPER_ADMIN"
                ? "A live overview of schools and activity across SchoolMS."
                : "Your latest school and academic information."}
          </p>
        </div>
        <span className="dashboard-updated"><i />Live data</span>
      </header>

      <StatCards items={summary} />

      {role === "SUPER_ADMIN" && (
        <>
          <div className="dashboard-content-grid dashboard-platform-grid">
            <BarTrend
              title="School registrations"
              subtitle="New schools added in the last six months"
              items={dashboard.schoolRegistrationTrend}
            />
            <DonutChart
              title="School status"
              values={[
                { label: "Active", value: dashboard.schoolStatusDistribution?.active || 0 },
                { label: "Suspended", value: dashboard.schoolStatusDistribution?.suspended || 0 },
              ]}
            />
          </div>
          <SubscriptionPlans plans={dashboard.subscriptionPlanDistribution} />
          <div className="dashboard-content-grid">
            <RecentSchools schools={dashboard.recentSchools} />
            <RecentSubscriptions subscriptions={dashboard.recentSubscriptions} />
          </div>
        </>
      )}

      {role === "ADMIN" && (
        <>
          <div className="dashboard-content-grid">
            <BarTrend
              title="Student enrollment"
              subtitle="New enrollments in the current academic year"
              items={dashboard.studentEnrollmentTrend}
            />
            <AttendanceTrend items={dashboard.attendanceTrend} />
          </div>
          <div className="dashboard-content-grid">
            <FeeSummary summary={dashboard.feeSummary} />
            <ClassEnrollment classes={dashboard.classEnrollment} />
          </div>
          <div className="dashboard-content-grid dashboard-activity-grid">
            <RecentEnrollments enrollments={dashboard.recentEnrollments} />
            <UpcomingExams exams={dashboard.upcomingExams} />
            <UpcomingEvents events={dashboard.upcomingEvents} />
          </div>
        </>
      )}

      {role === "TEACHER" && (
        <>
          <div className="dashboard-content-grid">
            <TeacherAssignments
              classes={dashboard.assignedClasses}
              subjects={dashboard.assignedSubjects}
              attendance={dashboard.attendance}
            />
            <UpcomingExams exams={dashboard.upcomingExams} />
          </div>
          <UpcomingEvents events={dashboard.upcomingEvents} />
        </>
      )}

      {role === "STUDENT" && (
        <>
          <div className="dashboard-personal-card">
            <FiBookOpen />
            <span>Current class</span>
            <strong>{dashboard.currentClass?.name || "No active enrollment"}</strong>
            <small>Role number: {dashboard.student?.roleNumber || "—"}</small>
          </div>
          <div className="dashboard-content-grid">
            <BarTrend
              title="Recent academic results"
              subtitle="Recent marks as a percentage of each exam total"
              items={(dashboard.recentMarks || []).filter((mark) => mark.percentage !== null).map((mark) => ({
                label: mark.subjectName,
                percentage: mark.percentage,
              }))}
              valueKey="percentage"
            />
            <AttendanceRecords attendance={dashboard.attendance} />
            <RecentMarks marks={dashboard.recentMarks} />
            <FeeSummary summary={dashboard.feeSummary} subtitle="Fees linked to your account" />
            <UpcomingExams exams={dashboard.upcomingExams} />
            <UpcomingEvents events={dashboard.upcomingEvents} />
          </div>
        </>
      )}

      {role === "PARENT" && (
        <>
          {!dashboard.children?.length ? (
            <Panel title="Your children"><EmptyMessage>No linked student records were found.</EmptyMessage></Panel>
          ) : (
            <>
              <Panel title="Your children" subtitle="Academic information for students linked to your parent account">
                <div className="dashboard-child-list">
                  {dashboard.children.map((child) => (
                    <div className="dashboard-child-summary" key={child._id}>
                      <strong>{child.fullName}</strong>
                      <span>{child.roleNumber} · {child.currentClass?.name || "No active class"}</span>
                    </div>
                  ))}
                </div>
              </Panel>
              {dashboard.children.map((child) => <ChildOverview child={child} key={child._id} />)}
            </>
          )}
          <UpcomingEvents events={dashboard.upcomingEvents} />
        </>
      )}
    </section>
  );
}
