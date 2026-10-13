import express from "express";
import mongoose from "mongoose";
import Examination from "../models/Examination.js";
import AcademicYear from "../models/AcademicYear.js";
import School from "../models/School.js";
import Teacher from "../models/Teacher.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// List shared examination names available to the signed-in role.
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
      const filter = {};

      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) filter.schoolId = req.query.schoolId;
      } else {
        filter.schoolId = req.schoolId;
      }

      if (req.query.academicYearId) {
        if (!mongoose.Types.ObjectId.isValid(req.query.academicYearId)) {
          return res.status(400).json({ message: "Please select a valid academic year." });
        }
        filter.academicYearId = req.query.academicYearId;
      }

      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
          status: "ACTIVE",
        }).select("_id");
        const yearIds = teacher
          ? await TeacherAssignment.distinct("academicYearId", {
              schoolId: req.schoolId,
              teacherId: teacher._id,
            })
          : [];
        filter.academicYearId = { $in: yearIds };
        if (req.query.academicYearId) {
          filter.academicYearId = {
            $in: yearIds.filter((id) => String(id) === req.query.academicYearId),
          };
        }
      }

      const [examinations, total] = await Promise.all([
        Examination.find(filter)
          .populate("academicYearId", "name")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Examination.countDocuments(filter),
      ]);

      return res.json({
        examinations,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error("Failed to get examinations:", error);
      return res.status(500).json({ message: "Failed to get examinations." });
    }
  },
);

// Only an Admin or SuperAdmin can register a shared examination name.
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const { academicYearId, name } = req.body;
      const schoolId = req.user.role === "SUPER_ADMIN" ? req.body.schoolId : req.schoolId;
      if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
        return res.status(400).json({ message: "Please select a valid school." });
      }
      if (!mongoose.Types.ObjectId.isValid(academicYearId)) {
        return res.status(400).json({ message: "Please select a valid academic year." });
      }
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Examination name is required." });
      }

      const [school, academicYear] = await Promise.all([
        School.findById(schoolId).select("status"),
        AcademicYear.findOne({ _id: academicYearId, schoolId }),
      ]);
      if (!school || school.status !== "ACTIVE") {
        return res.status(400).json({ message: "Select an active school." });
      }
      if (!academicYear) {
        return res.status(400).json({ message: "Academic year must belong to the selected school." });
      }

      const cleanName = name.trim();
      const nameKey = cleanName.toLocaleLowerCase();
      const existing = await Examination.findOne({ schoolId, academicYearId, nameKey });
      if (existing) {
        return res.status(409).json({ message: "This examination is already registered for the selected academic year." });
      }

      const examination = await Examination.create({
        schoolId,
        academicYearId,
        name: cleanName,
        nameKey,
        createdBy: req.user.userId,
      });
      return res.status(201).json({ message: "Examination registered.", examination });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "This examination is already registered for the selected academic year." });
      }
      console.error("Failed to register examination:", error);
      return res.status(500).json({ message: "Failed to register examination." });
    }
  },
);

export default router;
