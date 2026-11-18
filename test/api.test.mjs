import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cr-test-"));
process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
process.env.DEV_SHOW_LINKS = "1";
delete process.env.RESEND_API_KEY;
delete process.env.APP_URL;

const { handle } = await import("../lib/router.mjs");

const H = { host: "app.test" };
async function call(method, path, { body, cookie, query, headers } = {}) {
  return handle({
    method, path, query: query || {},
    headers: { ...H, ...(cookie ? { cookie } : {}), ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signIn(email) {
  const r = await call("POST", "auth/request", { body: { email } });
  assert.equal(r.status, 200);
  assert.ok(r.body.devLink, "dev link returned when email isn't configured");
  const token = new URL(r.body.devLink).searchParams.get("token");
  const v = await call("GET", "auth/verify", { query: { token } });
  assert.equal(v.status, 302);
  assert.equal(v.headers.Location, "/app");
  const set = v.headers["Set-Cookie"];
  assert.match(set, /HttpOnly/);
  return set.split(";")[0];
}

let lead, jeff, faculty, outsider, collegeId;

before(async () => {
  lead = await signIn("jacob@example.org");
  jeff = await signIn("jeff@example.org");
  outsider = await signIn("stranger@example.org");
});

test("sign-in links work once and unknown sessions are refused", async () => {
  const r = await call("POST", "auth/request", { body: { email: "once@example.org" } });
  const token = new URL(r.body.devLink).searchParams.get("token");
  assert.equal((await call("GET", "auth/verify", { query: { token } })).status, 302);
  const again = await call("GET", "auth/verify", { query: { token } });
  assert.equal(again.headers.Location, "/app#/signin/expired");
  assert.equal((await call("GET", "me", { cookie: "cr_session=nope" })).status, 401);
  assert.equal((await call("POST", "auth/request", { body: { email: "not an email" } })).status, 400);
});

test("writes from another site are refused", async () => {
  const r = await call("POST", "colleges", { cookie: lead, body: { name: "X" }, headers: { origin: "https://evil.test" } });
  assert.equal(r.status, 403);
});

test("a lead creates a college and invites people", async () => {
  const r = await call("POST", "colleges", { cookie: lead, body: { name: "Example College" } });
  assert.equal(r.status, 201);
  collegeId = r.body.college.id;
  const me = await call("GET", "me", { cookie: lead });
  assert.deepEqual(me.body.colleges.map((c) => c.role), ["lead"]);

  const inv = await call("POST", `colleges/${collegeId}/members`, { cookie: lead, body: { email: "Jeff@Example.org", name: "Jeff", role: "lead" } });
  assert.equal(inv.status, 201);
  assert.equal(inv.body.emailSent, false);
  assert.match(inv.body.inviteLink, /^https:\/\/app\.test\/api\/auth\/verify\?token=/);

  const inv2 = await call("POST", `colleges/${collegeId}/members`, { cookie: lead, body: { email: "prof@example.org", name: "Prof", role: "faculty_staff" } });
  const token = new URL(inv2.body.inviteLink).searchParams.get("token");
  const v = await call("GET", "auth/verify", { query: { token } });
  faculty = v.headers["Set-Cookie"].split(";")[0];
  const facMe = await call("GET", "me", { cookie: faculty });
  assert.equal(facMe.body.colleges[0].role, "faculty_staff");
  assert.equal(facMe.body.user.name, "Prof");
});

test("people outside the college can't see it, and members can't manage it", async () => {
  assert.equal((await call("GET", `colleges/${collegeId}`, { cookie: outsider })).status, 404);
  assert.equal((await call("POST", `colleges/${collegeId}/members`, { cookie: faculty, body: { email: "x@example.org" } })).status, 403);
  assert.equal((await call("POST", `colleges/${collegeId}/teams`, { cookie: faculty, body: { name: "T" } })).status, 403);
});

test("the last lead can't be removed or demoted", async () => {
  const c = await call("POST", "colleges", { cookie: outsider, body: { name: "Solo" } });
  const me = await call("GET", "me", { cookie: outsider });
  const uid = me.body.user.id;
  assert.equal((await call("PATCH", `colleges/${c.body.college.id}/members/${uid}`, { cookie: outsider, body: { role: "board" } })).status, 400);
  assert.equal((await call("DELETE", `colleges/${c.body.college.id}/members/${uid}`, { cookie: outsider })).status, 400);
});

test("the A3 loop: draft, review questions, next draft, history", async () => {
  const college = await call("GET", `colleges/${collegeId}`, { cookie: lead });
  const prof = college.body.members.find((m) => m.email === "prof@example.org");
  const jeffM = college.body.members.find((m) => m.email === "jeff@example.org");

  const a3team = await call("POST", `colleges/${collegeId}/teams`, { cookie: lead, body: { name: "Adult degree team", kind: "a3" } });
  const money = await call("POST", `colleges/${collegeId}/teams`, { cookie: lead, body: { kind: "money" } });
  assert.equal(money.body.team.name, "Hard questions: Money");
  await call("PUT", `teams/${a3team.body.team.id}/members/${prof.id}`, { cookie: lead, body: { team_role: "owner" } });
  await call("PUT", `teams/${money.body.team.id}/members/${jeffM.id}`, { cookie: lead, body: { team_role: "owner" } });

  const a = await call("POST", `colleges/${collegeId}/a3s`, { cookie: lead, body: { title: "Degree completion for adults", team_id: a3team.body.team.id, reviewer_team_ids: [money.body.team.id] } });
  assert.equal(a.status, 201);
  const aid = a.body.a3.id;

  // The A3 owner writes boxes 1 and 2; separate saves don't overwrite each other.
  assert.equal((await call("PUT", `a3s/${aid}/versions/1`, { cookie: faculty, body: { boxes: { 1: "We are $11M short." } } })).status, 200);
  const s2 = await call("PUT", `a3s/${aid}/versions/1`, { cookie: faculty, body: { boxes: { 2: "Enrollment fell 30% in 5 years." } } });
  assert.equal(s2.body.boxes["1"], "We are $11M short.");

  // Jeff isn't on the A3 team and isn't... a lead? He is a lead, so he can edit. The outsider can't even see it.
  assert.equal((await call("GET", `a3s/${aid}`, { cookie: outsider })).status, 404);

  assert.equal((await call("POST", `a3s/${aid}/versions`, { cookie: faculty, body: {} })).status, 409, "must submit first");
  assert.equal((await call("POST", `a3s/${aid}/versions/1/submit`, { cookie: faculty })).status, 200);
  assert.equal((await call("PUT", `a3s/${aid}/versions/1`, { cookie: faculty, body: { boxes: { 1: "late edit" } } })).status, 409);

  const q1 = await call("POST", `a3s/${aid}/questions`, { cookie: jeff, body: { box: 2, body: "Are these the CFO's numbers?", team_id: money.body.team.id } });
  assert.equal(q1.status, 201);
  assert.equal(q1.body.question.asked_by_team_id, money.body.team.id);
  assert.equal(q1.body.question.version_number, 1);

  // A faculty member who isn't on the A3 team can ask but can't answer.
  const other = await signIn("other-prof@example.org");
  await call("POST", `colleges/${collegeId}/members`, { cookie: lead, body: { email: "other-prof@example.org", role: "faculty_staff" } });
  assert.equal((await call("POST", `a3s/${aid}/questions`, { cookie: other, body: { body: "Who teaches it?" } })).status, 201);
  assert.equal((await call("PATCH", `questions/${q1.body.question.id}`, { cookie: other, body: { answer: "x" } })).status, 403);

  const n = await call("POST", `a3s/${aid}/versions`, { cookie: faculty, body: { what_changed: "Used the CFO's enrollment figures.", driven_by: [q1.body.question.id, "bogus"] } });
  assert.equal(n.body.number, 2);
  const ans = await call("PATCH", `questions/${q1.body.question.id}`, { cookie: faculty, body: { answer: "Swapped in the CFO's figures.", status: "answered", answered_in_version: 2 } });
  assert.equal(ans.body.question.status, "answered");

  const full = await call("GET", `a3s/${aid}`, { cookie: other });
  assert.equal(full.body.canEdit, false);
  assert.equal(full.body.versions.length, 2);
  assert.equal(full.body.versions[1].boxes["1"], "We are $11M short.", "next draft starts from the last one");
  assert.deepEqual(full.body.versions[1].driven_by, [q1.body.question.id]);
  assert.equal(full.body.questions.length, 2);

  const st = await call("PATCH", `a3s/${aid}`, { cookie: faculty, body: { status: "to_board" } });
  assert.equal(st.status, 200);
  assert.equal((await call("PATCH", `a3s/${aid}`, { cookie: faculty, body: { reviewer_team_ids: [] } })).status, 403);

  const act = await call("GET", `colleges/${collegeId}/activity`, { cookie: faculty });
  assert.ok(act.body.activity.some((x) => x.action === "sent draft 1 for review"));
});

test("logout ends the session", async () => {
  const c = await signIn("bye@example.org");
  const r = await call("POST", "auth/logout", { cookie: c });
  assert.match(r.headers["Set-Cookie"], /Max-Age=0/);
  assert.equal((await call("GET", "me", { cookie: c })).status, 401);
});
