/* /api/auth/*: NEKAI accounts (email and password), stored in PostgreSQL.
 *   GET    /session   the signed-in user, or { user: null }
 *   POST   /register  { name, email, password } creates the account and signs in
 *   POST   /login     { email, password }
 *   POST   /logout
 *   POST   /forgot    { email } emails a password reset link (always answers the same)
 *   POST   /reset     { token, password } sets a new password from that link and signs in
 *   PUT    /email     { email } changes the signed-in user's email
 */
const router = require("express").Router();
const db = require("../services/db");
const auth = require("../services/auth");
const { sendMail } = require("../services/mailer");
const { rateLimiter } = require("../services/rate-limit");

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESET_MINUTES = 60;

const loginLimited = rateLimiter(20, 10 * 60 * 1000); // sign-in and sign-up tries per IP
const mailLimited = rateLimiter(5, 15 * 60 * 1000); // reset emails per IP

const cleanEmail = (v) => String(v || "").trim().toLowerCase();
const validEmail = (v) => v.length <= 254 && EMAIL.test(v);
const validPassword = (v) => typeof v === "string" && v.length >= 8 && v.length <= 200;
const publicUser = (u) => ({ id: u.id, email: u.email, created_at: u.created_at });

// Wraps a handler so a database error answers 503 instead of crashing the request
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (res.headersSent) return;
    // unique_violation: two requests claimed the same email at the same moment
    if (err.code === "23505") return res.status(409).json({ error: "There’s already an account with that email." });
    console.error(`${req.method} /api/auth${req.path} failed:`, err.message);
    res.status(503).json({ error: "NEKAI’s account service isn’t available right now. Please try again." });
  }
};

router.get("/session", handle(async (req, res) => {
  const user = await auth.userFromRequest(req);
  if (user) auth.setSessionCookie(req, res, auth.readCookie(req, auth.COOKIE)); // renew the cookie's lifetime
  res.json({ user: user ? publicUser(user) : null });
}));

router.post("/register", handle(async (req, res) => {
  if (loginLimited(req.ip)) return res.status(429).json({ error: "Too many tries. Wait a minute, then try again." });
  const name = String(req.body?.name || "").trim().slice(0, 100);
  const email = cleanEmail(req.body?.email);
  const password = req.body?.password;
  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!validPassword(password)) return res.status(400).json({ error: "Use a password of 8 to 200 characters." });

  const hash = await auth.hashPassword(password);
  const user = await db.transaction(async (c) => {
    const { rows } = await c.query(
      `insert into users (email, password_hash) values ($1, $2)
       on conflict (email) do nothing
       returning id, email, created_at`,
      [email, hash],
    );
    if (!rows[0]) return null;
    // Every account starts with its profile and settings rows
    await c.query("insert into profiles (user_id, display_name) values ($1, $2)", [rows[0].id, name]);
    await c.query("insert into user_settings (user_id) values ($1)", [rows[0].id]);
    return rows[0];
  });
  if (!user) return res.status(409).json({ error: "There’s already an account with that email. Sign in instead." });

  await auth.startSession(req, res, user.id);
  res.status(201).json({ user: publicUser(user) });
}));

router.post("/login", handle(async (req, res) => {
  if (loginLimited(req.ip)) return res.status(429).json({ error: "Too many tries. Wait a minute, then try again." });
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const { rows } = await db.query("select id, email, created_at, password_hash from users where email = $1", [email]);
  const ok = rows[0] ? await auth.verifyPassword(password, rows[0].password_hash) : await auth.verifyDummy(password);
  // The same answer for an unknown email and a wrong password, so nobody can find out which emails have an account
  if (!ok) return res.status(401).json({ error: "Incorrect email or password. Check them and try again, or create an account if you don’t have one yet." });

  await db.query("delete from sessions where expires_at < now()"); // tidy up old sessions now and then
  await auth.startSession(req, res, rows[0].id);
  res.json({ user: publicUser(rows[0]) });
}));

router.post("/logout", handle(async (req, res) => {
  await auth.endSession(req, res);
  res.json({ signedOut: true });
}));

router.post("/forgot", handle(async (req, res) => {
  if (mailLimited(req.ip)) return res.status(429).json({ error: "Too many tries. Wait a minute, then try again." });
  const email = cleanEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });

  const { rows } = await db.query("select id from users where email = $1", [email]);
  if (rows[0]) {
    const token = auth.newToken();
    await db.query(
      `insert into password_resets (token_hash, user_id, expires_at)
       values ($1, $2, now() + make_interval(mins => $3))`,
      [auth.hashToken(token), rows[0].id, RESET_MINUTES],
    );
    // The link's address comes from APP_URL, never from the request, so a forged Host header
    // can't send someone a reset link that points at another site
    const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
    const link = `${base}/signin.html?mode=reset&token=${encodeURIComponent(token)}`;
    await sendMail({
      to: email,
      subject: "Reset your NEKAI password",
      text: `Someone asked to reset the password for your NEKAI account.\n\nChoose a new password here (the link works once, for ${RESET_MINUTES} minutes):\n${link}\n\nIf it wasn’t you, ignore this email: your password stays the same.`,
    });
  }
  // Answers the same either way, so this can't be used to find out who has an account
  res.json({ sent: true });
}));

router.post("/reset", handle(async (req, res) => {
  if (loginLimited(req.ip)) return res.status(429).json({ error: "Too many tries. Wait a minute, then try again." });
  const password = req.body?.password;
  if (!validPassword(password)) return res.status(400).json({ error: "Use a password of 8 to 200 characters." });

  const hash = await auth.hashPassword(password);
  const user = await db.transaction(async (c) => {
    const { rows } = await c.query(
      `update password_resets set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now()
       returning user_id`,
      [auth.hashToken(req.body?.token || "")],
    );
    if (!rows[0]) return null;
    const u = await c.query(
      "update users set password_hash = $2, updated_at = now() where id = $1 returning id, email, created_at",
      [rows[0].user_id, hash],
    );
    // A new password signs out every other browser
    await c.query("delete from sessions where user_id = $1", [rows[0].user_id]);
    return u.rows[0];
  });
  if (!user) return res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one from the sign-in page." });

  await auth.startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
}));

router.put("/email", auth.requireUser, handle(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const { rows } = await db.query(
    `update users set email = $2, updated_at = now()
     where id = $1 and not exists (select 1 from users where email = $2 and id <> $1)
     returning id, email, created_at`,
    [req.user.id, email],
  );
  if (!rows[0]) return res.status(409).json({ error: "There’s already an account with that email." });
  res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;
