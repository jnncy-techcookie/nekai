/* /api/tenrai/*: an allow-list proxy to the Tenrai API (https://api.tenrai.org/v1).
 * Each route checks its parameters before anything goes upstream, so the browser can only
 * make the few requests the app needs. Queueing and caching happen in services/tenrai.js.
 */
const router = require("express").Router();
const { getTenrai } = require("../services/tenrai");

// MyAnimeList ids: positive integers with no leading zero
const validId = (id) => /^[1-9]\d*$/.test(id);
// A whole number from 1 to max (query values arrive as strings)
const validNumber = (value, max) =>
  /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= max;

// Forwards one Tenrai request. Upstream failures map onto three answers:
// 404 stays 404, Tenrai's 429 becomes 503 (busy, try later) and anything else is 502.
async function send(res, path, params = {}) {
  try {
    res.json(await getTenrai(path, params));
  } catch (error) {
    console.error("Tenrai request failed:", error);

    const status =
      error.status === 404 ? 404 : error.status === 429 ? 503 : 502;

    res.status(status).json({
      error:
        status === 404
          ? "Anime not found"
          : "Anime information is temporarily unavailable",
    });
  }
}

// Search and browse: Discover search, the spin wheel and AI pick lookups.
// Only the filters the frontend uses are allowed, and sfw is always on.
router.get("/anime", (req, res) => {
  const {
    q = "",
    limit = "24",
    page = "1",
    type,
    genres,
    order_by = "members",
    sort = "desc",
    min_score,
  } = req.query;

  if (
    typeof q !== "string" ||
    q.length > 120 ||
    !validNumber(limit, 25) ||
    !validNumber(page, Number.MAX_SAFE_INTEGER) ||
    (type && !["tv", "movie", "ova", "ona"].includes(type)) ||
    (genres && !/^\d+(,\d+)*$/.test(genres)) ||
    !["members", "score"].includes(order_by) ||
    !["asc", "desc"].includes(sort) ||
    (min_score !== undefined &&
      !(Number(min_score) >= 0 && Number(min_score) <= 10))
  ) {
    return res.status(400).json({ error: "Invalid search filters" });
  }

  return send(res, "/anime", {
    q,
    limit,
    page,
    type,
    genres,
    order_by,
    sort,
    min_score,
    sfw: "true",
  });
});

// Top-rated shows airing now (Discover → Popular right now)
router.get("/top/anime", (req, res) => {
  const { filter = "airing", limit = "15" } = req.query;

  if (filter !== "airing" || !validNumber(limit, 25)) {
    return res.status(400).json({ error: "Invalid top-anime filters" });
  }

  return send(res, "/top/anime", { filter, limit, sfw: "true" });
});

// Every anime genre with its title count (the genre pills and the All Genres box)
router.get("/genres/anime", (req, res) => send(res, "/genres/anime", { filter: "genres" }));

// Full details for the detail panel: relations (seasons), trailer, studios…
router.get("/anime/:id/full", (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid anime ID" });
  }
  return send(res, `/anime/${req.params.id}/full`);
});

// Episode list, 100 per page (detail panel; aired-so-far count for ongoing shows)
router.get("/anime/:id/episodes", (req, res) => {
  const page = req.query.page || "1";

  if (!validId(req.params.id) || !validNumber(page, 100)) {
    return res.status(400).json({ error: "Invalid anime ID or page" });
  }
  return send(res, `/anime/${req.params.id}/episodes`, { page });
});

// Basic details: fills in posters and scores for sample titles (tenrai.hydrate)
router.get("/anime/:id", (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid anime ID" });
  }
  return send(res, `/anime/${req.params.id}`);
});

module.exports = router;
