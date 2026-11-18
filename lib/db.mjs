// Database access. Turso (libSQL) in production, a local file or memory in dev and tests.
//   TURSO_DATABASE_URL  libsql://... (or file:./local.db, or :memory:)
//   TURSO_AUTH_TOKEN    token for a remote Turso database
import { createClient } from "@libsql/client";
import { SCHEMA } from "./schema.mjs";

let client = null;
let ready = null;

export function getDb() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      const err = new Error("The database isn't set up yet.");
      err.statusCode = 503;
      throw err;
    }
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

/** Create tables once per cold start. Every statement is idempotent. */
export async function ensureSchema() {
  if (!ready) {
    const db = getDb();
    ready = db.batch(SCHEMA.map((sql) => ({ sql, args: [] })), "write").catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function q(sql, args = []) {
  await ensureSchema();
  const rs = await getDb().execute({ sql, args });
  return rs.rows.map((r) => ({ ...r }));
}

export async function one(sql, args = []) {
  const rows = await q(sql, args);
  return rows[0] || null;
}

export async function run(sql, args = []) {
  await ensureSchema();
  return getDb().execute({ sql, args });
}

/** Test helper: drop the cached client so a new TURSO_DATABASE_URL takes effect. */
export function resetDbForTests() {
  client = null;
  ready = null;
}
