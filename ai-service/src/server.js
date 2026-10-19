/* NEKAI AI service: the two Gemini-powered features.
 *   /api/neko/chat  the Neko chatbot, see routes/neko.js
 *   /api/recommend  Nekai's Picks (Gemini + a MyAnimeList lookup), see routes/recommend.js
 * No database: sessions are checked, and anime are looked up, by calling the api service
 * (API_URL), see services/api-client.js. Settings: ai-service/.env (see .env.example).
 */
const path = require("node:path");

// Secrets such as GEMINI_API_KEY live in ai-service/.env (gitignored). Loaded first:
// some services read their settings as soon as they are required.
try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch {
  /* no .env file: rely on real environment variables */
}

const express = require("express");
const nekoRoutes = require("./routes/neko");
const recommendRoutes = require("./routes/recommend");

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is missing: Neko and Nekai's Picks will answer that AI is switched off.");
}

const app = express();
const PORT = process.env.PORT || 3001;

// The service sits behind the reverse proxy (Nginx), which sets X-Forwarded-For
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Quick check that the service is up (makes no Gemini or api calls). Used by container
// health checks and the pipeline's smoke test.
app.get("/health", (req, res) => {
  res.json({ status: "ok", gemini: process.env.GEMINI_API_KEY ? "configured" : "missing key" });
});

app.use("/api/neko", express.json({ limit: "32kb" }), nekoRoutes);
app.use("/api/recommend", express.json({ limit: "64kb" }), recommendRoutes);
// Bad request bodies (not JSON, too large) answer in JSON like the rest of the API
app.use("/api", (err, req, res, next) => {
  if (!err.status || err.status >= 500) return next(err);
  res.status(err.status).json({
    error: err.type === "entity.too.large" ? "That’s too large to send." : "The request couldn’t be read.",
  });
});
app.use((req, res) => res.status(404).json({ error: "Not found" }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Nekai AI service is running at http://localhost:${PORT}`);
  });
}

// Tests import the app without starting the server; npm start listens above.
module.exports = app;
