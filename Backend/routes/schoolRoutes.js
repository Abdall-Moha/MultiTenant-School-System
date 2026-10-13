import express from "express";

import School from "../models/School.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import schoolLogoUploadMiddleware, {
  getSchoolLogoPath,
  removeSchoolLogoFile,
  removeStoredSchoolLogo,
} from "../middleware/schoolLogoUploadMiddleware.js";

const router = express.Router();


// ======================================================
// CREATE SCHOOL
// POST /api/schools
//
// Only Super Admin can create schools.
// ======================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("SUPER_ADMIN"),
  schoolLogoUploadMiddleware,
  async (req, res) => {
    try {
      const {
        schoolId,
        schoolName,
        district,
        phone,
        email,
        principalName,
      } = req.body;

      if (
        !schoolId ||
        !schoolName ||
        !district
      ) {
        await removeSchoolLogoFile(req.file?.path);
        return res.status(400).json({
          message:
            "schoolId, schoolName and district are required.",
        });
      }

      const normalizedSchoolId =
        schoolId.trim().toUpperCase();

      const existingSchool =
        await School.findOne({
          schoolId: normalizedSchoolId,
        });

      if (existingSchool) {
        await removeSchoolLogoFile(req.file?.path);
        return res.status(409).json({
          message:
            "This schoolId is already in use.",
        });
      }

      const school = await School.create({
        schoolId: normalizedSchoolId,
        schoolName: schoolName.trim(),
        district: district.trim(),
        phone: phone?.trim() || undefined,
        email: email
          ? email.trim().toLowerCase()
          : undefined,
        principalName:
          principalName?.trim() || undefined,
        logo: req.file ? getSchoolLogoPath(req.file.filename) : "",
        status: "ACTIVE",
        createdBy: req.user.userId,
      });

      return res.status(201).json({
        message:
          "School created successfully.",
        school,
      });
    } catch (error) {
      await removeSchoolLogoFile(req.file?.path).catch((cleanupError) => {
        console.error("Clean up failed school logo upload:", cleanupError);
      });
      console.error(
        "Create school error:",
        error
      );

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A school with this schoolId already exists.",
        });
      }

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


// ======================================================
// GET ALL SCHOOLS
// GET /api/schools?page=1&limit=20
//
// Only Super Admin can see all schools.
// ======================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const page = Math.max(
        parseInt(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          parseInt(req.query.limit) || 20,
          1
        ),
        100
      );

      const skip = (page - 1) * limit;

      const [schools, total] =
        await Promise.all([
          School.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),

          School.countDocuments(),
        ]);

      return res.status(200).json({
        schools,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(
            total / limit
          ),
        },
      });
    } catch (error) {
      console.error(
        "Get schools error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


// ======================================================
// GET CURRENT SCHOOL
// GET /api/schools/me
//
// Admin gets his school.
// Super Admin can also use this if req.schoolId exists,
// although normally Super Admin works with /:id.
// ======================================================

router.get(
  "/me",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN"),
  async (req, res) => {
    try {
      const school = await School.findById(
        req.schoolId
      );

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      return res.status(200).json({
        school,
      });
    } catch (error) {
      console.error(
        "Get current school error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


// ======================================================
// GET CURRENT SCHOOL BRANDING
// GET /api/schools/me/branding
// School users can read their own school's display name.
// ======================================================

router.get(
  "/me/branding",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "TEACHER", "PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const school = await School.findById(req.schoolId)
        .select("schoolName logo updatedAt");

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      return res.status(200).json({
        school: {
          schoolName: school.schoolName,
          logo: school.logo || "",
          updatedAt: school.updatedAt,
        },
      });
    } catch (error) {
      console.error("Get school branding error:", error);
      return res.status(500).json({
        message: "Unable to load school name.",
      });
    }
  }
);


// ======================================================
// GET ONE SCHOOL
// GET /api/schools/:id
// ======================================================

router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const filter = {
        _id: req.params.id,
      };

      // Admin can only access his own school
      if (req.user.role === "ADMIN") {
        filter._id = req.schoolId;
      }

      const school = await School.findOne(
        filter
      );

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      return res.status(200).json({
        school,
      });
    } catch (error) {
      console.error(
        "Get school error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


// ======================================================
// UPDATE SCHOOL INFORMATION
// PUT /api/schools/:id
//
// SUPER_ADMIN → can update everything except
//               status through this route.
//
// ADMIN → can update only own school information.
//
// Admin CANNOT change:
// - schoolId
// - status
// ======================================================

router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("SUPER_ADMIN", "ADMIN"),
  schoolLogoUploadMiddleware,
  async (req, res) => {
    try {
      const {
        schoolName,
        district,
        phone,
        email,
        principalName,
      } = req.body;

      const filter = {
        _id: req.params.id,
      };

      // Admin can only update own school
      if (req.user.role === "ADMIN") {
        filter._id = req.schoolId;
      }

      const school = await School.findOne(
        filter
      );

      if (!school) {
        await removeSchoolLogoFile(req.file?.path);
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (schoolName !== undefined) {
        if (!schoolName.trim()) {
          await removeSchoolLogoFile(req.file?.path);
          return res.status(400).json({
            message:
              "School name cannot be empty.",
          });
        }

        school.schoolName =
          schoolName.trim();
      }

      if (district !== undefined) {
        if (!district.trim()) {
          await removeSchoolLogoFile(req.file?.path);
          return res.status(400).json({
            message:
              "District cannot be empty.",
          });
        }

        school.district =
          district.trim();
      }

      if (phone !== undefined) {
        school.phone =
          phone?.trim() || undefined;
      }

      if (email !== undefined) {
        school.email = email
          ? email.trim().toLowerCase()
          : undefined;
      }

      if (principalName !== undefined) {
        school.principalName =
          principalName?.trim() || undefined;
      }

      const oldLogo = school.logo;
      if (req.file) school.logo = getSchoolLogoPath(req.file.filename);

      try {
        await school.save();
      } catch (saveError) {
        await removeSchoolLogoFile(req.file?.path).catch((cleanupError) => {
          console.error("Clean up failed school logo update:", cleanupError);
        });
        throw saveError;
      }

      // Keep the previous logo until the new school record has been saved.
      if (req.file && oldLogo && oldLogo !== school.logo) {
        try {
          const oldLogoIsShared = await School.exists({ logo: oldLogo, _id: { $ne: school._id } });
          if (!oldLogoIsShared) await removeStoredSchoolLogo(oldLogo);
        } catch (cleanupError) {
          console.error("Unable to remove replaced school logo:", cleanupError);
        }
      }

      return res.status(200).json({
        message:
          "School updated successfully.",
        school,
      });
    } catch (error) {
      await removeSchoolLogoFile(req.file?.path).catch((cleanupError) => {
        console.error("Clean up failed school logo update:", cleanupError);
      });
      console.error(
        "Update school error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


// ======================================================
// CHANGE SCHOOL STATUS
// PATCH /api/schools/:id/status
//
// ONLY SUPER ADMIN
//
// Admin CANNOT suspend or activate a school.
// ======================================================

router.patch(
  "/:id/status",
  authMiddleware,
  roleMiddleware("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (
        !["ACTIVE", "SUSPENDED"].includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Status must be ACTIVE or SUSPENDED.",
        });
      }

      const school =
        await School.findById(
          req.params.id
        );

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      school.status = status;

      await school.save();

      return res.status(200).json({
        message:
          `School ${status.toLowerCase()} successfully.`,

        school,
      });
    } catch (error) {
      console.error(
        "Change school status error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


// ======================================================
// DELETE SCHOOL
// DELETE /api/schools/:id
//
// We do NOT physically delete a school.
// A school contains students, teachers, marks,
// attendance, fees, etc.
//
// Instead, Super Admin suspends it.
// ======================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const school =
        await School.findById(
          req.params.id
        );

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status === "SUSPENDED") {
        return res.status(400).json({
          message:
            "School is already suspended.",
        });
      }

      school.status = "SUSPENDED";

      await school.save();

      return res.status(200).json({
        message:
          "School suspended successfully.",
      });
    } catch (error) {
      console.error(
        "Suspend school error:",
        error
      );

      return res.status(500).json({
        message: "Server error.",
      });
    }
  }
);


export default router;
