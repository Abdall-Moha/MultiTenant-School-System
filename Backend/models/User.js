import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    username: {
      type: String,
      trim: true,
      default: null,
    },

    password: {
      type: String,
      required: true,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "ADMIN",
        "TEACHER",
        "PARENT",
        "STUDENT",
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

// Username must be globally unique because
// login does not require a School ID.
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $type: "string" },
    },
  }
);

// Email must also be globally unique.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  }
);

const User = mongoose.model("User", userSchema);

export default User;