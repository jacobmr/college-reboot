# The College Reboot Workbook

Two parts, one site:

- **The workbook** (`public/index.html`): the open guide with the Gap, Runway and market-sizing calculators. Anyone can use it without signing in, and nothing typed into it is saved or sent anywhere.
- **The team workspace** (`/app`): where a college's teams run the A3 loop together. People sign in by an emailed link. Every draft, every hard question and every answer is stored, so teams can iterate.

## How the workspace works

- A **workspace** belongs to one college. Whoever creates it is its first **lead**.
- Leads invite people (lead, cabinet, board, faculty and staff, student, red team), set up teams and start A3s.
- **A3 teams** write one idea. Members can hold the A3 roles from Phase 3: owner, numbers person, voice of the students we want, builder.
- **Hard-question teams** (demand, money, identity, what we lose, delivery) and the **red team** review the A3s assigned to them.
- Each A3 moves through drafts. The A3 team writes a draft, sends it for review (which locks it), the reviewers log questions against that draft, and the team starts the next draft, saying what changed and which questions drove it. The question log and version history fill in by themselves.
- Everyone in a workspace can read every A3 and ask questions. Only the A3's own team and leads can edit it. People outside a college can't see its workspace at all.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:3000, local database in local.db, sign-in links shown on screen
npm test
```

## Deploy (Vercel)

Static files in `public/`, one serverless function at `api/router.mjs` that serves every `/api/*` route. Tables are created on first request.

| Variable | What it's for |
| --- | --- |
| `TURSO_DATABASE_URL` | Turso (libSQL) database URL, `libsql://...` |
| `TURSO_AUTH_TOKEN` | Token for that database |
| `RESEND_API_KEY` | Resend key for sign-in and invite emails |
| `EMAIL_FROM` | Sender on a domain verified in Resend, e.g. `College Reboot <signin@example.org>` |
| `APP_URL` | Optional. The public address used in emailed links; defaults to the request's host |

Without the two email variables, sign-in by email is off, and leads get a one-time invite link to pass on instead.

## Data

Sign-in links and sessions are stored only as SHA-256 hashes. Session cookies are HttpOnly, Secure and SameSite=Lax, and writes from other sites are refused.
