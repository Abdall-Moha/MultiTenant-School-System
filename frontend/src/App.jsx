import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { useAuth } from "./hooks/useAuth.js";
import MainLayout from "./layouts/MainLayout.jsx";
import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Users from "./pages/Users.jsx";
import School from "./pages/School.jsx";
import Settings from "./pages/Settings.jsx";
import Students from "./pages/Students.jsx";
import Classes from "./pages/Classes.jsx";
import Parents from "./pages/Parents.jsx";
import Teachers from "./pages/Teachers.jsx";
import Subjects from "./pages/Subjects.jsx";
import TeacherAssignments from "./pages/TeacherAssignments.jsx";
import Staff from "./pages/Staff.jsx";
import Attendance from "./pages/Attendance.jsx";
import AcademicYears from "./pages/AcademicYears.jsx";
import Exams from "./pages/Exams.jsx";
import Events from "./pages/Events.jsx";
import Fees from "./pages/Fees.jsx";
import Payments from "./pages/Payments.jsx";
import Reports from "./pages/Reports.jsx";
import Marks from "./pages/Marks.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SubscriptionPlans from "./pages/SubscriptionPlans.jsx";
import SubscriptionPlanForm from "./pages/SubscriptionPlanForm.jsx";
import SubscriptionPlanDetails from "./pages/SubscriptionPlanDetails.jsx";
import Subscriptions from "./pages/Subscriptions.jsx";
import SubscriptionOverview from "./pages/SubscriptionOverview.jsx";
import { ProtectedRoute } from "./routes/ProtectedRoute.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";

function ApplicationRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to={user.mustChangePassword ? "/change-password" : "/dashboard"}
              replace
            />
          ) : (
            <Login />
          )
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<ProtectedRoute requirePasswordChange={false} />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "SUPER_ADMIN",
                    "ADMIN",
                    "TEACHER",
                    "PARENT",
                    "STUDENT",
                  ]}
                />
              }
            >
              <Route path="/events" element={<Events />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["SUPER_ADMIN", "ADMIN", "PARENT", "STUDENT"]}
                />
              }
            >
              <Route path="/fees" element={<Fees />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["SUPER_ADMIN", "ADMIN", "PARENT", "STUDENT"]}
                />
              }
            >
              <Route path="/payments" element={<Payments />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "SUPER_ADMIN",
                    "ADMIN",
                    "TEACHER",
                    "PARENT",
                    "STUDENT",
                  ]}
                />
              }
            >
              <Route path="/reports" element={<Reports />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "SUPER_ADMIN",
                    "ADMIN",
                    "TEACHER",
                    "PARENT",
                    "STUDENT",
                  ]}
                />
              }
            >
              <Route path="/marks" element={<Marks />} />
            </Route>
            <Route
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ADMIN"]} />
              }
            >
              <Route path="/staff" element={<Staff />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={[
                    "SUPER_ADMIN",
                    "ADMIN",
                    "TEACHER",
                    "PARENT",
                    "STUDENT",
                  ]}
                />
              }
            >
              <Route path="/attendance" element={<Attendance />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["SUPER_ADMIN", "ADMIN", "TEACHER"]}
                />
              }
            >
              <Route path="/exams" element={<Exams />} />
            </Route>
            <Route
              element={
                <ProtectedRoute
                  allowedRoles={["SUPER_ADMIN", "ADMIN", "TEACHER"]}
                />
              }
            >
              <Route path="/students" element={<Students />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route
                path="/teacher-assignments"
                element={<TeacherAssignments />}
              />
            </Route>
            <Route
              element={
                <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ADMIN"]} />
              }
            >
              <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
                <Route path="/academic-years" element={<AcademicYears />} />
              </Route>
              <Route path="/schools" element={<School />} />
              <Route path="/users" element={<Users />} />
              <Route path="/parents" element={<Parents />} />
              <Route path="/teachers" element={<Teachers />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]} />}>
              <Route path="/subscription-plans" element={<SubscriptionPlans />} />
              <Route path="/subscription-plans/new" element={<SubscriptionPlanForm />} />
              <Route path="/subscription-plans/:id" element={<SubscriptionPlanDetails />} />
              <Route path="/subscription-plans/:id/edit" element={<SubscriptionPlanForm />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
              <Route path="/subscription" element={<SubscriptionOverview />} />
            </Route>
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <Navigate
            to={
              user
                ? user.mustChangePassword
                  ? "/change-password"
                  : "/dashboard"
                : "/login"
            }
            replace
          />
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <ApplicationRoutes />
      </AuthProvider>
    </NotificationProvider>
  );
}

export default App;
