// College Reboot Workspace: a small single-page app over /api.
const view = document.getElementById("view");
const who = document.getElementById("who");

const BOXES = [
  { k: "1", name: "Background", q: "Is this tied to the gap, or is it a project someone already wanted?" },
  { k: "2", name: "Current state", q: "Are these the same numbers the CFO uses? What is missing?" },
  { k: "3", name: "Target state", q: "Is the target big enough to matter, and specific enough that we'd know if we missed it?" },
  { k: "4", name: "Gap and root cause", q: "Whose voice is this: current students, or the people we need to attract?" },
  { k: "5", name: "Countermeasures", q: "Was a cheaper option considered? Was stopping something an option?" },
  { k: "6", name: "Test plan", q: "Does the pilot ask for real money? Were the stop results set before launch?" },
  { k: "7", name: "Follow-up", q: "Is one person accountable? Will the board see results against the original targets?" },
];

const DRAFT_GUIDE = {
  1: "Draft 1: fill in boxes 1 to 4 only. No solutions yet. Teams that jump to a solution tend to miss why students aren't coming.",
  2: "Draft 2: rewrite boxes 1 to 4 using what the hard-question teams asked. Add box 5 with at least three countermeasures.",
  3: "Draft 3: add the test plan and follow-up. The CFO prices it. Then the red team reads it.",
};

const HARD_QUESTIONS = {
  demand: "Who outside this campus said they want this? How many? What did they choose instead? What would they pay?",
  money: "Do these numbers match the CFO's? What happens if enrollment comes in at half the target? What does it cost to stop?",
  identity: "Does this build on something true about us? Would our best graduates still recognize the college?",
  what_we_lose: "What does this draw people, money or space from? Does it weaken anything that earns a surplus? How do current students finish?",
  delivery: "Who teaches it, where, starting when? What has to be true about accreditation, hiring and space?",
  red_team: "Read the whole A3 and argue that it won't work.",
};

let config = null;
let me = null;
let pollTimer = null;

// ---------- helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => [...root.querySelectorAll(sel)];
const fmtDate = (ms) => (ms ? new Date(Number(ms)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
const fmtTime = (ms) => (ms ? new Date(Number(ms)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

async function api(method, path, body) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) {
    me = null;
    location.hash = "#/signin";
    throw new Error(data.error || "Please sign in.");
  }
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 3200);
}

function fail(e) { toast(e.message || String(e)); }

const nameOf = (u) => (u ? u.name || u.email : "Someone");

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function opts(map, selected) {
  return Object.entries(map).map(([k, v]) => `<option value="${esc(k)}"${k === selected ? " selected" : ""}>${esc(v)}</option>`).join("");
}

function copyBox(link) {
  return `<div class="copy"><input type="text" readonly value="${esc(link)}"><button class="btn secondary" data-copy="${esc(link)}">Copy</button></div>`;
}

view.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied."); } catch { toast("Select the link and copy it."); }
});

// ---------- routing ----------

window.addEventListener("hashchange", render);
render();

async function render() {
  stopPolling();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  try {
    if (!config) config = await api("GET", "config");
    if (parts[0] === "signin") return renderSignIn(parts[1] === "expired");
    if (!me) {
      try { me = await api("GET", "me"); } catch { return; }
    }
    renderWho();
    if (!me.user.name) return renderName();
    if (parts[0] === "c" && parts[1]) return renderCollege(parts[1], parts[2] || "a3s");
    if (parts[0] === "a" && parts[1]) return renderA3(parts[1], parts[2] === "v" ? Number(parts[3]) : null, parts[2] === "v" ? parts[4] || "a3" : parts[2] || "a3");
    return renderHome();
  } catch (e) {
    if (e.status === 503) {
      view.innerHTML = `<div class="card narrow"><h1>Almost ready</h1><p>The workspace database isn't connected yet.</p></div>`;
      return;
    }
    view.innerHTML = `<div class="card narrow"><h1>That didn't load</h1><p>${esc(e.message)}</p><p><a href="#/">Back to your workspaces</a></p></div>`;
  }
}

function renderWho() {
  who.innerHTML = me ? `${esc(nameOf(me.user))} · <button class="link" id="signout">Sign out</button>` : "";
  const so = document.getElementById("signout");
  if (so) so.onclick = async () => {
    await api("POST", "auth/logout").catch(() => {});
    me = null;
    location.hash = "#/signin";
  };
}

// ---------- sign in ----------

function renderSignIn(expired) {
  who.innerHTML = "";
  view.innerHTML = `
    <div class="card narrow">
      <h1>Sign in</h1>
      <p class="muted">Your college's A3 work lives here, so every team can build on the last draft together.</p>
      ${expired ? `<div class="notice">That link has expired or was already used. Ask for a new one below.</div>` : ""}
      ${config.emailConfigured ? "" : `<div class="notice blue">Email sign-in isn't switched on yet. If your workspace lead sent you an invite link, open that link to sign in.</div>`}
      <form id="f">
        <label for="email">Your email</label>
        <input id="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" enterkeyhint="send" required>
        <div class="actions"><button class="btn">Email me a sign-in link</button></div>
      </form>
      <div id="msg"></div>
      <p class="muted small">Only people your college invites can see its workspace. The calculators in the workbook stay open to anyone and save nothing.</p>
    </div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("POST", "auth/request", { email: $("#email").value });
      if (r.devLink) {
        $("#msg").innerHTML = `<div class="notice">Development mode: <a href="${esc(r.devLink)}">sign in with this link</a>.</div>`;
      } else if (r.emailConfigured === false) {
        $("#msg").innerHTML = `<div class="notice">Email sign-in isn't switched on yet, so no link went out.</div>`;
      } else {
        $("#msg").innerHTML = `<div class="notice blue">Check your email for a sign-in link. It works once, for 20 minutes.</div>`;
      }
    } catch (err) { fail(err); }
  };
}

function renderName() {
  view.innerHTML = `
    <div class="card narrow">
      <h1>Welcome</h1>
      <p>What name should your colleagues see?</p>
      <form id="f"><label for="n">Your name</label><input id="n" type="text" required maxlength="120" autocomplete="name" autocapitalize="words" enterkeyhint="done">
      <div class="actions"><button class="btn">Continue</button></div></form>
    </div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("PATCH", "me", { name: $("#n").value });
      me.user = r.user;
      render();
    } catch (err) { fail(err); }
  };
}

// ---------- home ----------

async function renderHome() {
  me = await api("GET", "me");
  renderWho();
  view.innerHTML = `
    <h1>Your workspaces</h1>
    <div class="list">${me.colleges.map((c) => `
      <a class="item" href="#/c/${esc(c.id)}"><strong>${esc(c.name)}</strong><span class="badge">${esc(config.roles[c.role] || c.role)}</span></a>`).join("") ||
      `<p class="muted">You aren't in a college workspace yet. If you expected one, ask your workspace lead to invite ${esc(me.user.email)}.</p>`}
    </div>
    <h2>Start a workspace for a college</h2>
    <div class="card">
      <form id="f" class="row">
        <div><label for="cn">College name</label><input id="cn" type="text" required maxlength="160" autocapitalize="words"></div>
        <button class="btn">Create workspace</button>
      </form>
      <p class="muted small">You'll be its lead: you invite people, set up teams and start A3s.</p>
    </div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("POST", "colleges", { name: $("#cn").value });
      location.hash = `#/c/${r.college.id}`;
    } catch (err) { fail(err); }
  };
}

// ---------- college ----------

async function loadCollege(cid) {
  const c = await api("GET", `colleges/${cid}`);
  c.people = Object.fromEntries(c.members.map((m) => [m.id, m]));
  c.teamById = Object.fromEntries(c.teams.map((t) => [t.id, t]));
  c.isLead = c.role === "lead";
  return c;
}

async function renderCollege(cid, tab) {
  const c = await loadCollege(cid);
  const tabs = [["a3s", "A3s"], ["teams", "Teams"], ["people", "People"], ["activity", "Activity"]];
  view.innerHTML = `
    <p class="small"><a href="#/">Your workspaces</a></p>
    <h1>${esc(c.college.name)}</h1>
    <p class="muted">You're ${c.isLead ? "a lead here" : "here as " + esc(config.roles[c.role] || c.role)}.</p>
    <div class="tabs">${tabs.map(([k, v]) => `<a href="#/c/${esc(cid)}/${k}" class="${k === tab ? "on" : ""}">${v}</a>`).join("")}</div>
    <div id="pane"></div>`;
  const pane = $("#pane");
  if (tab === "teams") return collegeTeams(c, pane);
  if (tab === "people") return collegePeople(c, pane);
  if (tab === "activity") return collegeActivity(c, pane);
  return collegeA3s(c, pane);
}

function statusBadge(status) {
  const cls = { drafting: "blue", to_board: "green", rework: "gold", stopped: "red" }[status] || "";
  return `<span class="badge ${cls}">${esc(config.a3Statuses[status] || status)}</span>`;
}

function collegeA3s(c, pane) {
  const a3Teams = c.teams.filter((t) => t.kind === "a3");
  const reviewTeams = c.teams.filter((t) => t.kind !== "a3");
  pane.innerHTML = `
    <div class="list">${c.a3s.map((a) => `
      <a class="item" href="#/a/${esc(a.id)}">
        <span><strong>${esc(a.title)}</strong><br><span class="muted small">${esc(c.teamById[a.team_id]?.name || "")} · Draft ${esc(a.version)} ${a.version_status === "submitted" ? "in review" : "being written"}</span></span>
        <span class="chips">${Number(a.open_questions) ? `<span class="badge gold">${esc(a.open_questions)} open question${Number(a.open_questions) === 1 ? "" : "s"}</span>` : ""}${statusBadge(a.status)}</span>
      </a>`).join("") || `<p class="muted">No A3s yet.${c.isLead ? " Set up an A3 team and at least one hard-question team on the Teams tab, then start the first A3 here." : ""}</p>`}
    </div>
    ${c.isLead ? `
    <h2>Start an A3</h2>
    <div class="card">
      ${a3Teams.length ? `
      <form id="f">
        <label for="t">The idea</label><input id="t" type="text" required maxlength="200" placeholder="e.g. Evening degree completion for working adults">
        <label for="team">A3 team that holds the pen</label><select id="team">${a3Teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select>
        <label>Hard-question teams that review every draft</label>
        <div class="chips">${reviewTeams.map((t) => `<label class="badge check"><input type="checkbox" value="${esc(t.id)}" checked> ${esc(t.name)}</label>`).join("") || `<span class="muted small">None yet. Add them on the Teams tab.</span>`}</div>
        <div class="actions"><button class="btn">Start the A3</button></div>
      </form>` : `<p class="muted">First create an A3 team on the Teams tab.</p>`}
    </div>` : ""}`;
  const f = $("#f", pane);
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("POST", `colleges/${c.college.id}/a3s`, {
        title: $("#t", pane).value, team_id: $("#team", pane).value,
        reviewer_team_ids: $$("input[type=checkbox]:checked", pane).map((x) => x.value),
      });
      location.hash = `#/a/${r.a3.id}`;
    } catch (err) { fail(err); }
  };
}

function collegeTeams(c, pane) {
  const memberOpts = c.members.map((m) => `<option value="${esc(m.id)}">${esc(nameOf(m))}</option>`).join("");
  pane.innerHTML = `
    <p class="muted">An A3 team writes and rewrites one idea. Hard-question teams review every draft of the A3s assigned to them. Rotate assignments so no group only reviews the work of friends.</p>
    <div class="grid">${c.teams.map((t) => `
      <div class="card" data-team="${esc(t.id)}">
        <div class="row" style="align-items:center"><h3 style="margin:0">${esc(t.name)}</h3><span class="badge" style="flex:0 0 auto">${esc(config.teamKinds[t.kind])}</span></div>
        ${HARD_QUESTIONS[t.kind] ? `<p class="muted small">${esc(HARD_QUESTIONS[t.kind])}</p>` : ""}
        <table>${t.members.map((tm) => `<tr><td>${esc(nameOf(c.people[tm.user_id]))}</td><td class="muted small">${t.kind === "a3" ? esc(config.teamRoles[tm.team_role]) : ""}</td>
          <td>${c.isLead ? `<button class="link" data-rm="${esc(tm.user_id)}">Remove</button>` : ""}</td></tr>`).join("") || `<tr><td class="muted">Nobody yet.</td></tr>`}</table>
        ${c.isLead ? `
        <div class="row">
          <div><label>Add someone</label><select class="who">${memberOpts}</select></div>
          ${t.kind === "a3" ? `<div><label>Role on the team</label><select class="trole">${opts(config.teamRoles, "member")}</select></div>` : ""}
          <button class="btn secondary add">Add</button>
        </div>
        <p class="small" style="margin-top:10px"><button class="link del">Delete team</button></p>` : ""}
      </div>`).join("") || `<p class="muted">No teams yet.</p>`}
    </div>
    ${c.isLead ? `
    <h2>Add a team</h2>
    <div class="card"><form id="f" class="row">
      <div><label for="k">Kind</label><select id="k">${opts(config.teamKinds, "a3")}</select></div>
      <div><label for="n">Name (optional)</label><input id="n" type="text" maxlength="120" autocapitalize="words" placeholder="e.g. Adult degree team"></div>
      <button class="btn">Add team</button>
    </form></div>` : ""}`;
  if (!c.isLead) return;
  $("#f", pane).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("POST", `colleges/${c.college.id}/teams`, { kind: $("#k", pane).value, name: $("#n", pane).value });
      render();
    } catch (err) { fail(err); }
  };
  for (const card of $$("[data-team]", pane)) {
    const tid = card.dataset.team;
    $(".add", card).onclick = async () => {
      try {
        await api("PUT", `teams/${tid}/members/${$(".who", card).value}`, { team_role: $(".trole", card)?.value || "member" });
        render();
      } catch (err) { fail(err); }
    };
    $(".del", card).onclick = async () => {
      if (!confirm("Delete this team?")) return;
      try { await api("DELETE", `teams/${tid}`); render(); } catch (err) { fail(err); }
    };
    for (const b of $$("[data-rm]", card)) b.onclick = async () => {
      try { await api("DELETE", `teams/${tid}/members/${b.dataset.rm}`); render(); } catch (err) { fail(err); }
    };
  }
}

function collegePeople(c, pane) {
  pane.innerHTML = `
    <table class="stack">
      <tr class="head"><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
      ${c.members.map((m) => `
      <tr data-user="${esc(m.id)}">
        <td data-label="Name">${esc(m.name || "")}${m.signed_in ? "" : ` <span class="badge">not signed in yet</span>`}</td>
        <td data-label="Email" class="email">${esc(m.email)}</td>
        <td data-label="Role">${c.isLead ? `<select class="role" aria-label="Role">${opts(config.roles, m.role)}</select>` : esc(config.roles[m.role] || m.role)}</td>
        <td>${c.isLead ? `<button class="link link-new">New invite</button> · <button class="link rm">Remove</button>` : ""}</td>
      </tr>`).join("")}
    </table>
    <div id="linkout"></div>
    ${c.isLead ? `
    <h2>Invite someone</h2>
    <div class="card"><form id="f" class="row">
      <div><label for="e">Email</label><input id="e" type="email" required autocomplete="off" autocapitalize="none" spellcheck="false"></div>
      <div><label for="n">Name</label><input id="n" type="text" maxlength="120" autocomplete="off" autocapitalize="words"></div>
      <div><label for="r">Role</label><select id="r">${opts(config.roles, "faculty_staff")}</select></div>
      <button class="btn">Invite</button>
    </form>
    <p class="muted small">${config.emailConfigured ? "They'll get an email with a sign-in link." : "Email isn't switched on yet, so you'll get a one-time link to send them yourself."} Leads can invite people, set up teams and start A3s. Everyone in the workspace can read every A3 and ask questions; only the A3's own team and leads can edit it.</p>
    </div>` : ""}`;
  if (!c.isLead) return;
  const showLink = (r, who) => {
    $("#linkout", pane).innerHTML = r.emailSent
      ? `<div class="notice blue">Invite emailed to ${esc(who)}.</div>`
      : `<div class="notice"><p>Send this one-time link to ${esc(who)}. It works once, for 7 days, and signs them straight in.</p>${copyBox(r.inviteLink)}</div>`;
  };
  $("#f", pane).onsubmit = async (e) => {
    e.preventDefault();
    try {
      const email = $("#e", pane).value;
      const r = await api("POST", `colleges/${c.college.id}/members`, { email, name: $("#n", pane).value, role: $("#r", pane).value });
      const c2 = await loadCollege(c.college.id);
      collegePeople(c2, pane);
      showLink(r, email);
    } catch (err) { fail(err); }
  };
  for (const tr of $$("[data-user]", pane)) {
    const uid = tr.dataset.user;
    $(".role", tr).onchange = async (e) => {
      try { await api("PATCH", `colleges/${c.college.id}/members/${uid}`, { role: e.target.value }); toast("Role updated."); } catch (err) { fail(err); render(); }
    };
    $(".rm", tr).onclick = async () => {
      if (!confirm("Remove this person from the workspace?")) return;
      try { await api("DELETE", `colleges/${c.college.id}/members/${uid}`); render(); } catch (err) { fail(err); }
    };
    $(".link-new", tr).onclick = async () => {
      try { showLink(await api("POST", `colleges/${c.college.id}/members/${uid}/link`), c.people[uid].email); } catch (err) { fail(err); }
    };
  }
}

async function collegeActivity(c, pane) {
  const r = await api("GET", `colleges/${c.college.id}/activity`);
  pane.innerHTML = `<table>${r.activity.map((a) => `
    <tr><td class="muted small" style="white-space:nowrap">${esc(fmtTime(a.created_at))}</td><td>${esc(a.name || a.email)} ${esc(a.action)}${a.detail ? `: ${esc(a.detail)}` : ""}</td></tr>`).join("") || `<tr><td class="muted">Nothing yet.</td></tr>`}</table>`;
}

// ---------- A3 ----------

async function renderA3(aid, vnum, tab) {
  const data = await api("GET", `a3s/${aid}`);
  const c = await loadCollege(data.a3.college_id);
  const state = { data, c, aid, dirty: {}, saving: false, timer: null };
  const latest = data.versions[data.versions.length - 1];
  state.v = data.versions.find((v) => v.number === vnum) || latest;
  state.latest = latest;
  state.editable = data.canEdit && state.v.number === latest.number && latest.status === "draft";
  state.tab = ["a3", "log", "history"].includes(tab) ? tab : "a3";
  drawA3(state);
  pollTimer = setInterval(() => refreshA3(state), 20000);
}

function a3Link(state, n, tab) {
  return `#/a/${state.aid}/v/${n}/${tab}`;
}

function drawA3(state) {
  const { data, c, v, latest } = state;
  const a3 = data.a3;
  const team = c.teamById[a3.team_id];
  const myTeams = c.teams.filter((t) => t.members.some((m) => m.user_id === data.me));
  const tabs = [["a3", "The A3"], ["log", "Question log"], ["history", "Version history"]];
  view.innerHTML = `
    <p class="small"><a href="#/c/${esc(a3.college_id)}">${esc(c.college.name)}</a></p>
    <div class="row" style="align-items:center">
      <h1 style="flex:1 1 400px">${esc(a3.title)}</h1>
      ${data.canEdit ? `<select id="status" style="flex:0 0 200px">${opts(config.a3Statuses, a3.status)}</select>` : statusBadge(a3.status)}
    </div>
    <p class="muted">Written by ${esc(team?.name || "")}${team ? ` (${team.members.map((m) => esc(nameOf(c.people[m.user_id]))).join(", ") || "nobody yet"})` : ""}.
      Reviewed by ${a3.reviewer_team_ids.map((t) => esc(c.teamById[t]?.name)).join(", ") || "no hard-question teams yet"}.</p>
    <div class="versions">${data.versions.map((x) => `<a href="${a3Link(state, x.number, state.tab)}" class="${x.number === v.number ? "on" : ""}">Draft ${x.number} · ${x.status === "draft" ? "being written" : "in review"}</a>`).join("")}</div>
    <div class="tabs">${tabs.map(([k, t]) => `<a href="${a3Link(state, v.number, k)}" class="${k === state.tab ? "on" : ""}">${t}</a>`).join("")}</div>
    <div id="pane"></div>`;
  const st = $("#status");
  if (st) st.onchange = async () => {
    try { await api("PATCH", `a3s/${state.aid}`, { status: st.value }); toast("Status updated."); } catch (err) { fail(err); }
  };
  const pane = $("#pane");
  if (state.tab === "log") return drawLog(state, pane);
  if (state.tab === "history") return drawHistory(state, pane);
  return drawBoxes(state, pane, myTeams);
}

function boxText(state, k) {
  return state.v.boxes[k] || "";
}

function prevBoxes(state) {
  const prev = state.data.versions.find((x) => x.number === state.v.number - 1);
  return prev ? prev.boxes : null;
}

function questionHtml(state, q) {
  const c = state.c;
  const asker = c.people[q.asked_by];
  const team = q.asked_by_team_id ? c.teamById[q.asked_by_team_id] : null;
  return `<div class="qitem ${q.status === "answered" ? "answered" : ""}">
    <div>${esc(q.body)}</div>
    <div class="qmeta">${esc(nameOf(asker))}${team ? ` for ${esc(team.name)}` : ""} · draft ${esc(q.version_number)}${q.status === "answered" ? " · answered" : " · open"}</div>
    ${q.answer ? `<div style="margin-top:4px"><strong class="small">What we changed:</strong> ${esc(q.answer)}${q.answered_in_version ? ` <span class="qmeta">(draft ${esc(q.answered_in_version)})</span>` : ""}</div>` : ""}
  </div>`;
}

function drawBoxes(state, pane, myTeams) {
  const { data, v, latest } = state;
  const prev = prevBoxes(state);
  const qs = data.questions.filter((q) => q.version_number === v.number);
  const openQs = data.questions.filter((q) => q.status === "open");
  const guide = DRAFT_GUIDE[v.number] || "Keep going until the A3 team decides to send it to the board, rework it once more, or stop.";
  pane.innerHTML = `
    <div class="notice blue">${esc(guide)}</div>
    ${v.number !== latest.number ? `<div class="notice">You're looking at an earlier draft. <a href="${a3Link(state, latest.number, "a3")}">Go to draft ${latest.number}</a>.</div>` : ""}
    ${!state.editable && data.canEdit && v.number === latest.number && v.status === "submitted"
      ? `<div class="notice">Draft ${v.number} is out for review, so it's locked. Once the hard-question teams have asked their questions, start the next draft.</div>` : ""}
    ${!data.canEdit ? `<div class="notice">You can read this A3 and ask questions. Only ${esc(state.c.teamById[data.a3.team_id]?.name || "the A3 team")} and workspace leads can edit it.</div>` : ""}
    ${BOXES.map((b) => {
      const changed = prev && (prev[b.k] || "") !== (v.boxes[b.k] || "");
      const boxQs = qs.filter((q) => String(q.box) === b.k);
      return `<div class="box ${changed ? "changed" : ""}">
        <div class="box-head"><strong>${b.k}. ${esc(b.name)}${changed ? ` <span class="badge gold">changed since draft ${v.number - 1}</span>` : ""}</strong><span class="box-q">${esc(b.q)}</span></div>
        <div class="box-body">
          ${state.editable ? `<textarea data-box="${b.k}" aria-label="${esc(b.name)}">${esc(boxText(state, b.k))}</textarea>`
            : `<div class="text">${esc(boxText(state, b.k)) || `<span class="muted">Empty</span>`}</div>`}
          ${boxQs.map((q) => questionHtml(state, q)).join("")}
        </div>
      </div>`;
    }).join("")}
    ${qs.filter((q) => !q.box).length ? `<h3>Questions on the whole draft</h3>${qs.filter((q) => !q.box).map((q) => questionHtml(state, q)).join("")}` : ""}
    <div class="actions">
      ${state.editable ? `<span class="saved" id="saved">${latest.updated_at ? "Saved " + esc(fmtTime(latest.updated_at)) : ""}</span>
        <button class="btn gold" id="submit">Send draft ${v.number} for review</button>` : ""}
      ${data.canEdit && v.number === latest.number && v.status === "submitted" ? `<button class="btn gold" id="next">Start draft ${v.number + 1}</button>` : ""}
    </div>
    <div id="nextpanel"></div>
    <h2>Ask a hard question</h2>
    <div class="card">
      <form id="ask">
        <div class="row">
          <div><label for="qbox">About</label><select id="qbox"><option value="">The whole draft</option>${BOXES.map((b) => `<option value="${b.k}">${b.k}. ${esc(b.name)}</option>`).join("")}</select></div>
          ${myTeams.length ? `<div><label for="qteam">Asking for</label><select id="qteam"><option value="">Just me</option>${myTeams.map((t) => `<option value="${esc(t.id)}"${data.a3.reviewer_team_ids.includes(t.id) ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>` : ""}
        </div>
        <label for="qbody">Question</label><textarea id="qbody" required maxlength="4000" style="min-height:70px"></textarea>
        <div class="actions"><button class="btn">Add to the question log</button><span class="muted small">It's logged against draft ${latest.number}. The owner answers in the next draft, not in the room.</span></div>
      </form>
    </div>
    ${openQs.length && data.canEdit ? `<p class="muted small">${openQs.length} question${openQs.length === 1 ? " is" : "s are"} still open across all drafts. Answer them on the <a href="${a3Link(state, v.number, "log")}">question log</a>.</p>` : ""}`;

  for (const ta of $$("textarea[data-box]", pane)) {
    ta.addEventListener("input", () => {
      state.dirty[ta.dataset.box] = ta.value;
      $("#saved").textContent = "Saving…";
      clearTimeout(state.timer);
      state.timer = setTimeout(() => saveBoxes(state), 1200);
    });
    ta.addEventListener("blur", () => { if (Object.keys(state.dirty).length) { clearTimeout(state.timer); saveBoxes(state); } });
  }
  const submit = $("#submit", pane);
  if (submit) submit.onclick = async () => {
    if (!confirm(`Send draft ${v.number} for review? It locks so the hard-question teams all read the same version.`)) return;
    try {
      await saveBoxes(state);
      await api("POST", `a3s/${state.aid}/versions/${v.number}/submit`);
      toast(`Draft ${v.number} is out for review.`);
      render();
    } catch (err) { fail(err); }
  };
  const next = $("#next", pane);
  if (next) next.onclick = () => drawNextPanel(state, $("#nextpanel", pane));
  $("#ask", pane).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("POST", `a3s/${state.aid}/questions`, { box: $("#qbox", pane).value || null, team_id: $("#qteam", pane)?.value || null, body: $("#qbody", pane).value });
      toast("Question logged.");
      render();
    } catch (err) { fail(err); }
  };
}

async function saveBoxes(state) {
  const boxes = state.dirty;
  if (!Object.keys(boxes).length) return;
  state.dirty = {};
  const el = document.getElementById("saved");
  try {
    const r = await api("PUT", `a3s/${state.aid}/versions/${state.v.number}`, { boxes });
    state.v.boxes = r.boxes;
    state.latest.updated_at = r.updated_at;
    if (el) el.textContent = "Saved " + fmtTime(r.updated_at);
  } catch (err) {
    state.dirty = { ...boxes, ...state.dirty };
    if (el) el.textContent = "Not saved";
    fail(err);
    if (err.status === 409) setTimeout(render, 1500);
    throw err;
  }
}

function drawNextPanel(state, el) {
  const { data, v } = state;
  const asked = data.questions.filter((q) => q.version_number === v.number || q.status === "open");
  el.innerHTML = `<div class="card">
    <h3>Start draft ${v.number + 1}</h3>
    <p class="muted small">The new draft starts as a copy of draft ${v.number}. Say what you're changing and which questions drove it, so the version history tells the story.</p>
    <label for="wc">What changes in this draft</label><textarea id="wc" style="min-height:70px"></textarea>
    ${asked.length ? `<label>Which questions drove it</label>${asked.map((q) => `<label class="check"><input type="checkbox" value="${esc(q.id)}"> <span>${esc(q.body)}</span></label>`).join("")}` : ""}
    <div class="actions"><button class="btn gold" id="go">Start draft ${v.number + 1}</button></div>
  </div>`;
  $("#go", el).onclick = async () => {
    try {
      const r = await api("POST", `a3s/${state.aid}/versions`, { what_changed: $("#wc", el).value, driven_by: $$("input[type=checkbox]:checked", el).map((x) => x.value) });
      location.hash = a3Link(state, r.number, "a3");
    } catch (err) { fail(err); }
  };
}

function drawLog(state, pane) {
  const { data, c } = state;
  const maxV = state.latest.number;
  pane.innerHTML = `
    <p class="muted">Every question from every review, and what the A3 team changed because of it.</p>
    <table class="stack">
      <tr class="head"><th>Draft</th><th>Box</th><th>Question</th><th>Asked by</th><th>What we changed</th></tr>
      ${data.questions.map((q) => {
        const asker = c.people[q.asked_by];
        const team = q.asked_by_team_id ? c.teamById[q.asked_by_team_id] : null;
        const canDel = q.asked_by === data.me || data.role === "lead";
        return `<tr data-q="${esc(q.id)}">
          <td data-label="Draft">${esc(q.version_number)}</td>
          <td data-label="Box">${q.box ? esc(q.box + ". " + BOXES[q.box - 1].name) : "Whole draft"}</td>
          <td data-label="Question">${esc(q.body)}${canDel ? `<br><button class="link small del">Remove</button>` : ""}</td>
          <td data-label="Asked by">${esc(nameOf(asker))}${team ? `<br><span class="muted small">${esc(team.name)}</span>` : ""}</td>
          <td data-label="What we changed" class="wide">${data.canEdit ? `
            <textarea class="ans" aria-label="What we changed" style="min-height:60px">${esc(q.answer)}</textarea>
            <div class="row" style="margin-top:6px">
              <select class="inv" aria-label="Changed in draft"><option value="">Changed in draft…</option>${Array.from({ length: maxV }, (_, i) => i + 1).map((n) => `<option value="${n}"${Number(q.answered_in_version) === n ? " selected" : ""}>Draft ${n}</option>`).join("")}</select>
              <select class="qs" aria-label="Status"><option value="open"${q.status === "open" ? " selected" : ""}>Open</option><option value="answered"${q.status === "answered" ? " selected" : ""}>Answered</option></select>
              <button class="btn secondary save">Save</button>
            </div>` : `${esc(q.answer) || `<span class="muted">Not yet</span>`}${q.answered_in_version ? `<br><span class="muted small">Draft ${esc(q.answered_in_version)}</span>` : ""}`}
          </td></tr>`;
      }).join("") || `<tr><td colspan="5" class="muted">No questions yet.</td></tr>`}
    </table>`;
  for (const tr of $$("[data-q]", pane)) {
    const qid = tr.dataset.q;
    const save = $(".save", tr);
    if (save) save.onclick = async () => {
      try {
        await api("PATCH", `questions/${qid}`, { answer: $(".ans", tr).value, status: $(".qs", tr).value, answered_in_version: $(".inv", tr).value ? Number($(".inv", tr).value) : null });
        toast("Saved.");
      } catch (err) { fail(err); }
    };
    const del = $(".del", tr);
    if (del) del.onclick = async () => {
      if (!confirm("Remove this question?")) return;
      try { await api("DELETE", `questions/${qid}`); render(); } catch (err) { fail(err); }
    };
  }
}

function drawHistory(state, pane) {
  const { data, c } = state;
  const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));
  pane.innerHTML = `
    <p class="muted">If an A3 looks the same after review as it did before, nobody really reviewed it.</p>
    <table class="stack">
      <tr class="head"><th>Draft</th><th>Started</th><th>What changed</th><th>Which questions drove it</th><th></th></tr>
      ${data.versions.map((v) => `<tr>
        <td data-label="Draft">${v.number}</td><td data-label="Started">${esc(fmtDate(v.created_at))}<br><span class="muted small">${v.status === "draft" ? "being written" : "sent " + esc(fmtDate(v.submitted_at))}</span></td>
        <td data-label="What changed">${esc(v.what_changed) || `<span class="muted">${v.number === 1 ? "First draft" : "Not described"}</span>`}</td>
        <td data-label="Which questions drove it">${v.driven_by.map((id) => qById[id] ? `<div class="small">${esc(qById[id].body)} <span class="muted">(${esc(nameOf(c.people[qById[id].asked_by]))})</span></div>` : "").join("") || `<span class="muted">None</span>`}</td>
        <td>${v.number > 1 ? `<button class="link cmp" data-n="${v.number}">Compare with draft ${v.number - 1}</button>` : ""}</td>
      </tr>`).join("")}
    </table>
    <div id="cmp"></div>`;
  for (const b of $$(".cmp", pane)) b.onclick = () => {
    const n = Number(b.dataset.n);
    const cur = data.versions.find((x) => x.number === n).boxes;
    const prev = data.versions.find((x) => x.number === n - 1).boxes;
    const changed = BOXES.filter((bx) => (cur[bx.k] || "") !== (prev[bx.k] || ""));
    $("#cmp", pane).innerHTML = `<h2>Draft ${n - 1} to draft ${n}</h2>${changed.map((bx) => `
      <div class="box changed"><div class="box-head"><strong>${bx.k}. ${esc(bx.name)}</strong></div>
      <div class="box-body compare"><div><div class="muted small">Draft ${n - 1}</div><div class="text">${esc(prev[bx.k] || "")}</div></div>
      <div><div class="muted small">Draft ${n}</div><div class="text">${esc(cur[bx.k] || "")}</div></div></div></div>`).join("") || `<p class="muted">No box changed between these drafts.</p>`}`;
  };
}

// Pick up other people's questions and saves without disturbing what you're typing.
async function refreshA3(state) {
  if (document.hidden || state.saving) return;
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.tagName === "SELECT")) return;
  if (Object.keys(state.dirty).length) return;
  try {
    const fresh = await api("GET", `a3s/${state.aid}`);
    const sig = (d) => JSON.stringify([d.a3, d.versions.map((v) => [v.number, v.status, v.updated_at]), d.questions.map((q) => [q.id, q.updated_at])]);
    if (sig(fresh) !== sig(state.data)) render();
  } catch {}
}

// Text boxes grow with what's typed, so nobody scrolls inside a small box on a phone.
// Browsers with CSS field-sizing do this themselves; others get this fallback.
if (!(window.CSS && CSS.supports("field-sizing", "content"))) {
  const grow = (t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
  document.addEventListener("input", (e) => { if (e.target.tagName === "TEXTAREA") grow(e.target); });
  new MutationObserver(() => { for (const t of document.querySelectorAll("textarea")) if (t.scrollHeight > t.clientHeight) grow(t); })
    .observe(document.getElementById("view"), { childList: true, subtree: true });
}
