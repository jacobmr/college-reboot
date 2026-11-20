# Handoff: College Reboot team workspace

Updated 2026-11-19. Read this first; it is the session state that travels between sessions.

## Where things are

- **Repo:** jacobmr/college-reboot (Jacob's fork of Jeff Ritter's repo). Jeff's original still serves his live site; nothing here touches it.
- **PR #1** (`workbook-proposal`): the workbook changes (TAM/SAM/SOM up front, A3 as an iterative loop, six market-read examples, wording and voice passes).
- **PR #2** (`team-app` into `main`): the stored team workspace. It includes PR #1's commits. CI is green and it has no conflicts. Nobody has merged it.
- **Plan doc for the app:** https://claude.ai/artifact/MPfMLtV5dUKD1BAHKu4xwC

## What the app is

- `public/index.html`: the open workbook and calculators. No sign-in, nothing saved.
- `/app` (`public/app.html`, `app.js`, `app.css`): vanilla single-page app. Workspaces per college, roles, teams, and the A3 loop (draft; send for review, which locks it; questions logged against that draft; next draft records what changed and which questions drove it).
- `api/router.mjs`: the one Vercel function. `vercel.json` rewrites `/api/*` to it. Routes live in `lib/router.mjs`.
- `lib/`: `db.mjs` (libSQL client; schema created on cold start from `schema.mjs`), `auth.mjs` (emailed one-time links, hashed tokens and sessions, 30-day HttpOnly cookie), `email.mjs` (Resend), `http.mjs`.
- `npm test` runs 7 tests (Node test runner). `npm run dev` runs locally on a file database with sign-in links shown on screen.
- The README has the full picture of roles and the env var table.

## Vercel

- Team `huddlehealth` (team_VQpNZDgcr3AMHl5U6P8KSIaj), project `college-reboot` (prj_8426UxeXrXhRFkbmbJ7qOi573KSL), linked to the fork.
- Domain: **collegerunway.org** (Cloudflare DNS). Apex redirects 308 to `www.collegerunway.org`, which is attached to the project.
- Production is `main`, which is still the old static workbook. It becomes the workspace when PR #2 merges.
- Preview of `team-app` with all settings: college-reboot-396g7qaqi-huddlehealth.vercel.app (rebuilt 2026-11-19). Vercel Authentication is on.

## Settings (all set 2026-11-19)

| Variable | Production | Preview (team-app only) |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | libsql://collegereboot-jacobr.aws-us-east-1.turso.io | same |
| `TURSO_AUTH_TOKEN` | secret; SOPS `College_Reboot_token` | same |
| `RESEND_API_KEY` | secret; SOPS `COLLEGE_RUNWAY_RESEND_API_KEY` (send-only, scoped to collegerunway.org) | same |
| `EMAIL_FROM` | `College Runway <signin@collegerunway.org>` | same |
| `APP_URL` | `https://www.collegerunway.org` | not set, so links use the preview host |

- The preview and production share one Turso database. Test rows from 2026-11-19 are in it (see below).
- Resend: click and open tracking are **off** for collegerunway.org on purpose; sign-in links carry one-time tokens. DKIM, SPF and inbound MX verified. Only the unused tracking CNAME fails.
- Inbound mail on collegerunway.org lands in Resend (Receiving), so an agent can sign in as `claude-test@collegerunway.org` and read the link through the Resend API.

## Clicked through on the preview (2026-11-19)

Sign-in email delivered, link pointed at the preview host (not a tracking redirect), signed in, set a name, created "Test College (delete me)", added an A3 team and a Money hard-question team, started an A3, autosave, sent draft 1 for review (locked), logged a question, started draft 2 citing it, version history filled in. No errors.

Seen, not fixed:
- Branding mismatch: page says "College Reboot", email subject says "College Reboot", sender and domain say College Runway.
- A question cited by draft 2 stays "Open" in the log until someone marks it answered.
- A team card's "Add someone" list still offers people already on that team.
- "Asking for" only lists teams the asker is on.

## Next steps

1. Delete the test data (user `claude-test@collegerunway.org`, workspace "Test College (delete me)") before go-live.
2. Decide the name in the page copy and emails (College Reboot or College Runway).
3. Merge PR #2 when happy (Jacob's call). Production then serves `/app` on www.collegerunway.org.
4. Invite Jeff: People tab, invite as lead. Adding him to the GitHub repo is separate.
5. Resend has an older full-access key named "collegerunway" (2026-11-18) that nothing reads; revoke it.

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
