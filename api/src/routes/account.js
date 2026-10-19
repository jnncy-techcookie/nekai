const router = require("express").Router();
const db = require("../services/db");
const { requireUser, endSession } = require("../services/auth");
const { removeAvatars } = require("../services/avatars");

// Deletes the signed-in user's account. Every NEKAI table references users with
// "on delete cascade", so the library, history, badges, sessions and chats go with it.
router.delete("/", requireUser, async (req, res) => {
  try {
    await db.query("delete from users where id = $1", [req.user.id]);
  } catch (err) {
    console.error("Deleting account failed:", err.message);
    return res.status(503).json({ error: "Your account couldn’t be deleted just now. Please try again." });
  }

  // Profile pictures are files, which the cascade doesn't reach (best effort: a leftover
  // file can't be reached without the account anyway)
  await removeAvatars(req.user.id).catch((err) => {
    console.error("Removing profile pictures failed:", err.message);
  });
  await endSession(req, res).catch(() => {});
  return res.json({ deleted: true });
});

module.exports = router;
