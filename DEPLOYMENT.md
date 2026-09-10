# Deploying Meeple Night

The app is a standard Next.js server application. It needs a Node runtime and a PostgreSQL
database, and nothing else. There is no static export, no edge-only code, and no vendor SDK.

**GitHub Pages cannot host this.** Pages serves static files; all 19 routes here are
server-rendered on demand, every form is a Server Action, and sessions are database rows.
There is no build setting that changes that — it would need rewriting as a static SPA plus a
separately hosted API.

---

## Railway (the configured path)

`railway.json` in the repo root already describes the build, the migration step, the start
command and the health check, so Railway picks all of that up on its own.

### 1. Create the project

1. Sign in at [railway.app](https://railway.app) and choose **New Project → Deploy from GitHub
   repo**, then pick `rielwl/board-game-app`.
2. Railway detects Node from `package.json` and `.nvmrc` (Node 22) and starts a first build.
   It will fail the health check until the database and secrets exist — that is expected.

### 2. Add PostgreSQL

In the same project: **New → Database → Add PostgreSQL**. Railway provisions it and exposes
`DATABASE_URL` on the database service.

### 3. Set the variables

On the **app** service, under Variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — a Railway [variable reference](https://docs.railway.com/guides/variables#reference-variables), not a pasted string, so it keeps working if the database is rotated |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `INVITE_ENCRYPTION_KEY` | `openssl rand -base64 32` (a *different* value) |
| `BETTER_AUTH_URL` | your public origin, e.g. `https://board-game-app-production.up.railway.app` |
| `BGG_USER_AGENT` | `MeepleNight/0.1 (+https://your-domain; you@example.com)` |

Optional: `BGG_ENABLED=false` to run against the bundled offline catalog,
`BGG_CACHE_TTL_HOURS`, `BGG_MIN_REQUEST_INTERVAL_MS`, `BGG_TIMEOUT_MS`.

`BETTER_AUTH_URL` is chicken-and-egg: generate the domain first (**Settings → Networking →
Generate Domain**), then set the variable and redeploy. Invite links are built from this value,
so if it is wrong every invite you send is dead.

### 4. Deploy

Push to `main`, or hit **Deploy**. Railway will:

1. `npm ci` and `npm run build` (`prisma generate && next build`)
2. run the pre-deploy command `npx prisma migrate deploy` — this applies
   `prisma/migrations/` to the production database
3. start with `npm start`, and poll `/api/health` until it returns 200

`/api/health` checks that the environment parses and that the database answers `SELECT 1`. A
missing secret or an unreachable database therefore fails the deploy instead of producing a
site that 500s on every page.

### 5. Confirm

```bash
curl https://<your-domain>/api/health
# {"status":"ok","checks":{"env":"ok","database":"ok"}}
```

Then register an account through the UI and create an event.

---

## Things that will bite you

**Never run `npm run setup` or `npm run db:seed` against production.** The seed deliberately
clears events, members, offers, preferences, selections and the demo users before inserting its
scenario. It is for local development. The deploy path uses `prisma migrate deploy` only, which
is additive.

**Do not set `NODE_ENV` yourself in Railway.** The platform manages it. Setting it to
`production` at install time makes npm skip devDependencies, which removes TypeScript, Tailwind
and the type packages that `next build` needs. (`prisma` is in `dependencies` precisely so the
migration step survives that class of pruning.)

**Point `BETTER_AUTH_URL` at the real origin,** including `https://` and no trailing slash. It
drives cookie behaviour and invite links.

**Secure cookies need HTTPS.** `useSecureCookies` follows `NODE_ENV === 'production'`, so
sessions require TLS in production. Railway domains are HTTPS, so this is automatic — but it
means you cannot test a production build over plain HTTP on a custom setup.

**Rate limiting reads `X-Forwarded-For`.** Behind Railway's proxy that header is present and the
per-IP limits work. Note this header is currently trusted unconditionally, which is
[issue #3](https://github.com/rielwl/board-game-app/issues/3) — worth fixing before this is
public, since a forged header lets a caller sidestep the sign-in limiter.

---

## Custom domain

**Settings → Networking → Custom Domain**, add the CNAME Railway gives you, then update
`BETTER_AUTH_URL` to the new origin and redeploy. Existing invite links keep the old host until
they are regenerated.

---

## Other hosts

Nothing in the app is Railway-specific; `railway.json` is the only file that mentions it.

**Vercel** — no code changes. Add an external Postgres (Neon, Supabase), set the same four
variables, and add `prisma migrate deploy` as the build command prefix:
`prisma migrate deploy && npm run build`.

**Fly.io / any container host** — set `output: 'standalone'` in `next.config.ts` for a much
smaller image, then a two-stage Dockerfile with `npm ci`, `npm run build`, and
`node .next/standalone/server.js`. Run migrations as a release command.

**Cloudflare Workers** — the only genuinely awkward target, and it needs real code changes:

- build with `next build --webpack` (Next 16 defaults to Turbopack, which the
  [OpenNext adapter](https://opennext.js.org/cloudflare) does not support — the webpack build is
  verified working)
- move Prisma onto driver adapters: `previewFeatures = ["driverAdapters"]`, `@prisma/adapter-pg`,
  `pg` >8.13.0, and the `nodejs_compat` flag, since the default query engine will not run there
- add an external Postgres plus [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) for
  pooling — Cloudflare has no managed Postgres, D1 is SQLite
- port `src/lib/crypto.ts` from `node:crypto`'s `createCipheriv` to WebCrypto `crypto.subtle`;
  `createCipheriv` support on workerd is [still open](https://github.com/cloudflare/workerd/issues/3277)

---

## Backups

Railway's PostgreSQL supports scheduled backups on paid plans; enable them before you have data
worth keeping. `prisma migrate deploy` is forward-only and never drops data, but a bad migration
you wrote can, so take a backup before any migration that alters existing columns.
