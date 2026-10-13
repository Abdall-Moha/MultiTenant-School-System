import express from "express";

import Class from "../models/Class.js";
import AcademicYear from "../models/AcademicYear.js";
import Teacher from "../models/Teacher.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Attendance from "../models/Attendence.js";
import SubjectExam from "../models/SubjectExam.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// Add academic year information when returning a class
const populateClass = (query) => {
  return query.populate(
    "academicYearId",
    "name startDate endDate isCurrent"
  );
};

// ========================================
// CREATE CLASS
// POST /api/classes
// ========================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        name,
        academicYearId,
        numberOfPeriods,
        status,
      } = req.body;

      // SUPER_ADMIN sends schoolId in the request.
      // ADMIN gets schoolId from the logged-in user.
      let schoolId;

      if (req.user.role === "SUPER_ADMIN") {
        schoolId = req.body.schoolId;
      } else {
        schoolId = req.schoolId;
      }

      // Check required information
      if (!schoolId) {
        return res.status(400).json({
          message: "School is required.",
        });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({
          message: "Class name is required.",
        });
      }

      if (!academicYearId) {
        return res.status(400).json({
          message: "Academic year is required.",
        });
      }

      const periods = Number(numberOfPeriods);

      if (!Number.isInteger(periods) || periods < 1 || periods > 12) {
        return res.status(400).json({
          message: "Period count must be between 1 and 12.",
        });
      }

      // Make sure the academic year belongs to this school
      const academicYear = await AcademicYear.findOne({
        _id: academicYearId,
        schoolId,
      });

      if (!academicYear) {
        return res.status(400).json({
          message: "Academic year does not belong to this school.",
        });
      }

      // Create the class
      const classData = await Class.create({
        schoolId,
        name: name.trim(),
        academicYearId,
        numberOfPeriods: periods,
        status: status || "ACTIVE",
        createdBy: req.user.userId,
      });

      // Get the newly created class with academic year information
      const createdClass = await populateClass(
        Class.findById(classData._id)
      );

      return res.status(201).json({
        message: "Class created successfully.",
        class: createdClass,
      });
    } catch (error) {
      // Duplicate class for the same school and academic year
      if (error.code === 11000) {
        return res.status(409).json({
          message: "This class already exists for that academic year.",
        });
      }

      console.error(error);

      return res.status(500).json({
        message: "Failed to create class.",
      });
    }
  }
);

// ========================================
// GET ALL CLASSES
// GET /api/classes
// ========================================

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      // Pagination
      const page = Math.max(Number(req.query.page) || 1, 1);

      const limit = Math.min(
        Math.max(Number(req.query.limit) || 20, 1),
        100
      );

      const filter = {};

      // SUPER_ADMIN can optionally choose a school.
      // ADMIN and TEACHER can only access their own school.
      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          filter.schoolId = req.query.schoolId;
        }
      } else {
        filter.schoolId = req.schoolId;
      }

      // Optional academic year filter
      if (req.query.academicYearId) {
        filter.academicYearId = req.query.academicYearId;
      }

      // TEACHER can only see classes assigned to them
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (teacher) {
          const classIds = await TeacherAssignment.distinct(
            "classId",
            {
              teacherId: teacher._id,
              schoolId: req.schoolId,
            }
          );

          filter._id = {
            $in: classIds,
          };
        } else {
          // Teacher profile does not exist,
          // so the teacher should see no classes.
          filter._id = {
            $in: [],
          };
        }
      }

      // Get classes and total count
      const classes = await populateClass(
        Class.find(filter)
          .sort({ name: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
      );

      const total = await Class.countDocuments(filter);

      return res.json({
        classes,
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
        message: "Failed to get classes.",
      });
    }
  }
);

// ========================================
// GET ONE CLASS
// GET /api/classes/:id
// ========================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const filter = {
        _id: req.params.id,
      };

      // SUPER_ADMIN can access any school.
      // Other users can only access their school.
      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      // Teacher can only access an assigned class
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (teacher) {
          const assigned = await TeacherAssignment.exists({
            teacherId: teacher._id,
            classId: req.params.id,
            schoolId: req.schoolId,
          });

          if (!assigned) {
            return res.status(403).json({
              message: "You are not assigned to this class.",
            });
          }
        } else {
          return res.status(403).json({
            message: "You are not assigned to this class.",
          });
        }
      }

      const classData = await populateClass(
        Class.findOne(filter)
      );

      if (!classData) {
        return res.status(404).json({
          message: "Class not found.",
        });
      }

      return res.json({
        class: classData,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get class.",
      });
    }
  }
);

// ========================================
// UPDATE CLASS
// PUT /api/classes/:id
// ========================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const filter = {
        _id: req.params.id,
      };

      // ADMIN can only update classes in their school.
      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const classData = await Class.findOne(filter);

      if (!classData) {
        return res.status(404).json({
          message: "Class not found.",
        });
      }

      // Keep old value if the field was not sent
      let name = classData.name;

      if (req.body.name !== undefined) {
        name = req.body.name.trim();
      }

      let academicYearId = classData.academicYearId;

      if (req.body.academicYearId !== undefined) {
        academicYearId = req.body.academicYearId;
      }

      let numberOfPeriods = classData.numberOfPeriods;

      if (req.body.numberOfPeriods !== undefined) {
        numberOfPeriods = Number(req.body.numberOfPeriods);
      }

      // Validate class name
      if (!name) {
        return res.status(400).json({
          message: "Class name is required.",
        });
      }

      // Validate number of periods
      if (
        !Number.isInteger(numberOfPeriods) ||
        numberOfPeriods < 1 ||
        numberOfPeriods > 12
      ) {
        return res.status(400).json({
          message: "Period count must be between 1 and 12.",
        });
      }

      // We cannot reduce the number of periods
      // below a period that already has attendance records.
      if (numberOfPeriods < classData.numberOfPeriods) {
        const attendanceExists = await Attendance.exists({
          schoolId: classData.schoolId,
          classId: classData._id,
          periodNumber: {
            $gt: numberOfPeriods,
          },
        });

        if (attendanceExists) {
          return res.status(409).json({
            message:
              "The period count cannot be reduced below a period already recorded in attendance history.",
          });
        }
      }

      // Make sure the new academic year belongs to
      // the same school as the class.
      const academicYearExists = await AcademicYear.exists({
        _id: academicYearId,
        schoolId: classData.schoolId,
      });

      if (!academicYearExists) {
        return res.status(400).json({
          message:
            "Academic year does not belong to this school.",
        });
      }

      // Check if the academic year was changed
      const academicYearChanged =
        String(academicYearId) !==
        String(classData.academicYearId);

      if (academicYearChanged) {
        // A class with historical records cannot be moved
        // to another academic year.
        const enrollmentExists = await StudentEnrollment.exists({
          schoolId: classData.schoolId,
          classId: classData._id,
        });

        const assignmentExists = await TeacherAssignment.exists({
          schoolId: classData.schoolId,
          classId: classData._id,
        });

        const attendanceExists = await Attendance.exists({
          schoolId: classData.schoolId,
          classId: classData._id,
        });

        const examExists = await SubjectExam.exists({
          schoolId: classData.schoolId,
          classId: classData._id,
        });

        if (
          enrollmentExists ||
          assignmentExists ||
          attendanceExists ||
          examExists
        ) {
          return res.status(409).json({
            message:
              "This class has historical records and cannot be moved to another academic year.",
          });
        }
      }

      // Update the class
      classData.name = name;
      classData.academicYearId = academicYearId;
      classData.numberOfPeriods = numberOfPeriods;

      if (req.body.status !== undefined) {
        classData.status = req.body.status;
      }

      await classData.save();

      const updatedClass = await populateClass(
        Class.findById(classData._id)
      );

      return res.json({
        message: "Class updated successfully.",
        class: updatedClass,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "This class already exists for that academic year.",
        });
      }

      console.error(error);

      return res.status(500).json({
        message: "Failed to update class.",
      });
    }
  }
);

// ========================================
// DELETE CLASS
// DELETE /api/classes/:id
// ========================================

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const filter = {
        _id: req.params.id,
      };

      // ADMIN can only delete classes in their school.
      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const classData = await Class.findOne(filter);

      if (!classData) {
        return res.status(404).json({
          message: "Class not found.",
        });
      }

      // Check if this class is already being used
      const enrollmentExists = await StudentEnrollment.exists({
        schoolId: classData.schoolId,
        classId: classData._id,
      });

      const assignmentExists = await TeacherAssignment.exists({
        schoolId: classData.schoolId,
        classId: classData._id,
      });

      const attendanceExists = await Attendance.exists({
        schoolId: classData.schoolId,
        classId: classData._id,
      });

      const examExists = await SubjectExam.exists({
        schoolId: classData.schoolId,
        classId: classData._id,
      });

      // Do not delete a class that has historical records.
      if (
        enrollmentExists ||
        assignmentExists ||
        attendanceExists ||
        examExists
      ) {
        return res.status(409).json({
          message:
            "This class has historical records and cannot be deleted.",
        });
      }

      await classData.deleteOne();

      return res.json({
        message: "Class deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to delete class.",
      });
    }
  }
);

export default router;