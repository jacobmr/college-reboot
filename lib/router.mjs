// The whole API as one function: handle({ method, path, query, headers, body }) -> { status, headers, body }.
// api/router.mjs adapts it to Vercel; tests call it directly.
import { q, one, run } from "./db.mjs";
import { httpError, parseCookies, cookie, str } from "./http.mjs";
import {
  SESSION_COOKIE, SESSION_DAYS, newId, normalizeEmail, createLoginToken, recentTokenCount,
  consumeLoginToken, upsertUser, createSession, userFromSession, endSession,
} from "./auth.mjs";
import { sendEmail, emailConfigured, signInEmail } from "./email.mjs";

export const ROLES = {
  lead: "Lead (runs the workspace)",
  cabinet: "Cabinet",
  board: "Board",
  faculty_staff: "Faculty and staff",
  student: "Student",
  red_team: "Red team",
};

export const TEAM_KINDS = {
  a3: "A3 team",
  demand: "Hard questions: Demand",
  money: "Hard questions: Money",
  identity: "Hard questions: Identity",
  what_we_lose: "Hard questions: What we lose",
  delivery: "Hard questions: Delivery",
  red_team: "Red team",
};

export const TEAM_ROLES = {
  owner: "Owner (holds the pen)",
  numbers: "Numbers person",
  students_voice: "Voice of the students we want",
  builder: "Builder",
  member: "Member",
};

export const A3_STATUSES = {
  drafting: "Drafting",
  to_board: "Sent to the board",
  rework: "Rework",
  stopped: "Stopped",
};

export const BOX_KEYS = ["1", "2", "3", "4", "5", "6", "7"];

const MAX_BODY = 200_000;

// ---------- entry point ----------

export async function handle(req) {
  try {
    const ctx = await context(req);
    const res = await route(ctx);
    return { status: 200, headers: {}, ...res };
  } catch (err) {
    const status = err.statusCode || 500;
    if (status === 500) console.error("api error", err);
    return { status, headers: {}, body: { error: status === 500 ? "Something went wrong." : err.message } };
  }
}

async function context(req) {
  const method = (req.method || "GET").toUpperCase();
  const path = "/" + String(req.path || "").replace(/^\/+|\/+$/g, "");
  const headers = lowerKeys(req.headers || {});
  if (method !== "GET" && method !== "HEAD") checkOrigin(headers);
  const cookies = parseCookies(headers.cookie);
  const token = cookies[SESSION_COOKIE] || null;
  let body = req.body ?? {};
  if (typeof body === "string") {
    if (body.length > MAX_BODY) throw httpError(413, "That's too much text to save at once.");
    try { body = body ? JSON.parse(body) : {}; } catch { throw httpError(400, "Couldn't read that request."); }
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) body = {};
  return {
    method, path, query: req.query || {}, headers, body, token,
    user: await userFromSession(token),
    secure: req.secure !== false,
    baseUrl: baseUrl(headers),
  };
}

function lowerKeys(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  return out;
}

// Writes must come from our own pages (SameSite=Lax cookies already stop most cross-site posts).
function checkOrigin(headers) {
  const origin = headers.origin;
  if (!origin) return;
  const host = headers["x-forwarded-host"] || headers.host;
  try {
    if (new URL(origin).host !== host) throw httpError(403, "Not allowed.");
  } catch (e) {
    if (e.statusCode) throw e;
    throw httpError(403, "Not allowed.");
  }
}

function baseUrl(headers) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const host = headers["x-forwarded-host"] || headers.host || "localhost:3000";
  const proto = headers["x-forwarded-proto"] || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// ---------- routing ----------

async function route(ctx) {
  const { method, path } = ctx;
  const seg = path.split("/").filter(Boolean);
  const is = (m, pattern) => {
    if (m !== method) return null;
    const p = pattern.split("/").filter(Boolean);
    if (p.length !== seg.length) return null;
    const params = {};
    for (let i = 0; i < p.length; i++) {
      if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(seg[i]);
      else if (p[i] !== seg[i]) return null;
    }
    return params;
  };
  let p;
  if ((p = is("GET", "/config"))) return { body: { emailConfigured: emailConfigured(), roles: ROLES, teamKinds: TEAM_KINDS, teamRoles: TEAM_ROLES, a3Statuses: A3_STATUSES } };
  if ((p = is("POST", "/auth/request"))) return requestSignIn(ctx);
  if ((p = is("GET", "/auth/verify"))) return verifySignIn(ctx);
  if ((p = is("POST", "/auth/logout"))) return logout(ctx);

  requireUser(ctx);
  if ((p = is("GET", "/me"))) return getMe(ctx);
  if ((p = is("PATCH", "/me"))) return patchMe(ctx);
  if ((p = is("POST", "/colleges"))) return createCollege(ctx);
  if ((p = is("GET", "/colleges/:cid"))) return getCollege(ctx, p.cid);
  if ((p = is("PATCH", "/colleges/:cid"))) return patchCollege(ctx, p.cid);
  if ((p = is("GET", "/colleges/:cid/activity"))) return getActivity(ctx, p.cid);
  if ((p = is("POST", "/colleges/:cid/members"))) return inviteMember(ctx, p.cid);
  if ((p = is("PATCH", "/colleges/:cid/members/:uid"))) return patchMember(ctx, p.cid, p.uid);
  if ((p = is("DELETE", "/colleges/:cid/members/:uid"))) return removeMember(ctx, p.cid, p.uid);
  if ((p = is("POST", "/colleges/:cid/members/:uid/link"))) return resendInvite(ctx, p.cid, p.uid);
  if ((p = is("POST", "/colleges/:cid/teams"))) return createTeam(ctx, p.cid);
  if ((p = is("PATCH", "/teams/:tid"))) return patchTeam(ctx, p.tid);
  if ((p = is("DELETE", "/teams/:tid"))) return deleteTeam(ctx, p.tid);
  if ((p = is("PUT", "/teams/:tid/members/:uid"))) return putTeamMember(ctx, p.tid, p.uid);
  if ((p = is("DELETE", "/teams/:tid/members/:uid"))) return removeTeamMember(ctx, p.tid, p.uid);
  if ((p = is("POST", "/colleges/:cid/a3s"))) return createA3(ctx, p.cid);
  if ((p = is("GET", "/a3s/:aid"))) return getA3(ctx, p.aid);
  if ((p = is("PATCH", "/a3s/:aid"))) return patchA3(ctx, p.aid);
  if ((p = is("PUT", "/a3s/:aid/versions/:n"))) return saveVersion(ctx, p.aid, p.n);
  if ((p = is("POST", "/a3s/:aid/versions/:n/submit"))) return submitVersion(ctx, p.aid, p.n);
  if ((p = is("POST", "/a3s/:aid/versions"))) return newVersion(ctx, p.aid);
  if ((p = is("POST", "/a3s/:aid/questions"))) return askQuestion(ctx, p.aid);
  if ((p = is("PATCH", "/questions/:qid"))) return patchQuestion(ctx, p.qid);
  if ((p = is("DELETE", "/questions/:qid"))) return deleteQuestion(ctx, p.qid);
  throw httpError(404, "Not found.");
}

function requireUser(ctx) {
  if (!ctx.user) throw httpError(401, "Please sign in.");
}

// ---------- auth ----------

async function requestSignIn(ctx) {
  const email = normalizeEmail(ctx.body.email);
  if (!email) throw httpError(400, "That doesn't look like an email address.");
  if (!emailConfigured() && process.env.DEV_SHOW_LINKS !== "1") {
    return { body: { ok: true, emailConfigured: false } };
  }
  if ((await recentTokenCount(email)) >= 5) return { body: { ok: true, emailConfigured: true } };
  const token = await createLoginToken(email, "signin");
  const link = `${ctx.baseUrl}/api/auth/verify?token=${token}`;
  const sent = await sendEmail({ to: email, ...signInEmail({ link }) });
  const body = { ok: true, emailConfigured: emailConfigured() };
  if (!sent.sent && process.env.DEV_SHOW_LINKS === "1") body.devLink = link;
  return { body };
}

async function verifySignIn(ctx) {
  const user = await consumeLoginToken(ctx.query.token);
  if (!user) return { status: 302, headers: { Location: "/app#/signin/expired" }, body: null };
  const session = await createSession(user.id);
  return {
    status: 302,
    headers: {
      Location: "/app",
      "Set-Cookie": cookie(SESSION_COOKIE, session, { maxAge: SESSION_DAYS * 86400, secure: ctx.secure }),
    },
    body: null,
  };
}

async function logout(ctx) {
  await endSession(ctx.token);
  return { headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", { maxAge: 0, secure: ctx.secure }) }, body: { ok: true } };
}

// ---------- me ----------

async function getMe(ctx) {
  const colleges = await q(
    "SELECT c.id, c.name, m.role FROM memberships m JOIN colleges c ON c.id = m.college_id WHERE m.user_id = ? ORDER BY c.name",
    [ctx.user.id],
  );
  return { body: { user: pubUser(ctx.user), colleges } };
}

async function patchMe(ctx) {
  const name = str(ctx.body.name, 120).trim();
  if (!name) throw httpError(400, "Please enter your name.");
  await run("UPDATE users SET name = ? WHERE id = ?", [name, ctx.user.id]);
  return { body: { user: { ...pubUser(ctx.user), name } } };
}

const pubUser = (u) => ({ id: u.id, email: u.email, name: u.name || "" });

// ---------- access ----------

async function membership(ctx, collegeId) {
  const m = await one("SELECT role FROM memberships WHERE college_id = ? AND user_id = ?", [collegeId, ctx.user.id]);
  // Not a member: answer as if it doesn't exist.
  if (!m) throw httpError(404, "Not found.");
  return m.role;
}

async function requireLead(ctx, collegeId) {
  const role = await membership(ctx, collegeId);
  if (role !== "lead") throw httpError(403, "Only a workspace lead can do that.");
  return role;
}

async function loadTeam(ctx, teamId) {
  const team = await one("SELECT * FROM teams WHERE id = ?", [teamId]);
  if (!team) throw httpError(404, "Not found.");
  team.role = await membership(ctx, team.college_id);
  return team;
}

async function loadA3(ctx, a3Id) {
  const a3 = await one("SELECT * FROM a3s WHERE id = ?", [a3Id]);
  if (!a3) throw httpError(404, "Not found.");
  const role = await membership(ctx, a3.college_id);
  const onTeam = await one("SELECT team_role FROM team_members WHERE team_id = ? AND user_id = ?", [a3.team_id, ctx.user.id]);
  a3.myRole = role;
  a3.canEdit = role === "lead" || Boolean(onTeam);
  return a3;
}

function requireEdit(a3) {
  if (!a3.canEdit) throw httpError(403, "Only the A3 team or a workspace lead can change this A3.");
}

async function log(collegeId, userId, action, detail = "") {
  await run("INSERT INTO activity (id, college_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    newId(), collegeId, userId, action, str(detail, 300), Date.now(),
  ]);
}

// ---------- colleges ----------

async function createCollege(ctx) {
  const name = str(ctx.body.name, 160).trim();
  if (!name) throw httpError(400, "Please name the college.");
  const id = newId();
  const now = Date.now();
  await run("INSERT INTO colleges (id, name, created_by, created_at) VALUES (?, ?, ?, ?)", [id, name, ctx.user.id, now]);
  await run("INSERT INTO memberships (college_id, user_id, role, created_at) VALUES (?, ?, 'lead', ?)", [id, ctx.user.id, now]);
  await log(id, ctx.user.id, "created the workspace", name);
  return { status: 201, body: { college: { id, name, role: "lead" } } };
}

async function patchCollege(ctx, cid) {
  await requireLead(ctx, cid);
  const name = str(ctx.body.name, 160).trim();
  if (!name) throw httpError(400, "Please name the college.");
  await run("UPDATE colleges SET name = ? WHERE id = ?", [name, cid]);
  return { body: { ok: true } };
}

async function getCollege(ctx, cid) {
  const role = await membership(ctx, cid);
  const college = await one("SELECT id, name, created_at FROM colleges WHERE id = ?", [cid]);
  const members = await q(
    "SELECT u.id, u.email, u.name, m.role, m.created_at, (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS signed_in FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.college_id = ? ORDER BY u.name, u.email",
    [cid],
  );
  const teams = await q("SELECT id, name, kind, created_at FROM teams WHERE college_id = ? ORDER BY created_at", [cid]);
  const tm = await q(
    "SELECT tm.team_id, tm.user_id, tm.team_role FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.college_id = ?",
    [cid],
  );
  for (const t of teams) t.members = tm.filter((x) => x.team_id === t.id).map((x) => ({ user_id: x.user_id, team_role: x.team_role }));
  const a3s = await q(
    `SELECT a.id, a.title, a.team_id, a.status, a.updated_at,
       (SELECT MAX(number) FROM a3_versions v WHERE v.a3_id = a.id) AS version,
       (SELECT status FROM a3_versions v WHERE v.a3_id = a.id ORDER BY number DESC LIMIT 1) AS version_status,
       (SELECT COUNT(*) FROM questions qq WHERE qq.a3_id = a.id AND qq.status = 'open') AS open_questions
     FROM a3s a WHERE a.college_id = ? ORDER BY a.updated_at DESC`,
    [cid],
  );
  const reviewers = await q(
    "SELECT r.a3_id, r.team_id FROM a3_reviewers r JOIN a3s a ON a.id = r.a3_id WHERE a.college_id = ?",
    [cid],
  );
  for (const a of a3s) a.reviewer_team_ids = reviewers.filter((r) => r.a3_id === a.id).map((r) => r.team_id);
  return {
    body: {
      college, role, me: ctx.user.id,
      members: members.map((m) => ({ ...m, signed_in: Number(m.signed_in) > 0 })),
      teams, a3s,
    },
  };
}

async function getActivity(ctx, cid) {
  await membership(ctx, cid);
  const rows = await q(
    "SELECT a.action, a.detail, a.created_at, u.name, u.email FROM activity a JOIN users u ON u.id = a.user_id WHERE a.college_id = ? ORDER BY a.created_at DESC LIMIT 100",
    [cid],
  );
  return { body: { activity: rows } };
}

// ---------- members ----------

async function inviteMember(ctx, cid) {
  await requireLead(ctx, cid);
  const email = normalizeEmail(ctx.body.email);
  if (!email) throw httpError(400, "That doesn't look like an email address.");
  const role = ROLES[ctx.body.role] ? ctx.body.role : "faculty_staff";
  const name = str(ctx.body.name, 120).trim();
  const user = await upsertUser(email, name);
  const existing = await one("SELECT role FROM memberships WHERE college_id = ? AND user_id = ?", [cid, user.id]);
  if (!existing) {
    await run("INSERT INTO memberships (college_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", [cid, user.id, role, Date.now()]);
    await log(cid, ctx.user.id, "invited", `${name || email} as ${ROLES[role]}`);
  }
  const delivery = await deliverInvite(ctx, cid, email);
  return { status: existing ? 200 : 201, body: { member: { id: user.id, email, name: user.name, role: existing?.role || role }, alreadyMember: Boolean(existing), ...delivery } };
}

async function resendInvite(ctx, cid, uid) {
  await requireLead(ctx, cid);
  const m = await one("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.college_id = ? AND m.user_id = ?", [cid, uid]);
  if (!m) throw httpError(404, "Not found.");
  return { body: await deliverInvite(ctx, cid, m.email) };
}

// Email the invite. If email isn't set up, hand the lead a one-time link to pass on.
async function deliverInvite(ctx, cid, email) {
  const college = await one("SELECT name FROM colleges WHERE id = ?", [cid]);
  const token = await createLoginToken(email, "invite");
  const link = `${ctx.baseUrl}/api/auth/verify?token=${token}`;
  const sent = await sendEmail({ to: email, ...signInEmail({ link, collegeName: college.name, inviterName: ctx.user.name }) });
  return sent.sent ? { emailSent: true } : { emailSent: false, inviteLink: link };
}

async function leadCount(cid) {
  const row = await one("SELECT COUNT(*) AS n FROM memberships WHERE college_id = ? AND role = 'lead'", [cid]);
  return Number(row.n);
}

async function patchMember(ctx, cid, uid) {
  await requireLead(ctx, cid);
  const role = ctx.body.role;
  if (!ROLES[role]) throw httpError(400, "Pick a role.");
  const m = await one("SELECT role FROM memberships WHERE college_id = ? AND user_id = ?", [cid, uid]);
  if (!m) throw httpError(404, "Not found.");
  if (m.role === "lead" && role !== "lead" && (await leadCount(cid)) <= 1) {
    throw httpError(400, "Every workspace needs at least one lead.");
  }
  await run("UPDATE memberships SET role = ? WHERE college_id = ? AND user_id = ?", [role, cid, uid]);
  return { body: { ok: true } };
}

async function removeMember(ctx, cid, uid) {
  await requireLead(ctx, cid);
  const m = await one("SELECT role FROM memberships WHERE college_id = ? AND user_id = ?", [cid, uid]);
  if (!m) throw httpError(404, "Not found.");
  if (m.role === "lead" && (await leadCount(cid)) <= 1) throw httpError(400, "Every workspace needs at least one lead.");
  await run("DELETE FROM memberships WHERE college_id = ? AND user_id = ?", [cid, uid]);
  await run("DELETE FROM team_members WHERE user_id = ? AND team_id IN (SELECT id FROM teams WHERE college_id = ?)", [uid, cid]);
  return { body: { ok: true } };
}

// ---------- teams ----------

async function createTeam(ctx, cid) {
  await requireLead(ctx, cid);
  const kind = TEAM_KINDS[ctx.body.kind] ? ctx.body.kind : "a3";
  const name = str(ctx.body.name, 120).trim() || TEAM_KINDS[kind];
  const id = newId();
  await run("INSERT INTO teams (id, college_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?)", [id, cid, name, kind, Date.now()]);
  await log(cid, ctx.user.id, "created team", name);
  return { status: 201, body: { team: { id, name, kind, members: [] } } };
}

async function patchTeam(ctx, tid) {
  const team = await loadTeam(ctx, tid);
  await requireLead(ctx, team.college_id);
  const name = str(ctx.body.name, 120).trim();
  if (!name) throw httpError(400, "Please name the team.");
  await run("UPDATE teams SET name = ? WHERE id = ?", [name, tid]);
  return { body: { ok: true } };
}

async function deleteTeam(ctx, tid) {
  const team = await loadTeam(ctx, tid);
  await requireLead(ctx, team.college_id);
  const used = await one("SELECT COUNT(*) AS n FROM a3s WHERE team_id = ?", [tid]);
  if (Number(used.n) > 0) throw httpError(400, "This team owns an A3. Move or stop the A3 first.");
  await run("DELETE FROM team_members WHERE team_id = ?", [tid]);
  await run("DELETE FROM a3_reviewers WHERE team_id = ?", [tid]);
  await run("DELETE FROM teams WHERE id = ?", [tid]);
  return { body: { ok: true } };
}

async function putTeamMember(ctx, tid, uid) {
  const team = await loadTeam(ctx, tid);
  await requireLead(ctx, team.college_id);
  const isMember = await one("SELECT 1 AS x FROM memberships WHERE college_id = ? AND user_id = ?", [team.college_id, uid]);
  if (!isMember) throw httpError(400, "Invite that person to the workspace first.");
  const teamRole = team.kind === "a3" && TEAM_ROLES[ctx.body.team_role] ? ctx.body.team_role : "member";
  await run(
    "INSERT INTO team_members (team_id, user_id, team_role) VALUES (?, ?, ?) ON CONFLICT(team_id, user_id) DO UPDATE SET team_role = excluded.team_role",
    [tid, uid, teamRole],
  );
  return { body: { ok: true } };
}

async function removeTeamMember(ctx, tid, uid) {
  const team = await loadTeam(ctx, tid);
  await requireLead(ctx, team.college_id);
  await run("DELETE FROM team_members WHERE team_id = ? AND user_id = ?", [tid, uid]);
  return { body: { ok: true } };
}

// ---------- A3s ----------

async function validTeamIds(cid, ids) {
  const list = Array.isArray(ids) ? ids.map(String).slice(0, 20) : [];
  if (!list.length) return [];
  const rows = await q(`SELECT id FROM teams WHERE college_id = ? AND id IN (${list.map(() => "?").join(",")})`, [cid, ...list]);
  return rows.map((r) => r.id);
}

async function createA3(ctx, cid) {
  await requireLead(ctx, cid);
  const title = str(ctx.body.title, 200).trim();
  if (!title) throw httpError(400, "Please name the idea.");
  const team = await one("SELECT id FROM teams WHERE id = ? AND college_id = ?", [String(ctx.body.team_id || ""), cid]);
  if (!team) throw httpError(400, "Pick the A3 team that will hold the pen.");
  const id = newId();
  const now = Date.now();
  await run("INSERT INTO a3s (id, college_id, team_id, title, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'drafting', ?, ?, ?)", [
    id, cid, team.id, title, ctx.user.id, now, now,
  ]);
  await run("INSERT INTO a3_versions (a3_id, number, boxes, created_at, updated_at, updated_by) VALUES (?, 1, '{}', ?, ?, ?)", [id, now, now, ctx.user.id]);
  for (const t of await validTeamIds(cid, ctx.body.reviewer_team_ids)) {
    if (t !== team.id) await run("INSERT OR IGNORE INTO a3_reviewers (a3_id, team_id) VALUES (?, ?)", [id, t]);
  }
  await log(cid, ctx.user.id, "started an A3", title);
  return { status: 201, body: { a3: { id, title } } };
}

async function getA3(ctx, aid) {
  const a3 = await loadA3(ctx, aid);
  const versions = await q("SELECT number, boxes, what_changed, driven_by, status, created_at, updated_at, updated_by, submitted_at FROM a3_versions WHERE a3_id = ? ORDER BY number", [aid]);
  for (const v of versions) {
    v.boxes = safeJson(v.boxes, {});
    v.driven_by = safeJson(v.driven_by, []);
  }
  const questions = await q("SELECT * FROM questions WHERE a3_id = ? ORDER BY created_at", [aid]);
  const reviewers = await q("SELECT team_id FROM a3_reviewers WHERE a3_id = ?", [aid]);
  return {
    body: {
      a3: {
        id: a3.id, college_id: a3.college_id, team_id: a3.team_id, title: a3.title, status: a3.status,
        created_at: a3.created_at, updated_at: a3.updated_at, reviewer_team_ids: reviewers.map((r) => r.team_id),
      },
      canEdit: a3.canEdit, role: a3.myRole, me: ctx.user.id, versions, questions,
    },
  };
}

async function patchA3(ctx, aid) {
  const a3 = await loadA3(ctx, aid);
  const b = ctx.body;
  const now = Date.now();
  if (b.title !== undefined || b.status !== undefined) {
    requireEdit(a3);
    if (b.title !== undefined) {
      const title = str(b.title, 200).trim();
      if (!title) throw httpError(400, "Please name the idea.");
      await run("UPDATE a3s SET title = ?, updated_at = ? WHERE id = ?", [title, now, aid]);
    }
    if (b.status !== undefined) {
      if (!A3_STATUSES[b.status]) throw httpError(400, "Pick a status.");
      await run("UPDATE a3s SET status = ?, updated_at = ? WHERE id = ?", [b.status, now, aid]);
      await log(a3.college_id, ctx.user.id, `marked an A3 "${A3_STATUSES[b.status]}"`, a3.title);
    }
  }
  if (b.reviewer_team_ids !== undefined || b.team_id !== undefined) {
    if (a3.myRole !== "lead") throw httpError(403, "Only a workspace lead can change team assignments.");
    if (b.team_id !== undefined) {
      const team = await one("SELECT id FROM teams WHERE id = ? AND college_id = ?", [String(b.team_id), a3.college_id]);
      if (!team) throw httpError(400, "Pick a team.");
      await run("UPDATE a3s SET team_id = ?, updated_at = ? WHERE id = ?", [team.id, now, aid]);
    }
    if (b.reviewer_team_ids !== undefined) {
      await run("DELETE FROM a3_reviewers WHERE a3_id = ?", [aid]);
      for (const t of await validTeamIds(a3.college_id, b.reviewer_team_ids)) {
        await run("INSERT OR IGNORE INTO a3_reviewers (a3_id, team_id) VALUES (?, ?)", [aid, t]);
      }
    }
  }
  return { body: { ok: true } };
}

async function latestVersion(aid) {
  return one("SELECT * FROM a3_versions WHERE a3_id = ? ORDER BY number DESC LIMIT 1", [aid]);
}

// Saves only the boxes sent, so two people editing different boxes don't overwrite each other.
async function saveVersion(ctx, aid, n) {
  const a3 = await loadA3(ctx, aid);
  requireEdit(a3);
  const v = await latestVersion(aid);
  if (String(v.number) !== String(n)) throw httpError(409, `Draft ${n} is closed. Draft ${v.number} is the current one.`);
  if (v.status !== "draft") throw httpError(409, `Draft ${n} has gone out for review. Start the next draft to keep writing.`);
  const incoming = ctx.body.boxes && typeof ctx.body.boxes === "object" ? ctx.body.boxes : {};
  const boxes = safeJson(v.boxes, {});
  for (const k of BOX_KEYS) if (incoming[k] !== undefined) boxes[k] = str(incoming[k], 20000);
  const fields = [JSON.stringify(boxes), Date.now(), ctx.user.id];
  let sql = "UPDATE a3_versions SET boxes = ?, updated_at = ?, updated_by = ?";
  if (ctx.body.what_changed !== undefined) {
    sql += ", what_changed = ?";
    fields.push(str(ctx.body.what_changed, 5000));
  }
  await run(`${sql} WHERE a3_id = ? AND number = ?`, [...fields, aid, v.number]);
  await run("UPDATE a3s SET updated_at = ? WHERE id = ?", [Date.now(), aid]);
  return { body: { boxes, updated_at: fields[1] } };
}

async function submitVersion(ctx, aid, n) {
  const a3 = await loadA3(ctx, aid);
  requireEdit(a3);
  const v = await latestVersion(aid);
  if (String(v.number) !== String(n) || v.status !== "draft") throw httpError(409, "That draft isn't open.");
  const now = Date.now();
  await run("UPDATE a3_versions SET status = 'submitted', submitted_at = ? WHERE a3_id = ? AND number = ?", [now, aid, v.number]);
  await run("UPDATE a3s SET updated_at = ? WHERE id = ?", [now, aid]);
  await log(a3.college_id, ctx.user.id, `sent draft ${v.number} for review`, a3.title);
  return { body: { ok: true } };
}

async function newVersion(ctx, aid) {
  const a3 = await loadA3(ctx, aid);
  requireEdit(a3);
  const v = await latestVersion(aid);
  if (v.status !== "submitted") throw httpError(409, `Send draft ${v.number} for review before starting the next one.`);
  const qids = Array.isArray(ctx.body.driven_by) ? ctx.body.driven_by.map(String).slice(0, 200) : [];
  const valid = qids.length
    ? (await q(`SELECT id FROM questions WHERE a3_id = ? AND id IN (${qids.map(() => "?").join(",")})`, [aid, ...qids])).map((r) => r.id)
    : [];
  const now = Date.now();
  const number = Number(v.number) + 1;
  await run(
    "INSERT INTO a3_versions (a3_id, number, boxes, what_changed, driven_by, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [aid, number, v.boxes, str(ctx.body.what_changed, 5000), JSON.stringify(valid), now, now, ctx.user.id],
  );
  await run("UPDATE a3s SET updated_at = ?, status = CASE WHEN status = 'rework' THEN 'drafting' ELSE status END WHERE id = ?", [now, aid]);
  await log(a3.college_id, ctx.user.id, `started draft ${number}`, a3.title);
  return { status: 201, body: { number } };
}

// ---------- questions ----------

async function askQuestion(ctx, aid) {
  const a3 = await loadA3(ctx, aid);
  const body = str(ctx.body.body, 4000).trim();
  if (!body) throw httpError(400, "Write the question first.");
  const v = await latestVersion(aid);
  const box = BOX_KEYS.includes(String(ctx.body.box)) ? Number(ctx.body.box) : null;
  let teamId = null;
  if (ctx.body.team_id) {
    const t = await one("SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = ? AND t.college_id = ? AND tm.user_id = ?", [
      String(ctx.body.team_id), a3.college_id, ctx.user.id,
    ]);
    teamId = t?.id || null;
  }
  const id = newId();
  const now = Date.now();
  await run(
    "INSERT INTO questions (id, a3_id, version_number, box, body, asked_by, asked_by_team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, aid, v.number, box, body, ctx.user.id, teamId, now, now],
  );
  await run("UPDATE a3s SET updated_at = ? WHERE id = ?", [now, aid]);
  await log(a3.college_id, ctx.user.id, `asked a question on draft ${v.number}`, a3.title);
  return { status: 201, body: { question: await one("SELECT * FROM questions WHERE id = ?", [id]) } };
}

async function patchQuestion(ctx, qid) {
  const question = await one("SELECT * FROM questions WHERE id = ?", [qid]);
  if (!question) throw httpError(404, "Not found.");
  const a3 = await loadA3(ctx, question.a3_id);
  const b = ctx.body;
  const sets = [];
  const args = [];
  if (b.body !== undefined) {
    if (question.asked_by !== ctx.user.id) throw httpError(403, "Only the person who asked can reword a question.");
    const text = str(b.body, 4000).trim();
    if (!text) throw httpError(400, "The question can't be empty.");
    sets.push("body = ?"); args.push(text);
  }
  if (b.answer !== undefined || b.status !== undefined || b.answered_in_version !== undefined) {
    requireEdit(a3);
    if (b.answer !== undefined) { sets.push("answer = ?"); args.push(str(b.answer, 5000)); }
    if (b.status !== undefined) {
      if (!["open", "answered"].includes(b.status)) throw httpError(400, "Pick open or answered.");
      sets.push("status = ?"); args.push(b.status);
    }
    if (b.answered_in_version !== undefined) {
      sets.push("answered_in_version = ?");
      args.push(b.answered_in_version === null ? null : Number(b.answered_in_version) || null);
    }
  }
  if (!sets.length) return { body: { question } };
  sets.push("updated_at = ?"); args.push(Date.now());
  await run(`UPDATE questions SET ${sets.join(", ")} WHERE id = ?`, [...args, qid]);
  return { body: { question: await one("SELECT * FROM questions WHERE id = ?", [qid]) } };
}

async function deleteQuestion(ctx, qid) {
  const question = await one("SELECT * FROM questions WHERE id = ?", [qid]);
  if (!question) throw httpError(404, "Not found.");
  const a3 = await loadA3(ctx, question.a3_id);
  if (question.asked_by !== ctx.user.id && a3.myRole !== "lead") throw httpError(403, "Only the person who asked, or a lead, can remove a question.");
  await run("DELETE FROM questions WHERE id = ?", [qid]);
  return { body: { ok: true } };
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
