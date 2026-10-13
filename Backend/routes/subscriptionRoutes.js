import express from "express";
import mongoose from "mongoose";
import School from "../models/School.js";
import Subscription from "../models/Subscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware);
const validStatuses = ["ACTIVE", "EXPIRED", "CANCELLED"];
const validPaymentStatuses = ["PENDING", "PARTIAL", "PAID"];

function datesAreValid(startDate, endDate) {
  if (!startDate || !endDate) return false;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}

function paymentStatusFor(amountPaid, planPrice) {
  if (amountPaid > 0 && amountPaid >= planPrice) return "PAID";
  return amountPaid > 0 ? "PARTIAL" : "PENDING";
}

// Admins only receive their own school's newest subscription. There is no schoolId parameter.
router.get("/mine", tenantMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ schoolId: req.schoolId })
      .populate("schoolId", "schoolName schoolId")
      .populate("planId", "name price billingInterval isActive")
      .sort({ createdAt: -1 }).lean();
    res.json({ subscription });
  } catch (error) {
    console.error("Get school subscription error:", error);
    res.status(500).json({ message: "Unable to load your school's subscription." });
  }
});

router.get("/", roleMiddleware("SUPER_ADMIN"), async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.status) {
      if (!validStatuses.includes(req.query.status)) return res.status(400).json({ message: "Invalid subscription status." });
      filter.status = req.query.status;
    }
    if (req.query.paymentStatus) {
      if (!validPaymentStatuses.includes(req.query.paymentStatus)) return res.status(400).json({ message: "Invalid payment status." });
      filter.paymentStatus = req.query.paymentStatus;
    }
    if (req.query.planId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.planId)) return res.status(400).json({ message: "Invalid plan ID." });
      filter.planId = req.query.planId;
    }
    if (req.query.search?.trim()) {
      const schools = await School.find({ schoolName: { $regex: req.query.search.trim(), $options: "i" } }).select("_id").lean();
      filter.schoolId = { $in: schools.map((school) => school._id) };
    }
    const [subscriptions, total] = await Promise.all([
      Subscription.find(filter).populate("schoolId", "schoolName schoolId").populate("planId", "name price billingInterval")
        .sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Subscription.countDocuments(filter),
    ]);
    res.json({ subscriptions, pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (error) {
    console.error("Get subscriptions error:", error);
    res.status(500).json({ message: "Unable to load subscriptions." });
  }
});

router.post("/", roleMiddleware("SUPER_ADMIN"), async (req, res) => {
  const { schoolId, planId, startDate, endDate, amountPaid = 0 } = req.body;
  if (!mongoose.Types.ObjectId.isValid(schoolId || "") || !mongoose.Types.ObjectId.isValid(planId || "")) {
    return res.status(400).json({ message: "Select a valid school and subscription plan." });
  }
  if (!datesAreValid(startDate, endDate)) return res.status(400).json({ message: "End date must be after the start date." });
  if (typeof amountPaid === "boolean" || amountPaid === null || (typeof amountPaid === "string" && !amountPaid.trim()) || !Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0) return res.status(400).json({ message: "Amount paid must be zero or greater." });
  try {
    const [school, plan] = await Promise.all([School.findById(schoolId), SubscriptionPlan.findById(planId)]);
    if (!school) return res.status(404).json({ message: "School not found." });
    if (school.status !== "ACTIVE") return res.status(400).json({ message: "A subscription cannot be assigned to a suspended school." });
    if (!plan) return res.status(404).json({ message: "Subscription plan not found." });
    if (!plan.isActive) return res.status(400).json({ message: "Only active plans can be assigned." });
    if (await Subscription.exists({ schoolId, status: "ACTIVE" })) {
      return res.status(409).json({ message: "This school already has an active subscription. End it before assigning a replacement." });
    }
    const paid = Number(amountPaid);
    const subscription = await Subscription.create({
      schoolId, planId, planName: plan.name, planPrice: plan.price,
      billingInterval: plan.billingInterval, startDate: new Date(startDate), endDate: new Date(endDate),
      amountPaid: paid, paymentStatus: paymentStatusFor(paid, plan.price), createdBy: req.user.userId,
    });
    res.status(201).json({ message: "Subscription assigned successfully.", subscription });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This school already has an active subscription." });
    console.error("Assign subscription error:", error);
    res.status(500).json({ message: "Unable to assign the subscription." });
  }
});

router.get("/:id", roleMiddleware("SUPER_ADMIN"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid subscription ID." });
  try {
    const subscription = await Subscription.findById(req.params.id).populate("schoolId", "schoolName schoolId")
      .populate("planId", "name price billingInterval isActive").lean();
    if (!subscription) return res.status(404).json({ message: "Subscription not found." });
    res.json({ subscription });
  } catch (error) {
    console.error("Get subscription error:", error);
    res.status(500).json({ message: "Unable to load the subscription." });
  }
});

// SuperAdmin can adjust dates, status, or the recorded initial amount. Plan/school and snapshots stay fixed.
router.patch("/:id", roleMiddleware("SUPER_ADMIN"), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid subscription ID." });
  const allowed = ["status", "startDate", "endDate", "amountPaid"];
  if (Object.keys(req.body).some((key) => !allowed.includes(key))) return res.status(400).json({ message: "Only dates, status, and amount paid can be updated." });
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) return res.status(404).json({ message: "Subscription not found." });
    const startDate = req.body.startDate ?? subscription.startDate;
    const endDate = req.body.endDate ?? subscription.endDate;
    if ((req.body.startDate !== undefined || req.body.endDate !== undefined) && !datesAreValid(startDate, endDate)) {
      return res.status(400).json({ message: "End date must be after the start date." });
    }
    if (req.body.status !== undefined) {
      if (!validStatuses.includes(req.body.status)) return res.status(400).json({ message: "Invalid subscription status." });
      if (req.body.status === "ACTIVE" && await Subscription.exists({ schoolId: subscription.schoolId, status: "ACTIVE", _id: { $ne: subscription._id } })) {
        return res.status(409).json({ message: "This school already has another active subscription." });
      }
      subscription.status = req.body.status;
    }
    if (req.body.startDate !== undefined) subscription.startDate = new Date(req.body.startDate);
    if (req.body.endDate !== undefined) subscription.endDate = new Date(req.body.endDate);
    if (req.body.amountPaid !== undefined) {
      if (typeof req.body.amountPaid === "boolean" || req.body.amountPaid === null || (typeof req.body.amountPaid === "string" && !req.body.amountPaid.trim()) || !Number.isFinite(Number(req.body.amountPaid)) || Number(req.body.amountPaid) < 0) return res.status(400).json({ message: "Amount paid must be zero or greater." });
      subscription.amountPaid = Number(req.body.amountPaid);
      subscription.paymentStatus = paymentStatusFor(subscription.amountPaid, subscription.planPrice);
    }
    await subscription.save();
    res.json({ message: "Subscription updated successfully.", subscription });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This school already has another active subscription." });
    console.error("Update subscription error:", error);
    res.status(500).json({ message: "Unable to update the subscription." });
  }
});

export default router;
