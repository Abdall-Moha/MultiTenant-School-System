import express from "express";
import mongoose from "mongoose";

import AcademicYear from "../models/AcademicYear.js";
import Class from "../models/Class.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Attendance from "../models/Attendence.js";
import SubjectExam from "../models/SubjectExam.js";
import School from "../models/School.js";
import Parent from "../models/Parent.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

const roles = [
  "SUPER_ADMIN",
  "ADMIN",
  "TEACHER",
  "PARENT",
  "STUDENT",
];


// ============================================================
// SCHOOL FILTER
// ============================================================

function getSchoolFilter(req, query = {}) {
  const filter = {};

  if (req.user.role === "SUPER_ADMIN") {
    if (
      query.schoolId &&
      mongoose.Types.ObjectId.isValid(query.schoolId)
    ) {
      filter.schoolId = query.schoolId;
    }
  } else {
    filter.schoolId = req.schoolId;
  }

  return filter;
}


// ============================================================
// GET ALL ACADEMIC YEARS
// GET /api/academic-years
// ============================================================

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(...roles),
  async (req, res) => {
    try {
      const filter = getSchoolFilter(
        req,
        req.query
      );

      // Teacher can only see academic years
      // where the teacher has an assignment.
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!teacher) {
          filter._id = {
            $in: [],
          };
        } else {
          const academicYearIds =
            await TeacherAssignment.distinct(
              "academicYearId",
              {
                schoolId: req.schoolId,
                teacherId: teacher._id,
              }
            );

          filter._id = {
            $in: academicYearIds,
          };
        }
      }

      // Student can only see academic years
      // in which the student has enrollment.
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!student) {
          filter._id = {
            $in: [],
          };
        } else {
          const academicYearIds =
            await StudentEnrollment.distinct(
              "academicYearId",
              {
                schoolId: req.schoolId,
                studentId: student._id,
              }
            );

          filter._id = {
            $in: academicYearIds,
          };
        }
      }

      // Parent can only see academic years
      // where at least one of their children
      // has an enrollment.
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!parent) {
          filter._id = {
            $in: [],
          };
        } else {
          const children =
            await Student.distinct(
              "_id",
              {
                parentId: parent._id,
                schoolId: req.schoolId,
              }
            );

          if (children.length === 0) {
            filter._id = {
              $in: [],
            };
          } else {
            const academicYearIds =
              await StudentEnrollment.distinct(
                "academicYearId",
                {
                  schoolId: req.schoolId,
                  studentId: {
                    $in: children,
                  },
                }
              );

            filter._id = {
              $in: academicYearIds,
            };
          }
        }
      }

      const academicYears =
        await AcademicYear.find(filter).sort({
          startDate: -1,
        });

      return res.json({
        academicYears,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to get academic years.",
      });
    }
  }
);


// ============================================================
// GET ONE ACADEMIC YEAR
// GET /api/academic-years/:id
// ============================================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(...roles),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid academic year ID.",
        });
      }

      const filter = {
        _id: req.params.id,
        ...getSchoolFilter(req),
      };

      const academicYear =
        await AcademicYear.findOne(filter);

      if (!academicYear) {
        return res.status(404).json({
          message:
            "Academic year not found.",
        });
      }

      // Teacher access.
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!teacher) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }

        const assignment =
          await TeacherAssignment.exists({
            teacherId: teacher._id,
            academicYearId:
              academicYear._id,
            schoolId: req.schoolId,
          });

        if (!assignment) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }
      }

      // Student access.
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!student) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }

        const enrollment =
          await StudentEnrollment.exists({
            studentId: student._id,
            academicYearId:
              academicYear._id,
            schoolId: req.schoolId,
          });

        if (!enrollment) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }
      }

      // Parent access.
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!parent) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }

        const children =
          await Student.distinct("_id", {
            parentId: parent._id,
            schoolId: req.schoolId,
          });

        if (children.length === 0) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }

        const enrollment =
          await StudentEnrollment.exists({
            studentId: {
              $in: children,
            },
            academicYearId:
              academicYear._id,
            schoolId: req.schoolId,
          });

        if (!enrollment) {
          return res.status(403).json({
            message:
              "You do not have access to this academic year.",
          });
        }
      }

      return res.json({
        academicYear,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to get academic year.",
      });
    }
  }
);


// ============================================================
// CREATE ACADEMIC YEAR
// POST /api/academic-years
//
// ADMIN → own school
// SUPER_ADMIN → can choose school
// ============================================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        name,
        startDate,
        endDate,
        isCurrent,
      } = req.body;

      let schoolId;

      if (req.user.role === "SUPER_ADMIN") {
        schoolId = req.body.schoolId;
      } else {
        schoolId = req.schoolId;
      }

      if (
        !schoolId ||
        !mongoose.Types.ObjectId.isValid(
          schoolId
        )
      ) {
        return res.status(400).json({
          message:
            "A valid schoolId is required.",
        });
      }

      // Required fields.
      if (
        !name?.trim() ||
        !startDate ||
        !endDate
      ) {
        return res.status(400).json({
          message:
            "Provide a name, start date and end date.",
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return res.status(400).json({
          message:
            "Invalid start date or end date.",
        });
      }

      if (end <= start) {
        return res.status(400).json({
          message:
            "End date must be after start date.",
        });
      }

      // Check school.
      const school = await School.findById(
        schoolId
      ).select("_id status");

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status !== "ACTIVE") {
        return res.status(400).json({
          message:
            "Cannot create an academic year for a suspended school.",
        });
      }

      // Prevent overlapping academic years.
      const overlappingYear =
        await AcademicYear.findOne({
          schoolId,

          startDate: {
            $lt: end,
          },

          endDate: {
            $gt: start,
          },
        });

      if (overlappingYear) {
        return res.status(409).json({
          message:
            "This academic year overlaps with another academic year.",
        });
      }

      // Create year as not current first.
      const academicYear =
        await AcademicYear.create({
          schoolId,
          name: name.trim(),
          startDate,
          endDate,
          isCurrent: false,
          createdBy: req.user.userId,
        });

      // If this should be current,
      // make all other years not current.
      if (isCurrent === true) {
        await AcademicYear.updateMany(
          {
            schoolId,
            _id: {
              $ne: academicYear._id,
            },
            isCurrent: true,
          },
          {
            $set: {
              isCurrent: false,
            },
          }
        );

        academicYear.isCurrent = true;

        await academicYear.save();
      }

      return res.status(201).json({
        academicYear,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "That academic year already exists for this school.",
        });
      }

      console.error(error);

      return res.status(500).json({
        message:
          "Failed to create academic year.",
      });
    }
  }
);


// ============================================================
// UPDATE ACADEMIC YEAR
// PUT /api/academic-years/:id
// ============================================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid academic year ID.",
        });
      }

      const filter = {
        _id: req.params.id,
        ...getSchoolFilter(req),
      };

      const academicYear =
        await AcademicYear.findOne(filter);

      if (!academicYear) {
        return res.status(404).json({
          message:
            "Academic year not found.",
        });
      }

      // Keep old values when fields are
      // not included in the request.
      let name = academicYear.name;
      let startDate =
        academicYear.startDate;
      let endDate =
        academicYear.endDate;

      if (req.body.name !== undefined) {
        name = req.body.name.trim();
      }

      if (req.body.startDate !== undefined) {
        startDate = req.body.startDate;
      }

      if (req.body.endDate !== undefined) {
        endDate = req.body.endDate;
      }

      if (!name) {
        return res.status(400).json({
          message:
            "Academic year name cannot be empty.",
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return res.status(400).json({
          message:
            "Invalid start date or end date.",
        });
      }

      if (end <= start) {
        return res.status(400).json({
          message:
            "End date must be after start date.",
        });
      }

      // Check overlap with another year.
      const overlappingYear =
        await AcademicYear.findOne({
          schoolId:
            academicYear.schoolId,

          _id: {
            $ne: academicYear._id,
          },

          startDate: {
            $lt: end,
          },

          endDate: {
            $gt: start,
          },
        });

      if (overlappingYear) {
        return res.status(409).json({
          message:
            "This academic year overlaps with another academic year.",
        });
      }

      academicYear.name = name;
      academicYear.startDate = start;
      academicYear.endDate = end;

      // If isCurrent was supplied,
      // temporarily make this year false.
      if (
        req.body.isCurrent !== undefined
      ) {
        academicYear.isCurrent = false;
      }

      await academicYear.save();

      // If requested to become current,
      // unset all other current years.
      if (req.body.isCurrent === true) {
        await AcademicYear.updateMany(
          {
            schoolId:
              academicYear.schoolId,

            _id: {
              $ne: academicYear._id,
            },

            isCurrent: true,
          },
          {
            $set: {
              isCurrent: false,
            },
          }
        );

        academicYear.isCurrent = true;

        await academicYear.save();
      }

      return res.json({
        academicYear,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "That academic year already exists for this school.",
        });
      }

      console.error(error);

      return res.status(500).json({
        message:
          "Failed to update academic year.",
      });
    }
  }
);


// ============================================================
// DELETE ACADEMIC YEAR
// DELETE /api/academic-years/:id
//
// Academic year cannot be deleted if it has
// historical records.
// ============================================================

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid academic year ID.",
        });
      }

      const academicYear =
        await AcademicYear.findOne({
          _id: req.params.id,
          ...getSchoolFilter(req),
        });

      if (!academicYear) {
        return res.status(404).json({
          message:
            "Academic year not found.",
        });
      }

      // Find classes belonging to this year.
      const classIds =
        await Class.distinct("_id", {
          schoolId:
            academicYear.schoolId,

          academicYearId:
            academicYear._id,
        });

      const [
        hasEnrollments,
        hasAssignments,
        hasAttendance,
        hasExams,
      ] = await Promise.all([
        StudentEnrollment.exists({
          schoolId:
            academicYear.schoolId,

          academicYearId:
            academicYear._id,
        }),

        TeacherAssignment.exists({
          schoolId:
            academicYear.schoolId,

          academicYearId:
            academicYear._id,
        }),

        Attendance.exists({
          schoolId:
            academicYear.schoolId,

          academicYearId:
            academicYear._id,
        }),

        SubjectExam.exists({
          schoolId:
            academicYear.schoolId,

          classId: {
            $in: classIds,
          },
        }),
      ]);

      if (
        classIds.length > 0 ||
        hasEnrollments ||
        hasAssignments ||
        hasAttendance ||
        hasExams
      ) {
        return res.status(409).json({
          message:
            "This academic year has historical records and cannot be deleted.",
        });
      }

      await academicYear.deleteOne();

      return res.json({
        message:
          "Academic year deleted.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to delete academic year.",
      });
    }
  }
);


export default router;