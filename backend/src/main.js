import express from "express";
import { getEnvVar } from "./getEnvVar.js";
import { SHARED_TEST } from "./shared/example.js";

const PORT = Number.parseInt(getEnvVar("PORT", false), 10) || 3000;
const app = express();

app.get("/hello", (req, res) => {
    res.send("Hello, World " + SHARED_TEST);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}.  CTRL+C to stop.`);
});
