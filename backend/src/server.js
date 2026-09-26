const path = require("node:path");
const express = require("express");
const animeRoutes = require("./routes/anime");
const lolliRoutes = require("./routes/lolli");

// Secrets such as GEMINI_API_KEY live in backend/.env (gitignored)
try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch {
  /* no .env file: rely on real environment variables */
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tenrai", animeRoutes);
app.use("/api/lolli", express.json({ limit: "32kb" }), lolliRoutes);
app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Nekai is running at http://localhost:${PORT}`);
});
