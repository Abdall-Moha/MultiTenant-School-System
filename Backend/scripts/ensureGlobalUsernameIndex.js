import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

async function ensureGlobalUsernameIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const users = mongoose.connection.collection("users");

    const duplicates = await users.aggregate([
      { $match: { username: { $type: "string" } } },
      { $group: { _id: "$username", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();

    if (duplicates.length > 0) {
      throw new Error(
        "Duplicate usernames exist. Resolve them before enabling global username login. No data was changed.",
      );
    }

    const indexes = await users.indexes();
    const globalUsernameIndex = indexes.find(
      (index) => index.key?.username === 1 && Object.keys(index.key).length === 1,
    );

    if (!globalUsernameIndex?.unique) {
      await users.createIndex(
        { username: 1 },
        {
          name: "username_1",
          unique: true,
          partialFilterExpression: { username: { $type: "string" } },
        },
      );
    }

    const legacyIndex = indexes.find(
      (index) => index.key?.schoolId === 1 && index.key?.username === 1,
    );
    if (legacyIndex) {
      await users.dropIndex(legacyIndex.name);
      console.log(`Removed obsolete username index: ${legacyIndex.name}`);
    }

    console.log("Global username uniqueness is enabled. No user records were modified.");
  } finally {
    await mongoose.disconnect();
  }
}

ensureGlobalUsernameIndex().catch((error) => {
  console.error("Username index migration failed:", error.message);
  process.exitCode = 1;
});
