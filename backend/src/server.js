const path = require("node:path");
const express = require("express");
const animeRoutes = require("./routes/anime");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/jikan", animeRoutes);
app.use(express.static(path.join(__dirname, "../../frontend")));

app.listen(PORT, () => {
  console.log(`Nekai is running at http://localhost:${PORT}`);
});
