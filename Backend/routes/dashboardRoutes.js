import express from "express";
import mongoose from "mongoose";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import AcademicYear from "../models/AcademicYear.js";
import Attendance from "../models/Attendence.js";
import Class from "../models/Class.js";
import Event from "../models/Event.js";
import Fee from "../models/Fee.js";
import Mark from "../models/Mark.js";
import Parent from "../models/Parent.js";
import School from "../models/School.js";
import Staff from "../models/Staff.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Subject from "../models/Subject.js";
import SubjectExam from "../models/SubjectExam.js";
import Subscription from "../models/Subscription.js";
import Teacher from "../models/Teacher.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import User from "../models/User.js";

const router = express.Router();

const recentListLimit = 5;

function useFallback(promise, fallbackValue) {
  return promise.catch(() => fallbackValue);
}

function getSixMonthWindow() {
  const now = new Date();
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const months = [];

  for (let offset = 0; offset < 6; offset += 1) {
    const date = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + offset, 1));
    months.push({
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    });
  }

  return { startDate: firstMonth, months };
}

function fillMonthlyValues(rows, keys) {
  const valuesByMonth = new Map(
    rows.map((row) => [
      `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
      row,
    ]),
  );

  return keys.map((month) => ({
    label: month.label,
    ...(valuesByMonth.get(month.key) || {}),
  }));
}

async function getMonthlyCounts(Model, filter = {}) {
  const { startDate, months } = getSixMonthWindow();
  const rows = await Model.aggregate([
    { $match: { ...filter, createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return fillMonthlyValues(rows, months).map((month) => ({
    label: month.label,
    count: month.count || 0,
  }));
}

async function getMonthlyAttendance(schoolId, academicYearId) {
  const { startDate, months } = getSixMonthWindow();
  const rows = await Attendance.aggregate([
    {
      $match: {
        schoolId: new mongoose.Types.ObjectId(schoolId),
        academicYearId,
        date: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
        },
        present: { $sum: { $cond: [{ $eq: ["$status", "PRESENT"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "LATE"] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ["$status", "EXCUSED"] }, 1, 0] } },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return fillMonthlyValues(rows, months).map((month) => ({
    label: month.label,
    present: month.present || 0,
    absent: month.absent || 0,
    late: month.late || 0,
    excused: month.excused || 0,
  }));
}

async function getUpcomingEvents(schoolId) {
  return Event.find({ schoolId, eventDate: { $gte: new Date() } })
    .select("title description eventDate location")
    .sort({ eventDate: 1 })
    .limit(recentListLimit)
    .lean();
}

async function getAttendanceSummary(filter) {
  const match = { ...filter };
  if (typeof match.schoolId === "string") {
    match.schoolId = new mongoose.Types.ObjectId(match.schoolId);
  }

  const [totals] = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        recorded: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "PRESENT"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "LATE"] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ["$status", "EXCUSED"] }, 1, 0] } },
      },
    },
  ]);

  const recorded = totals?.recorded || 0;
  return {
    recorded,
    present: totals?.present || 0,
    absent: totals?.absent || 0,
    late: totals?.late || 0,
    excused: totals?.excused || 0,
    // The percentage uses recorded entries only. Missing attendance is not counted as absence.
    presentPercentage: recorded ? Number(((totals.present / recorded) * 100).toFixed(1)) : null,
  };
}

async function getStudentFeeSummary(studentId, schoolId) {
  const [totals] = await Fee.aggregate([
    {
      $match: {
        schoolId: new mongoose.Types.ObjectId(schoolId),
        studentId,
      },
    },
    {
      $group: {
        _id: null,
        billed: { $sum: "$amount" },
        paid: { $sum: "$paidAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const billed = totals?.billed || 0;
  const paid = totals?.paid || 0;
  return {
    billed,
    paid,
    outstanding: Math.max(0, billed - paid),
    feeCount: totals?.count || 0,
  };
}

async function getRecentStudentAttendance(studentId, schoolId, academicYearId) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const filter = {
    schoolId,
    studentId,
    ...(academicYearId ? { academicYearId } : {}),
    date: { $gte: startDate },
  };
  const [summary, records] = await Promise.all([
    getAttendanceSummary(filter),
    Attendance.find(filter)
      .populate("classId", "name")
      .select("date periodNumber status classId")
      .sort({ date: -1, periodNumber: -1 })
      .limit(recentListLimit)
      .lean(),
  ]);
  return { ...summary, records };
}

async function getUpcomingExams(schoolId, filter = {}) {
  return SubjectExam.find({
    schoolId,
    examDate: { $gte: new Date() },
    ...filter,
  })
    .populate("examinationId", "name")
    .populate("classId", "name")
    .populate("subjectId", "name")
    .sort({ examDate: 1 })
    .limit(recentListLimit)
    .lean();
}

async function getRecentStudentMarks(studentId, schoolId, academicYearId) {
  if (!academicYearId) return [];
  const subjectExamIds = await SubjectExam.distinct("_id", {
    schoolId,
    academicYearId,
  });
  if (!subjectExamIds.length) return [];

  const marks = await Mark.find({ schoolId, studentId, examId: { $in: subjectExamIds } })
    .populate({
      path: "examId",
      select: "totalMarks examinationId subjectId",
      populate: [
        { path: "examinationId", select: "name" },
        { path: "subjectId", select: "name" },
      ],
    })
    .select("marksObtained remarks updatedAt examId")
    .sort({ updatedAt: -1 })
    .limit(recentListLimit)
    .lean();

  return marks.map((mark) => ({
    _id: mark._id,
    marksObtained: mark.marksObtained,
    totalMarks: mark.examId?.totalMarks ?? null,
    percentage: mark.examId?.totalMarks
      ? Number(((mark.marksObtained / mark.examId.totalMarks) * 100).toFixed(1))
      : null,
    remarks: mark.remarks || "",
    subjectName: mark.examId?.subjectId?.name || "Subject",
    examinationName: mark.examId?.examinationId?.name || "Examination",
    updatedAt: mark.updatedAt,
  }));
}

// Build the current class from an active enrollment and the school's current year.
async function getCurrentEnrollment(studentId, schoolId, academicYear) {
  if (!academicYear) return null;

  const enrollment = await StudentEnrollment.findOne({
    schoolId,
    studentId,
    academicYearId: academicYear._id,
    status: "ACTIVE",
  })
    .populate("classId", "name academicYearId")
    .lean();

  return enrollment;
}

router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"),
  async (req, res) => {
    try {
      // Platform statistics are intentionally separate from school-level data.
      if (req.user.role === "SUPER_ADMIN") {
        const [
          totalSchools,
          activeSchools,
          suspendedSchools,
          totalUsers,
          totalStudents,
          totalTeachers,
          totalAdmins,
          activeSubscriptions,
          subscriptionPayments,
          schoolRegistrationTrend,
          subscriptionPlanDistribution,
          recentSchools,
          recentSubscriptions,
        ] =
          await Promise.all([
            School.countDocuments({}),
            School.countDocuments({ status: "ACTIVE" }),
            School.countDocuments({ status: "SUSPENDED" }),
            User.countDocuments({}),
            Student.countDocuments({}),
            Teacher.countDocuments({}),
            User.countDocuments({ role: "ADMIN" }),
            useFallback(Subscription.countDocuments({ status: "ACTIVE" }), null),
            useFallback(Subscription.aggregate([
              { $group: { _id: null, amount: { $sum: "$amountPaid" } } },
            ]), null),
            useFallback(getMonthlyCounts(School), null),
            useFallback(Subscription.aggregate([
              {
                $group: {
                  _id: "$planName",
                  count: { $sum: 1 },
                  active: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } },
                },
              },
              { $sort: { count: -1, _id: 1 } },
            ]), null),
            School.find({})
              .select("schoolName schoolId status createdAt")
              .sort({ createdAt: -1 })
              .limit(recentListLimit)
              .lean(),
            useFallback(Subscription.find({})
              .populate("schoolId", "schoolName schoolId")
              .select("schoolId planName status amountPaid paymentStatus updatedAt")
              .sort({ updatedAt: -1 })
              .limit(recentListLimit)
              .lean(), null),
          ]);

        return res.json({
          role: req.user.role,
          summary: [
            { label: "Registered Schools", value: totalSchools },
            { label: "Active Schools", value: activeSchools },
            { label: "Suspended Schools", value: suspendedSchools },
            { label: "Registered Users", value: totalUsers },
            { label: "Total Students", value: totalStudents },
            { label: "Teachers", value: totalTeachers },
            { label: "School Administrators", value: totalAdmins },
            { label: "Active Subscriptions", value: activeSubscriptions },
            {
              label: "Subscription Payments",
              value: Number((subscriptionPayments[0]?.amount || 0).toFixed(2)),
              format: "currency",
            },
          ],
          schoolStatusDistribution: { active: activeSchools, suspended: suspendedSchools },
          schoolRegistrationTrend,
          subscriptionPlanDistribution: subscriptionPlanDistribution?.map((plan) => ({
            name: plan._id || "Unnamed plan",
            count: plan.count,
            active: plan.active,
          })) || null,
          recentSchools,
          recentSubscriptions,
        });
      }

      const schoolId = req.schoolId;
      const [academicYear, upcomingEvents] = await Promise.all([
        AcademicYear.findOne({ schoolId, isCurrent: true }).select("_id name startDate endDate schoolId"),
        getUpcomingEvents(schoolId),
      ]);

      if (req.user.role === "ADMIN") {
        const yearFilter = academicYear
          ? { academicYearId: academicYear._id }
          : { academicYearId: { $exists: false } };
        const [
          totalStudents,
          activeStudents,
          totalTeachers,
          totalParents,
          totalStaff,
          totalClasses,
          totalSubjects,
          totalSubjectExams,
          totalEvents,
          classRecords,
          classEnrollmentTotals,
          attendance,
          studentEnrollmentTrend,
          attendanceTrend,
          feeTotals,
          recentEnrollments,
          upcomingExams,
        ] = await Promise.all([
          Student.countDocuments({ schoolId }),
          Student.countDocuments({ schoolId, status: "ACTIVE" }),
          Teacher.countDocuments({ schoolId }),
          Parent.countDocuments({ schoolId }),
          Staff.countDocuments({ schoolId }),
          Class.countDocuments({ schoolId, ...yearFilter }),
          Subject.countDocuments({ schoolId }),
          SubjectExam.countDocuments({ schoolId, ...yearFilter }),
          Event.countDocuments({ schoolId }),
          Class.find({ schoolId, ...yearFilter, status: "ACTIVE" })
            .select("name")
            .sort({ name: 1 })
            .lean(),
          academicYear
            ? StudentEnrollment.aggregate([
                {
                  $match: {
                    schoolId: academicYear.schoolId,
                    academicYearId: academicYear._id,
                    status: "ACTIVE",
                  },
                },
                {
                  $lookup: {
                    from: "students",
                    localField: "studentId",
                    foreignField: "_id",
                    as: "student",
                  },
                },
                { $unwind: "$student" },
                { $match: { "student.schoolId": academicYear.schoolId, "student.status": "ACTIVE" } },
                { $group: { _id: "$classId", students: { $addToSet: "$studentId" } } },
              ])
            : [],
          academicYear
            ? getAttendanceSummary({ schoolId, academicYearId: academicYear._id })
            : Promise.resolve({ recorded: 0, present: 0, absent: 0, late: 0, excused: 0, presentPercentage: null }),
          academicYear
            ? useFallback(getMonthlyCounts(StudentEnrollment, {
                schoolId: new mongoose.Types.ObjectId(schoolId),
                academicYearId: academicYear._id,
              }), null)
            : Promise.resolve([]),
          academicYear
            ? useFallback(getMonthlyAttendance(schoolId, academicYear._id), null)
            : Promise.resolve([]),
          useFallback(Fee.aggregate([
            { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
            {
              $group: {
                _id: null,
                billed: { $sum: "$amount" },
                paid: { $sum: "$paidAmount" },
                count: { $sum: 1 },
              },
            },
          ]), null),
          academicYear
            ? useFallback(StudentEnrollment.find({ schoolId, academicYearId: academicYear._id })
                .populate("studentId", "fullName roleNumber")
                .populate("classId", "name")
                .select("createdAt studentId classId status")
                .sort({ createdAt: -1 })
                .limit(recentListLimit)
                .lean(), null)
            : Promise.resolve([]),
          getUpcomingExams(schoolId, yearFilter),
        ]);

        const enrollmentByClass = new Map(
          classEnrollmentTotals.map((item) => [String(item._id), item.students.length]),
        );
        const classEnrollment = classRecords.map((classRecord) => ({
          _id: classRecord._id,
          name: classRecord.name,
          students: enrollmentByClass.get(String(classRecord._id)) || 0,
        }));

        return res.json({
          role: req.user.role,
          currentAcademicYear: academicYear,
          summary: [
            { label: "Total Students", value: totalStudents },
            { label: "Active Students", value: activeStudents },
            { label: "Teachers", value: totalTeachers },
            { label: "Parents", value: totalParents },
            { label: "Staff", value: totalStaff },
            { label: "Current Year Classes", value: totalClasses },
            { label: "Subjects", value: totalSubjects },
            { label: "Subject Exams", value: totalSubjectExams },
            { label: "School Events", value: totalEvents },
          ],
          classEnrollment,
          attendance,
          studentEnrollmentTrend,
          attendanceTrend,
          feeSummary: feeTotals ? {
            billed: feeTotals[0]?.billed || 0,
            paid: feeTotals[0]?.paid || 0,
            outstanding: Math.max(0, (feeTotals[0]?.billed || 0) - (feeTotals[0]?.paid || 0)),
            feeCount: feeTotals[0]?.count || 0,
          } : null,
          recentEnrollments,
          upcomingExams,
          upcomingEvents,
        });
      }

      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId,
          status: "ACTIVE",
        }).select("_id fullName");
        if (!teacher) return res.status(404).json({ message: "Teacher profile not found." });

        const assignments = academicYear
          ? await TeacherAssignment.find({
              schoolId,
              teacherId: teacher._id,
              academicYearId: academicYear._id,
            })
              .populate("classId", "name")
              .populate("subjectId", "name")
              .select("classId subjectId")
          : [];
        const classIds = [...new Set(assignments.map((item) => String(item.classId?._id)).filter(Boolean))];
        const subjectIds = [...new Set(assignments.map((item) => String(item.subjectId?._id)).filter(Boolean))];
        const assignedClasses = [...new Map(assignments
          .filter((item) => item.classId)
          .map((item) => [String(item.classId._id), { _id: item.classId._id, name: item.classId.name }])).values()];
        const assignedSubjects = [...new Map(assignments
          .filter((item) => item.subjectId)
          .map((item) => [String(item.subjectId._id), { _id: item.subjectId._id, name: item.subjectId.name }])).values()];
        const activeEnrollmentRecords = classIds.length && academicYear
          ? await StudentEnrollment.find({
              schoolId,
              classId: { $in: classIds },
              academicYearId: academicYear._id,
              status: "ACTIVE",
            }).select("studentId")
          : [];
        const studentIds = [...new Set(activeEnrollmentRecords.map((item) => String(item.studentId)))];
        const activeStudents = studentIds.length
          ? await Student.countDocuments({ _id: { $in: studentIds }, schoolId, status: "ACTIVE" })
          : 0;
        const examConditions = assignments.map((item) => ({
          classId: item.classId?._id,
          subjectId: item.subjectId?._id,
        }));
        const upcomingExams = academicYear && examConditions.length
          ? await getUpcomingExams(schoolId, {
              academicYearId: academicYear._id,
              teacherId: teacher._id,
              $or: examConditions,
            })
          : [];
        const attendance = academicYear && classIds.length
          ? await getAttendanceSummary({
              schoolId,
              academicYearId: academicYear._id,
              classId: { $in: classIds.map((id) => new mongoose.Types.ObjectId(id)) },
            })
          : { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, presentPercentage: null };

        return res.json({
          role: req.user.role,
          teacher: { fullName: teacher.fullName },
          currentAcademicYear: academicYear,
          summary: [
            { label: "Assigned Classes", value: classIds.length },
            { label: "Assigned Subjects", value: subjectIds.length },
            { label: "Students in Assigned Classes", value: activeStudents },
            { label: "Attendance rate", value: attendance.recorded ? attendance.presentPercentage : null, suffix: "%" },
          ],
          assignedClasses,
          assignedSubjects,
          attendance,
          upcomingExams,
          upcomingEvents,
        });
      }

      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({ userId: req.user.userId, schoolId })
          .select("_id fullName roleNumber status")
          .lean();
        if (!student) return res.status(404).json({ message: "Student profile not found." });

        const enrollment = await getCurrentEnrollment(student._id, schoolId, academicYear);
        const classId = enrollment?.classId?._id;
        const [attendance, recentMarks, upcomingExams, feeSummary] = await Promise.all([
          getRecentStudentAttendance(student._id, schoolId, academicYear?._id),
          getRecentStudentMarks(student._id, schoolId, academicYear?._id),
          classId && academicYear
            ? getUpcomingExams(schoolId, { classId, academicYearId: academicYear._id })
            : [],
          useFallback(getStudentFeeSummary(student._id, schoolId), null),
        ]);

        return res.json({
          role: req.user.role,
          currentAcademicYear: academicYear,
          student,
          currentClass: enrollment?.classId || null,
          attendance,
          recentMarks,
          upcomingExams,
          feeSummary,
          upcomingEvents,
        });
      }

      // Parents only receive details for children linked through Student.parentId.
      const parent = await Parent.findOne({ userId: req.user.userId, schoolId, status: "ACTIVE" })
        .select("_id fullName")
        .lean();
      if (!parent) return res.status(404).json({ message: "Parent profile not found." });

      const children = await Student.find({ parentId: parent._id, schoolId })
        .select("_id fullName roleNumber status")
        .sort({ fullName: 1 })
        .lean();
      const childrenWithDetails = await Promise.all(children.map(async (child) => {
        const enrollment = await getCurrentEnrollment(child._id, schoolId, academicYear);
        const classId = enrollment?.classId?._id;
        const [attendance, recentMarks, upcomingExams, feeSummary] = await Promise.all([
          getRecentStudentAttendance(child._id, schoolId, academicYear?._id),
          getRecentStudentMarks(child._id, schoolId, academicYear?._id),
          classId && academicYear
            ? getUpcomingExams(schoolId, { classId, academicYearId: academicYear._id })
            : [],
          useFallback(getStudentFeeSummary(child._id, schoolId), null),
        ]);

        return {
          ...child,
          currentClass: enrollment?.classId || null,
          attendance,
          recentMarks,
          upcomingExams,
          feeSummary,
        };
      }));

      return res.json({
        role: req.user.role,
        parent,
        currentAcademicYear: academicYear,
        children: childrenWithDetails,
        upcomingEvents,
      });
    } catch (error) {
      console.error("Dashboard request failed:", error);
      return res.status(500).json({ message: "Unable to load dashboard information." });
    }
  },
);

export default router;
