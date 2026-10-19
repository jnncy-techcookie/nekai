/* How the AI service talks to the api service (API_URL, e.g. http://api:3000 inside Docker).
 * The AI service has no database of its own, so it asks the api to
 *   - check the browser's session cookie (GET /api/auth/session), and
 *   - search MyAnimeList through Tenrai (GET /api/tenrai/anime), so every Tenrai call in
 *     the system goes through the api's one shared queue and cache.
 */
const API_URL = (process.env.API_URL || "http://localhost:3000").replace(/\/$/, "");
const TIMEOUT_MS = 12000;

// The signed-in user ({ id, email, … }) for this request's cookie, or null.
// Throws when the api can't be reached.
async function userFromRequest(req) {
  const cookie = req.get("cookie");
  if (!cookie) return null;
  const response = await fetch(`${API_URL}/api/auth/session`, {
    headers: { cookie },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`api returned ${response.status}`);
  return (await response.json()).user || null;
}

// Middleware for routes that need a signed-in NEKAI account: sets req.user, or answers 401
async function requireUser(req, res, next) {
  let user;
  try {
    user = await userFromRequest(req);
  } catch (err) {
    console.error("Checking the session with the api failed:", err.message);
    return res.status(503).json({ error: "NEKAI’s account service isn’t reachable right now. Please try again." });
  }
  if (!user) return res.status(401).json({ error: "Please sign in again, then retry." });
  req.user = user;
  return next();
}

// Same shape as Tenrai's own answer ({ data, … }); rejects with an Error whose .status is the api's status
async function searchAnime(params) {
  const url = new URL(`${API_URL}/api/tenrai/anime`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    const error = new Error(`api returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

module.exports = { API_URL, userFromRequest, requireUser, searchAnime };
