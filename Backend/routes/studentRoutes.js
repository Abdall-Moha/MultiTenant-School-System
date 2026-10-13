import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import AcademicYear from "../models/AcademicYear.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import Parent from "../models/Parent.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Class from "../models/Class.js";
import School from "../models/School.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

const studentStatuses = [
  "ACTIVE",
  "INACTIVE",
  "GRADUATED",
  "TRANSFERRED",
];


// ============================================================
// GET STUDENT FILTER
// This controls which students each role is allowed to see.
// ============================================================

async function getStudentFilter(req) {
  const filter = {};

  // Super Admin can choose a school.
  if (req.user.role === "SUPER_ADMIN") {
    if (req.query.schoolId) {
      filter.schoolId = req.query.schoolId;
    }
  } else {
    // Normal users can only see their own school's students.
    filter.schoolId = req.schoolId;
  }

  // Optional status filter.
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Search by name or role number.
  if (req.query.search?.trim()) {
    const searchValue = req.query.search
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      {
        fullName: {
          $regex: searchValue,
          $options: "i",
        },
      },
      {
        roleNumber: {
          $regex: searchValue,
          $options: "i",
        },
      },
    ];
  }

  // Student can only see himself.
  if (req.user.role === "STUDENT") {
    filter.userId = req.user.userId;
  }

  // Parent can only see his/her children.
  if (req.user.role === "PARENT") {
    const parent = await Parent.findOne({
      userId: req.user.userId,
      schoolId: req.schoolId,
    });

    if (parent) {
      filter.parentId = parent._id;
    } else {
      // No parent profile means no students should be returned.
      filter.parentId = null;
    }
  }

  // Teacher can only see students from assigned classes.
  if (req.user.role === "TEACHER") {
    const teacher = await Teacher.findOne({
      userId: req.user.userId,
      schoolId: req.schoolId,
    });

    if (!teacher) {
      filter._id = { $in: [] };
      return filter;
    }

    const assignments = await TeacherAssignment.find({
      teacherId: teacher._id,
      schoolId: req.schoolId,
    }).select("classId academicYearId");

    const classYearPairs = assignments.map((assignment) => ({
      classId: assignment.classId,
      academicYearId: assignment.academicYearId,
    }));

    if (classYearPairs.length === 0) {
      filter._id = { $in: [] };
      return filter;
    }

    const studentIds = await StudentEnrollment.distinct("studentId", {
      schoolId: req.schoolId,
      status: "ACTIVE",
      $or: classYearPairs,
    });

    filter.schoolId = req.schoolId;
    filter._id = { $in: studentIds };
  }

  return filter;
}


// ============================================================
// ADD ENROLLMENT HISTORY
// Adds current enrollment and full enrollment history
// to each student.
// ============================================================

async function addEnrollmentHistory(students) {
  const studentIds = students.map((student) => student._id);

  const enrollments = await StudentEnrollment.find({
    studentId: {
      $in: studentIds,
    },
  })
    .populate(
      "academicYearId",
      "name isCurrent startDate endDate"
    )
    .populate(
      "classId",
      "name academicYearId numberOfPeriods"
    );

  const enrollmentMap = new Map();

  for (const enrollment of enrollments) {
    const studentId = String(enrollment.studentId);

    if (!enrollmentMap.has(studentId)) {
      enrollmentMap.set(studentId, []);
    }

    enrollmentMap.get(studentId).push(enrollment);
  }

  const result = [];

  for (const student of students) {
    const history =
      enrollmentMap.get(String(student._id)) || [];

    let currentEnrollment = null;

    for (const enrollment of history) {
      if (
        enrollment.academicYearId?.isCurrent &&
        enrollment.status === "ACTIVE"
      ) {
        currentEnrollment = enrollment;
        break;
      }
    }

    result.push({
      ...student.toObject(),
      currentEnrollment,
      enrollmentHistory: history,
    });
  }

  return result;
}


// ============================================================
// CREATE STUDENT
// POST /api/students
// ============================================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    let user = null;
    let student = null;
    let enrollment = null;

    try {
      const {
        parentId,
        roleNumber,
        fullName,
        dateOfBirth,
        gender,
        academicYearId,
        classId,
        status,
      } = req.body;

      // Check required fields.
      if (
        !parentId ||
        !roleNumber?.trim() ||
        !fullName?.trim() ||
        !academicYearId ||
        !classId
      ) {
        return res.status(400).json({
          message:
            "parentId, roleNumber, fullName, academicYearId and classId are required.",
        });
      }

      // Super Admin chooses the school.
      // Admin automatically uses his own school.
      let schoolId;

      if (req.user.role === "SUPER_ADMIN") {
        schoolId = req.body.schoolId;
      } else {
        schoolId = req.schoolId;
      }

      if (
        !schoolId ||
        !mongoose.Types.ObjectId.isValid(schoolId)
      ) {
        return res.status(400).json({
          message: "A valid schoolId is required.",
        });
      }

      const studentStatus = status || "ACTIVE";

      if (!studentStatuses.includes(studentStatus)) {
        return res.status(400).json({
          message: "Invalid student status.",
        });
      }

      // Make sure all related records belong to this school.
      const school = await School.findOne({
        _id: schoolId,
        status: "ACTIVE",
      }).select("schoolId status");

      const parent = await Parent.findOne({
        _id: parentId,
        schoolId,
        status: "ACTIVE",
      });

      const academicYear = await AcademicYear.findOne({
        _id: academicYearId,
        schoolId,
      });

      const classData = await Class.findOne({
        _id: classId,
        schoolId,
        academicYearId,
      });

      if (!school) {
        return res.status(400).json({
          message: "School not found or suspended.",
        });
      }

      if (!parent) {
        return res.status(400).json({
          message:
            "Parent must be active and belong to this school.",
        });
      }

      if (!academicYear || !classData) {
        return res.status(400).json({
          message:
            "Academic year and class must belong to this school, and class must use that year.",
        });
      }

      const normalizedRoleNumber = roleNumber.trim();

      // Check duplicate role number.
      const existingStudent = await Student.findOne({
        schoolId,
        roleNumber: normalizedRoleNumber,
      });

      // The role number is also the student's username.
      const existingUser = await User.findOne({
        schoolId,
        username: normalizedRoleNumber,
      });

      if (existingStudent || existingUser) {
        return res.status(409).json({
          message:
            "This role number is already used in this school.",
        });
      }

      // The initial password is the role number.
      const hashedPassword = await bcrypt.hash(
        normalizedRoleNumber,
        10
      );

      // Create the student's login account.
      user = await User.create({
        schoolId,
        name: fullName.trim(),
        email: null,
        username: normalizedRoleNumber,
        password: hashedPassword,
        role: "STUDENT",
        status:
          studentStatus === "ACTIVE"
            ? "ACTIVE"
            : "INACTIVE",
        mustChangePassword: true,
      });

      // Create student profile.
      student = await Student.create({
        schoolId,
        userId: user._id,
        parentId: parent._id,
        roleNumber: normalizedRoleNumber,
        fullName: fullName.trim(),
        dateOfBirth,
        gender,
        status: studentStatus,
        createdBy: req.user.userId,
      });

      // Create first enrollment.
      enrollment = await StudentEnrollment.create({
        schoolId,
        studentId: student._id,
        academicYearId,
        classId,
        status: "ACTIVE",
        createdBy: req.user.userId,
      });

      return res.status(201).json({
        message: "Student created successfully.",

        student: {
          ...student.toObject(),

          currentEnrollment: {
            _id: enrollment._id,
            academicYear: academicYear.name,
            class: classData.name,
            status: enrollment.status,
          },
        },

        login: {
          schoolId: school.schoolId,
          username: normalizedRoleNumber,
          password: normalizedRoleNumber,
          mustChangePassword: true,
        },
      });
    } catch (error) {
      // Manual rollback because we are not using transactions.
      if (enrollment) {
        await StudentEnrollment.deleteOne({
          _id: enrollment._id,
        });
      }

      if (student) {
        await Student.deleteOne({
          _id: student._id,
        });
      }

      if (user) {
        await User.deleteOne({
          _id: user._id,
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "This student or role number already exists in this school.",
        });
      }

      console.error(error);

      return res.status(500).json({
        message: "Failed to create student.",
      });
    }
  }
);


// ============================================================
// GET ALL STUDENTS
// GET /api/students
// ============================================================

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "PARENT",
    "STUDENT"
  ),
  async (req, res) => {
    try {
      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(Number(req.query.limit) || 20, 1),
        100
      );

      const filter = await getStudentFilter(req);

      const [students, total] = await Promise.all([
        Student.find(filter)
          .populate(
            "parentId",
            "fullName phoneNumber"
          )
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),

        Student.countDocuments(filter),
      ]);

      const studentsWithHistory =
        await addEnrollmentHistory(students);

      return res.json({
        students: studentsWithHistory,

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
        message: "Failed to get students.",
      });
    }
  }
);


// ============================================================
// GET ONE STUDENT
// GET /api/students/:id
// ============================================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "SUPER_ADMIN",
    "ADMIN",
    "TEACHER",
    "PARENT",
    "STUDENT"
  ),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid student ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      // Normal users can only access their school.
      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      // Student can only access himself.
      if (req.user.role === "STUDENT") {
        filter.userId = req.user.userId;
      }

      // Parent can only access his/her child.
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        filter.parentId = parent?._id || null;
      }

      const student = await Student.findOne(
        filter
      ).populate(
        "parentId",
        "fullName phoneNumber"
      );

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      // Teacher needs an additional assignment check.
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        const assignments = teacher
          ? await TeacherAssignment.find({
              teacherId: teacher._id,
              schoolId: req.schoolId,
            }).select(
              "classId academicYearId"
            )
          : [];

        const visible = assignments.length
          ? await StudentEnrollment.exists({
              schoolId: req.schoolId,
              studentId: student._id,
              status: "ACTIVE",

              $or: assignments.map(
                (assignment) => ({
                  classId: assignment.classId,
                  academicYearId:
                    assignment.academicYearId,
                })
              ),
            })
          : false;

        if (!visible) {
          return res.status(403).json({
            message:
              "You are not assigned to this student's class.",
          });
        }
      }

      const [studentWithHistory] =
        await addEnrollmentHistory([student]);

      return res.json({
        student: studentWithHistory,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get student.",
      });
    }
  }
);


// ============================================================
// UPDATE STUDENT
// PUT /api/students/:id
// ============================================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const student = await Student.findOne({
        _id: req.params.id,

        ...(req.user.role === "SUPER_ADMIN"
          ? {}
          : {
              schoolId: req.schoolId,
            }),
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      const user = await User.findById(
        student.userId
      );

      if (!user) {
        return res.status(500).json({
          message:
            "Student login account was not found.",
        });
      }

      const {
        parentId,
        roleNumber,
        fullName,
        dateOfBirth,
        gender,
        status,
      } = req.body;

      // Update parent.
      if (parentId !== undefined) {
        const parent = await Parent.findOne({
          _id: parentId,
          schoolId: student.schoolId,
          status: "ACTIVE",
        });

        if (!parent) {
          return res.status(400).json({
            message:
              "Parent must be active and belong to this school.",
          });
        }

        student.parentId = parent._id;
      }

      // Update role number.
      if (roleNumber !== undefined) {
        const newRoleNumber =
          roleNumber.trim();

        if (!newRoleNumber) {
          return res.status(400).json({
            message:
              "roleNumber cannot be empty.",
          });
        }

        if (
          newRoleNumber !==
          student.roleNumber
        ) {
          const existingStudent =
            await Student.exists({
              schoolId: student.schoolId,
              roleNumber: newRoleNumber,
              _id: {
                $ne: student._id,
              },
            });

          const existingUser =
            await User.exists({
              schoolId: student.schoolId,
              username: newRoleNumber,
              _id: {
                $ne: user._id,
              },
            });

          if (
            existingStudent ||
            existingUser
          ) {
            return res.status(409).json({
              message:
                "That role number is already used.",
            });
          }

          student.roleNumber =
            newRoleNumber;

          user.username =
            newRoleNumber;
        }
      }

      // Update name.
      if (fullName !== undefined) {
        if (!fullName.trim()) {
          return res.status(400).json({
            message:
              "Full name cannot be empty.",
          });
        }

        student.fullName =
          fullName.trim();

        user.name =
          fullName.trim();
      }

      // Update date of birth.
      if (dateOfBirth !== undefined) {
        student.dateOfBirth =
          dateOfBirth || null;
      }

      // Update gender.
      if (gender !== undefined) {
        student.gender =
          gender || undefined;
      }

      // Update status.
      if (status !== undefined) {
        if (!studentStatuses.includes(status)) {
          return res.status(400).json({
            message:
              "Invalid student status.",
          });
        }

        student.status = status;

        user.status =
          status === "ACTIVE"
            ? "ACTIVE"
            : "INACTIVE";

        // Graduated or transferred students
        // should no longer have active enrollments.
        if (
          status === "GRADUATED" ||
          status === "TRANSFERRED"
        ) {
          await StudentEnrollment.updateMany(
            {
              schoolId: student.schoolId,
              studentId: student._id,
              status: "ACTIVE",
            },
            {
              $set: {
                status,
              },
            }
          );
        }
      }

      await user.save();
      await student.save();

      const [studentWithHistory] =
        await addEnrollmentHistory([
          student,
        ]);

      return res.json({
        message:
          "Student updated successfully.",

        student: studentWithHistory,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to update student.",
      });
    }
  }
);


// ============================================================
// RESET STUDENT PASSWORD
// PUT /api/students/:id/reset-password
// ============================================================

router.put(
  "/:id/reset-password",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      if (
        !req.body.newPassword ||
        req.body.newPassword.length < 8
      ) {
        return res.status(400).json({
          message:
            "New password must contain at least 8 characters.",
        });
      }

      const student = await Student.findOne({
        _id: req.params.id,

        ...(req.user.role === "SUPER_ADMIN"
          ? {}
          : {
              schoolId: req.schoolId,
            }),
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      const user = await User.findById(
        student.userId
      );

      if (!user) {
        return res.status(404).json({
          message:
            "Student account not found.",
        });
      }

      user.password = await bcrypt.hash(
        req.body.newPassword,
        10
      );

      user.mustChangePassword = true;

      await user.save();

      return res.json({
        message:
          "Student password reset successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to reset student password.",
      });
    }
  }
);


// ============================================================
// TRANSFER STUDENT
// DELETE /api/students/:id
//
// This does NOT really delete the student.
// It changes the student to TRANSFERRED.
// ============================================================

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const student = await Student.findOne({
        _id: req.params.id,

        ...(req.user.role === "SUPER_ADMIN"
          ? {}
          : {
              schoolId: req.schoolId,
            }),
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      // Transfer student.
      student.status = "TRANSFERRED";

      await student.save();

      // Disable login account.
      await User.findByIdAndUpdate(
        student.userId,
        {
          status: "INACTIVE",
        }
      );

      // Close active enrollments.
      await StudentEnrollment.updateMany(
        {
          schoolId: student.schoolId,
          studentId: student._id,
          status: "ACTIVE",
        },
        {
          $set: {
            status: "TRANSFERRED",
          },
        }
      );

      return res.json({
        message:
          "Student transferred and account deactivated.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to transfer student.",
      });
    }
  }
);


export default router;