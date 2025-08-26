import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "data");
const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf-8"));

app.get("/", (_req, res) => {
  res
    .type("text")
    .send("Neon Runner API\n\nEndpoints:\n  GET /obstacles\n  GET /bonuses\n");
});

app.get("/obstacles", (_req, res) => {
  const data = readJson("obstacles.json");
  res.json({ items: data.items, updatedAt: Date.now() });
});

app.get("/bonuses", (_req, res) => {
  const data = readJson("bonuses.json");
  res.json({ items: data.items, updatedAt: Date.now() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
