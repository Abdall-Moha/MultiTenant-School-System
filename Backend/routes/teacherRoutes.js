import express from "express";
import bcrypt from "bcrypt";

import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import School from "../models/School.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// ========================================
// CREATE TEACHER
// POST /api/teachers
// ========================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        schoolId,
        fullName,
        phone,
        qualification,
        hireDate,
        status,
      } = req.body;

      // ========================================
      // DETERMINE SCHOOL
      // ========================================

      let targetSchoolId;

      if (req.user.role === "SUPER_ADMIN") {
        targetSchoolId = schoolId;
      } else {
        targetSchoolId = req.schoolId;
      }

      if (!targetSchoolId) {
        return res.status(400).json({
          message: "schoolId is required.",
        });
      }

      // ========================================
      // REQUIRED FIELDS
      // ========================================

      if (!fullName || !phone) {
        return res.status(400).json({
          message: "fullName and phone are required.",
        });
      }

      // ========================================
      // CHECK SCHOOL
      // ========================================

      const school = await School.findById(targetSchoolId);

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status !== "ACTIVE") {
        return res.status(400).json({
          message:
            "Cannot create a teacher in a suspended school.",
        });
      }

      // ========================================
      // CHECK DUPLICATE TEACHER
      // ========================================

      const existingTeacher = await Teacher.findOne({
        schoolId: targetSchoolId,
        phone,
      });

      if (existingTeacher) {
        return res.status(409).json({
          message:
            "A teacher with this phone already exists in this school.",
        });
      }

      // ========================================
      // CREATE USER ACCOUNT
      // ========================================

      // Initial password = phone number
      const hashedPassword = await bcrypt.hash(phone, 10);

      const user = await User.create({
        schoolId: targetSchoolId,
        name: fullName,
        username: phone,
        password: hashedPassword,
        role: "TEACHER",
        mustChangePassword: true,
        status:
          status === "INACTIVE"
            ? "INACTIVE"
            : "ACTIVE",
      });

      // ========================================
      // CREATE TEACHER PROFILE
      // ========================================

      try {
        const teacher = await Teacher.create({
          schoolId: targetSchoolId,
          userId: user._id,
          fullName,
          phone,
          qualification,
          hireDate,
          status: status || "ACTIVE",
          createdBy: req.user.userId,
        });

        return res.status(201).json({
          message: "Teacher created successfully.",
          teacher,
        });
      } catch (error) {
        // If Teacher creation fails,
        // remove the User account we just created.
        await User.findByIdAndDelete(user._id);

        throw error;
      }
    } catch (error) {
      console.error(error);

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A teacher with this phone already exists in this school.",
        });
      }

      return res.status(500).json({
        message: "Failed to create teacher.",
      });
    }
  }
);

// ========================================
// GET ALL TEACHERS
// GET /api/teachers
// ========================================

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      // ========================================
      // PAGINATION
      // ========================================

      let page = Number(req.query.page) || 1;
      let limit = Number(req.query.limit) || 20;

      if (page < 1) {
        page = 1;
      }

      if (limit < 1) {
        limit = 20;
      }

      if (limit > 100) {
        limit = 100;
      }

      const skip = (page - 1) * limit;

      // ========================================
      // BUILD FILTER
      // ========================================

      const filter = {};

      // Filter by status
      if (
        req.query.status &&
        ["ACTIVE", "INACTIVE"].includes(req.query.status)
      ) {
        filter.status = req.query.status;
      }

      // Search by name or phone
      if (req.query.search?.trim()) {
        const search = req.query.search
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        filter.$or = [
          {
            fullName: {
              $regex: search,
              $options: "i",
            },
          },
          {
            phone: {
              $regex: search,
              $options: "i",
            },
          },
        ];
      }

      // ========================================
      // SCHOOL FILTER
      // ========================================

      if (req.user.role === "SUPER_ADMIN") {
        // SuperAdmin can see all schools.
        // If schoolId is provided, filter by it.
        if (req.query.schoolId) {
          filter.schoolId = req.query.schoolId;
        }
      } else {
        // Admin can only see their own school.
        filter.schoolId = req.schoolId;
      }

      // ========================================
      // GET TEACHERS
      // ========================================

      const teachers = await Teacher.find(filter)
        .populate(
          "schoolId",
          "schoolId schoolName"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Teacher.countDocuments(filter);

      return res.status(200).json({
        teachers,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get teachers.",
      });
    }
  }
);

// ========================================
// GET MY TEACHER PROFILE
// GET /api/teachers/me
// ========================================

router.get(
  "/me",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("TEACHER"),
  async (req, res) => {
    try {
      const teacher = await Teacher.findOne({
        userId: req.user.userId,
        schoolId: req.schoolId,
      }).populate(
        "schoolId",
        "schoolId schoolName"
      );

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher profile not found.",
        });
      }

      return res.status(200).json({
        teacher,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get teacher profile.",
      });
    }
  }
);

// ========================================
// GET ONE TEACHER
// GET /api/teachers/:id
// ========================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  async (req, res) => {
    try {
      const teacher = await Teacher.findById(
        req.params.id
      ).populate(
        "schoolId",
        "schoolId schoolName"
      );

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found.",
        });
      }

      // ========================================
      // ADMIN SCHOOL SECURITY
      // ========================================

      if (req.user.role === "ADMIN") {
        if (
          teacher.schoolId._id.toString() !==
          req.schoolId.toString()
        ) {
          return res.status(403).json({
            message:
              "You do not have access to this teacher.",
          });
        }
      }

      // ========================================
      // TEACHER SECURITY
      // ========================================

      if (req.user.role === "TEACHER") {
        if (
          teacher.userId.toString() !==
          req.user.userId
        ) {
          return res.status(403).json({
            message:
              "You can only view your own profile.",
          });
        }
      }

      // ========================================
      // CHECK ROLE
      // ========================================

      if (
        ![
          "SUPER_ADMIN",
          "ADMIN",
          "TEACHER",
        ].includes(req.user.role)
      ) {
        return res.status(403).json({
          message:
            "You do not have permission to view this teacher.",
        });
      }

      return res.status(200).json({
        teacher,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get teacher.",
      });
    }
  }
);

// ========================================
// UPDATE TEACHER
// PUT /api/teachers/:id
// ========================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        fullName,
        phone,
        qualification,
        hireDate,
        status,
      } = req.body;

      const teacher = await Teacher.findById(
        req.params.id
      );

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found.",
        });
      }

      // ========================================
      // ADMIN SCHOOL SECURITY
      // ========================================

      if (req.user.role === "ADMIN") {
        if (
          teacher.schoolId.toString() !==
          req.schoolId.toString()
        ) {
          return res.status(403).json({
            message:
              "You cannot update a teacher from another school.",
          });
        }
      }

      // ========================================
      // CHECK PHONE DUPLICATE
      // ========================================

      if (phone && phone !== teacher.phone) {
        const existingTeacher =
          await Teacher.findOne({
            schoolId: teacher.schoolId,
            phone,
            _id: {
              $ne: teacher._id,
            },
          });

        if (existingTeacher) {
          return res.status(409).json({
            message:
              "A teacher with this phone already exists.",
          });
        }
      }

      // Save old phone before changing it
      const oldPhone = teacher.phone;

      // ========================================
      // UPDATE TEACHER
      // ========================================

      if (fullName !== undefined) {
        teacher.fullName = fullName;
      }

      if (phone !== undefined) {
        teacher.phone = phone;
      }

      if (qualification !== undefined) {
        teacher.qualification = qualification;
      }

      if (hireDate !== undefined) {
        teacher.hireDate = hireDate;
      }

      if (status !== undefined) {
        teacher.status = status;
      }

      await teacher.save();

      // ========================================
      // UPDATE USER ACCOUNT
      // ========================================

      const user = await User.findById(
        teacher.userId
      );

      if (user) {
        // Update username/name in User
        // so both records stay synchronized.
        if (fullName !== undefined) {
          user.name = fullName;
        }

        if (
          phone !== undefined &&
          phone !== oldPhone
        ) {
          user.username = phone;
        }

        if (status !== undefined) {
          if (status === "ACTIVE") {
            user.status = "ACTIVE";
          } else {
            user.status = "INACTIVE";
          }
        }

        await user.save();
      }

      return res.status(200).json({
        message: "Teacher updated successfully.",
        teacher,
      });
    } catch (error) {
      console.error(error);

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A teacher with this phone already exists.",
        });
      }

      return res.status(500).json({
        message: "Failed to update teacher.",
      });
    }
  }
);

// ========================================
// RESET TEACHER PASSWORD
// PUT /api/teachers/:id/reset-password
// ========================================

router.put(
  "/:id/reset-password",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { password } = req.body;

      // ========================================
      // VALIDATE PASSWORD
      // ========================================

      if (!password || password.length < 8) {
        return res.status(400).json({
          message:
            "Password must be at least 8 characters.",
        });
      }

      const teacher = await Teacher.findById(
        req.params.id
      );

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found.",
        });
      }

      // ========================================
      // ADMIN SCHOOL SECURITY
      // ========================================

      if (req.user.role === "ADMIN") {
        if (
          teacher.schoolId.toString() !==
          req.schoolId.toString()
        ) {
          return res.status(403).json({
            message:
              "You cannot reset a teacher from another school.",
          });
        }
      }

      // ========================================
      // FIND USER ACCOUNT
      // ========================================

      const user = await User.findById(
        teacher.userId
      );

      if (!user) {
        return res.status(404).json({
          message:
            "Teacher login account not found.",
        });
      }

      // Hash new password
      user.password = await bcrypt.hash(
        password,
        10
      );

      // Teacher must change the password after login
      user.mustChangePassword = true;

      await user.save();

      return res.status(200).json({
        message:
          "Teacher password reset successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to reset teacher password.",
      });
    }
  }
);

// ========================================
// DELETE / DEACTIVATE TEACHER
// DELETE /api/teachers/:id
// ========================================

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const teacher = await Teacher.findById(
        req.params.id
      );

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found.",
        });
      }

      // ========================================
      // ADMIN SCHOOL SECURITY
      // ========================================

      if (req.user.role === "ADMIN") {
        if (
          teacher.schoolId.toString() !==
          req.schoolId.toString()
        ) {
          return res.status(403).json({
            message:
              "You cannot delete a teacher from another school.",
          });
        }
      }

      // ========================================
      // SOFT DELETE
      // ========================================

      // We do not permanently delete the teacher
      // because assignments and exams may reference them.
      teacher.status = "INACTIVE";

      await teacher.save();

      // Deactivate the login account too
      await User.findByIdAndUpdate(
        teacher.userId,
        {
          status: "INACTIVE",
        }
      );

      return res.status(200).json({
        message:
          "Teacher deactivated successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to deactivate teacher.",
      });
    }
  }
);

export default router;