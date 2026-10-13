import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    // Keep plan details as a snapshot so later plan edits do not change old records.
    planName: { type: String, required: true, trim: true },
    planPrice: { type: Number, required: true, min: 0 },
    billingInterval: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["ACTIVE", "EXPIRED", "CANCELLED"], default: "ACTIVE" },
    amountPaid: { type: Number, min: 0, default: 0 },
    paymentStatus: { type: String, enum: ["PENDING", "PARTIAL", "PAID"], default: "PENDING" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

subscriptionSchema.index(
  { schoolId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } }
);
subscriptionSchema.index({ schoolId: 1, createdAt: -1 });

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
