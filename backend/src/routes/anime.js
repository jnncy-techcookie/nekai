const router = require("express").Router();
const { getJikan } = require("../services/jikan");

const validId = (id) => /^[1-9]\d*$/.test(id);
const validNumber = (value, max) =>
  /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= max;

async function send(res, path, params = {}) {
  try {
    res.json(await getJikan(path, params));
  } catch (error) {
    console.error("Jikan request failed:", error);

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

router.get("/anime", (req, res) => {
  const {
    q = "",
    limit = "24",
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
    type,
    genres,
    order_by,
    sort,
    min_score,
    sfw: "true",
  });
});

router.get("/top/anime", (req, res) => {
  const { filter = "airing", limit = "15" } = req.query;

  if (filter !== "airing" || !validNumber(limit, 25)) {
    return res.status(400).json({ error: "Invalid top-anime filters" });
  }

  return send(res, "/top/anime", { filter, limit, sfw: "true" });
});

router.get("/anime/:id/full", (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid anime ID" });
  }
  return send(res, `/anime/${req.params.id}/full`);
});

router.get("/anime/:id/episodes", (req, res) => {
  const page = req.query.page || "1";

  if (!validId(req.params.id) || !validNumber(page, 100)) {
    return res.status(400).json({ error: "Invalid anime ID or page" });
  }
  return send(res, `/anime/${req.params.id}/episodes`, { page });
});

router.get("/anime/:id", (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid anime ID" });
  }
  return send(res, `/anime/${req.params.id}`);
});

module.exports = router;
