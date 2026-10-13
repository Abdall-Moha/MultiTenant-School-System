import express from "express";

import Mark from "../models/Mark.js";
import SubjectExam from "../models/SubjectExam.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Class from "../models/Class.js";
import Teacher from "../models/Teacher.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import Parent from "../models/Parent.js";
import mongoose from "mongoose";
import AcademicYear from "../models/AcademicYear.js";
import Examination from "../models/Examination.js";

import authMiddleware from "../middleware/authMiddleware.js";
import tenantMiddleware from "../middleware/tenantMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();


// ======================================================
// CREATE MARK
// POST /api/marks
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const {
        examId,
        studentId,
        marksObtained,
        remarks,
      } = req.body;

      let targetSchoolId = req.user.role === "SUPER_ADMIN" ? null : req.schoolId;

      if (req.user.role !== "SUPER_ADMIN" && !targetSchoolId) {
        return res.status(400).json({
          message: "schoolId is required.",
        });
      }

      if (!examId || !studentId || marksObtained === undefined) {
        return res.status(400).json({
          message:
            "examId, studentId and marksObtained are required.",
        });
      }
      if (
        !mongoose.Types.ObjectId.isValid(examId) ||
        !mongoose.Types.ObjectId.isValid(studentId)
      ) {
        return res.status(400).json({ message: "A valid exam and student are required." });
      }

      const numericMark = Number(marksObtained);
      if (
        !["number", "string"].includes(typeof marksObtained) ||
        String(marksObtained).trim() === "" ||
        !Number.isFinite(numericMark) ||
        numericMark < 0
      ) {
        return res.status(400).json({
          message: "marksObtained must be a valid non-negative number.",
        });
      }

      // Get the exam
      const exam = await SubjectExam.findOne({
        _id: examId,
        ...(targetSchoolId ? { schoolId: targetSchoolId } : {}),
      });

      if (!exam) {
        return res.status(404).json({
          message: "Subject exam not found in this school.",
        });
      }

      // SuperAdmin access is scoped from the selected exam record, never from
      // a schoolId supplied by the browser.
      targetSchoolId = exam.schoolId;

      // Marks cannot exceed total marks
      if (numericMark > exam.totalMarks) {
        return res.status(400).json({
          message:
            "marksObtained cannot be greater than the exam total marks.",
        });
      }

      // Student must belong to same school
      const student = await Student.findOne({
        _id: studentId,
        schoolId: targetSchoolId,
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found in this school.",
        });
      }

      const examClass = await Class.findOne({ _id: exam.classId, schoolId: targetSchoolId });
      const enrollment = examClass ? await StudentEnrollment.findOne({ schoolId: targetSchoolId, studentId: student._id, classId: examClass._id, academicYearId: examClass.academicYearId, status: "ACTIVE" }) : null;
      if (!enrollment) {
        return res.status(400).json({
          message:
            "Student does not belong to the exam class.",
        });
      }

      // Teacher can only enter marks for their own exam
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
          status: "ACTIVE",
        });

        if (!teacher) {
          return res.status(404).json({
            message: "Teacher profile not found.",
          });
        }

        if (
          exam.teacherId.toString() !==
          teacher._id.toString()
        ) {
          return res.status(403).json({
            message:
              "You can only enter marks for your own exams.",
          });
        }

        // Verify the teacher's assignment
        const isCurrentAcademicYear = await AcademicYear.exists({
          _id: examClass.academicYearId,
          schoolId: req.schoolId,
          isCurrent: true,
        });
        const assignment = isCurrentAcademicYear
          ? await TeacherAssignment.findOne({
            schoolId: req.schoolId,
            teacherId: teacher._id,
            classId: exam.classId,
            subjectId: exam.subjectId,
            academicYearId: examClass.academicYearId,
          })
          : null;

        if (!assignment) {
          return res.status(403).json({
            message:
              "You are not assigned to this class and subject.",
          });
        }
      }

      // One mark per student for each exam
      const existingMark = await Mark.findOne({
        schoolId: targetSchoolId,
        examId,
        studentId,
      });

      if (existingMark) {
        return res.status(409).json({
          message:
            "A mark for this student already exists for this exam.",
        });
      }

      const mark = await Mark.create({
        schoolId: targetSchoolId,
        examId,
        studentId,
        marksObtained: numericMark,
        remarks,
        enteredBy: req.user.userId,
      });

      const populatedMark = await Mark.findById(mark._id)
        .populate(
          "studentId",
          "roleNumber fullName classId status"
        )
        .populate(
          "examId",
          "title classId subjectId teacherId examDate totalMarks academicYear"
        )
        .populate(
          "enteredBy",
          "name role"
        );

      return res.status(201).json({
        message: "Mark created successfully.",
        mark: populatedMark,
      });
    } catch (error) {
      console.error(error);

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A mark for this student already exists for this exam.",
        });
      }

      return res.status(500).json({
        message: "Failed to create mark.",
      });
    }
  }
);


// Save new marks and updates for one exam in a single request.
router.post(
  "/bulk",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const { examId, examinationId, academicYearId, classId, subjectId, marks } = req.body;
      if (
        !mongoose.Types.ObjectId.isValid(examId) ||
        !mongoose.Types.ObjectId.isValid(examinationId) ||
        !mongoose.Types.ObjectId.isValid(academicYearId) ||
        !mongoose.Types.ObjectId.isValid(classId)
      ) {
        return res.status(400).json({ message: "Please select a valid academic year, class, and exam." });
      }
      if (!mongoose.Types.ObjectId.isValid(subjectId)) {
        return res.status(400).json({ message: "Please select a valid subject." });
      }
      if (!Array.isArray(marks) || marks.length === 0 || marks.length > 500) {
        return res.status(400).json({ message: "Submit between 1 and 500 student marks." });
      }

      const exam = await SubjectExam.findById(examId);
      if (!exam) return res.status(404).json({ message: "Subject exam not found." });
      if (req.user.role !== "SUPER_ADMIN" && exam.schoolId.toString() !== req.schoolId) {
        return res.status(403).json({ message: "You cannot enter marks for this exam." });
      }
      if (req.body.schoolId && exam.schoolId.toString() !== req.body.schoolId) {
        return res.status(403).json({ message: "The selected exam does not belong to that school." });
      }
      // An exam has one subject. Reject a browser selection that does not match it.
      if (exam.subjectId.toString() !== subjectId) {
        return res.status(400).json({ message: "The selected subject does not belong to this exam." });
      }
      if (!exam.examinationId || exam.examinationId.toString() !== examinationId) {
        return res.status(400).json({ message: "The selected examination does not belong to this subject exam." });
      }
      const examClass = await Class.findOne({ _id: exam.classId, schoolId: exam.schoolId });
      if (!examClass) return res.status(404).json({ message: "Subject exam class not found." });
      if (
        exam.classId.toString() !== classId ||
        examClass.academicYearId.toString() !== academicYearId
      ) {
        return res.status(400).json({ message: "The selected class and academic year do not match this exam." });
      }
      const examinationExists = await Examination.exists({
        _id: examinationId,
        schoolId: exam.schoolId,
        academicYearId: examClass.academicYearId,
      });
      if (!examinationExists) {
        return res.status(400).json({ message: "The examination must belong to this school and academic year." });
      }

      // Teachers must own the exam and have an assignment for this exact class and subject.
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
          status: "ACTIVE",
        });
        if (!teacher || exam.teacherId.toString() !== teacher._id.toString()) {
          return res.status(403).json({ message: "You can only enter marks for your own exams." });
        }

        const isCurrentYear = await AcademicYear.exists({
          _id: examClass.academicYearId,
          schoolId: req.schoolId,
          isCurrent: true,
        });
        const assignment = isCurrentYear
          ? await TeacherAssignment.findOne({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              classId: exam.classId,
              subjectId: exam.subjectId,
              academicYearId: examClass.academicYearId,
            })
          : null;
        if (!assignment) {
          return res.status(403).json({ message: "You are not assigned to this class and subject." });
        }
      }

      const studentIds = [];
      const seenStudentIds = new Set();
      for (const item of marks) {
        if (!item || typeof item !== "object" || !mongoose.Types.ObjectId.isValid(item.studentId)) {
          return res.status(400).json({ message: "Every mark must include a valid student." });
        }
        const studentId = item.studentId.toString();
        if (seenStudentIds.has(studentId)) {
          return res.status(400).json({ message: "A student can only appear once in this request." });
        }
        seenStudentIds.add(studentId);

        if (
          !["number", "string"].includes(typeof item.marksObtained) ||
          String(item.marksObtained).trim() === "" ||
          !Number.isFinite(Number(item.marksObtained)) ||
          Number(item.marksObtained) < 0 ||
          Number(item.marksObtained) > exam.totalMarks
        ) {
          return res.status(400).json({
            message: `Each mark must be between 0 and ${exam.totalMarks}.`,
          });
        }
        if (item.remarks !== undefined && typeof item.remarks !== "string") {
          return res.status(400).json({ message: "Remarks must be text." });
        }
        studentIds.push(item.studentId);
      }

      // Validate every student and enrollment before writing any records.
      const [students, enrollments] = await Promise.all([
        Student.find({
          _id: { $in: studentIds },
          schoolId: exam.schoolId,
          status: "ACTIVE",
        }).select("_id"),
        StudentEnrollment.find({
          schoolId: exam.schoolId,
          studentId: { $in: studentIds },
          classId: examClass._id,
          academicYearId: examClass.academicYearId,
          status: "ACTIVE",
        }).select("studentId"),
      ]);

      if (students.length !== studentIds.length) {
        return res.status(400).json({ message: "All students must be active and belong to this school." });
      }
      if (enrollments.length !== studentIds.length) {
        return res.status(400).json({ message: "All students must be actively enrolled in this exam's class and year." });
      }

      const operations = marks.map((item) => ({
        updateOne: {
          filter: {
            schoolId: exam.schoolId,
            examId: exam._id,
            studentId: item.studentId,
          },
          update: {
            $set: {
              schoolId: exam.schoolId,
              examId: exam._id,
              studentId: item.studentId,
              marksObtained: Number(item.marksObtained),
              enteredBy: req.user.userId,
              ...(item.remarks !== undefined ? { remarks: item.remarks } : {}),
            },
          },
          upsert: true,
        },
      }));

      const result = await Mark.bulkWrite(operations, { ordered: true });
      return res.status(200).json({
        message: "Marks saved successfully.",
        saved: result.modifiedCount + result.upsertedCount,
        inserted: result.upsertedCount,
        updated: result.modifiedCount,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "A mark already exists for one of these students. Reload and save again." });
      }
      console.error("Failed to save marks:", error);
      return res.status(500).json({ message: "Failed to save marks." });
    }
  },
);


// ======================================================
// GET MARKS
// GET /api/marks?page=1&limit=20
// ADMIN, SUPER_ADMIN, TEACHER, PARENT, STUDENT
// ======================================================
router.get(
  "/",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER",
    "PARENT",
    "STUDENT"
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
      const accessConditions = [];

      // Tenant
      if (req.user.role === "SUPER_ADMIN") {
        if (req.query.schoolId) {
          filter.schoolId = req.query.schoolId;
        }
      } else {
        filter.schoolId = req.schoolId;
      }

      // When the page supplies a subject, confirm it belongs to the selected exam.
      if (req.query.subjectId) {
        if (
          !mongoose.Types.ObjectId.isValid(req.query.subjectId) ||
          !mongoose.Types.ObjectId.isValid(req.query.examId)
        ) {
          return res.status(400).json({ message: "A valid exam and subject are required." });
        }
        const examFilter = { _id: req.query.examId };
        if (req.user.role !== "SUPER_ADMIN") examFilter.schoolId = req.schoolId;
        else if (req.query.schoolId) examFilter.schoolId = req.query.schoolId;
        const selectedExam = await SubjectExam.findOne(examFilter).select("subjectId");
        if (!selectedExam) return res.status(404).json({ message: "Subject exam not found." });
        if (selectedExam.subjectId.toString() !== req.query.subjectId) {
          return res.status(400).json({ message: "The selected subject does not belong to this exam." });
        }
      }

      // --------------------------------------------------
      // STUDENT
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

        accessConditions.push({ studentId: student._id });
      }

      // --------------------------------------------------
      // PARENT
      // --------------------------------------------------
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

        const childIds = await Student.distinct("_id", {
          parentId: parent._id,
          schoolId: req.schoolId,
        });
        accessConditions.push({ studentId: { $in: childIds } });
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

        // Only marks from the teacher's own exams
        const currentYear = await AcademicYear.findOne({
          schoolId: req.schoolId,
          isCurrent: true,
        });
        const assignments = currentYear
          ? await TeacherAssignment.find({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              academicYearId: currentYear._id,
            }).select("classId subjectId")
          : [];
        const exams = assignments.length
          ? await SubjectExam.find({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              academicYear: currentYear.name,
              $or: assignments.map((assignment) => ({
                classId: assignment.classId,
                subjectId: assignment.subjectId,
              })),
            }).select("_id")
          : [];

        accessConditions.push({ examId: {
          $in: exams.map((exam) => exam._id),
        } });
      }

      // Optional filters
      if (req.query.examId) {
        accessConditions.push({ examId: req.query.examId });
      }

      if (req.query.studentId) {
        accessConditions.push({ studentId: req.query.studentId });
      }

      // Keep user access limits ANDed with optional UI filters so query parameters
      // can never replace the tenant, parent, student, or teacher restrictions.
      if (accessConditions.length) filter.$and = accessConditions;

      const [marks, total] = await Promise.all([
        Mark.find(filter)
          .populate(
            "studentId",
            "roleNumber fullName classId status"
          )
          .populate({
            path: "examId",
            select: "title classId subjectId teacherId examDate totalMarks academicYear",
            populate: {
              path: "classId",
              select: "name academicYearId",
              populate: { path: "academicYearId", select: "name isCurrent" },
            },
          })
          .populate(
            "enteredBy",
            "name role"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),

        Mark.countDocuments(filter),
      ]);

      return res.status(200).json({
        marks,
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
        message: "Failed to get marks.",
      });
    }
  }
);


// ======================================================
// STUDENT AND PARENT SHARED EXAMINATION RESULTS
// GET /api/marks/student-results?academicYearId=...&examinationId=...
// Returns every subject paper for the student's class under one shared examination.
// ======================================================
router.get(
  "/student-results",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("PARENT", "STUDENT"),
  async (req, res) => {
    try {
      const schoolId = req.schoolId;
      let children = [];
      let selectedStudent;

      if (req.user.role === "STUDENT") {
        // Student accounts always resolve to their own profile.
        selectedStudent = await Student.findOne({ userId: req.user.userId, schoolId })
          .select("_id fullName roleNumber");
        if (!selectedStudent) return res.status(404).json({ message: "Student profile not found." });
        children = [selectedStudent];
      } else {
        const parent = await Parent.findOne({ userId: req.user.userId, schoolId, status: "ACTIVE" });
        if (!parent) return res.status(404).json({ message: "Parent profile not found." });
        children = await Student.find({ parentId: parent._id, schoolId })
          .select("_id fullName roleNumber")
          .sort({ fullName: 1 });
        if (!children.length) {
          return res.json({ children: [], academicYears: [], selectedAcademicYearId: "", examinations: [], selectedExaminationId: "", results: [] });
        }

        if (req.query.studentId) {
          selectedStudent = children.find((child) => String(child._id) === req.query.studentId);
          if (!selectedStudent) return res.status(403).json({ message: "This student is not linked to your parent account." });
        } else {
          selectedStudent = children[0];
        }
      }

      // Enrollment history limits both the available years and each result's class.
      const enrollments = await StudentEnrollment.find({ schoolId, studentId: selectedStudent._id })
        .select("classId academicYearId");
      const classIds = [...new Set(enrollments.map((item) => String(item.classId)))];
      const yearIds = [...new Set(enrollments.map((item) => String(item.academicYearId)))];
      const [classes, years] = await Promise.all([
        Class.find({ _id: { $in: classIds }, schoolId }).select("_id name academicYearId"),
        AcademicYear.find({ _id: { $in: yearIds }, schoolId }).select("_id name"),
      ]);
      const classById = new Map(classes.map((item) => [String(item._id), item]));
      const yearById = new Map(years.map((item) => [String(item._id), item]));
      const validEnrollments = enrollments.filter((item) => {
        const classRecord = classById.get(String(item.classId));
        return classRecord && String(classRecord.academicYearId) === String(item.academicYearId);
      });
      const availableYears = [...new Map(
        validEnrollments
          .map((item) => yearById.get(String(item.academicYearId)))
          .filter(Boolean)
          .map((year) => [String(year._id), year]),
      ).values()].sort((first, second) => first.name.localeCompare(second.name));
      const publicYears = availableYears.map((year) => ({ _id: year._id, name: year.name }));

      let examinations = [];
      let results = [];
      if (req.query.academicYearId) {
        if (!mongoose.Types.ObjectId.isValid(req.query.academicYearId)) {
          return res.status(400).json({ message: "Please select a valid academic year." });
        }
        const selectedYear = availableYears.find((year) => String(year._id) === req.query.academicYearId);
        if (!selectedYear) return res.status(403).json({ message: "That academic year is not part of this student's enrollment history." });

        const selectedYearEnrollments = validEnrollments.filter(
          (item) => String(item.academicYearId) === String(selectedYear._id),
        );
        const selectedClassIds = [...new Set(selectedYearEnrollments.map((item) => String(item.classId)))];
        const subjectExamFilter = {
          schoolId,
          academicYearId: selectedYear._id,
          classId: { $in: selectedClassIds },
          examinationId: { $type: "objectId" },
        };
        const examinationIds = await SubjectExam.distinct("examinationId", subjectExamFilter);
        examinations = await Examination.find({
          _id: { $in: examinationIds },
          schoolId,
          academicYearId: selectedYear._id,
        }).select("_id name academicYearId").sort({ createdAt: 1 });

        if (req.query.examinationId) {
          if (!mongoose.Types.ObjectId.isValid(req.query.examinationId)) {
            return res.status(400).json({ message: "Please select a valid examination." });
          }
          const selectedExamination = examinations.find(
            (item) => String(item._id) === req.query.examinationId,
          );
          if (!selectedExamination) {
            return res.status(404).json({ message: "Examination not found for this student's class and academic year." });
          }

          const subjectExams = await SubjectExam.find({
            ...subjectExamFilter,
            examinationId: selectedExamination._id,
          })
            .populate("subjectId", "name")
            .populate("classId", "name")
            .sort({ examDate: 1, createdAt: 1 });
          const marks = await Mark.find({
            schoolId,
            studentId: selectedStudent._id,
            examId: { $in: subjectExams.map((item) => item._id) },
          }).select("examId marksObtained remarks");
          const markBySubjectExam = new Map(marks.map((mark) => [String(mark.examId), mark]));

          results = subjectExams.map((subjectExam) => {
            const mark = markBySubjectExam.get(String(subjectExam._id));
            return {
              subjectExamId: subjectExam._id,
              examinationId: selectedExamination._id,
              examinationName: selectedExamination.name,
              subjectName: subjectExam.subjectId?.name || "Unknown subject",
              className: subjectExam.classId?.name || "",
              examDate: subjectExam.examDate,
              marksObtained: mark?.marksObtained ?? null,
              totalMarks: subjectExam.totalMarks,
              percentage: mark
                ? ((mark.marksObtained / subjectExam.totalMarks) * 100).toFixed(2)
                : null,
              remarks: mark?.remarks || "",
              status: mark ? "RECORDED" : "PENDING",
            };
          });
        }
      }

      return res.json({
        children,
        selectedStudentId: selectedStudent._id,
        academicYears: publicYears,
        selectedAcademicYearId: req.query.academicYearId || "",
        examinations,
        selectedExaminationId: req.query.examinationId || "",
        results,
      });
    } catch (error) {
      console.error("Unable to load student examination results:", error);
      return res.status(500).json({ message: "Unable to load results. Please try again." });
    }
  },
);


// GET SINGLE MARK
// GET /api/marks/:id
// ======================================================
router.get(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER",
    "PARENT",
    "STUDENT"
  ),
  async (req, res) => {
    try {
      const mark = await Mark.findById(req.params.id)
        .populate(
          "studentId",
          "roleNumber fullName classId status"
        )
        .populate(
          "examId",
          "title classId subjectId teacherId examDate totalMarks academicYear"
        )
        .populate(
          "enteredBy",
          "name role"
        );

      if (!mark) {
        return res.status(404).json({
          message: "Mark not found.",
        });
      }

      // Tenant isolation
      if (
        req.user.role !== "SUPER_ADMIN" &&
        mark.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You do not have access to this mark.",
        });
      }

      // Student sees own mark only
      if (req.user.role === "STUDENT") {
        const student = await Student.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !student ||
          mark.studentId._id.toString() !==
            student._id.toString()
        ) {
          return res.status(403).json({
            message: "You can only view your own marks.",
          });
        }
      }

      // Parent sees children's marks only
      if (req.user.role === "PARENT") {
        const parent = await Parent.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !parent ||
          !(await Student.exists({
            _id: mark.studentId._id,
            parentId: parent._id,
            schoolId: req.schoolId,
          }))
        ) {
          return res.status(403).json({
            message:
              "You can only view marks of your children.",
          });
        }
      }

      // Teacher sees marks from their own exams
      if (req.user.role === "TEACHER") {
        const teacher = await Teacher.findOne({
          userId: req.user.userId,
          schoolId: req.schoolId,
        });

        if (
          !teacher ||
          mark.examId.teacherId.toString() !==
            teacher._id.toString()
        ) {
          return res.status(403).json({
            message:
              "You can only view marks from your own exams.",
          });
        }

        const examClass = await Class.findOne({
          _id: mark.examId.classId,
          schoolId: req.schoolId,
        });
        const isCurrentAcademicYear = examClass && await AcademicYear.exists({
          _id: examClass.academicYearId,
          schoolId: req.schoolId,
          isCurrent: true,
        });
        const assignment = examClass && isCurrentAcademicYear
          ? await TeacherAssignment.findOne({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              classId: examClass._id,
              subjectId: mark.examId.subjectId,
              academicYearId: examClass.academicYearId,
            })
          : null;
        if (!assignment) {
          return res.status(403).json({
            message: "You are not assigned to this class and subject.",
          });
        }
      }

      return res.status(200).json({
        mark,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to get mark.",
      });
    }
  }
);


// ======================================================
// UPDATE MARK
// PUT /api/marks/:id
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.put(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const {
        marksObtained,
        remarks,
      } = req.body;

      const mark = await Mark.findById(req.params.id);

      if (!mark) {
        return res.status(404).json({
          message: "Mark not found.",
        });
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        mark.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot update this mark.",
        });
      }

      // Get exam to check total marks and teacher ownership
      const exam = await SubjectExam.findOne({
        _id: mark.examId,
        schoolId: mark.schoolId,
      });

      if (!exam) {
        return res.status(404).json({
          message: "Subject exam not found.",
        });
      }

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
            message:
              "You can only update marks from your own exams.",
          });
        }

        const examClass = await Class.findOne({
          _id: exam.classId,
          schoolId: req.schoolId,
        });
        const isCurrentAcademicYear = examClass && await AcademicYear.exists({
          _id: examClass.academicYearId,
          schoolId: req.schoolId,
          isCurrent: true,
        });
        const assignment = examClass && isCurrentAcademicYear
          ? await TeacherAssignment.findOne({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              classId: examClass._id,
              subjectId: exam.subjectId,
              academicYearId: examClass.academicYearId,
            })
          : null;
        if (!assignment) {
          return res.status(403).json({
            message: "You are not assigned to this class and subject.",
          });
        }
      }

      if (marksObtained !== undefined) {
        const numericMark = Number(marksObtained);
        if (
          !["number", "string"].includes(typeof marksObtained) ||
          String(marksObtained).trim() === "" ||
          !Number.isFinite(numericMark) ||
          numericMark < 0
        ) {
          return res.status(400).json({
            message: "marksObtained must be a valid non-negative number.",
          });
        }

        if (numericMark > exam.totalMarks) {
          return res.status(400).json({
            message:
              "marksObtained cannot be greater than the exam total marks.",
          });
        }

        mark.marksObtained = numericMark;
      }

      if (remarks !== undefined) {
        mark.remarks = remarks;
      }

      await mark.save();

      const updatedMark = await Mark.findById(mark._id)
        .populate(
          "studentId",
          "roleNumber fullName classId status"
        )
        .populate(
          "examId",
          "title classId subjectId teacherId examDate totalMarks academicYear"
        )
        .populate(
          "enteredBy",
          "name role"
        );

      return res.status(200).json({
        message: "Mark updated successfully.",
        mark: updatedMark,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to update mark.",
      });
    }
  }
);


// ======================================================
// DELETE MARK
// DELETE /api/marks/:id
// ADMIN, SUPER_ADMIN, TEACHER
// ======================================================
router.delete(
  "/:id",
  authMiddleware,
  tenantMiddleware,
  roleMiddleware("ADMIN", "SUPER_ADMIN", "TEACHER"),
  async (req, res) => {
    try {
      const mark = await Mark.findById(req.params.id);

      if (!mark) {
        return res.status(404).json({
          message: "Mark not found.",
        });
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        mark.schoolId.toString() !== req.schoolId.toString()
      ) {
        return res.status(403).json({
          message: "You cannot delete this mark.",
        });
      }

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

        const exam = await SubjectExam.findOne({
          _id: mark.examId,
          schoolId: req.schoolId,
        });

        if (
          !exam ||
          exam.teacherId.toString() !==
            teacher._id.toString()
        ) {
          return res.status(403).json({
            message:
              "You can only delete marks from your own exams.",
          });
        }

        const examClass = await Class.findOne({
          _id: exam.classId,
          schoolId: req.schoolId,
        });
        const isCurrentAcademicYear = examClass && await AcademicYear.exists({
          _id: examClass.academicYearId,
          schoolId: req.schoolId,
          isCurrent: true,
        });
        const assignment = examClass && isCurrentAcademicYear
          ? await TeacherAssignment.findOne({
              schoolId: req.schoolId,
              teacherId: teacher._id,
              classId: examClass._id,
              subjectId: exam.subjectId,
              academicYearId: examClass.academicYearId,
            })
          : null;
        if (!assignment) {
          return res.status(403).json({
            message: "You are not assigned to this class and subject.",
          });
        }
      }

      await Mark.findByIdAndDelete(req.params.id);

      return res.status(200).json({
        message: "Mark deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Failed to delete mark.",
      });
    }
  }
);

export default router;
