/* GET /api/catalog?ids=1,2,3: saved anime details (titles, posters, genres…) from
 * anime_catalog, so a library loads without asking Tenrai again. Up to 200 ids. */
const router = require("express").Router();
const { requireUser } = require("../services/auth");
const { getCatalog } = require("../services/catalog");

router.get("/", requireUser, async (req, res) => {
  const ids = String(req.query.ids || "").split(",").filter(Boolean);
  if (ids.length > 200 || !ids.every((id) => /^[1-9]\d{0,9}$/.test(id) && Number(id) < 2 ** 31)) {
    return res.status(400).json({ error: "ids must be up to 200 MyAnimeList ids, separated by commas" });
  }
  try {
    res.json(await getCatalog(ids.map(Number)));
  } catch (err) {
    console.error("Reading anime_catalog failed:", err.message);
    res.status(503).json({ error: "Saved anime details aren’t available right now." });
  }
});

module.exports = router;
