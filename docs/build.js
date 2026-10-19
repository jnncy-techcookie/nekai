#!/usr/bin/env node
/* Builds the documentation files from their sources (no npm packages needed, only Node and Chrome/Edge):
 *   docs/src/architecture.svg             ->  docs/architecture.png
 *   docs/src/technical-documentation.html ->  docs/technical-documentation.pdf
 *
 *   node docs/build.js
 *
 * Needs Google Chrome or Microsoft Edge. Set CHROME_BIN if it is not found automatically.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const docs = __dirname;
const candidates = [
  process.env.CHROME_BIN,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("Chrome or Edge not found. Install one, or set CHROME_BIN to its path.");
  process.exit(1);
}

function run(label, args, out) {
  const result = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", ...args], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (!fs.existsSync(out) || result.status !== 0) {
    console.error(`${label}: failed\n${result.stderr || result.stdout}`);
    process.exit(1);
  }
  console.log(`${label}: ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

const png = path.join(docs, "architecture.png");
run("diagram", [
  "--force-device-scale-factor=1.5",
  "--window-size=1600,1200",
  `--screenshot=${png}`,
  pathToFileURL(path.join(docs, "src", "architecture.svg")).href,
], png);

const pdf = path.join(docs, "technical-documentation.pdf");
run("document", [
  "--no-pdf-header-footer",
  `--print-to-pdf=${pdf}`,
  pathToFileURL(path.join(docs, "src", "technical-documentation.html")).href,
], pdf);
