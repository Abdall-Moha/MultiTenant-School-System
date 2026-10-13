import express from "express";
import mongoose from "mongoose";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Teacher from "../models/Teacher.js";
import Class from "../models/Class.js";
import Subject from "../models/Subject.js";
import AcademicYear from "../models/AcademicYear.js";
import Attendance from "../models/Attendence.js";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();
const populated = (query) => query.populate("teacherId", "fullName phone status").populate("classId", "name academicYearId numberOfPeriods status").populate("subjectId", "name status").populate("academicYearId", "name startDate endDate isCurrent");

router.post("/", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const { teacherId, classId, subjectId, academicYearId } = req.body;
    const schoolId = req.user.role === "SUPER_ADMIN" ? req.body.schoolId : req.schoolId;
    if (!schoolId || ![teacherId, classId, subjectId, academicYearId].every((id) => mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ message: "A valid school, teacher, class, subject and academic year are required." });
    const [teacher, classData, subject, year] = await Promise.all([
      Teacher.findOne({ _id: teacherId, schoolId, status: "ACTIVE" }),
      Class.findOne({ _id: classId, schoolId, status: "ACTIVE", academicYearId }),
      Subject.findOne({ _id: subjectId, schoolId, status: "ACTIVE" }),
      AcademicYear.findOne({ _id: academicYearId, schoolId }),
    ]);
    if (!teacher || !classData || !subject || !year) return res.status(400).json({ message: "Teacher, class, subject and academic year must be active and belong to the same school; class must use the selected year." });
    const assignment = await TeacherAssignment.create({ schoolId, teacherId, classId, subjectId, academicYearId, createdBy: req.user.userId });
    return res.status(201).json({ assignment: await populated(TeacherAssignment.findById(assignment._id)) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This teacher assignment already exists." });
    console.error(error); return res.status(500).json({ message: "Failed to create teacher assignment." });
  }
});

router.get("/", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"), async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = {};
    if (req.user.role === "SUPER_ADMIN") { if (req.query.schoolId) filter.schoolId = req.query.schoolId; }
    else filter.schoolId = req.schoolId;
    if (req.user.role === "TEACHER") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.schoolId });
      filter.teacherId = teacher?._id || null;
    } else if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    if (req.query.academicYearId) filter.academicYearId = req.query.academicYearId;
    const [assignments, total] = await Promise.all([populated(TeacherAssignment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)), TeacherAssignment.countDocuments(filter)]);
    return res.json({ assignments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to get teacher assignments." }); }
});

router.get("/:id", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"), async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...(req.user.role === "SUPER_ADMIN" ? {} : { schoolId: req.schoolId }) };
    if (req.user.role === "TEACHER") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.schoolId });
      filter.teacherId = teacher?._id || null;
    }
    const assignment = await populated(TeacherAssignment.findOne(filter));
    if (!assignment) return res.status(404).json({ message: "Teacher assignment not found." });
    return res.json({ assignment });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to get teacher assignment." }); }
});

router.put("/:id", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const assignment = await TeacherAssignment.findOne({ _id: req.params.id, ...(req.user.role === "SUPER_ADMIN" ? {} : { schoolId: req.schoolId }) });
    if (!assignment) return res.status(404).json({ message: "Teacher assignment not found." });
    const teacherId = req.body.teacherId ?? assignment.teacherId;
    const classId = req.body.classId ?? assignment.classId;
    const subjectId = req.body.subjectId ?? assignment.subjectId;
    const academicYearId = req.body.academicYearId ?? assignment.academicYearId;
    const [teacher, classData, subject, year] = await Promise.all([
      Teacher.findOne({ _id: teacherId, schoolId: assignment.schoolId, status: "ACTIVE" }),
      Class.findOne({ _id: classId, schoolId: assignment.schoolId, status: "ACTIVE", academicYearId }),
      Subject.findOne({ _id: subjectId, schoolId: assignment.schoolId, status: "ACTIVE" }),
      AcademicYear.findOne({ _id: academicYearId, schoolId: assignment.schoolId }),
    ]);
    if (!teacher || !classData || !subject || !year) return res.status(400).json({ message: "Teacher, class, subject and academic year must belong to this school and class must use the selected year." });
    const hasAttendance = await Attendance.exists({ schoolId: assignment.schoolId, classId: assignment.classId, academicYearId: assignment.academicYearId });
    if (hasAttendance && (String(classId) !== String(assignment.classId) || String(academicYearId) !== String(assignment.academicYearId) || String(teacherId) !== String(assignment.teacherId) || String(subjectId) !== String(assignment.subjectId))) return res.status(409).json({ message: "This assignment is referenced by attendance history and cannot be changed." });
    Object.assign(assignment, { teacherId, classId, subjectId, academicYearId });
    await assignment.save();
    return res.json({ assignment: await populated(TeacherAssignment.findById(assignment._id)) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This teacher assignment already exists." });
    console.error(error); return res.status(500).json({ message: "Failed to update teacher assignment." });
  }
});

router.delete("/:id", authMiddleware, tenantMiddleware, roleMiddleware("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const assignment = await TeacherAssignment.findOne({ _id: req.params.id, ...(req.user.role === "SUPER_ADMIN" ? {} : { schoolId: req.schoolId }) });
    if (!assignment) return res.status(404).json({ message: "Teacher assignment not found." });
    const attendance = await Attendance.exists({ schoolId: assignment.schoolId, classId: assignment.classId, academicYearId: assignment.academicYearId });
    if (attendance) return res.status(409).json({ message: "This assignment is referenced by attendance history and cannot be deleted." });
    await assignment.deleteOne();
    return res.json({ message: "Teacher assignment deleted." });
  } catch (error) { console.error(error); return res.status(500).json({ message: "Failed to delete teacher assignment." }); }
});

export default router;
