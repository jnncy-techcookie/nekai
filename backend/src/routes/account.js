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

  // Profile pictures are files in storage, which the cascade doesn't reach: remove them first
  // (best effort: a missing bucket or folder doesn't stop the account from being deleted)
  try {
    const { data: files } = await db.storage.from("avatars").list(user.id);
    if (files && files.length) {
      await db.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch (err) {
    console.error("Removing profile pictures failed:", err.message);
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
