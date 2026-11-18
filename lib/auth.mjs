// Sign-in by emailed link, and cookie sessions. Only hashes of tokens are stored.
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { q, one, run } from "./db.mjs";

export const SESSION_COOKIE = "cr_session";
export const SESSION_DAYS = 30;
const SIGNIN_MINUTES = 20;
const INVITE_DAYS = 7;

export const hash = (t) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newId = () => randomUUID();

export function normalizeEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** Make a one-time login token. purpose is 'signin' (20 minutes) or 'invite' (7 days). */
export async function createLoginToken(email, purpose = "signin") {
  const token = newToken();
  const now = Date.now();
  const ttl = purpose === "invite" ? INVITE_DAYS * 86400e3 : SIGNIN_MINUTES * 60e3;
  await run("INSERT INTO login_tokens (token_hash, email, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", [
    hash(token), email, purpose, now + ttl, now,
  ]);
  return token;
}

export async function recentTokenCount(email) {
  const row = await one("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?", [email, Date.now() - 3600e3]);
  return Number(row?.n || 0);
}

/** Use a token once. Returns the user (created on first sign-in) or null. */
export async function consumeLoginToken(token) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const now = Date.now();
  const res = await run(
    "UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email",
    [now, hash(token), now],
  );
  const email = res.rows[0]?.email;
  if (!email) return null;
  return upsertUser(email);
}

export async function upsertUser(email, name = "") {
  const existing = await one("SELECT * FROM users WHERE email = ?", [email]);
  if (existing) {
    if (name && !existing.name) {
      await run("UPDATE users SET name = ? WHERE id = ?", [name, existing.id]);
      existing.name = name;
    }
    return existing;
  }
  const user = { id: newId(), email, name: name || "", created_at: Date.now() };
  await run("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING", [
    user.id, user.email, user.name, user.created_at,
  ]);
  return one("SELECT * FROM users WHERE email = ?", [email]);
}

export async function createSession(userId) {
  const token = newToken();
  const now = Date.now();
  await run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
    hash(token), userId, now + SESSION_DAYS * 86400e3, now,
  ]);
  return token;
}

export async function userFromSession(token) {
  if (!token) return null;
  return one(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    [hash(token), Date.now()],
  );
}

export async function endSession(token) {
  if (token) await run("DELETE FROM sessions WHERE token_hash = ?", [hash(token)]);
}

export async function listUsersByIds(ids) {
  if (!ids.length) return [];
  return q(`SELECT id, email, name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
}
