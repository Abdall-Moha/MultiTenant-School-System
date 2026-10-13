import dotenv from "dotenv";
import mongoose from "mongoose";
import SubjectExam from "../models/SubjectExam.js";
import Examination from "../models/Examination.js";
import Class from "../models/Class.js";
import AcademicYear from "../models/AcademicYear.js";

dotenv.config();

const applyChanges = process.argv.includes("--apply");

function normalizedName(name) {
  return name.trim().toLocaleLowerCase();
}

try {
  await mongoose.connect(process.env.MONGO_URI);
  const oldSubjectExams = await SubjectExam.find({}).sort({ createdAt: 1 }).lean();
  const groups = new Map();
  const skipped = [];
  const conflictingLinks = [];

  for (const subjectExam of oldSubjectExams) {
    const classData = await Class.findOne({
      _id: subjectExam.classId,
      schoolId: subjectExam.schoolId,
    }).select("academicYearId").lean();
    const year = classData
      ? await AcademicYear.findOne({ _id: classData.academicYearId, schoolId: subjectExam.schoolId })
        .select("name")
        .lean()
      : null;

    if (!classData || !year || !subjectExam.title?.trim()) {
      skipped.push(String(subjectExam._id));
      continue;
    }

    // The class is the source of truth for the year. Stop if the legacy text
    // disagrees, instead of silently attaching the paper to a different year.
    if (subjectExam.academicYear?.trim() !== year.name) {
      skipped.push(String(subjectExam._id));
      continue;
    }

    const nameKey = normalizedName(subjectExam.title);
    const key = `${subjectExam.schoolId}:${classData.academicYearId}:${nameKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        schoolId: subjectExam.schoolId,
        academicYearId: classData.academicYearId,
        academicYearName: year.name,
        name: subjectExam.title.trim(),
        nameKey,
        createdBy: subjectExam.createdBy,
        subjectExams: [],
      });
    }
    const existingLink = await Examination.findOne({
      schoolId: subjectExam.schoolId,
      academicYearId: classData.academicYearId,
      nameKey,
    }).select("_id").lean();
    if (subjectExam.examinationId && String(subjectExam.examinationId) !== String(existingLink?._id)) {
      conflictingLinks.push(String(subjectExam._id));
    }
    groups.get(key).subjectExams.push({ ...subjectExam, academicYearId: classData.academicYearId });
  }

  const duplicatePapers = [];
  for (const group of groups.values()) {
    const combinations = new Set();
    for (const subjectExam of group.subjectExams) {
      const combination = `${subjectExam.classId}:${subjectExam.subjectId}`;
      if (combinations.has(combination)) {
        duplicatePapers.push({ examination: group.name, classId: String(subjectExam.classId), subjectId: String(subjectExam.subjectId) });
      }
      combinations.add(combination);
    }
  }

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    subjectExamsFound: oldSubjectExams.length,
    examinationsToLink: groups.size,
    subjectExamsToLink: [...groups.values()].reduce((count, group) => count + group.subjectExams.length, 0),
    skippedSubjectExamIds: skipped,
    conflictingExaminationLinks: conflictingLinks,
    duplicateSubjectPapers: duplicatePapers,
    groups: [...groups.values()].map((group) => ({
      name: group.name,
      academicYear: group.academicYearName,
      subjectExamCount: group.subjectExams.length,
    })),
  }, null, 2));

  if (!applyChanges) {
    console.log("No database records were changed. Pass --apply after reviewing this plan.");
  } else if (skipped.length || duplicatePapers.length || conflictingLinks.length) {
    throw new Error("Migration stopped before writing because some legacy exam records need review.");
  } else {
    await Examination.init();
    for (const group of groups.values()) {
      const examination = await Examination.findOneAndUpdate(
        { schoolId: group.schoolId, academicYearId: group.academicYearId, nameKey: group.nameKey },
        {
          $setOnInsert: {
            schoolId: group.schoolId,
            academicYearId: group.academicYearId,
            name: group.name,
            nameKey: group.nameKey,
            createdBy: group.createdBy,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      for (const subjectExam of group.subjectExams) {
        await SubjectExam.updateOne(
          { _id: subjectExam._id, schoolId: group.schoolId },
          {
            $set: {
              examinationId: examination._id,
              academicYearId: group.academicYearId,
            },
          },
        );
      }
    }
    console.log("Existing subject exams are now linked to shared examinations. Original marks and files were not removed.");
  }
} catch (error) {
  console.error("Shared examination migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
