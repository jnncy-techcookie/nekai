/* NEKAI server: serves the frontend and the API routes it calls.
 *   /api/tenrai/*    anime data from Tenrai (MyAnimeList), see routes/anime.js
 *   /api/lolli/chat  the Lolli chatbot (Gemini), see routes/lolli.js
 *   /api/recommend   Nekai's Picks (Gemini + Tenrai), see routes/recommend.js
 *   /api/account     deleting the signed-in user's Supabase account, see routes/account.js
 * Sign-in and user data go straight from the browser to Supabase (frontend/js/core/supabase.js).
 * Start it with `npm start` in backend/. Settings: backend/.env (see .env.example).
 */
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

// Quick check that the server is up (makes no upstream calls)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API routes come before the static files, so nothing in frontend/ can shadow them.
// JSON bodies are parsed only for the routes that take one, each with a size cap.
app.use("/api/tenrai", animeRoutes);
app.use("/api/lolli", express.json({ limit: "32kb" }), lolliRoutes);
app.use("/api/recommend", express.json({ limit: "64kb" }), recommendRoutes);
app.use("/api/account", accountRoutes);
// Everything else is the static site: the HTML pages, css/, js/ and assets/
app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Nekai is running at http://localhost:${PORT}`);
});
