import mongoose from "mongoose";

const subjectExamSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    examinationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Examination",
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
    },
    // Kept for old records and existing reports; new values copy the examination name.
    title: {
      type: String,
      required: true,
      trim: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    examDate: {
      type: Date,
      required: true,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    filePath: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Older records do not have examinationId yet. The partial index keeps them
// untouched while preventing duplicate subject papers for new linked records.
subjectExamSchema.index(
  { schoolId: 1, examinationId: 1, classId: 1, subjectId: 1 },
  {
    unique: true,
    partialFilterExpression: { examinationId: { $type: "objectId" } },
  },
);

export default mongoose.model("SubjectExam", subjectExamSchema, "exams");
