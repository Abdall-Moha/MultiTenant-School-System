import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fee",
      required: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentDate: {
      type: Date,
      default: Date.now,
    },

    paymentMethod: {
      type: String,
      enum: ["E-Dahab", "BANK", "EVC"],
      default: "EVC",
    },

    receiptNumber: {
      type: String,
      required: true,
      trim: true,
    },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index(
  { schoolId: 1, receiptNumber: 1 },
  { unique: true }
);

paymentSchema.index(
  { schoolId: 1, feeId: 1, paymentDate: -1 }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;