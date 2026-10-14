
import express from "express";
import bcrypt from "bcrypt";

import User from "../models/User.js";
import School from "../models/School.js";

import generateToken from "../utils/generateToken.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import rateLimitMiddleware from "../middleware/rateLimitMiddleware.js";

const router = express.Router();


// ======================================================
// LOGIN
// POST /api/users/login
//
// SUPER_ADMIN / ADMIN
// → email + password
//
// TEACHER / PARENT / STUDENT
// → username + password
//
// School ID is NOT required.
// The user's school is found from User.schoolId.
// ======================================================

router.post(
  "/login",
  rateLimitMiddleware,
  async (req, res) => {
    try {
      const {
        email,
        username,
        password,
      } = req.body;

      if (!password) {
        return res.status(400).json({
          message: "Password is required.",
        });
      }

      if (!email && !username) {
        return res.status(400).json({
          message: "Email or username is required.",
        });
      }

      let user;

      // ==================================================
      // EMAIL LOGIN
      // SUPER_ADMIN / ADMIN
      // ==================================================

      if (email) {
        const normalizedEmail = email
          .trim()
          .toLowerCase();

        user = await User.findOne({
          email: normalizedEmail,
        });
      }

      // ==================================================
      // USERNAME LOGIN
      // TEACHER / PARENT / STUDENT
      //
      // Username is globally unique.
      // We do NOT need schoolId here.
      // ==================================================

      else if (username) {
        const normalizedUsername = username.trim();

        user = await User.findOne({
          username: normalizedUsername,
        });
      }

      // ==================================================
      // USER NOT FOUND
      // ==================================================

      if (!user) {
        return res.status(401).json({
          message: "Incorrect email/username or password.",
        });
      }

      // ==================================================
      // CHECK USER ROLE
      //
      // Email login should only be used by:
      // SUPER_ADMIN and ADMIN
      //
      // Username login should only be used by:
      // TEACHER, PARENT and STUDENT
      // ==================================================

      if (email) {
        if (
          !["SUPER_ADMIN", "ADMIN"].includes(
            user.role
          )
        ) {
          return res.status(401).json({
            message:
              "This account must use username to log in.",
          });
        }
      }

      if (username) {
        if (
          !["TEACHER", "PARENT", "STUDENT"].includes(
            user.role
          )
        ) {
          return res.status(401).json({
            message:
              "This account must use email to log in.",
          });
        }
      }

      // ==================================================
      // USER ACCOUNT STATUS
      // ==================================================

      if (user.status !== "ACTIVE") {
        return res.status(403).json({
          message: "This account is not active.",
        });
      }

      // ==================================================
      // CHECK SCHOOL
      //
      // SUPER_ADMIN has no school.
      //
      // Every other role must belong to a school.
      // ==================================================

      if (user.role !== "SUPER_ADMIN") {
        if (!user.schoolId) {
          return res.status(403).json({
            message:
              "This account is not assigned to a school.",
          });
        }

        const school = await School.findById(
          user.schoolId
        );

        if (!school) {
          return res.status(403).json({
            message: "School not found.",
          });
        }

        // Suspended schools cannot log in.
        if (school.status !== "ACTIVE") {
          return res.status(403).json({
            message:
              "Your school account is currently suspended. Please contact the school administrator.",
          });
        }
      }

      // ==================================================
      // CHECK PASSWORD
      // ==================================================

      const passwordMatch = await bcrypt.compare(
        password,
        user.password
      );

      if (!passwordMatch) {
        return res.status(401).json({
          message:
            "Incorrect email/username or password.",
        });
      }

      // ==================================================
      // GENERATE JWT
      //
      // generateToken() gets:
      // userId
      // role
      // schoolId
      // mustChangePassword
      // ==================================================

      const token = generateToken(user);

      return res.status(200).json({
        message: "Login successful.",

        token,

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          schoolId: user.schoolId,
          mustChangePassword:
            user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error("Login error:", error);

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// GET CURRENT USER
// GET /api/users/me
// ======================================================

router.get(
  "/me",
  authMiddleware,
  async (req, res) => {
    try {
      const user = await User.findById(
        req.user.userId
      ).select("-password");

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      return res.status(200).json({
        user,
      });
    } catch (error) {
      console.error(
        "Get current user error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// UPDATE OWN PROFILE
// PUT /api/users/me
// ======================================================

router.put(
  "/me",
  authMiddleware,
  async (req, res) => {
    try {
      const { name, email } = req.body;

      const user = await User.findById(
        req.user.userId
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      // Update name
      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            message: "Name cannot be empty.",
          });
        }

        user.name = name.trim();
      }

      // Only ADMIN and SUPER_ADMIN use email login.
      if (email !== undefined) {
        if (
          !["ADMIN", "SUPER_ADMIN"].includes(
            user.role
          )
        ) {
          return res.status(400).json({
            message:
              "This account does not use email for login.",
          });
        }

        const normalizedEmail = email
          ? email.trim().toLowerCase()
          : null;

        if (normalizedEmail) {
          const existingUser =
            await User.findOne({
              email: normalizedEmail,
              _id: { $ne: user._id },
            });

          if (existingUser) {
            return res.status(409).json({
              message:
                "This email is already in use.",
            });
          }
        }

        user.email = normalizedEmail;
      }

      await user.save();

      return res.status(200).json({
        message:
          "Profile updated successfully.",

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          schoolId: user.schoolId,
          mustChangePassword:
            user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error(
        "Update own profile error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// CHANGE OWN PASSWORD
// POST /api/users/change-password
// ======================================================

router.post(
  "/change-password",
  authMiddleware,
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          message:
            "Current password and new password are required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message:
            "New password must be at least 8 characters.",
        });
      }

      const user = await User.findById(
        req.user.userId
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const passwordMatch =
        await bcrypt.compare(
          currentPassword,
          user.password
        );

      if (!passwordMatch) {
        return res.status(401).json({
          message:
            "Current password is incorrect.",
        });
      }

      user.password =
        await bcrypt.hash(newPassword, 10);

      user.mustChangePassword = false;

      await user.save();

      // Generate a new token because
      // mustChangePassword has changed.
      const token = generateToken(user);

      return res.status(200).json({
        message:
          "Password changed successfully.",

        token,

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          schoolId: user.schoolId,
          mustChangePassword:
            user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error(
        "Change password error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// CREATE ADMIN / SUPER ADMIN
// POST /api/users
//
// Student / Teacher / Parent accounts are NOT created
// here. Their profile routes create their accounts.
// ======================================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role,
        schoolId,
      } = req.body;

      if (
        !name ||
        !email ||
        !password ||
        !role
      ) {
        return res.status(400).json({
          message:
            "Name, email, password and role are required.",
        });
      }

      if (
        !["ADMIN", "SUPER_ADMIN"].includes(role)
      ) {
        return res.status(400).json({
          message:
            "Only Admin and Super Admin accounts can be created from this route.",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          message:
            "Password must be at least 8 characters.",
        });
      }

      const normalizedEmail = email
        .trim()
        .toLowerCase();

      // Only Super Admin can create another Super Admin.
      if (
        role === "SUPER_ADMIN" &&
        req.user.role !== "SUPER_ADMIN"
      ) {
        return res.status(403).json({
          message:
            "Only Super Admin can create a Super Admin.",
        });
      }

      let accountSchoolId = null;

      // ==================================================
      // ADMIN ACCOUNT
      // ==================================================

      if (role === "ADMIN") {
        if (req.user.role === "ADMIN") {
          // Admin can only create an Admin
          // inside their own school.
          accountSchoolId = req.schoolId;
        } else {
          // Super Admin can choose the school.
          if (!schoolId) {
            return res.status(400).json({
              message:
                "schoolId is required when creating an Admin.",
            });
          }

          const school =
            await School.findById(schoolId);

          if (!school) {
            return res.status(404).json({
              message: "School not found.",
            });
          }

          accountSchoolId = school._id;
        }
      }

      // Super Admin has no school.
      if (role === "SUPER_ADMIN") {
        accountSchoolId = null;
      }

      // ==================================================
      // CHECK EMAIL
      // ==================================================

      const existingUser =
        await User.findOne({
          email: normalizedEmail,
        });

      if (existingUser) {
        return res.status(409).json({
          message:
            "This email is already in use.",
        });
      }

      // ==================================================
      // HASH PASSWORD
      // ==================================================

      const hashedPassword =
        await bcrypt.hash(password, 10);

      // ==================================================
      // CREATE USER
      // ==================================================

      const user = await User.create({
        schoolId: accountSchoolId,
        name: name.trim(),
        email: normalizedEmail,
        username: null,
        password: hashedPassword,
        role,
        status: "ACTIVE",
        mustChangePassword: false,
      });

      return res.status(201).json({
        message:
          "User account created successfully.",

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          status: user.status,
          mustChangePassword:
            user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error(
        "Create user error:",
        error
      );

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A user with these details already exists.",
        });
      }

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// GET ALL USERS
// GET /api/users?page=1&limit=20
// ======================================================

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const page = Math.max(
        parseInt(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          parseInt(req.query.limit) || 20,
          1
        ),
        100
      );

      const skip = (page - 1) * limit;

      const filter = {};

      // Admin can only see users
      // from their own school.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const [users, total] =
        await Promise.all([
          User.find(filter)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),

          User.countDocuments(filter),
        ]);

      return res.status(200).json({
        users,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      console.error(
        "Get users error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// GET ONE USER
// GET /api/users/:id
// ======================================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const filter = {
        _id: req.params.id,
      };

      // Admin can only access own-school users.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const user = await User.findOne(
        filter
      ).select("-password");

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      return res.status(200).json({
        user,
      });
    } catch (error) {
      console.error(
        "Get user error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// UPDATE USER
// PUT /api/users/:id
//
// Username and role are intentionally NOT changed here.
// They are controlled by profile routes.
// ======================================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        status,
      } = req.body;

      const filter = {
        _id: req.params.id,
      };

      // Admin can only update own-school users.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const user = await User.findOne(filter);

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      // Admin cannot modify Super Admin.
      if (
        req.user.role === "ADMIN" &&
        user.role === "SUPER_ADMIN"
      ) {
        return res.status(403).json({
          message:
            "You cannot modify a Super Admin.",
        });
      }

      // Update name.
      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            message:
              "Name cannot be empty.",
          });
        }

        user.name = name.trim();
      }

      // Update email.
      if (email !== undefined) {
        if (
          !["ADMIN", "SUPER_ADMIN"].includes(
            user.role
          )
        ) {
          return res.status(400).json({
            message:
              "This account does not use email for login.",
          });
        }

        const normalizedEmail = email
          ? email.trim().toLowerCase()
          : null;

        if (normalizedEmail) {
          const existingUser =
            await User.findOne({
              email: normalizedEmail,
              _id: { $ne: user._id },
            });

          if (existingUser) {
            return res.status(409).json({
              message:
                "This email is already in use.",
            });
          }
        }

        user.email = normalizedEmail;
      }

      // Update account status.
      if (status !== undefined) {
        if (
          ![
            "ACTIVE",
            "INACTIVE",
            "SUSPENDED",
          ].includes(status)
        ) {
          return res.status(400).json({
            message:
              "Invalid user status.",
          });
        }

        // Admin cannot change Super Admin status.
        if (
          user.role === "SUPER_ADMIN" &&
          req.user.role !== "SUPER_ADMIN"
        ) {
          return res.status(403).json({
            message:
              "You cannot change a Super Admin status.",
          });
        }

        user.status = status;
      }

      await user.save();

      return res.status(200).json({
        message:
          "User updated successfully.",

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          schoolId: user.schoolId,
          mustChangePassword:
            user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error(
        "Update user error:",
        error
      );

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A user with these details already exists.",
        });
      }

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ======================================================
// RESET ANOTHER USER'S PASSWORD
// PUT /api/users/:id/reset-password
// ======================================================

router.put(
  "/:id/reset-password",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const { newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({
          message:
            "New password is required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message:
            "New password must be at least 8 characters.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      // Admin can only reset passwords
      // for users in their own school.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const user = await User.findOne(filter);

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      // Cannot reset your own password here.
      if (
        user._id.toString() ===
        req.user.userId.toString()
      ) {
        return res.status(400).json({
          message:
            "Use the change-password endpoint to update your own password.",
        });
      }

      // Admin cannot reset Super Admin password.
      if (
        user.role === "SUPER_ADMIN" &&
        req.user.role !== "SUPER_ADMIN"
      ) {
        return res.status(403).json({
          message:
            "You cannot reset a Super Admin password.",
        });
      }

      user.password =
        await bcrypt.hash(newPassword, 10);

      // Student / Teacher / Parent should
      // change the temporary/reset password.
      if (
        ["STUDENT", "TEACHER", "PARENT"].includes(
          user.role
        )
      ) {
        user.mustChangePassword = true;
      } else {
        user.mustChangePassword = false;
      }

      await user.save();

      return res.status(200).json({
        message:
          "Password reset successfully.",
      });
    } catch (error) {
      console.error(
        "Reset password error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);



export default router;
