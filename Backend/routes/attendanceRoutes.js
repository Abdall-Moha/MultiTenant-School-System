import express from "express";
import mongoose from "mongoose";

import Attendance from "../models/Attendence.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Class from "../models/Class.js";
import AcademicYear from "../models/AcademicYear.js";
import Teacher from "../models/Teacher.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Parent from "../models/Parent.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

const attendanceStatuses = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
];

// Attendance days follow the school's local calendar rather than UTC.
function getSchoolToday() {
  const timeZone = process.env.TZ || "Africa/Mogadishu";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}


// ============================================================
// POPULATE ATTENDANCE
// ============================================================

function populateAttendance(query) {
  return query
    .populate(
      "studentId",
      "roleNumber fullName status"
    )
    .populate(
      "classId",
      "name academicYearId numberOfPeriods"
    )
    .populate(
      "academicYearId",
      "name"
    )
    .populate(
      "recordedBy",
      "name role"
    );
}


// ============================================================
// GET ONE FULL DAY RANGE
// Example:
// 2026-10-05
// becomes:
// 2026-10-05 00:00 → 2026-10-06 00:00
// ============================================================

function getDayRange(date) {
  const start = new Date(
    `${date}T00:00:00.000Z`
  );

  const end = new Date(start);

  end.setUTCDate(
    end.getUTCDate() + 1
  );

  return {
    $gte: start,
    $lt: end,
  };
}


// ============================================================
// CHECK DATE FORMAT
// ============================================================

function isValidDate(date) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return false;
  }

  const parsed = new Date(
    `${date}T00:00:00.000Z`
  );

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    parsed.toISOString().slice(0, 10) ===
    date
  );
}


// ============================================================
// CHECK WHETHER DATE IS INSIDE ACADEMIC YEAR
// ============================================================

function dateBelongsToYear(date, year) {
  if (!isValidDate(date)) {
    return false;
  }
  const startDate = year.startDate.toISOString().slice(0, 10);
  const endDate = year.endDate.toISOString().slice(0, 10);
  return date >= startDate && date <= endDate;
}


// ============================================================
// CHECK TEACHER ASSIGNMENT
// ============================================================

async function isTeacherAssigned(
  userId,
  schoolId,
  classId,
  academicYearId
) {
  const teacher = await Teacher.findOne({
    userId,
    schoolId,
    status: "ACTIVE",
  });

  if (!teacher) {
    return false;
  }

  const assignment =
    await TeacherAssignment.exists({
      schoolId,
      teacherId: teacher._id,
      classId,
      academicYearId,
    });

  return Boolean(assignment);
}


// ============================================================
// FIND ACADEMIC YEAR FOR A DATE
// ============================================================

async function getYearForDate(
  schoolId,
  date,
  academicYearId
) {
  // If academic year was directly provided,
  // use it.
  if (academicYearId) {
    return AcademicYear.findOne({
      _id: academicYearId,
      schoolId,
    });
  }

  // Otherwise find the academic year
  // whose dates contain the selected date.
  if (date) {
    const day = new Date(
      `${date}T00:00:00.000Z`
    );

    return AcademicYear.findOne({
      schoolId,
      startDate: {
        $lte: day,
      },
      endDate: {
        $gte: day,
      },
    });
  }

  // If no date was provided,
  // use the current academic year.
  return AcademicYear.findOne({
    schoolId,
    isCurrent: true,
  });
}


// ============================================================
// GET STUDENTS FOR ONE CLASS + ONE PERIOD
//
// If a student has no Attendance record yet,
// the returned status is NOT_RECORDED.
// ============================================================

async function getPeriodRows({
  schoolId,
  academicYear,
  classData,
  date,
  periodNumber,
  studentFilter = {},
}) {
  const enrollments =
    await StudentEnrollment.find({
      schoolId,
      academicYearId:
        academicYear._id,
      classId: classData._id,
      status: "ACTIVE",
    }).populate({
      path: "studentId",
      match: studentFilter,
      select:
        "roleNumber fullName status",
    });

  const students = enrollments
    .map(
      (enrollment) =>
        enrollment.studentId
    )
    .filter(Boolean);

  const attendanceRecords =
    await Attendance.find({
      schoolId,
      academicYearId:
        academicYear._id,
      classId: classData._id,
      date: getDayRange(date),
      periodNumber,
    });

  // Put attendance records into a Map.
  // Student ID becomes the key.
  const attendanceMap = new Map();

  for (const record of attendanceRecords) {
    attendanceMap.set(
      String(record.studentId),
      record
    );
  }

  const result = [];

  for (const student of students) {
    const record =
      attendanceMap.get(
        String(student._id)
      );

    result.push({
      student,

      attendance: record
        ? {
            _id: record._id,
            status: record.status,
          }
        : null,

      status:
        record?.status ||
        "NOT_RECORDED",
    });
  }

  return result;
}


// ============================================================
// CREATE ATTENDANCE
// POST /api/attendance
// ============================================================

router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER"
  ),
  async (req, res) => {
    try {
      const {
        academicYearId,
        classId,
        date,
        periodNumber,
        attendance: rows,
      } = req.body;

      // Super Admin can get school from the class
      // if schoolId was not directly provided.
      let selectedClass = null;

      if (
        req.user.role === "SUPER_ADMIN" &&
        classId
      ) {
        selectedClass =
          await Class.findById(
            classId
          ).select("schoolId");
      }

      let schoolId;

      if (
        req.user.role === "SUPER_ADMIN"
      ) {
        schoolId =
          req.body.schoolId ||
          selectedClass?.schoolId;
      } else {
        schoolId = req.schoolId;
      }

      // Required fields.
      if (
        !schoolId ||
        !academicYearId ||
        !classId ||
        !date ||
        !Array.isArray(rows) ||
        rows.length === 0
      ) {
        return res.status(400).json({
          message:
            "Provide academicYearId, classId, date and at least one attendance row.",
        });
      }

      // Validate ObjectIds.
      if (
        !mongoose.Types.ObjectId.isValid(
          academicYearId
        ) ||
        !mongoose.Types.ObjectId.isValid(
          classId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid academic year or class ID.",
        });
      }

      // Validate date.
      if (!isValidDate(date)) {
        return res.status(400).json({
          message:
            "date must use YYYY-MM-DD format.",
        });
      }

      if (req.user.role === "TEACHER" && date !== getSchoolToday()) {
        return res.status(403).json({ message: "Teachers can only record attendance for today." });
      }

      // Validate period.
      const period = Number(
        periodNumber
      );

      if (
        !Number.isInteger(period) ||
        period < 1
      ) {
        return res.status(400).json({
          message:
            "periodNumber must be a positive integer.",
        });
      }

      // Get academic year and class.
      const [academicYear, classData] =
        await Promise.all([
          AcademicYear.findOne({
            _id: academicYearId,
            schoolId,
          }),

          Class.findOne({
            _id: classId,
            schoolId,
            academicYearId,
          }),
        ]);

      if (!academicYear || !classData) {
        return res.status(400).json({
          message:
            "Academic year and class must belong to the same school, and class must use the selected year.",
        });
      }

      if (req.user.role === "TEACHER" && !academicYear.isCurrent) {
        return res.status(403).json({
          message: "Teachers can only record attendance in the current academic year.",
        });
      }

      // Date must belong to the selected year.
      if (
        !dateBelongsToYear(
          date,
          academicYear
        )
      ) {
        return res.status(400).json({
          message:
            "The attendance date must fall within the selected academic year.",
        });
      }

      // A class cannot have attendance
      // for a period it does not have.
      if (
        period >
        classData.numberOfPeriods
      ) {
        return res.status(400).json({
          message: `This class has only ${classData.numberOfPeriods} periods.`,
        });
      }

      // Teacher can only record attendance
      // for assigned class + academic year.
      if (
        req.user.role === "TEACHER"
      ) {
        const assigned =
          await isTeacherAssigned(
            req.user.userId,
            schoolId,
            classId,
            academicYearId
          );

        if (!assigned) {
          return res.status(403).json({
            message:
              "You are not assigned to this class and academic year.",
          });
        }
      }

      // Get all student IDs from submitted rows.
      const studentIds = rows.map(
        (row) => String(row.studentId)
      );

      // Each student can appear only once.
      const uniqueStudentIds =
        new Set(studentIds);

      if (
        studentIds.some(
          (id) =>
            !mongoose.Types.ObjectId.isValid(
              id
            )
        ) ||
        uniqueStudentIds.size !==
          studentIds.length ||
        rows.some(
          (row) =>
            !attendanceStatuses.includes(
              row.status
            )
        )
      ) {
        return res.status(400).json({
          message:
            "Each student must appear once with a valid attendance status.",
        });
      }

      // Make sure every student is actively
      // enrolled in this class/year.
      const enrolledStudentIds =
        await StudentEnrollment.distinct(
          "studentId",
          {
            schoolId,
            academicYearId,
            classId,
            status: "ACTIVE",
            studentId: {
              $in: studentIds,
            },
          }
        );

      if (
        enrolledStudentIds.length !==
        studentIds.length
      ) {
        return res.status(400).json({
          message:
            "Every student must have an active enrollment in this class and academic year.",
        });
      }

      // Do not create attendance twice
      // for the same student/period/date.
      const existing =
        await Attendance.exists({
          schoolId,
          academicYearId,
          classId,
          date: getDayRange(date),
          periodNumber: period,
          studentId: {
            $in: studentIds,
          },
        });

      if (existing) {
        return res.status(409).json({
          message:
            "Attendance for one or more students in this period has already been recorded.",
        });
      }

      // Create attendance documents.
      const records = rows.map(
        (row) => ({
          schoolId,
          studentId: row.studentId,
          classId,
          academicYearId,

          date: new Date(
            `${date}T00:00:00.000Z`
          ),

          periodNumber: period,
          status: row.status,
          recordedBy: req.user.userId,
        })
      );

      await Attendance.insertMany(
        records,
        {
          ordered: true,
        }
      );

      // Get the newly saved attendance.
      const savedAttendance =
        await populateAttendance(
          Attendance.find({
            schoolId,
            classId,
            academicYearId,
            date: getDayRange(date),
            periodNumber: period,
          }).sort({
            createdAt: 1,
          })
        );

      return res.status(201).json({
        message:
          "Attendance recorded successfully.",

        attendance: savedAttendance,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "Attendance for one or more students in this period has already been recorded.",
        });
      }

      console.error(error);

      return res.status(500).json({
        message:
          "Failed to record attendance.",
      });
    }
  }
);


// ============================================================
// PERIOD SUMMARY
// GET /api/attendance/period-summary
//
// Shows which periods have already been recorded.
// ============================================================

router.get(
  "/period-summary",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER"
  ),
  async (req, res) => {
    try {
      const {
        academicYearId,
        classId,
        date,
      } = req.query;

      let selectedClass = null;

      if (
        req.user.role === "SUPER_ADMIN" &&
        classId
      ) {
        selectedClass =
          await Class.findById(
            classId
          ).select("schoolId");
      }

      let schoolId;

      if (
        req.user.role === "SUPER_ADMIN"
      ) {
        schoolId =
          req.query.schoolId ||
          selectedClass?.schoolId;
      } else {
        schoolId = req.schoolId;
      }

      if (
        !schoolId ||
        !academicYearId ||
        !classId ||
        !date
      ) {
        return res.status(400).json({
          message:
            "academicYearId, classId and date are required.",
        });
      }

      if (!isValidDate(date)) {
        return res.status(400).json({
          message:
            "date must use YYYY-MM-DD format.",
        });
      }

      if (req.user.role === "TEACHER" && date !== getSchoolToday()) {
        return res.status(403).json({ message: "Teachers can only view today's attendance." });
      }

      const [academicYear, classData] =
        await Promise.all([
          AcademicYear.findOne({
            _id: academicYearId,
            schoolId,
          }),

          Class.findOne({
            _id: classId,
            schoolId,
            academicYearId,
          }),
        ]);

      if (!academicYear || !classData) {
        return res.status(404).json({
          message:
            "Class or academic year not found.",
        });
      }

      if (req.user.role === "TEACHER" && !academicYear.isCurrent) {
        return res.status(403).json({
          message: "Teachers can only use the current academic year.",
        });
      }

      if (
        String(academicYear.schoolId) !==
        String(classData.schoolId)
      ) {
        return res.status(404).json({
          message:
            "Class or academic year not found.",
        });
      }

      if (
        !dateBelongsToYear(
          date,
          academicYear
        )
      ) {
        return res.status(400).json({
          message:
            "The attendance date must fall within the selected academic year.",
        });
      }

      // Teacher assignment check.
      if (
        req.user.role === "TEACHER"
      ) {
        const assigned =
          await isTeacherAssigned(
            req.user.userId,
            schoolId,
            classId,
            academicYearId
          );

        if (!assigned) {
          return res.status(403).json({
            message:
              "You are not assigned to this class and academic year.",
          });
        }
      }

      // Find periods that already have records.
      const recordedPeriods =
        await Attendance.distinct(
          "periodNumber",
          {
            schoolId,
            academicYearId,
            classId,
            date: getDayRange(date),
          }
        );

      const recordedSet =
        new Set(recordedPeriods);

      const periods = [];

      for (
        let i = 1;
        i <= classData.numberOfPeriods;
        i++
      ) {
        periods.push({
          periodNumber: i,
          recorded:
            recordedSet.has(i),
        });
      }

      return res.json({
        classId,
        academicYearId,
        date,

        numberOfPeriods:
          classData.numberOfPeriods,

        periods,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to get period summary.",
      });
    }
  }
);


// ============================================================
// GET ATTENDANCE
// GET /api/attendance
//
// Admin/Teacher:
//   Can get attendance records.
//
// Parent:
//   Can see only own children.
//
// Student:
//   Can see only himself.
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
      const {
        academicYearId,
        classId,
        date,
        periodNumber,
      } = req.query;

      if (req.user.role === "TEACHER" && date && date !== getSchoolToday()) {
        return res.status(403).json({ message: "Teachers can only view today's attendance." });
      }

      if (req.user.role === "TEACHER" && academicYearId) {
        const academicYear = await AcademicYear.findOne({
          _id: academicYearId,
          schoolId: req.schoolId,
        });
        if (!academicYear || !academicYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only view attendance in the current academic year.",
          });
        }
      }

      // ======================================================
      // PARENT / STUDENT VIEW
      // ======================================================

      if (
        req.user.role === "PARENT" ||
        req.user.role === "STUDENT"
      ) {
        if (!date) {
          return res.status(400).json({
            message: "date is required.",
          });
        }

        if (!isValidDate(date)) {
          return res.status(400).json({
            message:
              "date must use YYYY-MM-DD format.",
          });
        }

        let student;

        // ----------------------------------------------------
        // STUDENT
        // ----------------------------------------------------

        if (
          req.user.role === "STUDENT"
        ) {
          student =
            await Student.findOne({
              userId: req.user.userId,
              schoolId: req.schoolId,
            });

          if (!student) {
            return res.status(404).json({
              message:
                "Student profile not found.",
            });
          }

          // Student cannot request another student's ID.
          if (
            req.query.studentId &&
            String(
              req.query.studentId
            ) !== String(student._id)
          ) {
            return res.status(403).json({
              message:
                "You can only view your own attendance.",
            });
          }
        }

        // ----------------------------------------------------
        // PARENT
        // ----------------------------------------------------

        else {
          const parent =
            await Parent.findOne({
              userId: req.user.userId,
              schoolId: req.schoolId,
            });

          if (!parent) {
            return res.status(404).json({
              message:
                "Parent profile not found.",
            });
          }

          if (!req.query.studentId) {
            return res.status(400).json({
              message:
                "studentId is required.",
            });
          }

          student =
            await Student.findOne({
              _id: req.query.studentId,
              parentId: parent._id,
              schoolId: req.schoolId,
            });

          if (!student) {
            return res.status(403).json({
              message:
                "You can only view attendance for your own children.",
            });
          }
        }

        // Find academic year.
        const academicYear =
          await getYearForDate(
            req.schoolId,
            date,
            academicYearId
          );

        if (!academicYear) {
          return res.status(404).json({
            message:
              "No academic year covers this date.",
          });
        }

        if (
          !dateBelongsToYear(
            date,
            academicYear
          )
        ) {
          return res.status(400).json({
            message:
              "The attendance date does not belong to the selected academic year.",
          });
        }

        // Find student's enrollment.
        const enrollment =
          await StudentEnrollment.findOne({
            schoolId: req.schoolId,
            studentId: student._id,
            academicYearId:
              academicYear._id,
            status: "ACTIVE",
          }).populate(
            "classId",
            "name academicYearId numberOfPeriods"
          );

        // Student has no class for this year.
        if (!enrollment?.classId) {
          return res.json({
            student,
            academicYear:
              academicYear.name,
            class: null,
            periods: [],
          });
        }

        const classData =
          enrollment.classId;

        // Check requested period.
        if (
          periodNumber &&
          (
            Number(periodNumber) < 1 ||
            Number(periodNumber) >
              classData.numberOfPeriods
          )
        ) {
          return res.status(400).json({
            message:
              "periodNumber is outside this class's period range.",
          });
        }

        const periods = [];

        for (
          let period = 1;
          period <=
            classData.numberOfPeriods;
          period++
        ) {
          if (
            !periodNumber ||
            Number(periodNumber) ===
              period
          ) {
            const record =
              await Attendance.findOne({
                schoolId:
                  req.schoolId,

                studentId:
                  student._id,

                classId:
                  classData._id,

                academicYearId:
                  academicYear._id,

                date: getDayRange(date),

                periodNumber:
                  period,
              }).select(
                "_id status"
              );

            periods.push({
              periodNumber:
                period,

              status:
                record?.status ||
                "NOT_RECORDED",

              attendanceId:
                record?._id || null,
            });
          }
        }

        return res.json({
          student,

          academicYear:
            academicYear.name,

          class: {
            _id: classData._id,
            name: classData.name,
          },

          date,

          numberOfPeriods:
            classData.numberOfPeriods,

          periods,
        });
      }


      // ======================================================
      // ADMIN / SUPER ADMIN / TEACHER
      // ======================================================

      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number(req.query.limit) || 20,
          1
        ),
        100
      );

      const filter = {};

      // Tenant filtering.
      if (
        req.user.role ===
        "SUPER_ADMIN"
      ) {
        if (req.query.schoolId) {
          filter.schoolId =
            req.query.schoolId;
        }
      } else {
        filter.schoolId =
          req.schoolId;
      }

      // Optional filters.
      if (academicYearId) {
        filter.academicYearId =
          academicYearId;
      }

      if (classId) {
        filter.classId = classId;
      }

      if (date) {
        filter.date =
          getDayRange(date);
      }

      if (periodNumber) {
        filter.periodNumber =
          Number(periodNumber);
      }

      if (req.query.status) {
        filter.status =
          req.query.status;
      }

      // A teacher list request without a date is still limited to today.
      if (req.user.role === "TEACHER") {
        filter.date = getDayRange(date || getSchoolToday());
      }

      // Teacher can only see assigned
      // class + academic year records.
      if (
        req.user.role === "TEACHER"
      ) {
        const teacher =
          await Teacher.findOne({
            userId: req.user.userId,
            schoolId: req.schoolId,
          });

        const currentAcademicYear = await AcademicYear.findOne({
          schoolId: req.schoolId,
          isCurrent: true,
        });

        const assignments = teacher && currentAcademicYear
          ? await TeacherAssignment.find({
              schoolId:
                req.schoolId,
              teacherId:
                teacher._id,
              academicYearId: currentAcademicYear._id,
            }).select(
              "classId academicYearId"
            )
          : [];

        filter.$or =
          assignments.map(
            (assignment) => ({
              classId:
                assignment.classId,

              academicYearId:
                assignment.academicYearId,
            })
          );
      }


      // ======================================================
      // GET ONE COMPLETE PERIOD
      // Returns every student, including NOT_RECORDED.
      // ======================================================

      if (
        classId &&
        academicYearId &&
        date &&
        periodNumber
      ) {
        if (!isValidDate(date)) {
          return res.status(400).json({
            message:
              "date must use YYYY-MM-DD format.",
          });
        }

        const yearFilter =
          req.user.role ===
          "SUPER_ADMIN"
            ? {}
            : {
                schoolId:
                  req.schoolId,
              };

        const classFilter =
          req.user.role ===
          "SUPER_ADMIN"
            ? {}
            : {
                schoolId:
                  req.schoolId,
              };

        const [academicYear, classData] =
          await Promise.all([
            AcademicYear.findOne({
              _id: academicYearId,
              ...yearFilter,
            }),

            Class.findOne({
              _id: classId,
              ...classFilter,
              academicYearId,
            }),
          ]);

        if (
          !academicYear ||
          !classData
        ) {
          return res.status(404).json({
            message:
              "Class or academic year not found.",
          });
        }

        if (req.user.role === "TEACHER" && !academicYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only use the current academic year.",
          });
        }

        if (
          String(
            academicYear.schoolId
          ) !==
          String(classData.schoolId)
        ) {
          return res.status(404).json({
            message:
              "Class or academic year not found.",
          });
        }

        if (
          !dateBelongsToYear(
            date,
            academicYear
          )
        ) {
          return res.status(400).json({
            message:
              "The attendance date must fall within the selected academic year.",
          });
        }

        // Teacher assignment check.
        if (
          req.user.role === "TEACHER"
        ) {
          const assigned =
            await isTeacherAssigned(
              req.user.userId,
              req.schoolId,
              classId,
              academicYearId
            );

          if (!assigned) {
            return res.status(403).json({
              message:
                "You are not assigned to this class and academic year.",
            });
          }
        }

        const period =
          Number(periodNumber);

        if (
          period < 1 ||
          period >
            classData.numberOfPeriods
        ) {
          return res.status(400).json({
            message:
              "periodNumber is outside this class's period range.",
          });
        }

        const attendance =
          await getPeriodRows({
            schoolId:
              classData.schoolId,

            academicYear,

            classData,

            date,

            periodNumber:
              period,
          });

        return res.json({
          classId,
          academicYearId,
          date,
          periodNumber: period,
          attendance,
        });
      }


      // ======================================================
      // NORMAL ATTENDANCE LIST
      // ======================================================

      const [attendance, total] =
        await Promise.all([
          populateAttendance(
            Attendance.find(filter)
              .sort({
                date: -1,
                periodNumber: 1,
              })
              .skip(
                (page - 1) * limit
              )
              .limit(limit)
          ),

          Attendance.countDocuments(
            filter
          ),
        ]);

      return res.json({
        attendance,

        pagination: {
          page,
          limit,
          total,
          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to get attendance.",
      });
    }
  }
);


// ============================================================
// UPDATE ONE ATTENDANCE RECORD
// PUT /api/attendance/:id
// ============================================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER"
  ),
  async (req, res) => {
    try {
      if (
        !attendanceStatuses.includes(
          req.body.status
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid attendance status.",
        });
      }

      const attendance =
        await Attendance.findOne({
          _id: req.params.id,

          ...(req.user.role ===
          "SUPER_ADMIN"
            ? {}
            : {
                schoolId:
                  req.schoolId,
              }),
        });

      if (!attendance) {
        return res.status(404).json({
          message:
            "Attendance record not found.",
        });
      }

      // Teacher can only update
      // attendance for assigned class/year.
      if (
        req.user.role === "TEACHER"
      ) {
        const academicYear = await AcademicYear.findOne({
          _id: attendance.academicYearId,
          schoolId: req.schoolId,
        });
        if (!academicYear || !academicYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only update attendance in the current academic year.",
          });
        }

        if (attendance.date.toISOString().slice(0, 10) !== getSchoolToday()) {
          return res.status(403).json({ message: "Teachers can only update today's attendance." });
        }

        const assigned =
          await isTeacherAssigned(
            req.user.userId,
            req.schoolId,
            attendance.classId,
            attendance.academicYearId
          );

        if (!assigned) {
          return res.status(403).json({
            message:
              "You are not assigned to this class and academic year.",
          });
        }
      }

      attendance.status =
        req.body.status;

      await attendance.save();

      const updatedAttendance =
        await populateAttendance(
          Attendance.findById(
            attendance._id
          )
        );

      return res.json({
        message:
          "Attendance updated.",

        attendance:
          updatedAttendance,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to update attendance.",
      });
    }
  }
);


// ============================================================
// DELETE ATTENDANCE
// DELETE /api/attendance/:id
// ============================================================

router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN"
  ),
  async (req, res) => {
    try {
      const attendance =
        await Attendance.findOne({
          _id: req.params.id,

          ...(req.user.role ===
          "SUPER_ADMIN"
            ? {}
            : {
                schoolId:
                  req.schoolId,
              }),
        });

      if (!attendance) {
        return res.status(404).json({
          message:
            "Attendance record not found.",
        });
      }

      await attendance.deleteOne();

      return res.json({
        message:
          "Attendance deleted.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          "Failed to delete attendance.",
      });
    }
  }
);


export default router;
