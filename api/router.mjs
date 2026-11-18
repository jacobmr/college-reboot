// Vercel function: every /api/* request is rewritten here (see vercel.json).
import { handle } from "../lib/router.mjs";

export default async function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const query = Object.fromEntries(url.searchParams);
  let path = query.route ?? url.pathname.replace(/^\/api\/?/, "");
  delete query.route;
  let body = req.body;
  if (body === undefined && req.method !== "GET" && req.method !== "HEAD") body = await readBody(req);
  const out = await handle({ method: req.method, path, query, headers: req.headers, body });
  res.statusCode = out.status;
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  if (out.body === null || out.body === undefined) return res.end();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(out.body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      data += c;
      if (data.length > 250_000) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
