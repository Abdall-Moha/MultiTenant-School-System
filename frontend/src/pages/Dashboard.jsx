import { useEffect, useState } from "react";
import {
  FiActivity,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
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
  "Subject Exams": FiClipboard,
  "School Events": FiCalendar,
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function Panel({ title, children, className = "" }) {
  return (
    <section className={`dashboard-panel ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function EmptyMessage({ children }) {
  return <p className="dashboard-empty">{children}</p>;
}

function StatCards({ items = [] }) {
  return (
    <div className="dashboard-stats">
      {items.map((item) => {
        const Icon = iconByLabel[item.label] || FiActivity;
        return (
          <article className="dashboard-stat-card" key={item.label}>
            <span className="dashboard-stat-icon"><Icon /></span>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function UpcomingExams({ exams = [] }) {
  return (
    <Panel title="Upcoming exams">
      {exams.length ? (
        <div className="dashboard-record-list">
          {exams.map((exam) => (
            <article className="dashboard-record" key={exam._id}>
              <div>
                <strong>{exam.examinationId?.name || exam.title}</strong>
                <span>
                  {[exam.classId?.name, exam.subjectId?.name].filter(Boolean).join(" · ") || "Subject exam"}
                </span>
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
    <Panel title="Upcoming school events">
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
      <strong>
        {attendance.presentPercentage === null ? "—" : `${attendance.presentPercentage}%`}
      </strong>
      <span>Present out of {attendance.recorded} recorded entries</span>
      <div className="dashboard-attendance-counts">
        <span>Present: {attendance.present}</span>
        <span>Absent: {attendance.absent}</span>
        <span>Late: {attendance.late}</span>
        <span>Excused: {attendance.excused}</span>
      </div>
    </div>
  );
}

function AttendanceRecords({ attendance }) {
  return (
    <Panel title="Recent attendance">
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
                  <td>{record.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function RecentMarks({ marks = [] }) {
  return (
    <Panel title="Recent marks">
      {marks.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>Examination</th><th>Subject</th><th>Mark</th><th>Percentage</th></tr></thead>
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

function ClassEnrollment({ classes = [] }) {
  return (
    <Panel title="Current class enrollment">
      {classes.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>Class</th><th>Active students enrolled</th></tr></thead>
            <tbody>
              {classes.map((item) => (
                <tr key={item._id}><td>{item.name}</td><td>{item.students}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No active classes are available for the current academic year.</EmptyMessage>}
    </Panel>
  );
}

function RecentSchools({ schools = [] }) {
  return (
    <Panel title="Recently registered schools">
      {schools.length ? (
        <div className="table-scroll dashboard-table-wrap">
          <table className="users-table">
            <thead><tr><th>School</th><th>School ID</th><th>Status</th><th>Registered</th></tr></thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school._id}>
                  <td>{school.schoolName}</td><td>{school.schoolId}</td>
                  <td>{school.status}</td><td>{formatDate(school.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyMessage>No schools have been registered yet.</EmptyMessage>}
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
        <AttendanceRecords attendance={child.attendance} />
        <UpcomingExams exams={child.upcomingExams} />
        <RecentMarks marks={child.recentMarks} />
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, []);

  if (loading) return <div className="school-loading">Loading your dashboard...</div>;
  if (error) return <div role="alert" className="dashboard-error">{error}</div>;

  const role = dashboard?.role || user?.role;
  const displayName =
    dashboard?.student?.fullName || dashboard?.teacher?.fullName ||
    dashboard?.parent?.fullName || user?.name || "there";
  const roleLabel = role === "SUPER_ADMIN" ? "Platform overview" : "School workspace";

  return (
    <section className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">{roleLabel}</span>
          <h2>Welcome, {displayName}</h2>
          <p>
            {dashboard?.currentAcademicYear?.name
              ? `Current academic year: ${dashboard.currentAcademicYear.name}`
              : role === "SUPER_ADMIN"
                ? "Here is the current overview of your platform."
                : "Here is the latest information available for your account."}
          </p>
        </div>
      </header>

      <StatCards items={dashboard?.summary} />

      {role === "SUPER_ADMIN" && <RecentSchools schools={dashboard.recentSchools} />}

      {role === "ADMIN" && (
        <div className="dashboard-content-grid">
          <ClassEnrollment classes={dashboard.classEnrollment} />
          <Panel title="Current year attendance">
            <AttendanceOverview attendance={dashboard.attendance} />
          </Panel>
          <UpcomingExams exams={dashboard.upcomingExams} />
          <UpcomingEvents events={dashboard.upcomingEvents} />
        </div>
      )}

      {role === "TEACHER" && (
        <div className="dashboard-content-grid">
          <UpcomingExams exams={dashboard.upcomingExams} />
          <UpcomingEvents events={dashboard.upcomingEvents} />
        </div>
      )}

      {role === "STUDENT" && (
        <>
          <div className="dashboard-personal-card">
            <FiBookOpen />
            <span>Current class</span>
            <strong>{dashboard.currentClass?.name || "No active enrollment"}</strong>
            <small>{dashboard.student?.roleNumber}</small>
          </div>
          <div className="dashboard-content-grid">
            <UpcomingExams exams={dashboard.upcomingExams} />
            <UpcomingEvents events={dashboard.upcomingEvents} />
            <AttendanceRecords attendance={dashboard.attendance} />
            <RecentMarks marks={dashboard.recentMarks} />
          </div>
        </>
      )}

      {role === "PARENT" && (
        <>
          {!dashboard.children?.length ? (
            <Panel title="Linked children"><EmptyMessage>No linked student records were found.</EmptyMessage></Panel>
          ) : (
            <>
              <Panel title="Linked children">
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
