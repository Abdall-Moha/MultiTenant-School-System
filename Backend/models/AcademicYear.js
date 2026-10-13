import mongoose from "mongoose";

const academicYearSchema = new mongoose.Schema(
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
    startDate: { 
      type: Date, 
      required: true 

    },
    endDate: { 
      type: Date, 
      required: true 

    },
    isCurrent: { 
      type: Boolean, 
      default: false 

    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

academicYearSchema.index(
    { schoolId: 1, name: 1 }, 
    { unique: true }
  );
academicYearSchema.pre("validate", function validateDates() {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate("endDate", "End date must be after start date.");
  }
});

export default mongoose.model("AcademicYear", academicYearSchema);
