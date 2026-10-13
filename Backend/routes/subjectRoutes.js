import express from "express";

import Subject from "../models/Subject.js";
import School from "../models/School.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();


// ======================================================
// CREATE SUBJECT
// POST /api/subjects
// ADMIN and SUPER_ADMIN only
// ======================================================
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        schoolId,
        name,
        status,
      } = req.body;

      const targetSchoolId =
        req.user.role === "SUPER_ADMIN" ? schoolId : req.schoolId;

      if (!targetSchoolId) {
        return res.status(400).json({
          message: "schoolId is required.",
        });
      }

      if (!name) {
        return res.status(400).json({
          message: "Subject name is required.",
        });
      }

      const school = await School.findById(targetSchoolId);

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status !== "ACTIVE") {
        return res.status(400).json({
          message: "Cannot create a subject in a suspended school.",
        });
      }

      const existingSubject = await Subject.findOne({
        schoolId: targetSchoolId,
        name,
      });

      if (existingSubject) {
        return res.status(409).json({
          message: "This subject already exists in this school.",
        });
      }

      const subject = await Subject.create({
        schoolId: targetSchoolId,
        name,
        status: status || "ACTIVE",
        createdBy: req.user.userId,
      });

      return res.status(201).json({
        message: "Subject created successfully.",
        subject,
      });
    } catch (error) {
      console.error(error);

      if (error.code === 11000) {
        return res.status(409).json({
          message: "This subject already exists in this school.",
        });
      }

      return res.status(500).json({
        message: "Failed to create subject.",
      });
    }
  }
);


// ======================================================
// GET SUBJECTS
// GET /api/subjects?page=1&limit=20
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      let page = Number(req.query.page) || 1;
      let limit = Number(req.query.limit) || 20;

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;
      if (limit > 100) limit = 100;

      const skip = (page - 1) * limit;

      const filter = {};

      if (req.query.status && ["ACTIVE", "INACTIVE"].includes(req.query.status)) {
        filter.status = req.query.status;
      }

      if (req.query.search?.trim()) {
        const search = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.name = { $regex: search, $options: "i" };
      }

      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          filter.schoolId = req.query.schoolId;
        }
      } else {
        filter.schoolId = req.schoolId;
      }

      const [subjects, total] = await Promise.all([
        Subject.find(filter)
          .populate("schoolId", "schoolId schoolName")
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit),

        Subject.countDocuments(filter),
      ]);

      return res.status(200).json({
        subjects,
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
        message: "Failed to get subjects.",
      });
    }
  }
);


// ======================================================
// GET SINGLE SUBJECT
// GET /api/subjects/:id
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const subject = await Subject.findById(req.params.id).populate(
        "schoolId",
        "schoolId schoolName"
      );

      if (!subject) {
        return res.status(404).json({
          message: "Subject not found.",
        });
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        subject.schoolId._id.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You do not have access to this subject.",
        });
      }

      return res.status(200).json({
        subject,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get subject.",
      });
    }
  }
);


// ======================================================
// UPDATE SUBJECT
// PUT /api/subjects/:id
// ADMIN and SUPER_ADMIN only
// ======================================================
router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        name,
        status,
      } = req.body;

      const subject = await Subject.findById(req.params.id);

      if (!subject) {
        return res.status(404).json({
          message: "Subject not found.",
        });
      }

      if (
        req.user.role === "ADMIN" &&
        subject.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot update a subject from another school.",
        });
      }

      if (name && name !== subject.name) {
        const existingSubject = await Subject.findOne({
          schoolId: subject.schoolId,
          name,
          _id: { $ne: subject._id },
        });

        if (existingSubject) {
          return res.status(409).json({
            message: "This subject already exists in this school.",
          });
        }

        subject.name = name;
      }

      if (status !== undefined) {
        subject.status = status;
      }

      await subject.save();

      return res.status(200).json({
        message: "Subject updated successfully.",
        subject,
      });
    } catch (error) {
      console.error(error);

      if (error.code === 11000) {
        return res.status(409).json({
          message: "This subject already exists in this school.",
        });
      }

      return res.status(500).json({
        message: "Failed to update subject.",
      });
    }
  }
);


// ======================================================
// DELETE SUBJECT
// DELETE /api/subjects/:id
// Soft delete = INACTIVE
// ======================================================
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const subject = await Subject.findById(req.params.id);

      if (!subject) {
        return res.status(404).json({
          message: "Subject not found.",
        });
      }

      if (
        req.user.role === "ADMIN" &&
        subject.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot delete a subject from another school.",
        });
      }

      subject.status = "INACTIVE";
      await subject.save();

      return res.status(200).json({
        message: "Subject deactivated successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to deactivate subject.",
      });
    }
  }
);

export default router;
