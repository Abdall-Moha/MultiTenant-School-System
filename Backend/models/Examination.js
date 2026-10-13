import mongoose from "mongoose";

const examinationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // A normalized value makes names unique regardless of capitalization.
    nameKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

examinationSchema.index(
  { schoolId: 1, academicYearId: 1, nameKey: 1 },
  { unique: true },
);

export default mongoose.model("Examination", examinationSchema);
