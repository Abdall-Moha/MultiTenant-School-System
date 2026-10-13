import express from "express";
import fs from "fs";
import multer from "multer";
import mongoose from "mongoose";

import SubjectExam from "../models/SubjectExam.js";
import Examination from "../models/Examination.js";
import Mark from "../models/Mark.js";
import AcademicYear from "../models/AcademicYear.js";
import School from "../models/School.js";
import Teacher from "../models/Teacher.js";
import Class from "../models/Class.js";
import Subject from "../models/Subject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
import uploadMiddleware from "../middleware/uploadMiddleware.js";

const router = express.Router();

function removeExamFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    // File cleanup should not turn an otherwise successful exam save into a failure.
    console.error("Unable to remove an exam file:", error.message);
  }
}

// Handle file upload errors
const handleExamUpload = (req, res, next) => {
  uploadMiddleware.single("examFile")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "File size cannot exceed 10 MB.",
        });
      }

      return res.status(400).json({
        message: error.code === "LIMIT_UNEXPECTED_FILE"
          ? "Please upload one exam file at a time."
          : "The exam file could not be uploaded. Please check the file and try again.",
      });
    }

    if (error) {
      return res.status(400).json({
        message: error.message === "Only PDF, Word (.doc/.docx), and TXT files are allowed."
          ? error.message
          : "The exam file could not be uploaded. Please check the file and try again.",
      });
    }

    next();
  });
};

// ======================================================
// CREATE EXAM
// POST /api/exams
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  handleExamUpload,
  async (req, res) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) removeExamFile(req.file?.path);
    });
    try {
      const {
        schoolId,
        examinationId,
        classId,
        subjectId,
        teacherId,
        examDate,
        totalMarks,
        academicYearId,
      } = req.body;

      if (!academicYearId) {
        return res.status(400).json({ message: "Please select an academic year." });
      }
      if (!classId) {
        return res.status(400).json({ message: "Please select a class." });
      }
      if (!subjectId) {
        return res.status(400).json({ message: "Please select a subject." });
      }
      if (!teacherId) {
        return res.status(400).json({ message: "Please select a teacher." });
      }
      if (!examDate || Number.isNaN(new Date(examDate).getTime())) {
        return res.status(400).json({ message: "Please select a valid exam date." });
      }
      if (
        totalMarks === undefined ||
        totalMarks === "" ||
        !Number.isFinite(Number(totalMarks)) ||
        Number(totalMarks) <= 0
      ) {
        return res.status(400).json({ message: "Total marks must be a number greater than zero." });
      }
      if (!mongoose.Types.ObjectId.isValid(academicYearId)) {
        return res.status(400).json({ message: "Please select a valid academic year." });
      }
      if (![classId, subjectId, teacherId].every(mongoose.Types.ObjectId.isValid)) {
        return res.status(400).json({ message: "Please select a valid class, subject, and teacher." });
      }
      if (!mongoose.Types.ObjectId.isValid(examinationId)) {
        return res.status(400).json({ message: "Please select an examination." });
      }

      const targetSchoolId =
        req.user.role === "SUPER_ADMIN"
          ? schoolId ||
            (classId
              ? (await Class.findById(classId).select("schoolId"))?.schoolId
              : null)
          : req.schoolId;

      if (!targetSchoolId) {
        return res.status(400).json({
          message: "schoolId is required.",
        });
      }
      if (!mongoose.Types.ObjectId.isValid(targetSchoolId)) {
        return res.status(400).json({ message: "Please select a valid school." });
      }

      const school = await School.findById(targetSchoolId);

      if (!school) {
        return res.status(404).json({
          message: "School not found.",
        });
      }

      if (school.status !== "ACTIVE") {
        return res.status(400).json({
          message: "Cannot create an exam in a suspended school.",
        });
      }

      // All related records must belong to the same school
      const [teacher, classData, subject, academicYear, examination] = await Promise.all([
        Teacher.findOne({
          _id: teacherId,
          schoolId: targetSchoolId,
          status: "ACTIVE",
        }),

        Class.findOne({
          _id: classId,
          schoolId: targetSchoolId,
          status: "ACTIVE",
          academicYearId,
        }),

        Subject.findOne({
          _id: subjectId,
          schoolId: targetSchoolId,
          status: "ACTIVE",
        }),
        AcademicYear.findOne({ _id: academicYearId, schoolId: targetSchoolId }),
        Examination.findOne({ _id: examinationId, schoolId: targetSchoolId, academicYearId }),
      ]);

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found in this school.",
        });
      }

      if (!classData) {
        return res.status(404).json({
          message: "Class not found in this school.",
        });
      }

      if (!subject) {
        return res.status(404).json({
          message: "Subject not found in this school.",
        });
      }

      if (!academicYear) {
        return res.status(404).json({
          message: "Academic year not found in this school.",
        });
      }
      if (!examination) {
        return res.status(404).json({ message: "Examination not found for this academic year and school." });
      }

      const duplicateExam = await SubjectExam.findOne({
        schoolId: targetSchoolId,
        examinationId,
        classId,
        subjectId,
      });

      if (duplicateExam) {
        return res.status(409).json({
          message: "A subject exam already exists for this examination, class and subject.",
        });
      }

      if (req.user.role === "TEACHER" && !academicYear.isCurrent) {
        return res.status(403).json({
          message: "Teachers can only create exams in the current academic year.",
        });
      }

      // Teacher must use their own teacher account
      if (req.user.role === "TEACHER") {
        if (teacher.userId.toString() !== req.user.userId) {
          return res.status(403).json({
            message:
              "You can only create exams using your own teacher account.",
          });
        }

        // Teacher must be assigned to this exact class + subject
        const assignment = await TeacherAssignment.findOne({
          schoolId: req.schoolId,
          teacherId: teacher._id,
          classId,
          subjectId,
          academicYearId: classData.academicYearId,
        });

        if (!assignment) {
          return res.status(403).json({
            message: "You are not assigned to this class and subject.",
          });
        }
      }

      const exam = await SubjectExam.create({
        schoolId: targetSchoolId,
        examinationId,
        academicYearId,
        title: examination.name,
        classId,
        subjectId,
        teacherId,
        examDate,
        totalMarks,
        // Keep the old year-name field in sync with the selected database record.
        academicYear: academicYear.name,

        // Save only the uploaded file path
        filePath: req.file
          ? req.file.path.replace(/\\/g, "/")
          : null,

        createdBy: req.user.userId,
      });

      const populatedExam = await SubjectExam.findById(exam._id)
        .populate("examinationId", "name academicYearId")
        .populate(
          "classId",
          "name academicYearId numberOfPeriods status"
        )
        .populate("subjectId", "name status")
        .populate("teacherId", "fullName phone status");

      return res.status(201).json({
        message: "Subject exam created successfully.",
        exam: populatedExam,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "A subject exam already exists for this examination, class and subject." });
      }
      console.error(error);

      removeExamFile(req.file?.path);

      return res.status(500).json({
        message: "Failed to create exam.",
      });
    }
  }
);

// ======================================================
// GET EXAMS
// GET /api/exams?page=1&limit=20
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER"
  ),
  async (req, res) => {
    try {
      let page = Number(req.query.page) || 1;
      let limit = Number(req.query.limit) || 20;

      if (page < 1) page = 1;
      if (limit < 1) limit = 20;
      if (limit > 100) limit = 100;

      const skip = (page - 1) * limit;

      const filter = {};

      // Tenant
      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          filter.schoolId = req.query.schoolId;
        }
      } else {
        filter.schoolId = req.schoolId;
      }

      // --------------------------------------------------
      // STUDENT
      // --------------------------------------------------
      if (req.user.role === "STUDENT") {
        const student = await import("../models/Student.js").then(
          (module) =>
            module.default.findOne({
              userId: req.user.userId,
              schoolId: req.schoolId,
            })
        );

        if (!student) {
          return res.status(404).json({
            message: "Student profile not found.",
          });
        }

        filter.classId = student.classId;
      }

      // --------------------------------------------------
      // PARENT
      // --------------------------------------------------
      if (req.user.role === "PARENT") {
        const Parent = (
          await import("../models/Parent.js")
        ).default;

        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!parent) {
          return res.status(404).json({
            message: "Parent profile not found.",
          });
        }

        const children = await import("../models/Student.js").then(
          (module) =>
            module.default
              .find({
                _id: { $in: parent.children },
                schoolId: req.schoolId,
              })
              .select("classId")
        );

        const classIds = [
          ...new Set(
            children
              .filter((child) => child.classId)
              .map((child) => child.classId.toString())
          ),
        ];

        filter.classId = { $in: classIds };
      }

      // --------------------------------------------------
      // TEACHER
      // --------------------------------------------------
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (!teacher) {
          return res.status(404).json({
            message: "Teacher profile not found.",
          });
        }

        filter.teacherId = teacher._id;
      }

      // Optional filters
      if (req.query.classId) {
        filter.classId = req.query.classId;
      }

      if (req.query.examinationId) {
        if (!mongoose.Types.ObjectId.isValid(req.query.examinationId)) {
          return res.status(400).json({ message: "Invalid examinationId." });
        }
        filter.examinationId = req.query.examinationId;
      }

      if (req.query.subjectId) {
        filter.subjectId = req.query.subjectId;
      }

      if (req.query.teacherId) {
        filter.teacherId = req.query.teacherId;
      }

      if (req.query.academicYearId) {
        const yearFilter = { _id: req.query.academicYearId };
        if (req.user.role !== "SUPER_ADMIN") {
          yearFilter.schoolId = req.schoolId;
        } else if (req.query.schoolId) {
          yearFilter.schoolId = req.query.schoolId;
        }

        const academicYear = await AcademicYear.findOne(yearFilter);
        if (!academicYear) {
          return res.status(404).json({ message: "Academic year not found." });
        }

        if (req.user.role === "TEACHER" && !academicYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only view exams in the current academic year.",
          });
        }

        if (req.user.role === "SUPER_ADMIN") {
          filter.schoolId = academicYear.schoolId;
        }
        filter.academicYearId = academicYear._id;
      }

      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        const currentAcademicYear = await AcademicYear.findOne({
          schoolId: req.schoolId,
          isCurrent: true,
        });

        const assignments = teacher && currentAcademicYear
          ? await TeacherAssignment.find({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              academicYearId: currentAcademicYear._id,
            }).select("classId subjectId academicYearId")
          : [];

        filter.teacherId = teacher?._id || null;

        filter.$or = assignments.map((assignment) => ({
          classId: assignment.classId,
          subjectId: assignment.subjectId,
        }));
      }

      const [exams, total] = await Promise.all([
        SubjectExam.find(filter)
          .populate("examinationId", "name academicYearId")
          .populate(
            "classId",
            "name academicYearId numberOfPeriods status"
          )
          .populate("subjectId", "name status")
          .populate("teacherId", "fullName phone status")
          .sort({ examDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit),

        SubjectExam.countDocuments(filter),
      ]);

      return res.status(200).json({
        exams,
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
        message: "Failed to get exams.",
      });
    }
  }
);

// ======================================================
// GET SINGLE EXAM
// GET /api/exams/:id
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER"
  ),
  async (req, res) => {
    try {
      const exam = await SubjectExam.findById(req.params.id)
        .populate("examinationId", "name academicYearId")
        .populate(
          "classId",
          "name academicYearId numberOfPeriods status"
        )
        .populate("subjectId", "name status")
        .populate("teacherId", "fullName phone status");

      if (!exam) {
        return res.status(404).json({
          message: "Subject exam not found.",
        });
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        exam.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You do not have access to this exam.",
        });
      }

      // Teacher can only view exams assigned to them
      if (req.user.role === "TEACHER") {
        const academicYear = exam.classId?.academicYearId
          ? await AcademicYear.findOne({
              _id: exam.classId.academicYearId,
              schoolId: req.schoolId,
            })
          : null;
        if (!academicYear || !academicYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only view exams in the current academic year.",
          });
        }

        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !teacher ||
          exam.teacherId._id.toString() !==
            teacher._id.toString()
        ) {
          return res.status(403).json({
            message: "You can only view your own exams.",
          });
        }

        const assignment = await TeacherAssignment.findOne({
          schoolId: req.schoolId,
          teacherId: teacher._id,
          classId: exam.classId._id,
          subjectId: exam.subjectId._id,
          academicYearId: exam.classId.academicYearId,
        });

        if (!assignment) {
          return res.status(403).json({
            message:
              "You are not assigned to this exam class and subject.",
          });
        }
      }

      // Student must belong to exam class
      if (req.user.role === "STUDENT") {
        const student = await import("../models/Student.js").then(
          (module) =>
            module.default.findOne({
              userId: req.user.userId,
              schoolId: req.schoolId,
            })
        );

        if (
          !student ||
          !student.classId ||
          student.classId.toString() !==
            exam.classId._id.toString()
        ) {
          return res.status(403).json({
            message: "You do not have access to this exam.",
          });
        }
      }

      // Parent can only see exams for their children's classes
      if (req.user.role === "PARENT") {
        const Parent = (
          await import("../models/Parent.js")
        ).default;

        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        const Student = (
          await import("../models/Student.js")
        ).default;

        const child = parent
          ? await Student.findOne({
              _id: {
                $in: parent.children,
              },
              classId: exam.classId._id,
              schoolId: req.schoolId,
            })
          : null;

        if (!child) {
          return res.status(403).json({
            message: "You do not have access to this exam.",
          });
        }
      }

      return res.status(200).json({
        exam,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get exam.",
      });
    }
  }
);

// ======================================================
// UPDATE EXAM
// PUT /api/exams/:id
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  handleExamUpload,
  async (req, res) => {
    let updateSaved = false;
    res.on("finish", () => {
      if (res.statusCode >= 400 && !updateSaved) removeExamFile(req.file?.path);
    });
    try {
      const {
        examinationId,
        classId,
        subjectId,
        teacherId,
        examDate,
        totalMarks,
        academicYearId,
      } = req.body;

      const exam = await SubjectExam.findById(req.params.id);

      if (!exam) {
        return res.status(404).json({
            message: "Subject exam not found.",
        });
      }

      if (examDate !== undefined && Number.isNaN(new Date(examDate).getTime())) {
        return res.status(400).json({ message: "Please select a valid exam date." });
      }
      if (
        totalMarks !== undefined &&
        (totalMarks === "" || !Number.isFinite(Number(totalMarks)) || Number(totalMarks) <= 0)
      ) {
        return res.status(400).json({ message: "Total marks must be a number greater than zero." });
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        exam.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot update this exam.",
        });
      }

      // Teacher can only update their own exam
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
          status: "ACTIVE",
        });

        if (
          !teacher ||
          exam.teacherId.toString() !==
            teacher._id.toString()
        ) {
          return res.status(403).json({
            message: "You can only update your own exams.",
          });
        }

        const assignedClass = await Class.findOne({
          _id: exam.classId,
          schoolId: req.schoolId,
        });

        const existingYear = assignedClass
          ? await AcademicYear.findOne({
              _id: assignedClass.academicYearId,
              schoolId: req.schoolId,
            })
          : null;

        if (!existingYear || !existingYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only edit exams in the current academic year.",
          });
        }

        const assignment = assignedClass
          ? await TeacherAssignment.findOne({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              classId: exam.classId,
              subjectId: exam.subjectId,
              academicYearId: assignedClass.academicYearId,
            })
          : null;

        if (!assignment) {
          return res.status(403).json({
            message:
              "You are not assigned to this exam class and subject.",
          });
        }

        const examClass = await Class.findOne({
          _id: exam.classId,
          schoolId: req.schoolId,
        });
        const academicYear = examClass
          ? await AcademicYear.findOne({
              _id: examClass.academicYearId,
              schoolId: req.schoolId,
            })
          : null;
        if (!academicYear || !academicYear.isCurrent) {
          return res.status(403).json({
            message: "Teachers can only delete exams in the current academic year.",
          });
        }
      }

      const newExaminationId = examinationId ?? exam.examinationId;
      if (!mongoose.Types.ObjectId.isValid(newExaminationId)) {
        return res.status(400).json({ message: "Please select an examination." });
      }

      const newClassId = classId ?? exam.classId;
      const newSubjectId = subjectId ?? exam.subjectId;
      const newTeacherId = teacherId ?? exam.teacherId;

      if (![newClassId, newSubjectId, newTeacherId].every(mongoose.Types.ObjectId.isValid)) {
        return res.status(400).json({ message: "Please select a valid class, subject, and teacher." });
      }

      if (academicYearId && !mongoose.Types.ObjectId.isValid(academicYearId)) {
        return res.status(400).json({ message: "Invalid academicYearId." });
      }

      // Validate related records
      const [teacher, classData, subject] = await Promise.all([
        Teacher.findOne({
          _id: newTeacherId,
          schoolId: exam.schoolId,
          status: "ACTIVE",
        }),

        Class.findOne({
          _id: newClassId,
          schoolId: exam.schoolId,
          status: "ACTIVE",
          ...(academicYearId ? { academicYearId } : {}),
        }),

        Subject.findOne({
          _id: newSubjectId,
          schoolId: exam.schoolId,
          status: "ACTIVE",
        }),
      ]);

      if (!teacher || !classData || !subject) {
        return res.status(400).json({
          message:
            "Teacher, class and subject must all belong to this school and be active.",
        });
      }

      const newAcademicYearId = academicYearId || classData.academicYearId;
      const [academicYear, examination] = await Promise.all([
        AcademicYear.findOne({ _id: newAcademicYearId, schoolId: exam.schoolId }),
        Examination.findOne({
          _id: newExaminationId,
          schoolId: exam.schoolId,
          academicYearId: newAcademicYearId,
        }),
      ]);

      if (!academicYear) {
        return res.status(400).json({
          message: "Academic year must belong to this school.",
        });
      }
      if (!examination) {
        return res.status(400).json({ message: "Examination must belong to the selected academic year and school." });
      }

      const duplicateExam = await SubjectExam.findOne({
        _id: { $ne: exam._id },
        schoolId: exam.schoolId,
        examinationId: newExaminationId,
        classId: newClassId,
        subjectId: newSubjectId,
      });

      if (duplicateExam) {
        return res.status(409).json({
          message: "A subject exam already exists for this examination, class and subject.",
        });
      }

      if (req.user.role === "TEACHER" && !academicYear.isCurrent) {
        return res.status(403).json({
          message: "Teachers can only edit exams in the current academic year.",
        });
      }

      // Teacher cannot change the exam to an assignment
      // they don't have
      if (req.user.role === "TEACHER") {
        if (
          teacher.userId.toString() !== req.user.userId
        ) {
          return res.status(403).json({
            message:
              "You cannot assign the exam to another teacher.",
          });
        }

        const assignment = await TeacherAssignment.findOne({
          schoolId: req.schoolId,
          teacherId: teacher._id,
          classId: newClassId,
          subjectId: newSubjectId,
          academicYearId: classData.academicYearId,
        });

        if (!assignment) {
          return res.status(403).json({
            message:
              "You are not assigned to this class and subject.",
          });
        }
      }

      exam.examinationId = newExaminationId;
      exam.title = examination.name;
      exam.academicYearId = newAcademicYearId;

      if (classId !== undefined) {
        exam.classId = classId;
      }

      if (subjectId !== undefined) {
        exam.subjectId = subjectId;
      }

      if (teacherId !== undefined) {
        exam.teacherId = teacherId;
      }

      if (examDate !== undefined) {
        exam.examDate = examDate;
      }

      if (totalMarks !== undefined) {
        if (Number(totalMarks) <= 0) {
          return res.status(400).json({
            message: "totalMarks must be greater than 0.",
          });
        }

        exam.totalMarks = totalMarks;
      }

      // Keep the legacy string field synchronized from the selected database record.
      exam.academicYear = academicYear.name;

      // Keep the current file unless the request contains a valid replacement.
      const previousFilePath = exam.filePath;
      if (req.file) {
        exam.filePath = req.file.path.replace(
          /\\/g,
          "/"
        );
      }

      await exam.save();
      updateSaved = true;

      // Remove the previous file only after the new database path was saved.
      if (req.file && previousFilePath && previousFilePath !== exam.filePath) {
        removeExamFile(previousFilePath);
      }

      const updatedExam = await SubjectExam.findById(exam._id)
        .populate("examinationId", "name academicYearId")
        .populate(
          "classId",
          "name academicYearId numberOfPeriods status"
        )
        .populate("subjectId", "name status")
        .populate("teacherId", "fullName phone status");

      return res.status(200).json({
        message: "Subject exam updated successfully.",
        exam: updatedExam,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "A subject exam already exists for this examination, class and subject." });
      }
      console.error(error);

      if (!updateSaved) removeExamFile(req.file?.path);

      return res.status(500).json({
        message: "Failed to update exam.",
      });
    }
  }
);

// ======================================================
// DELETE EXAM
// DELETE /api/exams/:id
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const exam = await SubjectExam.findById(req.params.id);

      if (!exam) {
        return res.status(404).json({
          message: "Subject exam not found.",
        });
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        exam.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot delete this exam.",
        });
      }

      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !teacher ||
          exam.teacherId.toString() !==
            teacher._id.toString()
        ) {
          return res.status(403).json({
            message: "You can only delete your own exams.",
          });
        }
      }

      if (await Mark.exists({ schoolId: exam.schoolId, examId: exam._id })) {
        return res.status(409).json({
          message: "This subject exam already has student marks and cannot be deleted.",
        });
      }

      const filePath = exam.filePath;
      await exam.deleteOne();
      // The shared Examination remains untouched when one subject paper is removed.
      removeExamFile(filePath);

      return res.status(200).json({
        message: "Subject exam deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to delete exam.",
      });
    }
  }
);

export default router;
