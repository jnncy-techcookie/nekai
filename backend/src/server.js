/* NEKAI server: serves the frontend and the three API routes it calls.
 *   /api/tenrai/*    anime data from Tenrai (MyAnimeList), see routes/anime.js
 *   /api/lolli/chat  the Lolli chatbot (Gemini), see routes/lolli.js
 *   /api/recommend   Nekai's Picks (Gemini + Tenrai), see routes/recommend.js
 * Start it with `npm start` in backend/. PORT defaults to 3000.
 */
const path = require("node:path");
const express = require("express");
const animeRoutes = require("./routes/anime");
const lolliRoutes = require("./routes/lolli");
const recommendRoutes = require("./routes/recommend");

// Secrets such as GEMINI_API_KEY live in backend/.env (gitignored)
try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch {
  /* no .env file: rely on real environment variables */
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
// Everything else is the static site: the HTML pages, css/, js/ and assets/
app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Nekai is running at http://localhost:${PORT}`);
});
