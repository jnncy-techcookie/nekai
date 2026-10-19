/* NEKAI api service: accounts, user data and anime data. The only service that talks to PostgreSQL.
 *   /api/tenrai/*    anime data from Tenrai (MyAnimeList), see routes/anime.js
 *   /api/auth/*      sign up, sign in, sign out, password reset, see routes/auth.js
 *   /api/me/*        the signed-in user's own data (PostgreSQL), see routes/me.js
 *   /api/catalog     saved anime details from anime_catalog, see routes/catalog.js
 *   /api/account     deleting the signed-in user's account, see routes/account.js
 *   /avatars/*       uploaded profile pictures (services/avatars.js)
 * The page files are served by the frontend container, and Neko and Nekai's Picks by the
 * ai-service; the reverse proxy (proxy/) sends each request to the right one.
 * Accounts and data live in PostgreSQL (schema: db/init.sql, settings: DATABASE_URL).
 * Start it with `npm start` in api/. Settings: api/.env (see .env.example).
 */
const path = require("node:path");

// Secrets such as the database password live in api/.env (gitignored).
// Loaded first: some services read their settings as soon as they are required.
try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch {
  /* no .env file: rely on real environment variables */
}

const express = require("express");
const animeRoutes = require("./routes/anime");
const accountRoutes = require("./routes/account");
const authRoutes = require("./routes/auth");
const meRoutes = require("./routes/me");
const catalogRoutes = require("./routes/catalog");
const db = require("./services/db");
const { AVATAR_DIR } = require("./services/avatars");

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.warn(
    "DATABASE_URL is missing from api/.env: trying PostgreSQL on localhost:5432 " +
      "with the PG* defaults. See api/.env.example.",
  );
}

const app = express();
const PORT = process.env.PORT || 3000;

// Production hardening. The app sits behind a trusted reverse proxy (Nginx).
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Quick check that the server is up and can reach PostgreSQL (makes no Tenrai call).
// Used by container health checks and the pipeline's smoke test.
app.get("/api/health", async (req, res) => {
  const database = await db.ping();
  res.status(database ? 200 : 503).json({ status: database ? "ok" : "degraded", database: database ? "ok" : "unreachable" });
});

// JSON bodies are parsed only for the routes that take one, each with a size cap.
app.use("/api/tenrai", animeRoutes);
app.use("/api/auth", express.json({ limit: "8kb" }), authRoutes);
app.use("/api/me", meRoutes); // each route parses its own body (JSON or an image)
app.use("/api/catalog", catalogRoutes);
app.use("/api/account", accountRoutes);
// Bad request bodies (not JSON, too large) answer in JSON like the rest of the API
app.use("/api", (err, req, res, next) => {
  if (!err.status || err.status >= 500) return next(err);
  res.status(err.status).json({
    error: err.type === "entity.too.large" ? "That’s too large to send." : "The request couldn’t be read.",
  });
});
// Unknown API paths answer in JSON, not with an HTML page
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Uploaded profile pictures. nosniff: a file is only ever shown as the image type its name says
app.use(
  "/avatars",
  express.static(AVATAR_DIR, {
    immutable: true,
    maxAge: "365d",
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Nekai api is running at http://localhost:${PORT}`);
  });
}

// Tests import the app without starting the server; npm start listens above.
module.exports = app;
