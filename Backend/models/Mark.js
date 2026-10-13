import mongoose from "mongoose";

const markSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    examId: {
      type: mongoose.Schema.Types.ObjectId,
      // This existing field points to the SubjectExam stored in the exams collection.
      ref: "SubjectExam",
      required: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    marksObtained: {
      type: Number,
      required: true,
      min: 0,
    },

    remarks: {
      type: String,
      trim: true,
    },

    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

markSchema.index(
  { schoolId: 1, examId: 1, studentId: 1 },
  { unique: true }
);

const Mark = mongoose.model("Mark", markSchema);

export default Mark;
