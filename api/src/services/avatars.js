const fs = require("node:fs/promises");
const path = require("node:path");

/* Profile pictures, stored as files: <UPLOAD_DIR>/avatars/<user id>/avatar-<time>.<ext>
 * and served at /avatars/<user id>/avatar-<time>.<ext>. In Docker, UPLOAD_DIR is a
 * named volume, so pictures survive redeploys. Each upload gets a new file name, so
 * browsers never show a cached old picture. */

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads"));
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
const MAX_BYTES = 1024 * 1024; // the app uploads a 256×256 WebP or JPEG, usually 10–30 KB

// The image type from the file's first bytes; the browser's Content-Type isn't trusted
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

// user ids are UUIDs, so they're safe as folder names; checked anyway before touching the disk
const folder = (userId) => {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Bad user id");
  return path.join(AVATAR_DIR, userId);
};

// The public URL an avatar_url may hold for this user (anything else is refused)
const OWN_URL = (userId) => new RegExp(`^/avatars/${userId}/avatar-\\d+\\.(webp|jpg|png)$`);

// Saves the picture, removes the user's older ones, and resolves with its URL
async function saveAvatar(userId, buf) {
  const ext = imageType(buf);
  if (!ext) return null;
  const dir = folder(userId);
  await fs.mkdir(dir, { recursive: true });
  const name = `avatar-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(dir, name), buf);
  for (const old of await fs.readdir(dir)) {
    if (old !== name) await fs.rm(path.join(dir, old), { force: true }); // a leftover file is harmless
  }
  return `/avatars/${userId}/${name}`;
}

async function removeAvatars(userId) {
  await fs.rm(folder(userId), { recursive: true, force: true });
}

module.exports = { AVATAR_DIR, MAX_BYTES, OWN_URL, saveAvatar, removeAvatars };
