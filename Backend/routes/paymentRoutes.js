import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";

import Payment from "../models/Payment.js";
import Fee from "../models/Fee.js";
import Student from "../models/Student.js";
import Parent from "../models/Parent.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// Protect all payment routes
router.use(authMiddleware);
router.use(tenantMiddleware);

/*
  CREATE PAYMENT

  Admin/SuperAdmin can record a payment.

  When a payment is created:
  1. Find the fee
  2. Check the student belongs to the same school
  3. Check payment does not exceed remaining balance
  4. Create payment
  5. Update fee paidAmount/status

  The fee balance is updated atomically so overpayments are prevented,
  including when two payments are recorded at nearly the same time.
*/
router.post(
  "/",
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    let payment;
    let updatedFee;
    let schoolId = req.schoolId;
    try {
      const {
        feeId,
        amount,
        paymentDate,
        paymentMethod,
        notes,
      } = req.body;

      // Validate required fields
      if (!feeId || amount === undefined) {
        return res.status(400).json({
          message: "feeId and amount are required.",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(feeId)) {
        return res.status(400).json({
          message: "Invalid fee ID.",
        });
      }

      const paymentAmount = Number(amount);

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({
          message: "Payment amount must be greater than 0.",
        });
      }

      // Only allow the payment methods used by the system
      const allowedMethods = ["E-Dahab", "BANK", "EVC"];

      if (
        paymentMethod !== undefined &&
        !allowedMethods.includes(paymentMethod)
      ) {
        return res.status(400).json({
          message: "Invalid payment method.",
        });
      }

      // SuperAdmin must tell us which school the payment belongs to
      if (req.user.role === "SUPER_ADMIN") {
        if (!req.body.schoolId) {
          return res.status(400).json({
            message: "schoolId is required for SuperAdmin.",
          });
        }

        if (!mongoose.Types.ObjectId.isValid(req.body.schoolId)) {
          return res.status(400).json({
            message: "Invalid school ID.",
          });
        }

        schoolId = req.body.schoolId;
      }

      // Find the fee inside the correct school
      const fee = await Fee.findOne({
        _id: feeId,
        schoolId,
      });

      if (!fee) {
        return res.status(404).json({
          message: "Fee not found.",
        });
      }

      // Make sure the fee's student belongs to the same school
      const student = await Student.findOne({
        _id: fee.studentId,
        schoolId,
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      // Calculate how much is still unpaid
      const remainingAmount = fee.amount - fee.paidAmount;

      if (paymentAmount > remainingAmount) {
        return res.status(400).json({
          message: `Payment cannot be greater than the remaining balance of ${remainingAmount}.`,
        });
      }

      /*
        Generate receipt number on the backend.

        randomUUID prevents two requests from accidentally
        receiving the same receipt number.
      */
      const receiptNumber = `RCT-${crypto.randomUUID()}`;

      const newPaidAmount = fee.paidAmount + paymentAmount;
      let newStatus = "UNPAID";

      if (newPaidAmount >= fee.amount) {
        newStatus = "PAID";
      } else if (newPaidAmount > 0) {
        newStatus = "PARTIAL";
      }

      // Match the current paid amount to avoid overwriting a concurrent payment.
      updatedFee = await Fee.findOneAndUpdate(
        {
          _id: fee._id,
          schoolId,
          paidAmount: fee.paidAmount,
          $expr: {
            $gte: [
              { $subtract: ["$amount", "$paidAmount"] },
              paymentAmount,
            ],
          },
        },
        { $set: { paidAmount: newPaidAmount, status: newStatus } },
        { new: true },
      );

      if (!updatedFee) {
        return res.status(409).json({
          message: "The fee balance changed. Refresh the page and try again.",
        });
      }

      payment = new Payment({
        schoolId,
        feeId: fee._id,
        studentId: student._id,
        amount: paymentAmount,
        paymentDate: paymentDate || new Date(),
        paymentMethod: paymentMethod || "EVC",
        receiptNumber,
        receivedBy: req.user.userId,
        notes,
      });

      await payment.save();

      return res.status(201).json({
        message: "Payment recorded successfully.",
        payment,
        fee: {
          id: updatedFee._id,
          amount: updatedFee.amount,
          paidAmount: updatedFee.paidAmount,
          status: updatedFee.status,
        },
      });
    } catch (error) {
      // If saving the payment fails after the balance update, restore the fee.
      if (updatedFee) {
        try {
          const paidAmountBeforeRollback = Math.max(
            updatedFee.paidAmount - Number(req.body.amount),
            0,
          );
          let rollbackStatus = "UNPAID";

          if (paidAmountBeforeRollback >= updatedFee.amount) {
            rollbackStatus = "PAID";
          } else if (paidAmountBeforeRollback > 0) {
            rollbackStatus = "PARTIAL";
          }

          await Fee.updateOne(
            {
              _id: updatedFee._id,
              schoolId,
              paidAmount: updatedFee.paidAmount,
            },
            { $set: { paidAmount: paidAmountBeforeRollback, status: rollbackStatus } },
          );
        } catch (rollbackError) {
          console.error("Fee balance rollback error:", rollbackError);
        }
      }

      if (payment?._id) {
        try {
          await Payment.deleteOne({ _id: payment._id });
        } catch (deleteError) {
          console.error("Unfinished payment cleanup error:", deleteError);
        }
      }

      // Handle duplicate receipt number
      if (error.code === 11000) {
        return res.status(409).json({
          message: "Payment receipt number already exists. Please try again.",
        });
      }

      console.error("Create payment error:", error);

      return res.status(500).json({
        message: error.message || "Failed to record payment.",
      });
    }
  }
);

/*
  GET ALL PAYMENTS

  Admin/SuperAdmin:
    Can see payments belonging to their school.

  Student:
    Can see only their own payments.

  Parent:
    Can see payments for their children.

  Teachers cannot access this route.
*/
router.get(
  "/",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"),
  async (req, res) => {
    try {
      let filter = {};

      // SuperAdmin can select a school
      if (req.user.role === "SUPER_ADMIN") {
        if (!req.query.schoolId) {
          return res.status(400).json({
            message: "schoolId is required for SuperAdmin.",
          });
        }

        if (!mongoose.Types.ObjectId.isValid(req.query.schoolId)) {
          return res.status(400).json({
            message: "Invalid school ID.",
          });
        }

        filter.schoolId = req.query.schoolId;
      } else {
        // Normal users are always restricted to their own school
        filter.schoolId = req.schoolId;
      }

      /*
        Student scope.

        IMPORTANT:
        We do not allow ?studentId=anotherStudent
        to replace this condition.
      */
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

        filter.studentId = student._id;
      }

      /*
        Parent scope.

        Parent can only see payments belonging to
        students listed in their children array.
      */
      if (req.user.role === "PARENT") {
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

      // Optional admin filter
      if (
        ["SUPER_ADMIN", "ADMIN"].includes(req.user.role) &&
        req.query.studentId
      ) {
        if (!mongoose.Types.ObjectId.isValid(req.query.studentId)) {
          return res.status(400).json({
            message: "Invalid student ID.",
          });
        }

        filter.studentId = req.query.studentId;
      }

      // Pagination
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(
        Math.max(Number(req.query.limit) || 20, 1),
        100
      );

      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        Payment.find(filter)
          .populate("studentId", "fullName roleNumber")
          .populate("feeId", "amount paidAmount status description")
          .populate("receivedBy", "name role")
          .sort({ paymentDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit),

        Payment.countDocuments(filter),
      ]);

      return res.status(200).json({
        payments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get payments error:", error);

      return res.status(500).json({
        message: "Failed to fetch payments.",
      });
    }
  }
);

/*
  GET PAYMENTS FOR ONE FEE

  Example:
  GET /api/payments/fee/64....

  Admin/SuperAdmin can view any fee in their allowed school.

  Student/Parent can only view payments they are allowed
  to see through the fee's student.
*/
router.get(
  "/fee/:feeId",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"),
  async (req, res) => {
    try {
      const { feeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(feeId)) {
        return res.status(400).json({
          message: "Invalid fee ID.",
        });
      }

      let schoolId = req.schoolId;

      if (req.user.role === "SUPER_ADMIN") {
        if (!req.query.schoolId) {
          return res.status(400).json({
            message: "schoolId is required for SuperAdmin.",
          });
        }

        if (!mongoose.Types.ObjectId.isValid(req.query.schoolId)) {
          return res.status(400).json({
            message: "Invalid school ID.",
          });
        }

        schoolId = req.query.schoolId;
      }

      const fee = await Fee.findOne({
        _id: feeId,
        schoolId,
      });

      if (!fee) {
        return res.status(404).json({
          message: "Fee not found.",
        });
      }

      // Student can only access their own fee
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!student || !student._id.equals(fee.studentId)) {
          return res.status(403).json({
            message: "You do not have access to this fee.",
          });
        }
      }

      // Parent can only access a child's fee
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !parent ||
          !parent.children.some((childId) =>
            childId.equals(fee.studentId)
          )
        ) {
          return res.status(403).json({
            message: "You do not have access to this fee.",
          });
        }
      }

      const payments = await Payment.find({
        schoolId,
        feeId,
      })
        .populate("studentId", "fullName roleNumber")
        .populate("receivedBy", "name role")
        .sort({ paymentDate: -1, createdAt: -1 });

      return res.status(200).json({
        fee: {
          id: fee._id,
          amount: fee.amount,
          paidAmount: fee.paidAmount,
          remainingAmount: fee.amount - fee.paidAmount,
          status: fee.status,
          description: fee.description,
        },
        payments,
      });
    } catch (error) {
      console.error("Get fee payments error:", error);

      return res.status(500).json({
        message: "Failed to fetch fee payments.",
      });
    }
  }
);

/*
  GET ONE PAYMENT

  Used when opening a payment receipt/details page.
*/
router.get(
  "/:id",
  roleMiddleware("SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid payment ID.",
        });
      }

      let schoolId = req.schoolId;

      if (req.user.role === "SUPER_ADMIN") {
        if (!req.query.schoolId) {
          return res.status(400).json({
            message: "schoolId is required for SuperAdmin.",
          });
        }

        if (!mongoose.Types.ObjectId.isValid(req.query.schoolId)) {
          return res.status(400).json({
            message: "Invalid school ID.",
          });
        }

        schoolId = req.query.schoolId;
      }

      const payment = await Payment.findOne({
        _id: id,
        schoolId,
      })
        .populate("studentId", "fullName roleNumber")
        .populate("feeId", "amount paidAmount status description")
        .populate("receivedBy", "name role");

      if (!payment) {
        return res.status(404).json({
          message: "Payment not found.",
        });
      }

      const oldPaymentValues = {
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        notes: payment.notes,
      };

      // Student can only view their own payment
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !student ||
          !student._id.equals(payment.studentId._id)
        ) {
          return res.status(403).json({
            message: "You do not have access to this payment.",
          });
        }
      }

      // Parent can only view payments belonging to their children
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !parent ||
          !parent.children.some((childId) =>
            childId.equals(payment.studentId._id)
          )
        ) {
          return res.status(403).json({
            message: "You do not have access to this payment.",
          });
        }
      }

      return res.status(200).json({
        payment,
      });
    } catch (error) {
      console.error("Get payment error:", error);

      return res.status(500).json({
        message: "Failed to fetch payment.",
      });
    }
  }
);

/*
  UPDATE PAYMENT

  Admin/SuperAdmin can edit:
    - amount
    - paymentDate
    - paymentMethod
    - notes

  Cannot edit:
    - schoolId
    - feeId
    - studentId
    - receiptNumber
    - receivedBy

  IMPORTANT:
  We recalculate the fee's paidAmount from all payments
  instead of simply adding/subtracting the difference.

  This keeps the Fee aggregate accurate even if there
  was an old data inconsistency.
*/
router.put(
  "/:id",
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid payment ID.",
        });
      }

      const allowedMethods = ["E-Dahab", "BANK", "EVC"];

      if (
        req.body.paymentMethod !== undefined &&
        !allowedMethods.includes(req.body.paymentMethod)
      ) {
        return res.status(400).json({
          message: "Invalid payment method.",
        });
      }

      let schoolId = req.schoolId;

      if (req.user.role === "SUPER_ADMIN") {
        if (!req.body.schoolId) {
          return res.status(400).json({
            message: "schoolId is required for SuperAdmin.",
          });
        }

        if (!mongoose.Types.ObjectId.isValid(req.body.schoolId)) {
          return res.status(400).json({
            message: "Invalid school ID.",
          });
        }

        schoolId = req.body.schoolId;
      }

      const payment = await Payment.findOne({
        _id: id,
        schoolId,
      });

      if (!payment) {
        return res.status(404).json({
          message: "Payment not found.",
        });
      }

      const fee = await Fee.findOne({
        _id: payment.feeId,
        schoolId,
      });

      if (!fee) {
        return res.status(404).json({
          message: "Related fee not found.",
        });
      }

      // Only update fields that are allowed to be edited
      if (req.body.amount !== undefined) {
        const newAmount = Number(req.body.amount);

        if (!Number.isFinite(newAmount) || newAmount <= 0) {
          return res.status(400).json({
            message: "Payment amount must be greater than 0.",
          });
        }

        payment.amount = newAmount;
      }

      if (req.body.paymentDate !== undefined) {
        const newDate = new Date(req.body.paymentDate);

        if (Number.isNaN(newDate.getTime())) {
          return res.status(400).json({
            message: "Invalid payment date.",
          });
        }

        payment.paymentDate = newDate;
      }

      if (req.body.paymentMethod !== undefined) {
        payment.paymentMethod = req.body.paymentMethod;
      }

      if (req.body.notes !== undefined) {
        payment.notes = req.body.notes;
      }

      /*
        Get every payment for this fee except the payment
        currently being edited.
      */
      const otherPayments = await Payment.find({
        schoolId,
        feeId: payment.feeId,
        _id: { $ne: payment._id },
      });

      const otherPaymentsTotal = otherPayments.reduce(
        (total, item) => total + item.amount,
        0
      );

      const newPaidAmount = otherPaymentsTotal + payment.amount;

      // Payment total can never be greater than the fee
      if (newPaidAmount > fee.amount) {
        return res.status(400).json({
          message: `Payment total cannot be greater than the fee amount of ${fee.amount}.`,
        });
      }

      // Recalculate Fee aggregate
      fee.paidAmount = newPaidAmount;

      if (newPaidAmount === 0) {
        fee.status = "UNPAID";
      } else if (newPaidAmount < fee.amount) {
        fee.status = "PARTIAL";
      } else {
        fee.status = "PAID";
      }

      let paymentSaved = false;
      try {
        await payment.save();
        paymentSaved = true;
        await fee.save();
      } catch (saveError) {
        if (paymentSaved) {
          await Payment.updateOne(
            { _id: payment._id, schoolId },
            { $set: oldPaymentValues },
          );
        }
        throw saveError;
      }

      return res.status(200).json({
        message: "Payment updated successfully.",
        payment,
        fee: {
          id: fee._id,
          amount: fee.amount,
          paidAmount: fee.paidAmount,
          remainingAmount: fee.amount - fee.paidAmount,
          status: fee.status,
        },
      });
    } catch (error) {
      console.error("Update payment error:", error);

      return res.status(500).json({
        message: error.message || "Failed to update payment.",
      });
    }
  }
);

/*
  THERE IS INTENTIONALLY NO DELETE ROUTE.

  Payment records are financial records.
  If an admin makes a mistake, they edit the payment
  instead of deleting it.
*/

export default router;
