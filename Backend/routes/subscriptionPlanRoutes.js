import express from "express";
import mongoose from "mongoose";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();
const intervals = ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"];
router.use(authMiddleware, roleMiddleware("SUPER_ADMIN"));

function validatePlan(body, creating = false) {
  const { name, price, billingInterval, isActive, description } = body;
  if (creating && (typeof name !== "string" || !name.trim() || price === undefined || !billingInterval)) return "Plan name, price, and billing interval are required.";
  if (name !== undefined && (typeof name !== "string" || !name.trim())) return "Plan name must be non-empty text.";
  if (price !== undefined && (typeof price === "boolean" || price === null || (typeof price === "string" && !price.trim()) || !Number.isFinite(Number(price)) || Number(price) < 0)) return "Price must be a number greater than or equal to zero.";
  if (billingInterval !== undefined && !intervals.includes(billingInterval)) return "Choose a valid billing interval.";
  if (isActive !== undefined && typeof isActive !== "boolean") return "Active plan must be true or false.";
  if (description !== undefined && typeof description !== "string") return "Description must be text.";
  return "";
}

router.get("/", async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.search) filter.name = { $regex: req.query.search.trim(), $options: "i" };
    if (req.query.status === "active") filter.isActive = true;
    if (req.query.status === "inactive") filter.isActive = false;
    const [plans, total] = await Promise.all([
      SubscriptionPlan.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SubscriptionPlan.countDocuments(filter),
    ]);
    res.json({ plans, pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (error) {
    console.error("Get subscription plans error:", error);
    res.status(500).json({ message: "Unable to load subscription plans." });
  }
});

router.post("/", async (req, res) => {
  const validationError = validatePlan(req.body, true);
  if (validationError) return res.status(400).json({ message: validationError });
  try {
    const plan = await SubscriptionPlan.create({
      name: req.body.name.trim(), price: Number(req.body.price),
      billingInterval: req.body.billingInterval, isActive: req.body.isActive ?? true,
      description: req.body.description?.trim() || "", createdBy: req.user.userId,
    });
    res.status(201).json({ message: "Subscription plan created successfully.", plan });
  } catch (error) {
    console.error("Create subscription plan error:", error);
    res.status(500).json({ message: "Unable to create the subscription plan." });
  }
});

router.get("/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid plan ID." });
  try {
    const plan = await SubscriptionPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ message: "Subscription plan not found." });
    res.json({ plan });
  } catch (error) {
    console.error("Get subscription plan error:", error);
    res.status(500).json({ message: "Unable to load the subscription plan." });
  }
});

router.put("/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid plan ID." });
  const validationError = validatePlan(req.body);
  if (validationError) return res.status(400).json({ message: validationError });
  const updates = {};
  for (const field of ["name", "price", "billingInterval", "isActive", "description"]) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.name !== undefined) updates.name = updates.name.trim();
  if (updates.price !== undefined) updates.price = Number(updates.price);
  if (updates.description !== undefined) updates.description = updates.description.trim();
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: "Subscription plan not found." });
    res.json({ message: "Subscription plan updated successfully.", plan });
  } catch (error) {
    console.error("Update subscription plan error:", error);
    res.status(500).json({ message: "Unable to update the subscription plan." });
  }
});

export default router;
