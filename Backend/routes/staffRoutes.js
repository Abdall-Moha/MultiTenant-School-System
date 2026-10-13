import express from "express";

import Staff from "../models/Staff.js";
import School from "../models/School.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();


// ======================================================
// CREATE STAFF
// POST /api/staff
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
        fullName,
        phoneNumber,
        position,
        hireDate,
        status,
      } = req.body;

      const targetSchoolId =
        req.user.role === "SUPER_ADMIN" ? schoolId : req.schoolId;

      if (!targetSchoolId) {
        return res.status(400).json({
          message: "schoolId is required.",
        });
      }

      if (!fullName || !position) {
        return res.status(400).json({
          message: "fullName and position are required.",
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
          message: "Cannot create staff in a suspended school.",
        });
      }

      const staff = await Staff.create({
        schoolId: targetSchoolId,
        fullName,
        phoneNumber,
        position,
        hireDate,
        status: status || "ACTIVE",
        createdBy: req.user.userId,
      });

      return res.status(201).json({
        message: "Staff created successfully.",
        staff,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to create staff.",
      });
    }
  }
);


// ======================================================
// GET STAFF
// GET /api/staff?page=1&limit=20
// ADMIN and SUPER_ADMIN
// ======================================================
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      let page = Number(req.query.page) || 1;
      let limit = Number(req.query.limit) || 20;

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;
      if (limit > 100) limit = 100;

      const skip = (page - 1) * limit;

      const filter = {};

      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          filter.schoolId = req.query.schoolId;
        }
      } else {
        filter.schoolId = req.schoolId;
      }

      if (req.query.status) filter.status = req.query.status;
      if (req.query.search) {
        const search = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (search) filter.$or = [
          { fullName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { position: { $regex: search, $options: "i" } },
        ];
      }

      const [staff, total] = await Promise.all([
        Staff.find(filter)
          .populate("schoolId", "schoolId schoolName")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),

        Staff.countDocuments(filter),
      ]);

      return res.status(200).json({
        staff,
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
        message: "Failed to get staff.",
      });
    }
  }
);


// ======================================================
// GET SINGLE STAFF
// GET /api/staff/:id
// ADMIN and SUPER_ADMIN
// ======================================================
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const staff = await Staff.findById(req.params.id).populate(
        "schoolId",
        "schoolId schoolName"
      );

      if (!staff) {
        return res.status(404).json({
          message: "Staff not found.",
        });
      }

      if (
        req.user.role === "ADMIN" &&
        staff.schoolId._id.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You do not have access to this staff member.",
        });
      }

      return res.status(200).json({
        staff,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get staff.",
      });
    }
  }
);


// ======================================================
// UPDATE STAFF
// PUT /api/staff/:id
// ADMIN and SUPER_ADMIN
// ======================================================
router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        fullName,
        phoneNumber,
        position,
        hireDate,
        status,
      } = req.body;

      const staff = await Staff.findById(req.params.id);

      if (!staff) {
        return res.status(404).json({
          message: "Staff not found.",
        });
      }

      if (
        req.user.role === "ADMIN" &&
        staff.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot update staff from another school.",
        });
      }

      if (fullName !== undefined) {
        staff.fullName = fullName;
      }

      if (phoneNumber !== undefined) {
        staff.phoneNumber = phoneNumber;
      }

      if (position !== undefined) {
        staff.position = position;
      }

      if (hireDate !== undefined) {
        staff.hireDate = hireDate;
      }

      if (status !== undefined) {
        staff.status = status;
      }

      await staff.save();

      return res.status(200).json({
        message: "Staff updated successfully.",
        staff,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to update staff.",
      });
    }
  }
);


// ======================================================
// DELETE STAFF
// DELETE /api/staff/:id
// Soft delete = INACTIVE
// ======================================================
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const staff = await Staff.findById(req.params.id);

      if (!staff) {
        return res.status(404).json({
          message: "Staff not found.",
        });
      }

      if (
        req.user.role === "ADMIN" &&
        staff.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot delete staff from another school.",
        });
      }

      staff.status = "INACTIVE";

      await staff.save();

      return res.status(200).json({
        message: "Staff deactivated successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to deactivate staff.",
      });
    }
  }
);

export default router;
