import multer from "multer";
import path from "path";
import fs from "fs";

const uploadFolder = "uploads/exams";

// Create the upload folder if it does not already exist
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const fileName = `exam-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${extension}`;

    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".pdf", ".doc", ".docx", ".txt"];

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    return cb(
      new Error(
        "Only PDF, Word (.doc/.docx), and TXT files are allowed."
      )
    );
  }

  cb(null, true);
};

const uploadMiddleware = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

export default uploadMiddleware;