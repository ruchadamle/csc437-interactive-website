import jwt from "jsonwebtoken";
import { getEnvVar } from "../getEnvVar.js";
import { normalizeUsername } from "../providers/CredentialsProvider.js";

export function registerAuthRoutes(app, credentialsProvider) {
  app.post("/api/users", async (req, res, next) => {
    try {
      const username = normalizeUsername(req.body?.username);
      const password = normalizePassword(req.body?.password);

      if (!username || !password) {
        return res.status(400).send({
          error: "Bad request",
          message: "Missing username or password",
        });
      }

      const didRegister = await credentialsProvider.registerUser(username, password);
      if (!didRegister) {
        return res.status(409).send({
          error: "Conflict",
          message: "Username already taken",
        });
      }

      return res.status(201).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/tokens", async (req, res, next) => {
    try {
      const username = normalizeUsername(req.body?.username);
      const password = normalizePassword(req.body?.password);

      if (!username || !password) {
        return res.status(400).send({
          error: "Bad request",
          message: "Missing username or password",
        });
      }

      const isValid = await credentialsProvider.verifyPassword(username, password);
      if (!isValid) {
        return res.status(401).send({
          error: "Unauthorized",
          message: "Incorrect username or password",
        });
      }

      const token = await generateAuthToken(username);
      return res.status(200).send({ token, username });
    } catch (error) {
      return next(error);
    }
  });
}

function generateAuthToken(username) {
  const jwtSecret = getEnvVar("JWT_SECRET", false);
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is missing from backend/.env.");
  }

  return new Promise((resolve, reject) => {
    jwt.sign(
      { username },
      jwtSecret,
      { expiresIn: "1d" },
      (error, token) => {
        if (error) {
          reject(error);
        } else {
          resolve(token);
        }
      },
    );
  });
}

function normalizePassword(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value;
}
