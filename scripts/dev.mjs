// Local server: node scripts/dev.mjs  (uses TURSO_DATABASE_URL, default file:./local.db)
// Sign-in links print in the page when DEV_SHOW_LINKS=1, which this script sets.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
process.env.TURSO_DATABASE_URL ||= "file:./local.db";
process.env.DEV_SHOW_LINKS ||= "1";
const { default: api } = await import("../api/router.mjs");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const root = new URL("../public/", import.meta.url).pathname;
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://local");
  if (pathname.startsWith("/api/")) return api(req, res);
  let file = pathname === "/app" || pathname.startsWith("/app/") ? "app.html" : pathname.slice(1) || "index.html";
  try {
    const body = await readFile(join(root, file));
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.setHeader("Content-Type", types[".html"]);
    res.end(await readFile(join(root, "index.html")));
  }
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
