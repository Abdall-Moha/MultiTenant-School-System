import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FiBookOpen,
  FiBriefcase,
  FiCalendar,
  FiChevronRight,
  FiClipboard,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiSettings,
  FiUsers,
  FiX,
  FiCreditCard,
} from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getAssetUrl } from "../services/api.js";
const navigation = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: FiGrid,
    roles: ["SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"],
  },
  {
    section: "School management",
    roles: ["SUPER_ADMIN", "ADMIN"],
    items: [{ label: "School", path: "/schools", icon: FiBookOpen }],
  },
  {
    section: "Academic",
    roles: ["ADMIN", "TEACHER"],
    items: [
      { label: "Students", path: "/students", icon: FiUsers },
      {
        label: "Academic Years",
        path: "/academic-years",
        icon: FiCalendar,
        roles: ["ADMIN"],
      },
      {
        label: "Teachers",
        path: "/teachers",
        icon: FiUsers,
        roles: ["ADMIN"],
      },
      {
        label: "Parents",
        path: "/parents",
        icon: FiUsers,
        roles: ["ADMIN"],
      },
      {
        label: "Staff",
        path: "/staff",
        icon: FiBriefcase,
        roles: ["ADMIN"],
      },
      { label: "Classes", path: "/classes", icon: FiBookOpen },
      {
        label: "Subjects",
        path: "/subjects",
        icon: FiBookOpen,
        roles: ["ADMIN", "TEACHER"],
      },
      {
        label: "Teacher assignments",
        path: "/teacher-assignments",
        icon: FiClipboard,
        roles: ["ADMIN", "TEACHER"],
      },
    ],
  },
  {
    section: "Attendance & learning",
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
    items: [
      { label: "Attendance", path: "/attendance", icon: FiCalendar },
      {
        label: "Examinations",
        path: "/exams",
        icon: FiClipboard,
        roles: ["ADMIN", "TEACHER"],
      },
      {
        label: "Marks",
        path: "/marks",
        icon: FiClipboard,
        roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
      },
    ],
  },
  {
    section: "School",
    roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
    items: [
      {
        label: "Events",
        path: "/events",
        icon: FiCalendar,
        roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
      },
      {
        label: "Fees",
        path: "/fees",
        icon: FiClipboard,
        roles: ["ADMIN", "PARENT", "STUDENT"],
      },
      {
        label: "Payments",
        path: "/payments",
        icon: FiClipboard,
        roles: ["ADMIN", "PARENT", "STUDENT"],
      },
      {
        label: "Reports",
        path: "/reports",
        icon: FiClipboard,
        roles: ["ADMIN", "TEACHER", "PARENT", "STUDENT"],
      },
    ],
  },
  {
    section: "System",
    roles: ["SUPER_ADMIN", "ADMIN"],
    items: [{ label: "Users", path: "/users", icon: FiUsers }],
  },
  {
    section: "Subscriptions",
    roles: ["SUPER_ADMIN"],
    items: [
      { label: "Subscription Plans", path: "/subscription-plans", icon: FiCreditCard },
      { label: "Subscriptions", path: "/subscriptions", icon: FiCreditCard },
    ],
  },
  {
    section: "Account",
    roles: ["ADMIN"],
    items: [{ label: "Subscription", path: "/subscription", icon: FiCreditCard }],
  },
  {
    section: "Account",
    roles: ["SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"],
    items: [{ label: "Settings", path: "/settings", icon: FiSettings }],
  },
];
function Sidebar({ open, onClose, schoolName, schoolLogo }) {
  const { user, logout } = useAuth();
  const role = String(user?.role || "").trim().toUpperCase();
  const isSuperAdmin = role === "SUPER_ADMIN";
  return (
    <>
      {open && (
        <button
          type="button"
          className="drawer-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">
            {isSuperAdmin ? (
              <img src="/Schomas%20Logo.png" alt="Schomas Logo" />
            ) : (
              <SchoolLogoMark logo={schoolLogo} schoolName={schoolName} />
            )}
          </span>
          <span>
            {schoolName || (
              <>
                School<span className="brand-light">MS</span>
              </>
            )}
          </span>
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Close menu"
            onClick={onClose}
          >
            <FiX />
          </button>
        </div>
        <div className="sidebar-school">
          <span className="school-avatar">
            {isSuperAdmin ? (
              <img
                className="school-avatar-image"
                src="/Schomas%20Logo.png"
                alt="Schomas Logo"
              />
            ) : (
              <SchoolLogoMark
                logo={schoolLogo}
                schoolName={schoolName}
                className="school-avatar-image"
              />
            )}
          </span>
          <span>
            <strong>
              {role === "SUPER_ADMIN" ? "Platform" : "School workspace"}
            </strong>
            <small>
              {role === "SUPER_ADMIN"
                ? "Super administrator"
                : role.toLowerCase()}
            </small>
          </span>
        </div>
        <nav className="sidebar-navigation" aria-label="Main navigation">
          {navigation
            .filter((group) => group.roles.includes(role))
            .map((group) =>
              group.items ? (
                <div className="nav-group" key={group.section}>
                  <div className="nav-section-title">{group.section}</div>
                  {group.items
                    .filter(
                      (item) => !item.roles || item.roles.includes(role),
                    )
                    .map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `nav-link ${isActive ? "nav-link-active" : ""}`
                        }
                      >
                        <item.icon />
                        <span>
                          {item.path === "/schools" &&
                          role === "SUPER_ADMIN"
                            ? "Schools"
                            : item.label}
                        </span>
                        <FiChevronRight className="nav-chevron" />
                      </NavLink>
                    ))}
                </div>
              ) : (
                <NavLink
                  key={group.path}
                  to={group.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `nav-link nav-dashboard ${isActive ? "nav-link-active" : ""}`
                  }
                >
                  <group.icon />
                  <span>{group.label}</span>
                </NavLink>
              ),
            )}
        </nav>
        <button
          type="button"
          className="logout-button"
          onClick={() => {
            logout();
            onClose();
          }}
        >
          <FiLogOut />
          <span>Log out</span>
        </button>
      </aside>
    </>
  );
}
function SchoolLogoMark({ logo, schoolName, className }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState("");
  const schomasLogoUrl = "/Schomas%20Logo.png";
  const logoUrl = logo ? getAssetUrl(logo) : "";
  const schoolLogoFailed = Boolean(logoUrl && failedLogoUrl === logoUrl);
  const imageUrl = logoUrl && !schoolLogoFailed ? logoUrl : schomasLogoUrl;
  const alt = imageUrl === schomasLogoUrl
    ? "Schomas Logo"
    : `${schoolName || "School"} logo`;

  return (
    <img
      className={className}
      src={imageUrl}
      alt={alt}
      onError={() => setFailedLogoUrl(imageUrl)}
    />
  );
}

export default function MainLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [schoolBranding, setSchoolBranding] = useState({
    schoolId: "",
    schoolName: "",
    logo: "",
  });
  const { user } = useAuth();
  const role = String(user?.role || "").trim().toUpperCase();
  const location = useLocation();
  const titles = {
    "/dashboard": "Dashboard",
    "/schools": "Schools",
    "/students": "Students",
    "/academic-years": "Academic Years",
    "/teachers": "Teachers",
    "/parents": "Parents",
    "/staff": "Staff",
    "/classes": "Classes",
    "/subjects": "Subjects",
    "/teacher-assignments": "Teacher assignments",
    "/attendance": "Attendance",
    "/exams": "Examinations",
    "/marks": "Marks",
    "/events": "Events",
    "/fees": "Fees",
    "/payments": "Payments",
    "/reports": "Reports",
    "/users": "Users",
    "/settings": "Settings",
    "/subscription-plans": "Subscription Plans",
    "/subscriptions": "Subscriptions",
    "/subscription": "Subscription Overview",
  };
  const title =
    location.pathname.startsWith("/subscription-plans/")
      ? location.pathname.endsWith("/edit")
        ? "Edit Plan"
        : "Plan Details"
      : location.pathname === "/schools" && role !== "SUPER_ADMIN"
      ? "School"
      : titles[location.pathname] || "Dashboard";
  useEffect(() => {
    const schoolId = user?.schoolId;
    if (!role || role === "SUPER_ADMIN" || !schoolId) return undefined;
    let isCurrent = true;
    const loadSchoolBranding = () => {
      api
        .get("/schools/me/branding")
        .then(({ data }) => {
          if (isCurrent)
            setSchoolBranding({
              schoolId: String(schoolId),
              schoolName: data.school?.schoolName || "",
              logo: data.school?.logo || "",
            });
        })
        .catch(() => {
          if (isCurrent)
            setSchoolBranding({ schoolId: String(schoolId), schoolName: "", logo: "" });
        });
    };
    loadSchoolBranding();
    window.addEventListener("school-branding-updated", loadSchoolBranding);
    return () => {
      isCurrent = false;
      window.removeEventListener("school-branding-updated", loadSchoolBranding);
    };
  }, [role, user?.schoolId]);
  const schoolName =
    schoolBranding.schoolId === String(user?.schoolId)
      ? schoolBranding.schoolName
      : "";
  const schoolLogo =
    schoolBranding.schoolId === String(user?.schoolId)
      ? schoolBranding.logo
      : "";
  return (
    <div className="app-shell">
      <Sidebar
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        schoolName={role === "SUPER_ADMIN" ? "" : schoolName}
        schoolLogo={role === "SUPER_ADMIN" ? "" : schoolLogo}
      />
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button menu-button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <FiMenu />
          </button>
          <div className="topbar-heading">
            <h1>{title}</h1>
            <span>School Management System</span>
          </div>
          <div className="topbar-user">
            <span className="user-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
            <span className="user-details">
              <strong>{user?.name}</strong>
              <small>{user?.role?.replace("_", " ")}</small>
            </span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
