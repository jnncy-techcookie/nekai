const { createClient } = require("@supabase/supabase-js");

// The service role key bypasses row level security, so it only ever lives here
// on the server (backend/.env), never in the frontend.
let admin = null;

function getAdmin() {
  if (admin) return admin;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}

// Resolves the signed-in user from the "Authorization: Bearer <access token>" header,
// or null when the token is missing or not valid.
async function userFromRequest(req) {
  const client = getAdmin();
  const match = /^Bearer (.+)$/.exec(req.get("authorization") || "");
  if (!client || !match) return null;

  const { data, error } = await client.auth.getUser(match[1]);
  return error ? null : data.user;
}

// Middleware for API routes that should only be usable by a signed-in Nekai account.
async function requireUser(req, res, next) {
  const user = await userFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in again, then retry." });
  }
  req.user = user;
  return next();
}

module.exports = { getAdmin, userFromRequest, requireUser };
