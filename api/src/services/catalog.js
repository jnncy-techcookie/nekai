const db = require("./db");

/* Saves anime details from Tenrai into PostgreSQL's anime_catalog, in the same shape
 * the frontend uses (see normalize in public/js/services/tenrai.js), so signed-in
 * users can load their library's titles and posters without asking Tenrai again. */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function youtubeId(t) {
  if (!t) return "";
  if (t.youtube_id) return t.youtube_id;
  const m = /embed\/([\w-]{6,})/.exec(t.embed_url || "");
  return m ? m[1] : "";
}

function relations(list) {
  if (!list || !list.length) return undefined;
  const out = { prequel: [], sequel: [], other: [] };
  for (const r of list) {
    for (const x of r.entry || []) {
      if (x.type !== "anime") continue;
      if (r.relation === "Prequel") out.prequel.push(x.mal_id);
      else if (r.relation === "Sequel") out.sequel.push(x.mal_id);
      else if (r.relation !== "Character" && r.relation !== "Other")
        out.other.push({ id: x.mal_id, name: x.name, relation: r.relation });
    }
  }
  return out;
}

function normalize(j) {
  const img =
    j.images?.webp?.large_image_url || j.images?.jpg?.large_image_url || "";
  const year = j.year || j.aired?.prop?.from?.year || "";
  return {
    id: j.mal_id,
    title: j.title_english || j.title,
    jp: j.title_japanese || "",
    type: j.type || "",
    episodes: j.episodes || null,
    studio: j.studios?.[0]?.name || "",
    studios: (j.studios || []).map((x) => x.name).join(", "),
    members: j.members || null,
    rank: j.rank || null,
    popularity: j.popularity || null,
    duration: j.duration || "",
    ageRating: j.rating || "",
    source: j.source || "",
    season: j.season ? cap(j.season) + " " + year : String(year || ""),
    year: year ? String(year) : "",
    score: j.score ?? null,
    genres: (j.genres || []).map((g) => g.name),
    airing: !!j.airing,
    statusText: j.status || "",
    aired: j.aired?.string || "",
    synopsis: (j.synopsis || "").replace(/\s*\[Written by MAL Rewrite\]\s*$/, ""),
    image: img,
    trailer: youtubeId(j.trailer),
    trailerThumb:
      j.trailer?.images?.maximum_image_url ||
      j.trailer?.images?.large_image_url ||
      "",
    rel: relations(j.relations),
  };
}

// Tenrai paths whose "data" is one anime or a list of anime
const ANIME_PATH = /^\/(anime(\/\d+(\/full)?)?|top\/anime)$/;

// Drops empty values so a search result (no relations) never wipes what /full saved
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

async function saveToCatalog(path, result) {
  if (!ANIME_PATH.test(path) || !result?.data) return;

  const list = (Array.isArray(result.data) ? result.data : [result.data]).filter(
    (j) => j && Number(j.mal_id) > 0,
  );
  if (!list.length) return;

  const rows = [...new Map(list.map((j) => [j.mal_id, compact(normalize(j))])).entries()].map(
    ([anime_id, metadata]) => ({ anime_id, metadata }),
  );
  // "||" merges the saved details with the fresh ones (fresh values win), so a search
  // result never wipes the extra fields an earlier /full request saved
  await db.query(
    `insert into anime_catalog (anime_id, metadata, fetched_at)
     select x.anime_id, x.metadata, now()
     from jsonb_to_recordset($1::jsonb) as x(anime_id int, metadata jsonb)
     on conflict (anime_id) do update set
       metadata = anime_catalog.metadata || excluded.metadata, fetched_at = now()`,
    [JSON.stringify(rows)],
  );
}

// Saved details for up to 200 anime ids: { "<id>": metadata }
async function getCatalog(ids) {
  if (!ids.length) return {};
  const { rows } = await db.query(
    "select anime_id, metadata from anime_catalog where anime_id = any($1::int[])",
    [ids],
  );
  return Object.fromEntries(rows.map((r) => [r.anime_id, r.metadata]));
}

// Fire and forget: a catalog write never slows down or fails the Tenrai response
function rememberAnime(path, result) {
  saveToCatalog(path, result).catch((error) => {
    console.error("Saving to anime_catalog failed:", error.message || error);
  });
}

module.exports = { rememberAnime, getCatalog, normalize };
