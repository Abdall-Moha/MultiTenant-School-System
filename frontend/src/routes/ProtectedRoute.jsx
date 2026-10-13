import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

// Protect the app shell and keep first-login users on the password change screen.
export function ProtectedRoute({ requirePasswordChange, allowedRoles }) {
  const { isAuthenticated, user, isCheckingSession } = useAuth();
  if (isCheckingSession)
    return (
      <div className="session-loading" role="status">
        Checking your session…
      </div>
    );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && requirePasswordChange === false)
    return <Navigate to="/change-password" replace />;
  if (!user.mustChangePassword && requirePasswordChange === true)
    return <Navigate to="/dashboard" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role))
    return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
