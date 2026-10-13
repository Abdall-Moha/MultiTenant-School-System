import rateLimit from "express-rate-limit";

// Limit how many requests a user can make within a time period
const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Maximum 10 requests per IP
  message: {
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export default rateLimitMiddleware;