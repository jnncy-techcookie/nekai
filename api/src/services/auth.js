const crypto = require("node:crypto");
const { promisify } = require("node:util");
const db = require("./db");

/* Accounts: password hashing and sessions.
 * Passwords are hashed with scrypt (built into Node), each with its own random salt.
 * A session is a random token in an HttpOnly cookie; the database keeps only its
 * SHA-256 hash, so neither the browser's JavaScript nor a copy of the sessions table
 * can be used to sign in as someone else. */

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const COOKIE = "nekai_session";
const SESSION_DAYS = 30;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scrypt(password, salt, keylen, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(key, expected);
}

// Checked against when an email has no account, so a wrong email takes as long as a wrong password
let dummyHash = null;
async function verifyDummy(password) {
  dummyHash = dummyHash || (await hashPassword("not-a-real-password"));
  await verifyPassword(password, dummyHash);
  return false;
}

const newToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

function readCookie(req, name) {
  for (const part of (req.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax", // never sent on another site's POST, PUT or DELETE
    secure: req.secure, // https only, when the site is served over https
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/" });
}

// Starts a session for userId and sets its cookie
async function startSession(req, res, userId) {
  const token = newToken();
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS],
  );
  setSessionCookie(req, res, token);
}

async function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.query("delete from sessions where token_hash = $1", [hashToken(token)]);
  clearSessionCookie(req, res);
}

// The signed-in user ({ id, email, created_at }) for this request's cookie, or null.
// Each use pushes the session's expiry 30 days out, so an active user stays signed in.
async function userFromRequest(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const { rows } = await db.query(
    `with s as (
       update sessions set expires_at = now() + make_interval(days => $2)
       where token_hash = $1 and expires_at > now()
       returning user_id
     )
     select u.id, u.email, u.created_at from users u join s on s.user_id = u.id`,
    [hashToken(token), SESSION_DAYS],
  );
  return rows[0] || null;
}

// Middleware for routes that need a signed-in NEKAI account: sets req.user, or answers 401
async function requireUser(req, res, next) {
  let user;
  try {
    user = await userFromRequest(req);
  } catch (err) {
    console.error("Checking the session failed:", err.message);
    return res.status(503).json({ error: "NEKAI’s database isn’t reachable right now. Please try again." });
  }
  if (!user) return res.status(401).json({ error: "Please sign in again, then retry." });
  req.user = user;
  return next();
}

module.exports = {
  COOKIE,
  hashPassword,
  verifyPassword,
  verifyDummy,
  newToken,
  hashToken,
  readCookie,
  setSessionCookie,
  startSession,
  endSession,
  userFromRequest,
  requireUser,
};
