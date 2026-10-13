import jwt from "jsonwebtoken";
import User from "../models/User.js";
import School from "../models/School.js";

const SUSPENDED_SCHOOL_MESSAGE =
  "Your school account is currently suspended. Please contact the school administrator.";

// Validate both the token and the current account so changed roles/status take effect immediately.
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  // Get the token from "Bearer TOKEN"
  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }

  try {
    const account = await User.findById(decoded.userId).select(
      "role schoolId status mustChangePassword"
    );

    if (!account || account.status !== "ACTIVE") {
      return res.status(401).json({
        message: "This account is not active.",
      });
    }

    // Recheck the current school state for every school user's request so
    // suspending a school immediately ends access for existing sessions.
    if (account.role !== "SUPER_ADMIN") {
      if (!account.schoolId) {
        return res.status(403).json({
          message: "User is not assigned to a school.",
        });
      }

      const school = await School.findById(account.schoolId).select("status");
      if (!school || school.status !== "ACTIVE") {
        return res.status(403).json({
          message: SUSPENDED_SCHOOL_MESSAGE,
        });
      }
    }

    // Use current database role and school ownership instead of potentially stale JWT claims.
    req.user = {
      userId: account._id.toString(),
      role: account.role,
      schoolId: account.schoolId ? account.schoolId.toString() : null,
      mustChangePassword: account.mustChangePassword,
    };

    const isAccountRefresh = req.baseUrl === "/api/users" &&
      req.path === "/me" && req.method === "GET";
    const isPasswordChange = req.baseUrl === "/api/users" &&
      req.path === "/change-password" && req.method === "POST";

    if (account.mustChangePassword && !isAccountRefresh && !isPasswordChange) {
      return res.status(403).json({
        message: "You must change your password before continuing.",
      });
    }

    return next();
  } catch (error) {
    console.error("Authentication lookup error:", error);
    return res.status(500).json({
      message: "Unable to verify your account.",
    });
  }
};

export default authMiddleware;
