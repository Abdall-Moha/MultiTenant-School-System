// Make sure the user belongs to a school
const tenantMiddleware = (req, res, next) => {
  // Super Admin can access all schools
  if (req.user.role === "SUPER_ADMIN") {
    return next();
  }

  // School users must have a school ID
  if (!req.user.schoolId) {
    return res.status(403).json({
      message: "User is not assigned to a school.",
    });
  }

  // Store the school ID for use in routes
  req.schoolId = req.user.schoolId;

  next();
};

export default tenantMiddleware;