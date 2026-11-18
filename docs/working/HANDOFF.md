# Handoff: College Reboot team workspace

Updated 2026-11-18. Read this first; it is the session state that travels between sessions.

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
- Production is `main`, which is still the old static workbook. It becomes the workspace when PR #2 merges.
- A preview of `team-app` built cleanly: college-reboot-git-team-app-huddlehealth.vercel.app. Vercel Authentication is on, so open it while signed in to Vercel.
- The env vars below weren't set when that preview was built, so it needs a redeploy after they're added.

## Settings still to add (Vercel, then redeploy)

| Variable | Status |
| --- | --- |
| `TURSO_DATABASE_URL` | Database created (Turso `collegereboot`, aws-us-east-1). Jacob has the URL. |
| `TURSO_AUTH_TOKEN` | Stored in the 636 SOPS file as `College_Reboot_token`. Not yet in Vercel. |
| `RESEND_API_KEY` | Not yet. |
| `EMAIL_FROM` | Not yet. **Not mical.net**: Jacob doesn't want the sender traced to him. |
| `APP_URL` | Optional; set once there's a custom domain. |

Without the two email variables, email sign-in is off in production, so nobody (Jacob included) can sign in. The sender is the real blocker.

## Sender options (not tied to Jacob)

1. **Recommended:** register the product's own domain, with registrar WHOIS privacy. The name is still open; candidates from Nov 18 are Next Charter, Durable College, Margin & Mission and College Bearing. Verify it in Resend and send from something like `College Reboot <signin@thatdomain>`. The same domain then serves the site, which also hides the Vercel URL.
2. Any neutral domain Jacob already holds that isn't publicly connected to him.
3. Resend's test sender is for testing only: it delivers only to the Resend account owner's own address.

## Other places that trace to Jacob

- The `huddlehealth` team slug in every `*.vercel.app` URL. A custom domain fixes the public one.
- GitHub `jacobmr`: repo owner, PR author, Vercel bot comments, and the repository and homepage fields in `package.json`.
- The Turso host name includes Jacob's Turso org name. It's server-side only; visitors never see it.

## Next steps

1. Pick the name and register the domain (Jacob's call; costs money).
2. Add the four env vars in Vercel; redeploy the `team-app` preview.
3. Sign in on the preview, create a workspace, click through an A3 loop. The screens haven't been clicked through in a browser yet; only the API is tested.
4. Merge PR #2 when happy (Jacob's call), point the domain at the project, set `APP_URL`.
5. Invite Jeff: People tab, invite as lead. Adding him to the GitHub repo is separate.

## Open questions (Jacob's, not decided)

- Business, give-away or free.
- Jeff's points: which brand, who runs it, named people on the Consortium page, board chairs before presidents, Phase 1 flat fee.
- Jacob wants not to be seen as a primary driver, because of his wife's institution.

## Rules for whoever picks this up

- Don't push to or open PRs on Jeff's repo, and don't contact Jeff or Sarah without Jacob's yes.
- Don't merge without Jacob's ask.
- Never commit secrets; tokens live in SOPS and Vercel.
- Spell "health care" as two words; avoid AI-sounding phrasing in page copy.
