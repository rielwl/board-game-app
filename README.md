# Meeple Night

A private board game night organiser. Create an event, invite your friends, collect RSVPs,
game offers and preferences, then get a ranked shortlist of the games that actually work for
the table you have — with the reasoning shown, not hidden.

The recommendation engine is a deterministic scoring function. There is no machine learning
model and no LLM anywhere in this project.

---

## Quick start

```bash
cp .env.example .env          # then fill in the two secrets, see below
npm install
npm run db:up                 # PostgreSQL 17 in Docker, on host port 5433
npm run db:deploy             # apply migrations
npm run db:seed               # demo scenario: 5 users, 13 games, 2 events
npm run dev                   # http://localhost:3000
```

Generate the two required secrets:

```bash
openssl rand -base64 32       # BETTER_AUTH_SECRET
openssl rand -base64 32       # INVITE_ENCRYPTION_KEY
```

### Demo accounts

The seed creates five users, all with the password `meeple-night-demo`:

| Email               | Role in the demo                                            |
| ------------------- | ----------------------------------------------------------- |
| `ada@example.com`   | Organizer of "Thursday board games", can teach Pandemic     |
| `sam@example.com`   | Attending, brings the heavier games, wants something new    |
| `kai@example.com`   | Attending, wants something light and short                  |
| `rosa@example.com`  | Answered Maybe, so does not count toward the table by default |
| `bo@example.com`    | Has not responded yet                                        |

Sign in as Ada to see the organizer view, including recommendations and the lock-in controls.

---

## Requirements

- **Node.js 20.9 or newer.** The project is pinned to a toolchain that runs on Node 20.12:
  Prisma 6, Vitest 3 and ESLint 9. On Node 20.19+ you can move to Prisma 7, Vitest 5 and
  ESLint 10 if you want to; nothing in the application code depends on the older majors.
- **PostgreSQL 14 or newer.** `docker compose up -d` provides one; any Postgres will do.
- **Docker** only for the local database. The application itself is deployment-provider
  agnostic — it is a standard Next.js app that needs `DATABASE_URL` and the two secrets.

---

## Environment variables

Everything is validated on boot by `src/lib/env.ts`, which is `server-only`: none of these
can reach browser code.

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string. |
| `BETTER_AUTH_SECRET` | yes | — | Signs Better Auth cookies and tokens. At least 32 characters. |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` | Public origin. Used for cookies and to build invite links. |
| `INVITE_ENCRYPTION_KEY` | yes | — | 32-byte base64 key. Encrypts invite tokens at rest (AES-256-GCM). |
| `BGG_ENABLED` | no | `true` | `false` swaps in the bundled offline catalog. The app is fully usable either way. |
| `BGG_BASE_URL` | no | `https://boardgamegeek.com/xmlapi2` | BGG XML API2 base URL. |
| `BGG_API_TOKEN` | no | empty | Only needed if you front BGG with an authenticated proxy. Sent as a bearer header, server-side only. |
| `BGG_USER_AGENT` | no | `MeepleNight/0.1 (…)` | Contact string BGG asks API users to send. Put a real contact address here. |
| `BGG_MIN_REQUEST_INTERVAL_MS` | no | `2000` | Minimum gap between outbound BGG requests. |
| `BGG_TIMEOUT_MS` | no | `15000` | Per-request timeout. |
| `BGG_CACHE_TTL_HOURS` | no | `168` | How long cached game metadata stays fresh. |

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | `prisma generate` then a production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint 9, flat config. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest unit and integration tests. |
| `npm run test:e2e` | Playwright, against a production build with BGG disabled. |
| `npm run verify` | lint + typecheck + test + build, in that order. |
| `npm run db:up` / `db:down` | Start/stop the local PostgreSQL container. |
| `npm run db:migrate` | Create and apply a migration in development. |
| `npm run db:deploy` | Apply existing migrations (what you want in CI and production). |
| `npm run db:seed` | Load the demo scenario. Safe to re-run; it clears what it owns first. |
| `npm run db:reset` | Drop, re-migrate and re-seed. |
| `npm run setup` | install + generate + deploy + seed, in one go. |

Playwright needs its browser once: `npx playwright install chromium`.

---

## Architecture

```
src/
  domain/            Pure TypeScript. No Prisma, no Next, no I/O.
    recommendation/    The scoring engine and the "Pick for us" draw.
    catalog/           GameCatalogProvider interface, BGG XML parsers, offline fixtures.
  lib/               Server-only infrastructure: env, Prisma, auth, authz, crypto,
                     rate limiting, validation, the BGG HTTP adapter.
  server/            Database-facing read models and server actions.
  components/        UI. Server components by default; 'use client' only where needed.
  app/               Next.js App Router pages and route handlers.
prisma/              Schema, migrations, seed.
tests/               Vitest.
e2e/                 Playwright.
```

### Decisions worth knowing

**The recommendation engine is a pure function.** `recommendGames(input)` takes plain data and
returns plain data. It imports nothing from Prisma or Next, which is why it can be tested
exhaustively without a database. `src/server/recommendations.ts` is the only thing that knows
how to turn database rows into that input.

**Authorization is enforced on the server, in one place.** `src/lib/authz.ts` holds every rule.
`assertMember` and `assertOrganizer` are called by every server action; the event layout calls
`getEventForMember`, so no child page can render for a non-member even if it forgot to check.
A non-member and a non-existent event both produce a 404, so private event ids are not
enumerable. The UI hiding a button is a convenience, never the control.

**Invite tokens are stored twice, deliberately.** The database keeps a SHA-256 hash (the lookup
key, so a leaked dump is not a set of working invites) and an AES-256-GCM ciphertext (so the
organizer can re-copy the link without plaintext sitting at rest). Tokens are 32 random bytes,
optionally expiring, optionally use-limited, and revocable.

**Owning a game is not offering it.** `UserGame` records what you own and whether it is
currently available; `EventGameOffer` is an explicit, per-event promise to bring it. Only games
with at least one offer from a *Yes* attendee enter the candidate pool. This is enforced in the
engine's hard rules, not just in the UI.

**Expansions are never standalone.** `GameRelation` records the expansion → base game link from
BGG. An expansion is only eligible when its base game is also being brought, and the reason
names the base game either way.

**Missing data reduces confidence, it does not crash.** Every BGG field is optional. A game with
no weight, no rating and no player poll still scores, still ranks, and carries explicit warnings
plus a reduced `confidence` figure. There are tests for each of those paths.

**Deliberate snapshot.** `EventSelection.primaryScoreSnapshot` records the score at lock time so
the "Tonight" view stays stable if RSVPs change afterwards. It is the only derived value stored.

### How a game is scored

Six components, 100 points total, all configurable in
`src/domain/recommendation/constants.ts`:

| Component | Max | Basis |
| --- | ---: | --- |
| Player-count suitability | 25 | Community "Best"/"Recommended" polls for the target count, falling back to the box range. |
| Complexity fit | 25 | 70% how many attendees' stated ranges the weight falls inside, 30% closeness to the organizer's target. |
| Duration fit | 15 | Fraction of attendees whose stated time limit the game respects, with a 15-minute grace band. |
| Specific requests | 20 | Full marks at two requests from counted attendees; a Maybe's request is worth half. |
| Community rating | 10 | BGG Bayesian rating, or the raw average shrunk toward 5.5 by vote count. |
| Someone can teach it | 5 | Full for a Yes attendee, half for a Maybe. |

Popularity is capped at 10 of 100 on purpose: a famous heavy game that suits nobody at the table
loses to a modest one that fits, and there is a test that says so.

Four hard rules gate eligibility before any of that runs: a Yes attendee must have offered it,
the target player count must be inside its range, an expansion needs its base game present, and
it must not exceed the organizer's hard time limit. Anything that fails lands in **near misses**
with the specific reason, rather than silently disappearing.

---

## BoardGameGeek

Game data comes from the **documented [BGG XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2)**
and nothing else.

- All requests are made server-side, through a single process-wide queue with a configurable
  minimum gap between calls.
- Detail lookups are batched to the documented limit of 20 ids per request.
- The collection endpoint answers `202` while it builds an export; we poll with bounded
  exponential backoff (2s, 4s, 8s, 16s, 30s) and then give up with a retryable error.
- Responses are parsed defensively. Missing statistics, absent years, `"4+"` poll buckets,
  single-item collections, `<errors>` documents, truncated XML and HTML error pages are all
  covered by tests.
- Metadata is cached in PostgreSQL with a TTL, and concurrent refreshes of the same id are
  deduplicated in-process, so ten simultaneous page loads produce one outbound request.
- Only items marked as owned are imported from a collection. **A BGG password is never
  requested or stored.**
- BGG's HTML is never scraped and undocumented JSON endpoints are never used.
- No BGG data is sent to any external LLM or third-party service.

**Attribution.** Every screen that shows BGG data carries a linked "Powered by BoardGameGeek"
credit, as their terms require.

**Licensing.** BoardGameGeek makes its data available for **non-commercial use**. Meeple Night
is a non-commercial tool and relies on the XML API2 on that basis. If you intend to run this
commercially you must contact BoardGameGeek and agree terms with them first. Please also set
`BGG_USER_AGENT` to a real contact address, and leave the request interval conservative.

### Running without BoardGameGeek

Set `BGG_ENABLED=false`. A `FixtureCatalogProvider` takes over behind the same
`GameCatalogProvider` interface, serving a small offline catalog. Search, collection import
(usernames `demo` and `heavygamer`) and manual game entry all keep working, and the UI says
plainly which catalog it is using. The Playwright suite runs this way, so "works without BGG" is
verified rather than asserted.

If BGG is enabled but unreachable, search still returns locally cached games alongside a clear
explanation, and manual entry is offered as the way forward.

---

## Accessibility

- Semantic landmarks, a skip link, and a heading hierarchy that matches the page structure.
- Every control is keyboard operable, with a 3px focus ring that is never removed.
- RSVP states carry a distinct glyph and their own word as well as a colour, so they survive
  greyscale, colour-blindness and screen readers.
- Score breakdowns are real `<table>` elements with row headers; the bars are decorative and
  every number they encode is also written out.
- Form errors are associated with their inputs via `aria-describedby`; action results are
  announced through polite live regions without stealing focus.
- Layout is mobile-first and reflows to a single column; `prefers-reduced-motion` is respected.

---

## Testing

```bash
npm test          # 151 unit and integration tests
npm run test:e2e  # 7 end-to-end tests
```

The unit suite covers the recommendation engine (eligibility, every score component,
determinism, missing-data handling), the "Pick for us" draw, BGG XML parsing against recorded
fixtures, the BGG HTTP adapter (batching, 202 backoff, throttling, error translation),
authorization, invite lifecycle, and validation including timezone conversion.

The Playwright suite runs against a production build with `BGG_ENABLED=false` and covers the
full two-person journey, privacy boundaries, role boundaries, duplicate joins and imports, and
invite revocation. `e2e/global-setup.ts` clears the rate-limit counters before the run so the
limiter keeps its real production strength without blocking repeated runs.

---

## Deliberately out of scope

Date polling, multiple simultaneous tables, chat, push notifications, calendar integration and
payments are all out of the MVP by design.

Two things are stubbed rather than built:

- **Discovery ("Discover for next time")** is a clearly marked placeholder on the
  recommendations page. The provider and engine interfaces are shaped so it can later be filled
  from a cached, approved candidate catalog filtered by player count, duration, weight and
  quality. It is kept separate from the "play tonight" ranking on purpose, and anything shown
  there will be labelled "Nobody currently owns this".
- **Email delivery.** Accounts are usable immediately; there is no verification or password-reset
  email. Better Auth is already configured for it, so adding a mailer is a small change.
