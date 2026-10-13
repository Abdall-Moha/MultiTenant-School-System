import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },

    numberOfPeriods: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

classSchema.index(
  { schoolId: 1, name: 1, academicYearId: 1 },
  { unique: true }
);

const Class = mongoose.model("Class", classSchema);

export default Class;
