import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

import Parent from "../models/Parent.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import User from "../models/User.js";
import School from "../models/School.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// ========================================
// GET PARENT'S STUDENTS
// ========================================

async function getParentStudents(schoolId, parentId) {
  const students = await Student.find({
    schoolId,
    parentId,
  }).select("_id roleNumber fullName status");

  const studentIds = students.map((student) => student._id);

  const enrollments = await StudentEnrollment.find({
    schoolId,
    studentId: { $in: studentIds },
  })
    .populate("academicYearId", "name isCurrent")
    .populate("classId", "name academicYearId numberOfPeriods");

  const result = [];

  for (const student of students) {
    const history = enrollments.filter(
      (enrollment) =>
        String(enrollment.studentId) === String(student._id)
    );

    const currentEnrollment = history.find(
      (enrollment) =>
        enrollment.academicYearId?.isCurrent &&
        enrollment.status === "ACTIVE"
    );

    result.push({
      ...student.toObject(),
      currentEnrollment: currentEnrollment || null,
      enrollmentHistory: history,
    });
  }

  return result;
}

// ========================================
// CREATE PARENT
// POST /api/parents
// ========================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    let createdUser = null;

    try {
      const {
        schoolId,
        fullName,
        phoneNumber,
        status,
      } = req.body;

      // Check required fields
      if (!fullName || !phoneNumber) {
        return res.status(400).json({
          message: "fullName and phoneNumber are required.",
        });
      }

      // ========================================
      // DETERMINE SCHOOL
      // ========================================

      let accountSchoolId;

      if (req.user.role === "ADMIN") {
        // Admin automatically uses their own school
        accountSchoolId = req.schoolId;
      } else {
        // SuperAdmin must provide a school
        if (!schoolId) {
          return res.status(400).json({
            message: "schoolId is required for Super Admin.",
          });
        }

        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
          return res.status(400).json({
            message: "Invalid schoolId.",
          });
        }

        accountSchoolId = schoolId;
      }

      // ========================================
      // CHECK SCHOOL
      // ========================================

      const school = await School.findOne({
        _id: accountSchoolId,
        status: "ACTIVE",
      }).select("schoolId status");

      if (!school) {
        return res.status(400).json({
          message: "School not found or school is suspended.",
        });
      }

      // Clean the values
      const normalizedName = fullName.trim();
      const normalizedPhone = phoneNumber.trim();

      // ========================================
      // VALIDATE STATUS
      // ========================================

      const parentStatus = status || "ACTIVE";

      if (!["ACTIVE", "INACTIVE"].includes(parentStatus)) {
        return res.status(400).json({
          message: "Invalid parent status.",
        });
      }

      // ========================================
      // CHECK DUPLICATE PARENT
      // ========================================

      const existingParent = await Parent.findOne({
        schoolId: accountSchoolId,
        phoneNumber: normalizedPhone,
      });

      if (existingParent) {
        return res.status(409).json({
          message:
            "This phone number is already used by a parent in this school.",
        });
      }

      // ========================================
      // CHECK USER ACCOUNT
      // ========================================

      const existingUser = await User.findOne({
        schoolId: accountSchoolId,
        username: normalizedPhone,
      });

      if (existingUser) {
        return res.status(409).json({
          message:
            "This phone number is already used by another account in this school.",
        });
      }

      // ========================================
      // CREATE USER ACCOUNT
      // ========================================

      // Initial password = phone number
      const hashedPassword = await bcrypt.hash(
        normalizedPhone,
        10
      );

      createdUser = await User.create({
        schoolId: accountSchoolId,
        name: normalizedName,
        email: null,
        username: normalizedPhone,
        password: hashedPassword,
        role: "PARENT",
        status:
          parentStatus === "ACTIVE"
            ? "ACTIVE"
            : "INACTIVE",
        mustChangePassword: true,
      });

      // ========================================
      // CREATE PARENT PROFILE
      // ========================================

      let createdParent;

      try {
        createdParent = await Parent.create({
          schoolId: accountSchoolId,
          userId: createdUser._id,
          fullName: normalizedName,
          phoneNumber: normalizedPhone,
          status: parentStatus,
          createdBy: req.user.userId,
        });
      } catch (parentError) {
        // Parent creation failed,
        // so remove the User account we just created.
        await User.findByIdAndDelete(createdUser._id);

        throw parentError;
      }

      // ========================================
      // RETURN CREATED PARENT
      // ========================================

      return res.status(201).json({
        message: "Parent created successfully.",

        parent: {
          id: createdParent._id,
          fullName: createdParent.fullName,
          phoneNumber: createdParent.phoneNumber,
          schoolId: createdParent.schoolId,
          status: createdParent.status,
          userId: createdParent.userId,
        },

        login: {
          schoolId: school.schoolId,
          username: normalizedPhone,
          password: normalizedPhone,
          mustChangePassword: true,
        },
      });
    } catch (error) {
      console.error("Create parent error:", error);

      // Handle duplicate database records
      if (error.code === 11000) {
        if (createdUser) {
          await User.findByIdAndDelete(createdUser._id);
        }

        return res.status(409).json({
          message:
            "A parent with these details already exists in this school.",
        });
      }

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ========================================
// GET ALL PARENTS
// GET /api/parents
// ========================================

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  async (req, res) => {
    try {
      // ========================================
      // PAGINATION
      // ========================================

      let page = parseInt(req.query.page) || 1;
      let limit = parseInt(req.query.limit) || 20;

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

      // SuperAdmin can optionally choose a school
      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          if (
            !mongoose.Types.ObjectId.isValid(
              req.query.schoolId
            )
          ) {
            return res.status(400).json({
              message: "Invalid schoolId.",
            });
          }

          filter.schoolId = req.query.schoolId;
        }
      }

      // Admin can only see their own school
      else if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      // Parent can only see their own profile
      else if (req.user.role === "PARENT") {
        filter.schoolId = req.schoolId;
        filter.userId = req.user.userId;
      }

      else {
        return res.status(403).json({
          message: "You do not have permission to view parents.",
        });
      }

      // ========================================
      // GET PARENTS
      // ========================================

      const parents = await Parent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Parent.countDocuments(filter);

      // ========================================
      // ADD STUDENTS TO EACH PARENT
      // ========================================

      const parentsWithStudents = [];

      for (const parent of parents) {
        const students = await getParentStudents(
          parent.schoolId,
          parent._id
        );

        parentsWithStudents.push({
          ...parent.toObject(),
          students,
        });
      }

      return res.status(200).json({
        parents: parentsWithStudents,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get parents error:", error);

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ========================================
// GET ONE PARENT
// GET /api/parents/:id
// ========================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  async (req, res) => {
    try {
      // Check ID
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid parent ID.",
        });
      }

      const parent = await Parent.findById(req.params.id);

      if (!parent) {
        return res.status(404).json({
          message: "Parent not found.",
        });
      }

      // ========================================
      // SUPER ADMIN
      // ========================================

      if (req.user.role === "SUPER_ADMIN") {
        const students = await getParentStudents(
          parent.schoolId,
          parent._id
        );

        return res.status(200).json({
          parent,
          students,
        });
      }

      // ========================================
      // SCHOOL SECURITY
      // ========================================

      if (
        parent.schoolId.toString() !==
        req.schoolId.toString()
      ) {
        return res.status(404).json({
          message: "Parent not found.",
        });
      }

      // ========================================
      // ADMIN
      // ========================================

      if (req.user.role === "ADMIN") {
        const students = await getParentStudents(
          parent.schoolId,
          parent._id
        );

        return res.status(200).json({
          parent,
          students,
        });
      }

      // ========================================
      // PARENT
      // ========================================

      if (req.user.role === "PARENT") {
        if (
          parent.userId.toString() !==
          req.user.userId.toString()
        ) {
          return res.status(403).json({
            message:
              "You can only view your own parent profile.",
          });
        }

        const students = await getParentStudents(
          parent.schoolId,
          parent._id
        );

        return res.status(200).json({
          parent,
          students,
        });
      }

      return res.status(403).json({
        message:
          "You do not have permission to view this parent.",
      });
    } catch (error) {
      console.error("Get parent error:", error);

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ========================================
// UPDATE PARENT
// PUT /api/parents/:id
// ========================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      // Check ID
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid parent ID.",
        });
      }

      const {
        fullName,
        phoneNumber,
        status,
      } = req.body;

      const filter = {
        _id: req.params.id,
      };

      // Admin can only update parents
      // in their own school.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const parent = await Parent.findOne(filter);

      if (!parent) {
        return res.status(404).json({
          message: "Parent not found.",
        });
      }

      const user = await User.findById(parent.userId);

      if (!user) {
        return res.status(500).json({
          message: "Parent user account was not found.",
        });
      }

      // ========================================
      // UPDATE NAME
      // ========================================

      if (fullName !== undefined) {
        if (!fullName.trim()) {
          return res.status(400).json({
            message: "Full name cannot be empty.",
          });
        }

        parent.fullName = fullName.trim();
        user.name = fullName.trim();
      }

      // ========================================
      // UPDATE PHONE
      // ========================================

      if (phoneNumber !== undefined) {
        const normalizedPhone = phoneNumber.trim();

        if (!normalizedPhone) {
          return res.status(400).json({
            message: "Phone number cannot be empty.",
          });
        }

        // Only check duplicates if the phone changed
        if (normalizedPhone !== parent.phoneNumber) {
          const duplicateParent = await Parent.findOne({
            schoolId: parent.schoolId,
            phoneNumber: normalizedPhone,
            _id: { $ne: parent._id },
          });

          if (duplicateParent) {
            return res.status(409).json({
              message:
                "This phone number is already used by another parent in this school.",
            });
          }

          const duplicateUser = await User.findOne({
            schoolId: parent.schoolId,
            username: normalizedPhone,
            _id: { $ne: user._id },
          });

          if (duplicateUser) {
            return res.status(409).json({
              message:
                "This phone number is already used by another account in this school.",
            });
          }

          parent.phoneNumber = normalizedPhone;
          user.username = normalizedPhone;
        }
      }

      // ========================================
      // UPDATE STATUS
      // ========================================

      if (status !== undefined) {
        if (!["ACTIVE", "INACTIVE"].includes(status)) {
          return res.status(400).json({
            message: "Invalid parent status.",
          });
        }

        parent.status = status;

        if (status === "ACTIVE") {
          user.status = "ACTIVE";
        } else {
          user.status = "INACTIVE";
        }
      }

      // Save both records
      await user.save();
      await parent.save();

      return res.status(200).json({
        message: "Parent updated successfully.",
        parent,
      });
    } catch (error) {
      console.error("Update parent error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A parent with these details already exists.",
        });
      }

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ========================================
// RESET PARENT PASSWORD
// PUT /api/parents/:id/reset-password
// ========================================

router.put(
  "/:id/reset-password",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const { newPassword } = req.body;

      // Check password
      if (!newPassword) {
        return res.status(400).json({
          message: "New password is required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message:
            "New password must be at least 8 characters.",
        });
      }

      // Check ID
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid parent ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      // Admin can only reset parents
      // from their own school.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const parent = await Parent.findOne(filter);

      if (!parent) {
        return res.status(404).json({
          message: "Parent not found.",
        });
      }

      const user = await User.findById(parent.userId);

      if (!user) {
        return res.status(404).json({
          message: "Parent user account not found.",
        });
      }

      // Hash the new password
      user.password = await bcrypt.hash(
        newPassword,
        10
      );

      // Parent must change it again after logging in
      user.mustChangePassword = true;

      await user.save();

      return res.status(200).json({
        message: "Parent password reset successfully.",
      });
    } catch (error) {
      console.error(
        "Reset parent password error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

// ========================================
// DELETE PARENT
// DELETE /api/parents/:id
// ========================================

// We do not permanently delete the parent.
// The parent becomes INACTIVE instead.

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      // Check ID
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid parent ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      // Admin can only delete parents
      // from their own school.
      if (req.user.role === "ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const parent = await Parent.findOne(filter);

      if (!parent) {
        return res.status(404).json({
          message: "Parent not found.",
        });
      }

      // ========================================
      // CHECK STUDENTS
      // ========================================

      const studentCount = await Student.countDocuments({
        schoolId: parent.schoolId,
        parentId: parent._id,
      });

      if (studentCount > 0) {
        return res.status(400).json({
          message:
            "This parent cannot be deleted because students are still assigned to this parent.",
        });
      }

      // ========================================
      // DEACTIVATE PARENT
      // ========================================

      parent.status = "INACTIVE";

      await parent.save();

      // Deactivate the login account too
      await User.findByIdAndUpdate(parent.userId, {
        status: "INACTIVE",
      });

      return res.status(200).json({
        message: "Parent deactivated successfully.",
      });
    } catch (error) {
      console.error("Delete parent error:", error);

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);

export default router;