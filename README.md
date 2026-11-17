# irl.page

IRL Page is a map of people who met in real life.

You make a ticket at the venue you're in. It shows as a ticket stub with a QR
code. Friends scan it to join, you submit it, and from then on it is a
permanent record that those people were at that place together. Every
submitted ticket adds to one big public graph of people and venues, which you
can explore as a 3D network or on a globe.

It collects very little. There are no names and no stored emails: a person is
an id and an avatar (a blocky pattern by default, or an emoji or picture they
choose).

## How it works

- **Sign-in** is OAuth (Google or GitHub), handled entirely in the Worker.
  The email is used once, to compute `HMAC-SHA256(email, EMAIL_PEPPER)`, and
  only that hash is stored. The provider's picture stays in the sealed
  session cookie unless the person picks it as their avatar.
- **A ticket** starts open. Its QR code is `https://irl.page?ticket=<code>`,
  so scanning it with any camera opens the app on that ticket. Anyone signed
  in can join an open ticket; only the creator can submit it. An open ticket
  expires after a day.
- **Submitting** creates the venue if it is new, freezes the ticket, then
  writes graph nodes and edges: every attendee is linked to the venue and to
  every other attendee. A submitted ticket never changes again, with one
  exception: merging two venues (`pnpm venue:merge`) swaps the outgoing
  venue's id for the surviving one everywhere.
- **Venues** are suggested by distance from where you are: venues already on
  IRL Page plus nearby OpenStreetMap places. You can also type a name and
  address, or a name and a pin on a map. If the name matches a venue that is
  already here, you're asked to use that one.
- **Explore** (the home page) draws the graph in 3D, or on a globe with a
  heat map, a spike map, or arcs between the latest venues of people who
  have met.

### Data model

Five PocketBase collections (`pocketbase/pb_migrations/`), all
superuser-only. The Worker is the only client; a browser never reaches the
database.

| Collection | Fields                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `people`   | `email_hash`, `avatar_kind`, `avatar_value`, `onboarded`, `created`                            |
| `venues`   | `name`, `address`, `lat`, `lng`, `osm_id`, `created`, `updated`                                |
| `tickets`  | `code`, `creator`, `participants`, `status`, `venue`, `venue_draft`, `submitted_at`, `created` |
| `nodes`    | `kind` (person or venue), `user` or `venue`, `created`, `updated`                              |
| `edges`    | `a`, `b` (node ids), `created`                                                                 |

The collection is `people`, not `users`, because PocketBase's built-in
`users` collection stores emails; the migration deletes it.

All database access goes through the `Datastore` interface in
`shared/db.ts`. `shared/pocketbase-db.ts` implements it today; moving to
another database means writing one more implementation.

## Stack

pnpm, TypeScript, React 19, Vite, Tailwind v4, shadcn/ui, and a Cloudflare
Worker (static assets plus the `/api` routes) via `@cloudflare/vite-plugin`.
PocketBase is the database. The 3D views use `react-force-graph-3d` and
`react-globe.gl`; maps use MapLibre with OpenFreeMap tiles; venue lookups use
OpenStreetMap's Overpass and Nominatim services. Vitest for unit tests,
Playwright for end-to-end tests.

## Setup

Requires Node 24+ and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars`: a password for `POCKETBASE_SUPERUSER_PASSWORD` and
`openssl rand -base64 32` for each of `SESSION_SECRET` and `EMAIL_PEPPER`.
Leave the OAuth values empty to start; `DEV_LOGIN=1` adds a local sign-in
picker instead.

```sh
pnpm dev        # PocketBase on :8090 and the app on http://localhost:5173
pnpm db:seed    # in another terminal: fill the database with a sample world
```

The first `pnpm dev` downloads the pinned PocketBase binary into
`pocketbase/`. Data lives in `pocketbase/pb_data/` (gitignored). The
PocketBase dashboard is at <http://127.0.0.1:8090/_/> (sign in with the
superuser from `.dev.vars`).

To try the two-person flow locally, open the app in two browser profiles (or
one normal and one private window), sign in as different people, create a
ticket in one and open its link in the other.

The camera and location only work on a secure origin. `localhost` counts; to
test on a phone, put the dev server behind an HTTPS tunnel.

### Real sign-in

Create a Google OAuth client and a GitHub OAuth app with these callback URLs,
and put their ids and secrets in `.dev.vars`:

- `<origin>/api/auth/google/callback`
- `<origin>/api/auth/github/callback`

A provider without a client id is simply not offered.

## Scripts

- `pnpm dev`: PocketBase and the app together
- `pnpm dev:web`: only the app (Vite plus the Worker)
- `pnpm db`: only PocketBase
- `pnpm db:seed`: fill an empty database with sample people, venues and
  tickets (`SEED_USERS`, `SEED_TICKETS` set the size)
- `pnpm db:reset`: delete every record, keeping the schema
- `pnpm venue:merge <from> <to>`: fold one venue into another; with no
  arguments, list venues and their ids
- `pnpm build`: production build
- `pnpm deploy`: build and deploy the Worker
- `pnpm typecheck`: generate Worker types and type-check
- `pnpm test`: unit tests
- `pnpm test:e2e`: Playwright tests against a throwaway seeded PocketBase
- `pnpm lint`, `pnpm format`, `pnpm format:check`
- `pnpm validate:quick`: format check, typecheck, lint, unit tests
- `pnpm validate`: `validate:quick` plus the end-to-end tests
- `pnpm format-and-validate`: format, then `validate`; run before every commit

The scripts that talk to PocketBase read `.dev.vars`; set `ENV_FILE` to
point them at another file.

## Deploy

Not deployed yet. The plan:

1. Create a PocketHost instance, upload `pocketbase/pb_migrations/`, and
   create a superuser for the Worker.
2. Set every value from `.dev.vars.example` (except `DEV_LOGIN`) as a Worker
   secret with `wrangler secret put`, with `POCKETBASE_URL` pointing at the
   instance.
3. `pnpm deploy`. `wrangler.jsonc` routes the Worker to `irl.page`.
4. Add deploy and PR-preview jobs to `.github/workflows/ci.yml`.

Never set `DEV_LOGIN` in production: it lets anyone sign in as anyone.
