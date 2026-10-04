const path = require("node:path");
const express = require("express");
const animeRoutes = require("./routes/anime");
const lolliRoutes = require("./routes/lolli");
const recommendRoutes = require("./routes/recommend");
const accountRoutes = require("./routes/account");

// Secrets such as GEMINI_API_KEY and SUPABASE_SECRET_KEY live in backend/.env (gitignored)
try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch {
  /* no .env file: rely on real environment variables */
}

if (
  !process.env.SUPABASE_URL ||
  !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
) {
  console.warn(
    "SUPABASE_URL or SUPABASE_SECRET_KEY is missing from backend/.env: " +
      "anime details won’t be saved to anime_catalog and accounts can’t be deleted.",
  );
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tenrai", animeRoutes);
app.use("/api/lolli", express.json({ limit: "32kb" }), lolliRoutes);
app.use("/api/recommend", express.json({ limit: "64kb" }), recommendRoutes);
app.use("/api/account", accountRoutes);
app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Nekai is running at http://localhost:${PORT}`);
});
