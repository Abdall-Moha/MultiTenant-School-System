import express from "express";
import mongoose from "mongoose";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Attendance from "../models/Attendence.js";
import AcademicYear from "../models/AcademicYear.js";
import Class from "../models/Class.js";
import Subject from "../models/Subject.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import SubjectExam from "../models/SubjectExam.js";
import Mark from "../models/Mark.js";
import Fee from "../models/Fee.js";
import Payment from "../models/Payment.js";
import Parent from "../models/Parent.js";

const router = express.Router();
router.use(authMiddleware, tenantMiddleware);

router.get(
  "/options",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      let classIds = null;
      let studentIds = null;
      let yearIds = null;
      let examFilter = { schoolId };
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId,
          status: "ACTIVE",
        }).select("_id");
        const assignments = await TeacherAssignment.find({
          schoolId,
          teacherId: teacher?._id || null,
        }).select("classId academicYearId");
        classIds = [
          ...new Set(assignments.map((item) => String(item.classId))),
        ];
        yearIds = [
          ...new Set(assignments.map((item) => String(item.academicYearId))),
        ];
        examFilter.teacherId = teacher?._id || null;
        examFilter.classId = { $in: assignments.map((item) => item.classId) };
        const enrolled = await StudentEnrollment.distinct("studentId", {
          schoolId,
          classId: { $in: assignments.map((item) => item.classId) },
          status: { $in: ["ACTIVE", "REPEATED"] },
        });
        studentIds = enrolled;
      } else if (["STUDENT", "PARENT"].includes(req.user.role)) {
        if (req.user.role === "STUDENT") {
          const student = await Student.findOne({
            userId: req.user.userId,
            schoolId,
          }).select("_id");
          studentIds = student ? [student._id] : [];
        } else {
          const parent = await Parent.findOne({
            userId: req.user.userId,
            schoolId,
          }).select("children");
          studentIds = parent?.children || [];
        }
        const enrollments = await StudentEnrollment.find({
          schoolId,
          studentId: { $in: studentIds },
        }).select("classId academicYearId");
        classIds = [
          ...new Set(enrollments.map((item) => String(item.classId))),
        ];
        yearIds = [
          ...new Set(enrollments.map((item) => String(item.academicYearId))),
        ];
        examFilter.classId = { $in: enrollments.map((item) => item.classId) };
      }
      const subjectIds = await SubjectExam.distinct("subjectId", examFilter);
      const [years, classes, students, exams, subjects] = await Promise.all([
        AcademicYear.find({
          schoolId,
          ...(yearIds ? { _id: { $in: yearIds } } : {}),
        })
          .select("name startDate endDate isCurrent")
          .sort({ startDate: -1 }),
        Class.find({
          schoolId,
          ...(classIds ? { _id: { $in: classIds } } : {}),
        })
          .populate("academicYearId", "name")
          .select("name academicYearId status")
          .sort({ name: 1 }),
        Student.find({
          schoolId,
          ...(studentIds ? { _id: { $in: studentIds } } : {}),
        })
          .select("fullName roleNumber gender status")
          .sort({ fullName: 1 }),
        SubjectExam.find(examFilter)
          .populate("classId", "name academicYearId")
          .populate("subjectId", "name")
          .populate("teacherId", "fullName")
          .sort({ examDate: -1 }),
        Subject.find({ schoolId, _id: { $in: subjectIds } })
          .select("name status")
          .sort({ name: 1 }),
      ]);
      return res.json({ academicYears: years, classes, students, exams, subjects });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to load report filters." });
    }
  },
);

async function getSchoolId(req, res) {
  if (req.user.role !== "SUPER_ADMIN") return req.schoolId;
  const { schoolId } = req.query;
  if (!mongoose.Types.ObjectId.isValid(schoolId)) {
    res.status(400).json({
      message: "A valid schoolId is required for SuperAdmin reports.",
    });
    return null;
  }
  if (!(await School.exists({ _id: schoolId }))) {
    res.status(404).json({ message: "School not found." });
    return null;
  }
  return schoolId;
}

async function filters(
  req,
  res,
  schoolId,
  { academicYear = true, classFilter = true, student = true } = {},
) {
  const result = { schoolId };
  const fields = [
    ["academicYearId", academicYear],
    ["classId", classFilter],
    [
      "studentId",
      student && ["ADMIN", "SUPER_ADMIN", "PARENT"].includes(req.user.role),
    ],
  ];
  for (const [field, enabled] of fields) {
    const value = req.query[field];
    if (!value || !enabled) continue;
    if (!mongoose.Types.ObjectId.isValid(value)) {
      res.status(400).json({ message: `Invalid ${field}.` });
      return null;
    }
    const Model =
      field === "academicYearId"
        ? AcademicYear
        : field === "classId"
          ? Class
          : Student;
    if (!(await Model.exists({ _id: value, schoolId }))) {
      res
        .status(400)
        .json({ message: `${field} does not belong to this school.` });
      return null;
    }
    result[field] = value;
  }
  if (
    result.academicYearId &&
    result.classId &&
    !(await Class.exists({
      _id: result.classId,
      schoolId,
      academicYearId: result.academicYearId,
    }))
  ) {
    res
      .status(400)
      .json({
        message: "The selected class does not belong to this academic year.",
      });
    return null;
  }
  if (req.user.role === "TEACHER") {
    const teacher = await Teacher.findOne({
      userId: req.user.userId,
      schoolId,
      status: "ACTIVE",
    });
    const assignmentFilter = { schoolId, teacherId: teacher?._id || null };
    if (result.academicYearId)
      assignmentFilter.academicYearId = result.academicYearId;
    if (result.classId) assignmentFilter.classId = result.classId;
    const assignments = await TeacherAssignment.find(assignmentFilter).select(
      "classId subjectId academicYearId",
    );
    if (!assignments.length && result.classId) {
      res
        .status(403)
        .json({ message: "You are not assigned to the selected class." });
      return null;
    }
    result._teacherAssignments = assignments;
  }
  if (student && req.user.role === "STUDENT") {
    const profile = await Student.findOne({
      userId: req.user.userId,
      schoolId,
    }).select("_id");
    if (!profile) {
      res.status(404).json({ message: "Student profile not found." });
      return null;
    }
    result.studentId = profile._id;
  }
  if (student && req.user.role === "PARENT") {
    const parent = await Parent.findOne({
      userId: req.user.userId,
      schoolId,
    }).select("children");
    if (!parent) {
      res.status(404).json({ message: "Parent profile not found." });
      return null;
    }
    if (req.query.studentId) {
      if (
        !parent.children.some(
          (childId) => String(childId) === String(req.query.studentId),
        )
      ) {
        res
          .status(403)
          .json({ message: "You can only view reports for your children." });
        return null;
      }
      result.studentId = req.query.studentId;
    } else result.studentId = { $in: parent.children };
  }
  return result;
}

function feeStatusMatchesTotals(fee) {
  if (fee.amount === 0 && fee.paidAmount === 0)
    return ["PAID", "UNPAID"].includes(fee.status);
  if (fee.paidAmount === 0) return fee.status === "UNPAID";
  if (fee.paidAmount >= fee.amount) return fee.status === "PAID";
  return fee.status === "PARTIAL";
}

function addDateFilter(query, field, res) {
  const { from, to } = query;
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  };
  if (from && !validDate(from)) {
    res.status(400).json({ message: "Invalid start date." });
    return null;
  }
  if (to && !validDate(to)) {
    res.status(400).json({ message: "Invalid end date." });
    return null;
  }
  if (from && to && from > to) {
    res
      .status(400)
      .json({ message: "Start date must be before or equal to end date." });
    return null;
  }
  const date = {};
  if (from) date.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    date.$lt = end;
  }
  return Object.keys(date).length ? date : null;
}

// Keep the original individual-student report URL, but source class history
// from StudentEnrollment rather than the removed Student.classId field.
router.get(
  "/student/:studentId",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.studentId))
        return res.status(400).json({ message: "Invalid studentId." });
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const student = await Student.findOne({
        _id: req.params.studentId,
        schoolId,
      });
      if (!student)
        return res.status(404).json({ message: "Student not found." });
      if (
        req.user.role === "STUDENT" &&
        String(student.userId) !== String(req.user.userId)
      )
        return res
          .status(403)
          .json({ message: "You can only view your own report." });
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId,
        }).select("children");
        if (
          !parent?.children.some(
            (childId) => String(childId) === String(student._id),
          )
        )
          return res
            .status(403)
            .json({ message: "You can only view reports for your children." });
      }
      const enrollments = await StudentEnrollment.find({
        schoolId,
        studentId: student._id,
      })
        .populate("classId", "name academicYearId")
        .populate("academicYearId", "name startDate endDate isCurrent")
        .sort({ createdAt: -1 });
      let teacherPairs = null;
      let teacherExamIds = null;
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId,
          status: "ACTIVE",
        }).select("_id");
        const enrollmentPairs = enrollments
          .filter((item) => item.classId?._id && item.academicYearId?._id)
          .map((item) => ({
            classId: item.classId._id,
            academicYearId: item.academicYearId._id,
          }));
        const assignments = teacher && enrollmentPairs.length
          ? await TeacherAssignment.find({
            schoolId,
            teacherId: teacher._id,
            $or: enrollmentPairs,
          }).select("classId academicYearId")
          : [];
        teacherPairs = assignments.map((item) => ({ classId: item.classId, academicYearId: item.academicYearId }));
        if (!teacherPairs.length)
          return res
            .status(403)
            .json({ message: "You are not assigned to this student's class." });
        const visibleEnrollments = enrollments.filter((item) =>
          teacherPairs.some(
            (pair) =>
              String(pair.classId) === String(item.classId?._id) &&
              String(pair.academicYearId) === String(item.academicYearId?._id),
          ),
        );
        enrollments.splice(0, enrollments.length, ...visibleEnrollments);
        teacherExamIds = await SubjectExam.distinct("_id", {
          schoolId,
          teacherId: teacher._id,
          classId: { $in: teacherPairs.map((item) => item.classId) },
        });
      }
      const [attendance, marks, fees] = await Promise.all([
        Attendance.find({ schoolId, studentId: student._id, ...(teacherPairs ? { $or: teacherPairs } : {}) })
          .populate("classId", "name")
          .populate("academicYearId", "name")
          .sort({ date: -1 }),
        Mark.find({ schoolId, studentId: student._id, ...(teacherExamIds ? { examId: { $in: teacherExamIds } } : {}) })
          .populate({
            path: "examId",
            select: "title subjectId classId examDate totalMarks academicYear",
            populate: { path: "subjectId", select: "name" },
          })
          .sort({ createdAt: -1 }),
        req.user.role === "TEACHER" ? [] : Fee.find({ schoolId, studentId: student._id }).sort({ createdAt: -1 }),
      ]);
      const attendanceSummary = {
        total: attendance.length,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };
      for (const record of attendance)
        attendanceSummary[record.status.toLowerCase()] += 1;
      const totalFees = fees.reduce((sum, fee) => sum + fee.amount, 0);
      const totalPaid = fees.reduce((sum, fee) => sum + fee.paidAmount, 0);
      return res.json({
        student: {
          id: student._id,
          fullName: student.fullName,
          roleNumber: student.roleNumber,
          gender: student.gender,
          dateOfBirth: student.dateOfBirth,
          status: student.status,
          enrollments,
        },
        attendance: { summary: attendanceSummary, records: attendance },
        marks,
        fees: req.user.role === "TEACHER" ? null : {
          totalFees,
          totalPaid,
          remaining: totalFees - totalPaid,
          records: fees,
        },
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate student report." });
    }
  },
);

router.get(
  "/overview",
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const yearId = req.query.academicYearId;
      if (yearId && !mongoose.Types.ObjectId.isValid(yearId))
        return res.status(400).json({ message: "Invalid academicYearId." });
      const year = yearId
        ? await AcademicYear.findOne({ _id: yearId, schoolId })
        : await AcademicYear.findOne({ schoolId, isCurrent: true });
      if (yearId && !year)
        return res
          .status(400)
          .json({ message: "Academic year does not belong to this school." });
      const enrollmentFilter = {
        schoolId,
        status: { $in: ["ACTIVE", "REPEATED"] },
      };
      if (year) enrollmentFilter.academicYearId = year._id;
      const [
        uniqueStudents,
        activeStudents,
        enrollments,
        activeTeachers,
        activeStaff,
        classes,
        feeRows,
        attendanceRows,
      ] = await Promise.all([
        Student.countDocuments({ schoolId }),
        Student.countDocuments({ schoolId, status: "ACTIVE" }),
        StudentEnrollment.find(enrollmentFilter).populate({
          path: "studentId",
          match: { status: "ACTIVE" },
          select: "_id",
        }),
        Teacher.countDocuments({ schoolId, status: "ACTIVE" }),
        Staff.countDocuments({ schoolId, status: "ACTIVE" }),
        year
          ? Class.countDocuments({
              schoolId,
              academicYearId: year._id,
              status: "ACTIVE",
            })
          : Class.countDocuments({ schoolId, status: "ACTIVE" }),
        Fee.find({ schoolId }).select("amount paidAmount status"),
        Attendance.find({
          schoolId,
          ...(year ? { academicYearId: year._id } : {}),
        }).select("status"),
      ]);
      const feeSummary = {
        totalFees: 0,
        totalPaid: 0,
        totalRemaining: 0,
        unpaid: 0,
        partial: 0,
        paid: 0,
        inconsistentStatuses: 0,
      };
      for (const fee of feeRows) {
        feeSummary.totalFees += fee.amount;
        feeSummary.totalPaid += fee.paidAmount;
        feeSummary.totalRemaining += fee.amount - fee.paidAmount;
        if (!feeStatusMatchesTotals(fee)) feeSummary.inconsistentStatuses += 1;
        if (fee.status === "UNPAID") feeSummary.unpaid += 1;
        if (fee.status === "PARTIAL") feeSummary.partial += 1;
        if (fee.status === "PAID") feeSummary.paid += 1;
      }
      const attendanceSummary = {
        total: attendanceRows.length,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        percentage: 0,
      };
      for (const item of attendanceRows)
        attendanceSummary[item.status.toLowerCase()] += 1;
      attendanceSummary.percentage = attendanceSummary.total
        ? Number(
            (
              (attendanceSummary.present / attendanceSummary.total) *
              100
            ).toFixed(2),
          )
        : 0;
      return res.json({
        period: year
          ? {
              name: year.name,
              isCurrent: year.isCurrent,
              startDate: year.startDate,
              endDate: year.endDate,
            }
          : { name: "All academic years" },
        summary: {
          uniqueStudents,
          activeStudents,
          activeEnrollmentRecords: enrollments.filter(
            (entry) => entry.studentId,
          ).length,
          activeTeachers,
          activeStaff,
          activeClasses: classes,
          fees: feeSummary,
          attendance: attendanceSummary,
        },
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate overview report." });
    }
  },
);

router.get(
  "/students",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const selected = await filters(req, res, schoolId);
      if (!selected) return;
      if (
        selected.academicYearId &&
        selected.classId &&
        !(await Class.exists({
          _id: selected.classId,
          schoolId,
          academicYearId: selected.academicYearId,
        }))
      ) {
        return res
          .status(400)
          .json({
            message:
              "The selected class does not belong to this academic year.",
          });
      }
      const enrollmentFilter = { schoolId };
      if (selected.academicYearId)
        enrollmentFilter.academicYearId = selected.academicYearId;
      if (selected.classId) enrollmentFilter.classId = selected.classId;
      if (selected.studentId) enrollmentFilter.studentId = selected.studentId;
      if (selected._teacherAssignments && !selected.classId)
        enrollmentFilter.classId = {
          $in: selected._teacherAssignments.map((item) => item.classId),
        };
      let enrollments = await StudentEnrollment.find(enrollmentFilter)
        .populate("studentId", "fullName roleNumber gender status")
        .populate("classId", "name")
        .populate("academicYearId", "name")
        .sort({ createdAt: -1 });
      enrollments = enrollments.filter((row) => Boolean(row.studentId));
      const studentIds = [
        ...new Set(enrollments.map((row) => String(row.studentId._id))),
      ];
      const studentFilter = { schoolId };
      if (selected.studentId) studentFilter._id = selected.studentId;
      else if (req.user.role === "TEACHER")
        studentFilter._id = { $in: studentIds };
      const students = await Student.find(studentFilter)
        .select("fullName roleNumber gender status")
        .sort({ fullName: 1 });
      const countsByGender = { MALE: 0, FEMALE: 0, unspecified: 0 };
      for (const student of students)
        countsByGender[student.gender || "unspecified"] += 1;
      const enrollmentStatusCounts = {
        ACTIVE: 0,
        REPEATED: 0,
        TRANSFERRED: 0,
        GRADUATED: 0,
      };
      for (const enrollment of enrollments)
        enrollmentStatusCounts[enrollment.status] += 1;
      const activeEnrollments = enrollments.filter(
        (row) =>
          row.studentId.status === "ACTIVE" &&
          ["ACTIVE", "REPEATED"].includes(row.status),
      ).length;
      return res.json({
        summary: {
          uniqueStudents: students.length,
          activeStudents: students.filter((item) => item.status === "ACTIVE")
            .length,
          enrollmentRecords: enrollments.length,
          activeEnrollments,
          countsByGender,
          enrollmentStatusCounts,
        },
        students,
        enrollments,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate student report." });
    }
  },
);

router.get(
  "/attendance",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const selected = await filters(req, res, schoolId);
      if (!selected) return;
      const query = { schoolId };
      if (selected.academicYearId)
        query.academicYearId = selected.academicYearId;
      if (selected.classId) query.classId = selected.classId;
      if (selected.studentId) query.studentId = selected.studentId;
      if (selected._teacherAssignments && !selected.classId)
        query.classId = {
          $in: selected._teacherAssignments.map((item) => item.classId),
        };
      if (req.query.periodNumber !== undefined) {
        const period = Number(req.query.periodNumber);
        if (!Number.isInteger(period) || period < 1 || period > 12)
          return res
            .status(400)
            .json({ message: "Period must be between 1 and 12." });
        if (selected.classId) {
          const classData = await Class.findOne({
            _id: selected.classId,
            schoolId,
          }).select("numberOfPeriods");
          if (period > classData.numberOfPeriods)
            return res.status(400).json({
              message: "The selected period is not configured for this class.",
            });
        }
        query.periodNumber = period;
      }
      if (req.query.status) {
        if (
          !["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(req.query.status)
        )
          return res
            .status(400)
            .json({ message: "Invalid attendance status." });
        query.status = req.query.status;
      }
      const date = addDateFilter(req.query, "date", res);
      if (date === null && (req.query.from || req.query.to) && res.headersSent)
        return;
      if (date) query.date = date;
      const records = await Attendance.find(query)
        .populate("studentId", "fullName roleNumber status")
        .populate("classId", "name")
        .populate("academicYearId", "name")
        .sort({ date: -1, periodNumber: 1 });
      const summary = {
        total: records.length,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        percentage: 0,
      };
      for (const record of records) summary[record.status.toLowerCase()] += 1;
      summary.percentage = summary.total
        ? Number(((summary.present / summary.total) * 100).toFixed(2))
        : 0;
      const byClassMap = new Map();
      const byStudentMap = new Map();
      for (const record of records) {
        const key = String(record.classId?._id || "unknown");
        if (!byClassMap.has(key))
          byClassMap.set(key, {
            className: `${record.classId?.name || "Class unavailable"}${record.academicYearId?.name ? ` (${record.academicYearId.name})` : ""}`,
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
          });
        const row = byClassMap.get(key);
        row.total += 1;
        row[record.status.toLowerCase()] += 1;
        const studentKey = String(record.studentId?._id || "unknown");
        if (!byStudentMap.has(studentKey))
          byStudentMap.set(studentKey, {
            studentName: record.studentId?.fullName || "Student unavailable",
            roleNumber: record.studentId?.roleNumber || "—",
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
          });
        const studentRow = byStudentMap.get(studentKey);
        studentRow.total += 1;
        studentRow[record.status.toLowerCase()] += 1;
      }
      const byClass = [...byClassMap.values()].map((row) => ({
        ...row,
        percentage: row.total
          ? Number(((row.present / row.total) * 100).toFixed(2))
          : 0,
      }));
      const byStudent = [...byStudentMap.values()].map((row) => ({
        ...row,
        percentage: row.total
          ? Number(((row.present / row.total) * 100).toFixed(2))
          : 0,
      }));
      return res.json({ summary, byClass, byStudent, records });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate attendance report." });
    }
  },
);

router.get(
  "/performance",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const selected = await filters(req, res, schoolId);
      if (!selected) return;
      if (req.query.subjectId) {
        if (!mongoose.Types.ObjectId.isValid(req.query.subjectId))
          return res.status(400).json({ message: "Select a valid subject." });
        const subject = await Subject.findOne({ _id: req.query.subjectId, schoolId }).select("name");
        if (!subject) return res.status(404).json({ message: "Subject not found in this school." });
        const examFilter = { schoolId, subjectId: subject._id };
        if (selected.classId) examFilter.classId = selected.classId;
        else if (selected.academicYearId) {
          const selectedClasses = await Class.distinct("_id", { schoolId, academicYearId: selected.academicYearId });
          examFilter.classId = { $in: selectedClasses };
        }
        let teacherAssignments = null;
        if (req.user.role === "TEACHER") {
          const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId, status: "ACTIVE" }).select("_id");
          teacherAssignments = teacher ? await TeacherAssignment.find({ schoolId, teacherId: teacher._id, subjectId: subject._id, ...(selected.classId ? { classId: selected.classId } : {}), ...(selected.academicYearId ? { academicYearId: selected.academicYearId } : {}) }).select("classId academicYearId") : [];
          examFilter.teacherId = teacher?._id || null;
          examFilter.classId = { $in: teacherAssignments.map((item) => item.classId) };
        }
        const exams = await SubjectExam.find(examFilter).populate("classId", "name academicYearId").sort({ examDate: -1 });
        const records = [];
        for (const exam of exams) {
          const classYearId = exam.classId?.academicYearId;
          if (selected.academicYearId && String(classYearId) !== String(selected.academicYearId)) continue;
          if (teacherAssignments && !teacherAssignments.some((item) => String(item.classId) === String(exam.classId?._id) && String(item.academicYearId) === String(classYearId))) continue;
          const enrolledStudentIds = await StudentEnrollment.distinct("studentId", { schoolId, classId: exam.classId._id, academicYearId: classYearId });
          const requestedStudentIds = selected.studentId?.$in
            ? selected.studentId.$in.map(String)
            : selected.studentId
              ? [String(selected.studentId)]
              : null;
          const visibleStudentIds = requestedStudentIds
            ? enrolledStudentIds.filter((id) => requestedStudentIds.includes(String(id)))
            : enrolledStudentIds;
          const markFilter = { schoolId, examId: exam._id, studentId: { $in: visibleStudentIds } };
          const savedMarks = await Mark.find(markFilter).populate("studentId", "fullName roleNumber status").sort({ updatedAt: -1, createdAt: -1 });
          const uniqueMarks = new Map();
          for (const mark of savedMarks) {
            const key = String(mark.studentId?._id || mark.studentId);
            if (!uniqueMarks.has(key)) uniqueMarks.set(key, mark);
          }
          for (const mark of uniqueMarks.values()) {
            records.push({ _id: `${exam._id}-${mark.studentId?._id || mark.studentId}`, exam: { title: exam.title, date: exam.examDate, className: exam.classId?.name, totalMarks: exam.totalMarks }, student: mark.studentId, marksObtained: mark.marksObtained, totalMarks: exam.totalMarks, percentage: exam.totalMarks > 0 ? Number((mark.marksObtained / exam.totalMarks * 100).toFixed(2)) : null, remarks: mark.remarks });
          }
        }
        const averagePercentage = records.length ? Number((records.reduce((sum, row) => sum + (row.percentage || 0), 0) / records.length).toFixed(2)) : null;
        return res.json({ subject, summary: { examCount: exams.length, markCount: records.length, averagePercentage }, records });
      }
      if (!mongoose.Types.ObjectId.isValid(req.query.examId))
        return res.status(400).json({ message: "Select a valid exam." });
      const exam = await SubjectExam.findOne({ _id: req.query.examId, schoolId })
        .populate("classId", "name academicYearId")
        .populate("subjectId", "name")
        .populate("teacherId", "fullName");
      if (!exam)
        return res
          .status(404)
          .json({ message: "Subject exam not found in this school." });
      if (
        selected.classId &&
        String(selected.classId) !== String(exam.classId?._id)
      )
        return res.status(400).json({
          message: "The selected exam does not belong to this class.",
        });
      if (
        selected.academicYearId &&
        String(selected.academicYearId) !== String(exam.classId?.academicYearId)
      )
        return res
          .status(400)
          .json({ message: "The selected exam is not in this academic year." });
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId,
          status: "ACTIVE",
        });
        const assigned =
          teacher &&
          String(exam.teacherId?._id) === String(teacher._id) &&
          (await TeacherAssignment.exists({
            schoolId,
            teacherId: teacher._id,
            classId: exam.classId?._id,
            subjectId: exam.subjectId?._id,
            academicYearId: exam.classId?.academicYearId,
          }));
        if (!assigned)
          return res
            .status(403)
            .json({ message: "You are not assigned to this exam." });
      }
      const enrollmentStudentIds = await StudentEnrollment.distinct(
        "studentId",
        {
          schoolId,
          classId: exam.classId._id,
          academicYearId: exam.classId.academicYearId,
        },
      );
      const requestedStudentIds = selected.studentId?.$in
        ? selected.studentId.$in.map(String)
        : selected.studentId
          ? [String(selected.studentId)]
          : null;
      const visibleStudentIds = requestedStudentIds
        ? enrollmentStudentIds.filter((id) => requestedStudentIds.includes(String(id)))
        : enrollmentStudentIds;
      const filter = {
        schoolId,
        examId: exam._id,
        studentId: { $in: visibleStudentIds },
      };
      if (req.user.role === "PARENT" || req.user.role === "STUDENT")
        filter.studentId = selected.studentId;
      const savedMarks = await Mark.find(filter)
        .populate("studentId", "fullName roleNumber status")
        .sort({ updatedAt: -1, createdAt: -1 });
      const markByStudent = new Map();
      for (const mark of savedMarks) {
        const studentKey = String(mark.studentId?._id || mark.studentId);
        if (!markByStudent.has(studentKey)) markByStudent.set(studentKey, mark);
      }
      const marks = [...markByStudent.values()].sort(
        (first, second) => second.marksObtained - first.marksObtained,
      );
      const rows = marks.map((mark) => ({
        _id: mark._id,
        student: mark.studentId,
        marksObtained: mark.marksObtained,
        totalMarks: exam.totalMarks,
        percentage:
          exam.totalMarks > 0
            ? Number(((mark.marksObtained / exam.totalMarks) * 100).toFixed(2))
            : null,
        remarks: mark.remarks,
      }));
      const averagePercentage = rows.length
        ? Number(
            (
              rows.reduce((sum, row) => sum + (row.percentage || 0), 0) /
              rows.length
            ).toFixed(2),
          )
        : null;
      return res.json({
        exam: {
          _id: exam._id,
          title: exam.title,
          totalMarks: exam.totalMarks,
          date: exam.examDate,
          class: exam.classId,
          subject: exam.subjectId,
          teacher: exam.teacherId,
        },
        summary: { markCount: rows.length, averagePercentage },
        records: rows,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate performance report." });
    }
  },
);

router.get(
  "/fees",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const selected = await filters(req, res, schoolId, {
        academicYear: false,
        classFilter: false,
      });
      if (!selected) return;
      const records = await Fee.find({
        schoolId,
        ...(selected.studentId ? { studentId: selected.studentId } : {}),
      })
        .populate("studentId", "fullName roleNumber")
        .sort({ createdAt: -1 });
      const summary = {
        totalFees: 0,
        totalPaid: 0,
        totalRemaining: 0,
        numberOfFees: records.length,
        unpaid: 0,
        partial: 0,
        paid: 0,
        inconsistentStatuses: 0,
      };
      for (const fee of records) {
        summary.totalFees += fee.amount;
        summary.totalPaid += fee.paidAmount;
        summary.totalRemaining += fee.amount - fee.paidAmount;
        if (!feeStatusMatchesTotals(fee)) summary.inconsistentStatuses += 1;
        if (fee.status === "UNPAID") summary.unpaid += 1;
        if (fee.status === "PARTIAL") summary.partial += 1;
        if (fee.status === "PAID") summary.paid += 1;
      }
      return res.json({ summary, records });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate fees report." });
    }
  },
);

router.get(
  "/payments",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const selected = await filters(req, res, schoolId, {
        academicYear: false,
        classFilter: false,
      });
      if (!selected) return;
      const query = {
        schoolId,
        ...(selected.studentId ? { studentId: selected.studentId } : {}),
      };
      if (req.query.paymentMethod) {
        if (!["EVC", "E-Dahab", "BANK"].includes(req.query.paymentMethod))
          return res.status(400).json({ message: "Invalid payment method." });
        query.paymentMethod = req.query.paymentMethod;
      }
      const date = addDateFilter(req.query, "paymentDate", res);
      if (date === null && (req.query.from || req.query.to) && res.headersSent)
        return;
      if (date) query.paymentDate = date;
      const records = await Payment.find(query)
        .populate("studentId", "fullName roleNumber")
        .populate("feeId", "description amount")
        .populate("receivedBy", "name")
        .sort({ paymentDate: -1, createdAt: -1 });
      const summary = {
        totalAmount: records.reduce((sum, item) => sum + item.amount, 0),
        count: records.length,
        byMethod: {
          EVC: { count: 0, total: 0 },
          "E-Dahab": { count: 0, total: 0 },
          BANK: { count: 0, total: 0 },
        },
      };
      for (const item of records) {
        summary.byMethod[item.paymentMethod].count += 1;
        summary.byMethod[item.paymentMethod].total += item.amount;
      }
      return res.json({ summary, records });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate payments report." });
    }
  },
);

router.get(
  "/people",
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      if (
        req.query.academicYearId &&
        !mongoose.Types.ObjectId.isValid(req.query.academicYearId)
      ) {
        return res.status(400).json({ message: "Invalid academicYearId." });
      }
      const [teachers, staff, assignments] = await Promise.all([
        Teacher.find({ schoolId })
          .select("fullName phone qualification status hireDate")
          .sort({ fullName: 1 }),
        Staff.find({ schoolId })
          .select("fullName phoneNumber position status hireDate")
          .sort({ fullName: 1 }),
        TeacherAssignment.find({
          schoolId,
          ...(req.query.academicYearId &&
          mongoose.Types.ObjectId.isValid(req.query.academicYearId)
            ? { academicYearId: req.query.academicYearId }
            : {}),
        })
          .populate("teacherId", "fullName")
          .populate("classId", "name")
          .populate("subjectId", "name")
          .populate("academicYearId", "name")
          .sort({ createdAt: -1 }),
      ]);
      if (
        req.query.academicYearId &&
        !(await AcademicYear.exists({
          _id: req.query.academicYearId,
          schoolId,
        }))
      )
        return res
          .status(400)
          .json({ message: "Academic year does not belong to this school." });
      return res.json({
        summary: {
          teachers: teachers.length,
          activeTeachers: teachers.filter((item) => item.status === "ACTIVE")
            .length,
          inactiveTeachers: teachers.filter(
            (item) => item.status === "INACTIVE",
          ).length,
          staff: staff.length,
          activeStaff: staff.filter((item) => item.status === "ACTIVE").length,
          inactiveStaff: staff.filter((item) => item.status === "INACTIVE")
            .length,
          teacherAssignments: assignments.length,
        },
        teachers,
        staff,
        assignments,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate staff report." });
    }
  },
);

router.get(
  "/classes",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const schoolId = await getSchoolId(req, res);
      if (!schoolId) return;
      const selected = await filters(req, res, schoolId, { student: false });
      if (!selected) return;
      const classQuery = {
        schoolId,
        ...(selected.academicYearId
          ? { academicYearId: selected.academicYearId }
          : {}),
        ...(selected.classId ? { _id: selected.classId } : {}),
      };
      if (selected._teacherAssignments && !selected.classId)
        classQuery._id = {
          $in: selected._teacherAssignments.map((item) => item.classId),
        };
      const classes = await Class.find(classQuery)
        .populate("academicYearId", "name")
        .sort({ name: 1 });
      const classIds = classes.map((item) => item._id);
      const [enrollments, subjects, assignments] = await Promise.all([
        StudentEnrollment.find({
          schoolId,
          classId: { $in: classIds },
          status: { $in: ["ACTIVE", "REPEATED"] },
        }).populate({
          path: "studentId",
          match: { status: "ACTIVE" },
          select: "_id",
        }),
        Subject.find({ schoolId }).select("name status").sort({ name: 1 }),
        TeacherAssignment.find({ schoolId, classId: { $in: classIds } })
          .populate("teacherId", "fullName")
          .populate("classId", "name")
          .populate("subjectId", "name")
          .populate("academicYearId", "name"),
      ]);
      const counts = new Map();
      for (const row of enrollments)
        if (row.studentId)
          counts.set(
            String(row.classId),
            (counts.get(String(row.classId)) || 0) + 1,
          );
      return res.json({
        classes: classes.map((item) => ({
          ...item.toObject(),
          enrollmentCount: counts.get(String(item._id)) || 0,
        })),
        subjects,
        assignments,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Failed to generate class report." });
    }
  },
);

export default router;
