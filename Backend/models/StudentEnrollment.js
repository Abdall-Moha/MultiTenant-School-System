import mongoose from "mongoose";

const studentEnrollmentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REPEATED", "TRANSFERRED", "GRADUATED"],
      default: "ACTIVE",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

studentEnrollmentSchema.index(
  { schoolId: 1, studentId: 1, academicYearId: 1 },
  { unique: true },
);

export default mongoose.model("StudentEnrollment", studentEnrollmentSchema);
