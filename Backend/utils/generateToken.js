import jwt from "jsonwebtoken";

// Generate a JWT token for the logged-in user
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      schoolId: user.schoolId,
      mustChangePassword: user.mustChangePassword,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

export default generateToken;
