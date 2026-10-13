import dotenv from "dotenv";
import mongoose from "mongoose";
import AcademicYear from "../models/AcademicYear.js";
import Class from "../models/Class.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import TeacherAssignment from "../models/TeacherAssignment.js";

dotenv.config();

// Existing records were reviewed with the user: this school has Grade 8A and
// Grade 8B for 2025-2026, each with seven periods. Attendance has no old rows.
const yearName = "2025-2026";
const numberOfPeriods = 7;

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const legacyClasses = await Class.collection.find({ academicYear: yearName }).toArray();
    let year = legacyClasses.length
      ? await AcademicYear.findOne({ schoolId: legacyClasses[0].schoolId, name: yearName })
      : await AcademicYear.findOne({ name: yearName });
    const schoolId = legacyClasses[0]?.schoolId || year?.schoolId;
    const oldClasses = legacyClasses.length
      ? legacyClasses
      : year ? await Class.collection.find({ schoolId, academicYearId: year._id }).toArray() : [];
    if (oldClasses.length === 0) {
      console.log("No legacy classes remain for this migration.");
      return;
    }
    if (oldClasses.length !== 2 || new Set(oldClasses.map((item) => String(item.schoolId))).size !== 1) {
      throw new Error("The reviewed legacy class set changed. No records were migrated.");
    }

    const studentRows = await Student.collection.find({
      schoolId,
      classId: { $in: oldClasses.map((item) => item._id) },
    }).toArray();
    const assignmentRows = await TeacherAssignment.collection.find({ schoolId, classId: { $in: oldClasses.map((item) => item._id) } }).toArray();
    if (assignmentRows.some((item) => !oldClasses.some((classData) => String(classData._id) === String(item.classId)))) {
      throw new Error("A teacher assignment does not match the reviewed classes. No records were migrated.");
    }

    if (!year) {
      year = await AcademicYear.create({
        schoolId,
        name: yearName,
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        isCurrent: false,
        createdBy: oldClasses[0].createdBy,
      });
    }

    for (const classData of oldClasses) {
      await Class.collection.updateOne(
        { _id: classData._id },
        { $set: { academicYearId: year._id, numberOfPeriods }, $unset: { academicYear: "" } },
      );
    }

    for (const student of studentRows) {
      const classData = oldClasses.find((item) => String(item._id) === String(student.classId));
      await StudentEnrollment.updateOne(
        { schoolId, studentId: student._id, academicYearId: year._id },
        { $setOnInsert: { schoolId, studentId: student._id, academicYearId: year._id, classId: classData._id, status: "ACTIVE", createdBy: student.createdBy } },
        { upsert: true },
      );
      await Student.collection.updateOne({ _id: student._id }, { $unset: { classId: "" } });
    }

    for (const assignment of assignmentRows) {
      await TeacherAssignment.collection.updateOne(
        { _id: assignment._id },
        { $set: { academicYearId: year._id }, $unset: { academicYear: "" } },
      );
    }

    const currentDate = new Date();
    year.isCurrent = year.startDate <= currentDate && year.endDate >= currentDate;
    await year.save();
    if (year.isCurrent) {
      await AcademicYear.updateMany(
        { schoolId, _id: { $ne: year._id }, isCurrent: true },
        { $set: { isCurrent: false } },
      );
    }

    const enrollmentCount = await StudentEnrollment.countDocuments({ schoolId, academicYearId: year._id });
    console.log(JSON.stringify({ academicYear: year.name, classes: oldClasses.length, studentEnrollments: enrollmentCount, teacherAssignments: assignmentRows.length, numberOfPeriods }));
  } finally {
    await mongoose.disconnect();
  }
}

migrate().catch((error) => {
  console.error("Academic year migration failed:", error.message);
  process.exitCode = 1;
});
