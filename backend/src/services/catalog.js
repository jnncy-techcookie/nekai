const { getAdmin } = require("./supabase");

/* Saves anime details from Tenrai into Supabase's anime_catalog, in the same shape
 * the frontend uses (see normalize in frontend/js/services/tenrai.js), so signed-in
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
  const db = getAdmin();
  if (!db || !ANIME_PATH.test(path) || !result?.data) return;

  const list = (Array.isArray(result.data) ? result.data : [result.data]).filter(
    (j) => j && Number(j.mal_id) > 0,
  );
  if (!list.length) return;

  const fresh = new Map(list.map((j) => [j.mal_id, compact(normalize(j))]));
  const ids = [...fresh.keys()];

  const { data: existing, error: readError } = await db
    .from("anime_catalog")
    .select("anime_id, metadata")
    .in("anime_id", ids);
  if (readError) throw readError;

  const old = new Map((existing || []).map((r) => [Number(r.anime_id), r.metadata]));
  const now = new Date().toISOString();
  const rows = ids.map((id) => ({
    anime_id: id,
    metadata: { ...(old.get(id) || {}), ...fresh.get(id) },
    fetched_at: now,
  }));

  const { error } = await db
    .from("anime_catalog")
    .upsert(rows, { onConflict: "anime_id" });
  if (error) throw error;
}

// Fire and forget: a catalog write never slows down or fails the Tenrai response
function rememberAnime(path, result) {
  saveToCatalog(path, result).catch((error) => {
    console.error("Saving to anime_catalog failed:", error.message || error);
  });
}

module.exports = { rememberAnime };
