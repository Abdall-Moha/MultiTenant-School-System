import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import User from "../models/User.js";

dotenv.config();

const SETUP_LOCK_ID = "create-first-super-admin";
const SETUP_LOCK_DURATION_MS = 10 * 60 * 1000;
const lockOwnerId = randomUUID();
let lockCollection;
let lockAcquired = false;

function getInitialCredentials() {
  const name = process.env.SUPER_ADMIN_NAME?.trim();
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!name || !email || !password?.trim()) {
    throw new Error(
      "Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD in the backend environment.",
    );
  }

  if (password.length < 8) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters long.");
  }

  return { name, email, password };
}

async function acquireSetupLock() {
  lockCollection = mongoose.connection.db.collection("setupLocks");

  // Allow another setup attempt if a previous process crashed and its lock expired.
  await lockCollection.deleteOne({
    _id: SETUP_LOCK_ID,
    expiresAt: { $lte: new Date() },
  });

  try {
    await lockCollection.insertOne({
      _id: SETUP_LOCK_ID,
      ownerId: lockOwnerId,
      expiresAt: new Date(Date.now() + SETUP_LOCK_DURATION_MS),
    });
    lockAcquired = true;
  } catch (error) {
    if (error.code === 11000) {
      throw new Error("Another first SuperAdmin setup is already running. Try again shortly.");
    }
    throw error;
  }
}

async function createFirstSuperAdmin() {
  try {
    if (!process.env.MONGO_URI?.trim()) {
      throw new Error("MONGO_URI is missing from the backend environment.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    await acquireSetupLock();

    // Refuse setup when any account exists, regardless of its role.
    if (await User.exists({})) {
      throw new Error("Users already exist. First SuperAdmin setup cancelled.");
    }

    const { name, email, password } = getInitialCredentials();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check again just before creating the account.
    if (await User.exists({})) {
      throw new Error("A user was created during setup. First SuperAdmin setup cancelled.");
    }

    await User.create({
      schoolId: null,
      name,
      email,
      username: null,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    });

    console.log(`First SuperAdmin created successfully for ${email}.`);
  } catch (error) {
    if (error.code === 11000) {
      console.error("Setup failed: a user with this email already exists. No duplicate account was created.");
    } else {
      console.error(`First SuperAdmin setup failed: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    // Release only this process's lock, then close the MongoDB connection.
    if (lockAcquired && lockCollection) {
      try {
        await lockCollection.deleteOne({ _id: SETUP_LOCK_ID, ownerId: lockOwnerId });
      } catch (error) {
        console.error(`Unable to release setup lock: ${error.message}`);
        process.exitCode = 1;
      }
    }

    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (error) {
        console.error(`Unable to close MongoDB connection: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}

await createFirstSuperAdmin();
