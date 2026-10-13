import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadFolder = path.resolve(currentDirectory, "../uploads/school-logos");
const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];
const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp"];

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadFolder),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `school-logo-${randomUUID()}${extension}`);
  },
});

function hasValidImageSignature(fileBuffer, extension) {
  if (extension === ".png") {
    return fileBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff;
  }
  return fileBuffer.toString("ascii", 0, 4) === "RIFF" &&
    fileBuffer.toString("ascii", 8, 12) === "WEBP";
}

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(extension) || !allowedMimeTypes.includes(file.mimetype)) {
      return callback(new Error("School logo must be a PNG, JPG, JPEG, or WebP image."));
    }
    callback(null, true);
  },
}).single("logo");

// Check the file's actual bytes as well as its extension and browser MIME type.
export default function schoolLogoUploadMiddleware(req, res, next) {
  upload(req, res, async (error) => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "School logo must be 2 MB or smaller."
        : error.message || "Unable to upload the school logo.";
      return res.status(400).json({ message });
    }

    if (!req.file) return next();

    try {
      const fileBuffer = await fs.promises.readFile(req.file.path);
      const extension = path.extname(req.file.filename).toLowerCase();
      if (!hasValidImageSignature(fileBuffer, extension)) {
        await removeSchoolLogoFile(req.file.path);
        return res.status(400).json({ message: "The selected file is not a valid PNG, JPG, JPEG, or WebP image." });
      }
      return next();
    } catch (readError) {
      await removeSchoolLogoFile(req.file.path);
      console.error("Validate school logo error:", readError);
      return res.status(400).json({ message: "Unable to read the selected school logo." });
    }
  });
}

// Only remove files inside the dedicated School Logo upload folder.
export async function removeSchoolLogoFile(filePath) {
  if (!filePath) return;
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(uploadFolder, resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return;
  try {
    await fs.promises.unlink(resolvedPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function getSchoolLogoPath(fileName) {
  return `/uploads/school-logos/${fileName}`;
}

export async function removeStoredSchoolLogo(logoPath) {
  const prefix = "/uploads/school-logos/";
  if (typeof logoPath !== "string" || !logoPath.startsWith(prefix)) return;
  const fileName = path.basename(logoPath);
  if (!fileName.startsWith("school-logo-") || !allowedExtensions.includes(path.extname(fileName).toLowerCase())) return;
  await removeSchoolLogoFile(path.join(uploadFolder, fileName));
}
