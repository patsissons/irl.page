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
- **You have to be there.** Creating a ticket and joining one both need
  your location, and the Worker checks it is within about 300 m of the
  venue. Scanning a code off someone's phone already means you're together,
  but a link or a photo of the code can be sent anywhere. If location is off,
  the page says so and how to turn it on. This relies on the position the
  browser reports, so it deters remote joins rather than making them
  impossible.
- **Sharing** a ticket opens the system share sheet with its link. The link
  unfurls in chat apps as the ticket: the Worker serves ticket links with
  their own preview tags and renders a 1200x630 landscape ticket at
  `/api/tickets/<code>/preview.png`. Only open tickets have a preview.
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
  have met. Clicking a person or venue narrows both views to that node
  and what it is directly linked to (`?focus=<node id>`); signed in, “Just
  me” does the same for your own node.

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

The camera, location and share sheet only work on a secure origin.
`localhost` counts. To test on a phone on the same network, run `pnpm db` and
`pnpm dev:https`, open `https://<this machine's address>:5173`, and accept the
self-signed certificate warning.

### Real sign-in

Create a Google OAuth client and a GitHub OAuth app with these callback URLs,
and put their ids and secrets in `.dev.vars`:

- `<origin>/api/auth/google/callback`
- `<origin>/api/auth/github/callback`

A provider without a client id is simply not offered.

## Scripts

- `pnpm dev`: PocketBase and the app together
- `pnpm dev:web`: only the app (Vite plus the Worker)
- `pnpm dev:https`: only the app, over HTTPS on every network interface,
  for testing on a phone
- `pnpm db`: only PocketBase
- `pnpm db:seed`: fill an empty database with sample people, venues and
  tickets (`SEED_USERS`, `SEED_TICKETS` set the size)
- `pnpm db:reset`: delete every record, keeping the schema
- `pnpm venue:merge <from> <to>`: fold one venue into another; with no
  arguments, list venues and their ids
- `pnpm build`: production build
- `pnpm db:deploy`: sync `pocketbase/pb_migrations` to the PocketHost instance
- `pnpm run deploy`: build and deploy the Worker
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

### Database (PocketHost)

The hosted database is the PocketHost instance `irl`
(`https://irl.pockethost.io`), named in `pocketbase/.pockethostconfig`.

Every push to `main`, which includes every merged PR, runs the
`deploy-pocketbase` job in `.github/workflows/ci.yml` once `validate` has
passed. It runs `scripts/pocketbase-deploy.sh`, which uses the
[PocketHost CLI](https://pockethost.io/docs/cli) to upload
`pocketbase/pb_migrations/` over HTTPS. The instance restarts and applies
new migrations. Migrations removed from the repo are removed from the
instance; `pb_data` is never touched.

The job needs one repository secret, `POCKETHOST_TOKEN`: a personal access
token from [Account → API Tokens](https://pockethost.io/account/tokens) with
write access to the `irl` instance only. Paste it at the prompt:

```sh
gh secret set POCKETHOST_TOKEN
```

To deploy by hand, run `pnpm db:deploy` (add `--dry-run` to list what would
be deployed). It uses `POCKETHOST_TOKEN` from the environment or `.env`, or
the token saved by `pockethost login`.

### Worker

Every push to `main` also runs the `deploy-worker` job, after the database
deploy: it builds the app and runs `wrangler deploy`, and `wrangler.jsonc`
routes the Worker to `irl.page`. The job needs two repository secrets,
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (a token that can edit
Workers and attach the `irl.page` custom domain).

The Worker's own configuration is not in CI. Set every value from
`.dev.vars.example` except `DEV_LOGIN` and `OSM_LOOKUP` once, as a Worker
secret; they survive deploys:

```sh
pnpm exec wrangler secret put POCKETBASE_URL
```

- `POCKETBASE_URL` is `https://irl.pockethost.io`, and
  `POCKETBASE_SUPERUSER_EMAIL` / `POCKETBASE_SUPERUSER_PASSWORD` are a
  superuser created on that instance for the Worker.
- `SESSION_SECRET` and `EMAIL_PEPPER` are fresh random values, not the local
  ones. Never rotate `EMAIL_PEPPER`: it orphans every account.
- The OAuth client ids and secrets come from apps whose callbacks are
  `https://irl.page/api/auth/google/callback` and
  `https://irl.page/api/auth/github/callback`.

To deploy by hand, run `pnpm run deploy` (plain `pnpm deploy` is a different,
built-in pnpm command).

Rendering the link-preview image takes tens of milliseconds of CPU, more than
the Workers Free plan's 10 ms per request, so the Worker needs the Workers
Paid plan. Images are cached at the edge for an hour.

Never set `DEV_LOGIN` in production: it lets anyone sign in as anyone.
