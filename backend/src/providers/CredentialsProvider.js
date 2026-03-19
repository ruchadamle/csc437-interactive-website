import bcrypt from "bcrypt";
import { getUserCredsCollection, getUsersCollection } from "../mongo.js";

export class CredentialsProvider {
  async registerUser(username, password) {
    const normalizedUsername = normalizeUsername(username);

    const credsCollection = getUserCredsCollection();
    const usersCollection = getUsersCollection();

    const [existingCreds, existingUser] = await Promise.all([
      credsCollection.findOne({ username: normalizedUsername }, { projection: { _id: 1 } }),
      usersCollection.findOne({ username: normalizedUsername }, { projection: { _id: 1 } }),
    ]);

    if (existingCreds || existingUser) {
      return false;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    try {
      await credsCollection.insertOne({
        username: normalizedUsername,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return false;
      }
      throw error;
    }

    try {
      await usersCollection.insertOne({
        username: normalizedUsername,
        createdAt: now,
        updatedAt: now,
      });
      return true;
    } catch (error) {
      await credsCollection.deleteOne({ username: normalizedUsername });
      if (error?.code === 11000) {
        return false;
      }
      throw error;
    }
  }

  async verifyPassword(username, password) {
    const normalizedUsername = normalizeUsername(username);
    const credsCollection = getUserCredsCollection();
    const creds = await credsCollection.findOne({ username: normalizedUsername });

    if (!creds?.passwordHash) {
      return false;
    }

    return bcrypt.compare(password, creds.passwordHash);
  }
}

export function normalizeUsername(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}
