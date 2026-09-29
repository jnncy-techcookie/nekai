const router = require("express").Router();
const { getAdmin, userFromRequest } = require("../services/supabase");

// Deletes the signed-in user's account. Every Nekai table references auth.users
// with "on delete cascade", so the library, history, badges and chats go with it.
router.delete("/", async (req, res) => {
  const db = getAdmin();
  if (!db) {
    return res
      .status(503)
      .json({ error: "Account deletion isn’t set up on the server yet." });
  }

  const user = await userFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in again, then retry." });
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Deleting account failed:", error.message);
    return res
      .status(502)
      .json({ error: "Your account couldn’t be deleted just now. Please try again." });
  }

  return res.json({ deleted: true });
});

module.exports = router;
