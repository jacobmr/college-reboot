# Handoff: College Reboot team workspace

Updated 2026-11-20. Read this first; it is the session state that travels between sessions.

## Where things are

- **Repo:** jacobmr/college-reboot (Jacob's fork of Jeff Ritter's repo). Jeff's original still serves his live site; nothing here touches it.
- **Live:** https://www.collegereboot.org (workbook) and https://www.collegereboot.org/app (team workspace). PR #1 (workbook) and PR #2 (workspace) were merged by Jacob on 2026-11-20.
- **Plan doc for the app:** https://claude.ai/artifact/MPfMLtV5dUKD1BAHKu4xwC

## What the app is

- `public/index.html`: the open workbook and calculators. No sign-in, nothing saved.
- `/app` (`public/app.html`, `app.js`, `app.css`): vanilla single-page app. Workspaces per college, roles, teams, and the A3 loop (draft; send for review, which locks it; questions logged against that draft; next draft records what changed and which questions drove it).
- `api/router.mjs`: the one Vercel function. `vercel.json` rewrites `/api/*` to it. Routes live in `lib/router.mjs`.
- `lib/`: `db.mjs` (libSQL client; schema created on cold start from `schema.mjs`), `auth.mjs` (emailed one-time links, hashed tokens and sessions, 30-day HttpOnly cookie), `email.mjs` (Resend), `http.mjs`.
- `npm test` runs 7 tests (Node test runner). `npm run dev` runs locally on a file database with sign-in links shown on screen.
- The README has the full picture of roles and the env var table.

## Vercel

- Team `huddlehealth` (team_VQpNZDgcr3AMHl5U6P8KSIaj), project `college-reboot` (prj_8426UxeXrXhRFkbmbJ7qOi573KSL), linked to the fork. Production is `main`.
- Main address: **www.collegereboot.org**. `collegereboot.org`, `collegerunway.org` and `www.collegerunway.org` all redirect 308 to it. Both domains are registered at Cloudflare, DNS only (grey cloud).
- Preview builds of `team-app` (now merged) still have their own settings scoped to that branch; other branches get none.

## Settings (production, as of 2026-11-20)

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | libsql://collegereboot-jacobr.aws-us-east-1.turso.io |
| `TURSO_AUTH_TOKEN` | secret; SOPS `College_Reboot_token` |
| `RESEND_API_KEY` | secret; SOPS `COLLEGE_REBOOT_RESEND_API_KEY` (send-only, scoped to collegereboot.org) |
| `EMAIL_FROM` | `College Reboot <signin@collegereboot.org>` |
| `APP_URL` | `https://www.collegereboot.org` |

- Vercel env vars apply at build time: change one, then redeploy.
- Both secrets are registered in inventory `secrets/placements.yaml`.
- Resend: collegereboot.org verified (DKIM, SPF). Click and open tracking are **off** on purpose; sign-in links carry one-time tokens. collegereboot.org has no inbound mail.
- collegerunway.org stays in Resend with inbound mail on, so an agent can sign in as `claude-test@collegerunway.org` and read the link through the Resend API (Receiving).
- Production and preview share one Turso database. Name test rows "Test ... (delete me)" and delete them right after. As of 2026-11-20 every table is empty.

## Checked on production (2026-11-20)

Redirects from all three other hosts land on www.collegereboot.org. A sign-in email went out from `College Reboot <signin@collegereboot.org>`, its link pointed at www.collegereboot.org, it set a session, and the same link was refused a second time. The test user was then deleted.

## Clicked through on the preview (2026-11-19, before the domain change)

Sign-in email delivered, link pointed at the preview host (not a tracking redirect), signed in, set a name, created "Test College (delete me)", added an A3 team and a Money hard-question team, started an A3, autosave, sent draft 1 for review (locked), logged a question, started draft 2 citing it, version history filled in. No errors.

Seen, not fixed:
- Name: JMR keeps "College Reboot" (2026-11-19). The domain is still collegerunway.org.
- A question cited by draft 2 stays "Open" in the log until someone marks it answered.
- A team card's "Add someone" list still offers people already on that team.
- "Asking for" only lists teams the asker is on.

## Next steps

1. Invite Jeff: People tab, invite as lead. Adding him to the GitHub repo is separate.
2. The small UI issues listed above.

Done 2026-11-20: the two unused Resend keys were revoked; the only College Reboot key left is `college-reboot-vercel-sending`.

## Other places that trace to Jacob

- GitHub `jacobmr`: repo owner, PR author, Vercel bot comments, and the repository and homepage fields in `package.json`.
- The Turso host name includes Jacob's Turso org name (`jacobr`). Server-side only.

## Open questions (Jacob's, not decided)

- Business, give-away or free.
- Jeff's points: which brand, who runs it, named people on the Consortium page, board chairs before presidents, Phase 1 flat fee.
- Jacob wants not to be seen as a primary driver, because of his wife's institution.

## Rules for whoever picks this up

- Don't push to or open PRs on Jeff's repo, and don't contact Jeff or Sarah without Jacob's yes.
- Don't merge without Jacob's ask.
- Never commit secrets; tokens live in SOPS and Vercel.
- Spell "health care" as two words; avoid AI-sounding phrasing in page copy.
