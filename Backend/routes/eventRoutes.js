import express from "express";
import mongoose from "mongoose";
import Event from "../models/Event.js";
import School from "../models/School.js";
import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// All event routes require login
router.use(authMiddleware);

// --------------------------------------------------
// CREATE EVENT
// POST /api/events
// --------------------------------------------------
router.post(
  "/",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const { title, description, eventDate, location, schoolId } = req.body;

      if (!title || !eventDate) {
        return res.status(400).json({
          message: "Title and event date are required.",
        });
      }

      let targetSchoolId;

      // SuperAdmin can select the school
      if (req.user.role === "SUPER_ADMIN") {
        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
          return res.status(400).json({
            message: "Valid schoolId is required.",
          });
        }

        targetSchoolId = schoolId;
      } else {
        // Admin can only create events for their own school
        targetSchoolId = req.schoolId;
      }

      const school = await School.findById(targetSchoolId);

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status !== "ACTIVE") {
        return res.status(400).json({
          message: "Cannot create an event for a suspended school.",
        });
      }

      const event = await Event.create({
        schoolId: targetSchoolId,
        title,
        description,
        eventDate,
        location,
        createdBy: req.user.userId,
      });

      res.status(201).json({
        message: "Event created successfully.",
        event,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to create event.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// GET ALL EVENTS
// GET /api/events?page=1&limit=20
// --------------------------------------------------
router.get(
  "/",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      let page = parseInt(req.query.page) || 1;
      let limit = parseInt(req.query.limit) || 20;

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;
      if (limit > 100) limit = 100;

      const skip = (page - 1) * limit;

      const filter = {};

      if (req.user.role === "SUPER_ADMIN") {
        // SuperAdmin can optionally filter by school
        if (req.query.schoolId) {
          if (!mongoose.Types.ObjectId.isValid(req.query.schoolId)) {
            return res.status(400).json({
              message: "Invalid schoolId.",
            });
          }

          filter.schoolId = req.query.schoolId;
        }
      } else {
        // Every normal school user only sees their own school
        filter.schoolId = req.schoolId;
      }

      // Optional date filtering
      if (req.query.from) {
        filter.eventDate = {
          ...filter.eventDate,
          $gte: new Date(req.query.from),
        };
      }

      if (req.query.to) {
        filter.eventDate = {
          ...filter.eventDate,
          $lte: new Date(req.query.to),
        };
      }

      const [events, total] = await Promise.all([
        Event.find(filter)
          .sort({ eventDate: 1 })
          .skip(skip)
          .limit(limit),

        Event.countDocuments(filter),
      ]);

      res.json({
        events,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch events.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// GET SINGLE EVENT
// GET /api/events/:id
// --------------------------------------------------
router.get(
  "/:id",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const event = await Event.findOne(filter);

      if (!event) {
        return res.status(404).json({
          message: "Event not found.",
        });
      }

      res.json(event);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch event.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// UPDATE EVENT
// PUT /api/events/:id
// --------------------------------------------------
router.put(
  "/:id",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const event = await Event.findOne(filter);

      if (!event) {
        return res.status(404).json({
          message: "Event not found.",
        });
      }

      const { title, description, eventDate, location } = req.body;

      if (title !== undefined) event.title = title;
      if (description !== undefined) event.description = description;
      if (eventDate !== undefined) event.eventDate = eventDate;
      if (location !== undefined) event.location = location;

      await event.save();

      res.json({
        message: "Event updated successfully.",
        event,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to update event.",
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// DELETE EVENT
// DELETE /api/events/:id
// --------------------------------------------------
router.delete(
  "/:id",
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID.",
        });
      }

      const filter = {
        _id: req.params.id,
      };

      if (req.user.role !== "SUPER_ADMIN") {
        filter.schoolId = req.schoolId;
      }

      const event = await Event.findOne(filter);

      if (!event) {
        return res.status(404).json({
          message: "Event not found.",
        });
      }

      await Event.deleteOne({ _id: event._id });

      res.json({
        message: "Event deleted successfully.",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete event.",
        error: error.message,
      });
    }
  }
);

export default router;