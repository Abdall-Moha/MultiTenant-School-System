import express from "express";
import mongoose from "mongoose";
import Fee from "../models/Fee.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// All fee routes require authentication
router.use(authMiddleware);

// --------------------------------------------------
// CREATE FEE
// POST /api/fees
// --------------------------------------------------
router.post(
  "/",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const {
        studentId,
        amount,
        paidAmount = 0,
        description,
        schoolId,
      } = req.body;

      if (!studentId || amount === undefined) {
        return res.status(400).json({
          message: "studentId and amount are required.",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({
          message: "Invalid studentId.",
        });
      }

      if (Number(amount) < 0 || Number(paidAmount) < 0) {
        return res.status(400).json({
          message: "Amount and paidAmount cannot be negative.",
        });
      }

      if (Number(paidAmount) > Number(amount)) {
        return res.status(400).json({
          message: "paidAmount cannot be greater than amount.",
        });
      }

      let targetSchoolId;

      // SuperAdmin chooses the school
      if (req.user.role === "SUPER_ADMIN") {
        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
          return res.status(400).json({
            message: "Valid schoolId is required.",
          });
        }

        targetSchoolId = schoolId;
      } else {
        targetSchoolId = req.schoolId;
      }

      // Make sure the school exists and is active
      const school = await School.findById(targetSchoolId);

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status !== "ACTIVE") {
        return res.status(400).json({
          message: "Cannot create fees for a suspended school.",
        });
      }

      // Make sure the student belongs to this school
      const student = await Student.findOne({
        _id: studentId,
        schoolId: targetSchoolId,
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found in this school.",
        });
      }

      const numericAmount = Number(amount);
      const numericPaidAmount = Number(paidAmount);

      let status = "UNPAID";

      if (numericPaidAmount === numericAmount) {
        status = "PAID";
      } else if (numericPaidAmount > 0) {
        status = "PARTIAL";
      }

      const fee = await Fee.create({
        schoolId: targetSchoolId,
        studentId,
        amount: numericAmount,
        paidAmount: numericPaidAmount,
        status,
        description,
        createdBy: req.user.userId,
      });

      res.status(201).json({
        message: "Fee created successfully.",
        fee,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to create fee.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// GET FEES
// GET /api/fees?page=1&limit=20
// --------------------------------------------------
router.get(
  "/",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      let page = parseInt(req.query.page) || 1;
      let limit = parseInt(req.query.limit) || 20;

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;
      if (limit > 100) limit = 100;

      const skip = (page - 1) * limit;

      const filter = {};

      // --------------------------------------------------
      // SCHOOL SCOPE
      // --------------------------------------------------
      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          if (!mongoose.Types.ObjectId.isValid(req.query.schoolId)) {
            return res.status(400).json({
              message: "Invalid schoolId.",
            });
          }

          filter.schoolId = req.query.schoolId;
        }
      } else {
        filter.schoolId = req.schoolId;
      }

      // --------------------------------------------------
      // STUDENT SCOPE
      // --------------------------------------------------
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!student) {
          return res.status(404).json({
            message: "Student profile not found.",
          });
        }

        // Student can NEVER replace this with another studentId
        filter.studentId = student._id;
      }

      // --------------------------------------------------
      // PARENT SCOPE
      // --------------------------------------------------
      if (req.user.role === "PARENT") {
        const Parent = (await import("../models/Parent.js")).default;

        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!parent) {
          return res.status(404).json({
            message: "Parent profile not found.",
          });
        }

        filter.studentId = {
          $in: parent.children,
        };
      }

      // Admin/SuperAdmin may optionally filter by student
      if (
        (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN") &&
        req.query.studentId
      ) {
        if (!mongoose.Types.ObjectId.isValid(req.query.studentId)) {
          return res.status(400).json({
            message: "Invalid studentId.",
          });
        }

        filter.studentId = req.query.studentId;
      }

      // Optional status filter
      if (req.query.status) {
        if (!["UNPAID", "PARTIAL", "PAID"].includes(req.query.status)) {
          return res.status(400).json({
            message: "Invalid fee status.",
          });
        }

        filter.status = req.query.status;
      }

      const [fees, total] = await Promise.all([
        Fee.find(filter)
          .populate("studentId", "fullName roleNumber")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),

        Fee.countDocuments(filter),
      ]);

      res.json({
        fees,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch fees.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// GET SINGLE FEE
// GET /api/fees/:id
// --------------------------------------------------
router.get(
  "/:id",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid fee ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const fee = await Fee.findOne(filter).populate(
        "studentId",
        "fullName roleNumber"
      );

      if (!fee) {
        return res.status(404).json({
          message: "Fee not found.",
        });
      }

      // Student can only see their own fee
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !student ||
          fee.studentId._id.toString() !== student._id.toString()
        ) {
          return res.status(403).json({
            message: "You do not have permission to view this fee.",
          });
        }
      }

      // Parent can only see fees belonging to their children
      if (req.user.role === "PARENT") {
        const Parent = (await import("../models/Parent.js")).default;

        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !parent ||
          !parent.children.some(
            (childId) =>
              childId.toString() === fee.studentId._id.toString()
          )
        ) {
          return res.status(403).json({
            message: "You do not have permission to view this fee.",
          });
        }
      }

      res.json(fee);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch fee.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// UPDATE FEE
// PUT /api/fees/:id
// --------------------------------------------------
router.put(
  "/:id",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid fee ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const fee = await Fee.findOne(filter);

      if (!fee) {
        return res.status(404).json({
          message: "Fee not found.",
        });
      }

      const {
        amount,
        paidAmount,
        description,
      } = req.body;

      const newAmount =
        amount !== undefined ? Number(amount) : fee.amount;

      const newPaidAmount =
        paidAmount !== undefined
          ? Number(paidAmount)
          : fee.paidAmount;

      if (newAmount < 0 || newPaidAmount < 0) {
        return res.status(400).json({
          message: "Amount and paidAmount cannot be negative.",
        });
      }

      if (newPaidAmount > newAmount) {
        return res.status(400).json({
          message: "paidAmount cannot be greater than amount.",
        });
      }

      let status = "UNPAID";

      if (newPaidAmount === newAmount) {
        status = "PAID";
      } else if (newPaidAmount > 0) {
        status = "PARTIAL";
      }

      fee.amount = newAmount;
      fee.paidAmount = newPaidAmount;
      fee.status = status;

      if (description !== undefined) {
        fee.description = description;
      }

      await fee.save();

      res.json({
        message: "Fee updated successfully.",
        fee,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to update fee.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// DELETE FEE
// DELETE /api/fees/:id
// --------------------------------------------------
router.delete(
  "/:id",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid fee ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const fee = await Fee.findOne(filter);

      if (!fee) {
        return res.status(404).json({
          message: "Fee not found.",
        });
      }

      await Fee.deleteOne({
        _id: fee._id,
      });

      res.json({
        message: "Fee deleted successfully.",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete fee.",
        error: error.message,
      });
    }
  }
);

export default router;