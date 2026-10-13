import express from "express";
import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Student from "../models/Student.js";
import AcademicYear from "../models/AcademicYear.js";
import Class from "../models/Class.js";
import Parent from "../models/Parent.js";
import Teacher from "../models/Teacher.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Attendance from "../models/Attendence.js";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();
const populate = (query) => query.populate("studentId", "roleNumber fullName parentId status").populate("academicYearId", "name startDate endDate isCurrent").populate("classId", "name academicYearId numberOfPeriods status");

async function enrollmentFilter(req) {
  const filter = {};
  if (req.user.role === "SUPER_ADMIN") {
    if (req.query.schoolId) filter.schoolId = req.query.schoolId;
  } else filter.schoolId = req.schoolId;
  if (req.query.academicYearId) filter.academicYearId = req.query.academicYearId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.studentId) filter.studentId = req.query.studentId;
  if (req.query.status) filter.status = req.query.status;
  if (req.user.role === "STUDENT") {
    const student = await Student.findOne({ userId: req.user.userId, schoolId: req.schoolId });
    filter.studentId = student?._id || null;
  } else if (req.user.role === "PARENT") {
    const parent = await Parent.findOne({ userId: req.user.userId, schoolId: req.schoolId });
    filter.studentId = { $in: parent ? await Student.distinct("_id", { parentId: parent._id, schoolId: req.schoolId }) : [] };
  } else if (req.user.role === "TEACHER") {
    const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.schoolId });
    const assignments = teacher ? await TeacherAssignment.find({ teacherId: teacher._id, schoolId: req.schoolId }).select("classId academicYearId") : [];
    filter.$or = assignments.map((assignment) => ({ classId: assignment.classId, academicYearId: assignment.academicYearId }));
  }
  return filter;
}

router.get("/", authMiddleware, tenantMiddleware, roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"), async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = await enrollmentFilter(req);
    const [enrollments, total] = await Promise.all([populate(StudentEnrollment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)), StudentEnrollment.countDocuments(filter)]);
    return res.json({ enrollments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to get student enrollments." }); }
});

router.get("/:id", authMiddleware, tenantMiddleware, roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid enrollment ID." });
    const filter = await enrollmentFilter(req);
    const enrollment = await populate(StudentEnrollment.findOne({ _id: req.params.id, ...filter }));
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found." });
    return res.json({ enrollment });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to get enrollment." }); }
});

router.post("/", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { studentId, academicYearId, classId, status } = req.body;
    const schoolId = req.user.role === "SUPER_ADMIN" ? req.body.schoolId : req.schoolId;
    if (!schoolId || ![studentId, academicYearId, classId].every(mongoose.Types.ObjectId.isValid)) return res.status(400).json({ message: "A valid school, student, academic year and class are required." });
    if (status && !["ACTIVE", "REPEATED", "TRANSFERRED", "GRADUATED"].includes(status)) return res.status(400).json({ message: "Invalid enrollment status." });
    const [student, academicYear, classData] = await Promise.all([
      Student.findOne({ _id: studentId, schoolId }),
      AcademicYear.findOne({ _id: academicYearId, schoolId }),
      Class.findOne({ _id: classId, schoolId, academicYearId }),
    ]);
    if (!student || !academicYear || !classData) return res.status(400).json({ message: "Student, academic year and class must belong to the selected school, and the class must use that academic year." });
    const enrollment = await StudentEnrollment.create({ schoolId, studentId, academicYearId, classId, status: status || "ACTIVE", createdBy: req.user.userId });
    return res.status(201).json({ enrollment: await populate(StudentEnrollment.findById(enrollment._id)) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This student already has an enrollment for that academic year." });
    console.error(error); return res.status(500).json({ message: "Failed to create enrollment." });
  }
});

router.put("/:id", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...(req.user.role === "SUPER_ADMIN" ? {} : { schoolId: req.schoolId }) };
    const enrollment = await StudentEnrollment.findOne(filter);
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found." });
    const academicYearId = req.body.academicYearId ?? enrollment.academicYearId;
    const classId = req.body.classId ?? enrollment.classId;
    const studentId = req.body.studentId ?? enrollment.studentId;
    const status = req.body.status ?? enrollment.status;
    if (!["ACTIVE", "REPEATED", "TRANSFERRED", "GRADUATED"].includes(status)) return res.status(400).json({ message: "Invalid enrollment status." });
    const [student, year, classData] = await Promise.all([
      Student.findOne({ _id: studentId, schoolId: enrollment.schoolId }),
      AcademicYear.findOne({ _id: academicYearId, schoolId: enrollment.schoolId }),
      Class.findOne({ _id: classId, schoolId: enrollment.schoolId, academicYearId }),
    ]);
    if (!student || !year || !classData) return res.status(400).json({ message: "Student, year and class must belong to this school and the class must match the year." });
    if (String(academicYearId) !== String(enrollment.academicYearId)) return res.status(400).json({ message: "Create a new enrollment for a new academic year to preserve student history." });
    const placementChanged = String(studentId) !== String(enrollment.studentId) || String(academicYearId) !== String(enrollment.academicYearId) || String(classId) !== String(enrollment.classId);
    if (placementChanged && await Attendance.exists({ schoolId: enrollment.schoolId, studentId: enrollment.studentId, academicYearId: enrollment.academicYearId })) return res.status(409).json({ message: "This enrollment has attendance history and cannot be moved. Create a new year enrollment instead." });
    enrollment.studentId = studentId; enrollment.academicYearId = academicYearId; enrollment.classId = classId; enrollment.status = status;
    await enrollment.save();
    return res.json({ enrollment: await populate(StudentEnrollment.findById(enrollment._id)) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This student already has an enrollment for that academic year." });
    console.error(error); return res.status(500).json({ message: "Failed to update enrollment." });
  }
});

router.delete("/:id", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const enrollment = await StudentEnrollment.findOne({ _id: req.params.id, ...(req.user.role === "SUPER_ADMIN" ? {} : { schoolId: req.schoolId }) });
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found." });
    enrollment.status = "TRANSFERRED";
    await enrollment.save();
    return res.json({ message: "Enrollment retained as historical record and marked transferred.", enrollment });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to delete enrollment." }); }
});

export default router;
