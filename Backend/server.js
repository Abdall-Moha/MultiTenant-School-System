import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import userRoutes from "./routes/userRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import parentRoutes from "./routes/parentRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import teacherAssignmentRoutes from "./routes/teacherAssignmentRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

import staffRoutes from "./routes/staffRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import examinationRoutes from "./routes/examinationRoutes.js";
import academicYearRoutes from "./routes/academicYearRoutes.js";
import studentEnrollmentRoutes from "./routes/studentEnrollmentRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import feeRoutes from "./routes/feeRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import markRoutes from "./routes/markRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import subscriptionPlanRoutes from "./routes/subscriptionPlanRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.use(cors());
app.use(express.json());


app.use("/api/users", userRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/teacher-assignments", teacherAssignmentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/examinations", examinationRoutes);
app.use("/api/academic-years", academicYearRoutes);
app.use("/api/student-enrollments", studentEnrollmentRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/marks", markRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);
app.use("/api/subscriptions", subscriptionRoutes);




mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("Connected to MongoDB");
}).catch((error) => {
    console.error("Error connecting to MongoDB:", error);
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
