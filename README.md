<p align="center">
  <img src="docs/logo.svg" width="76" alt="">
</p>

<h1 align="center">Switchboard</h1>

<p align="center">
  Feature flags with targeting rules, staged rollouts and an audit trail.<br>
  <sub>Next.js 16 · React 19 · TypeScript · Postgres · Prisma 7</sub>
</p>

<br>

Ship code behind a switch: turn it on for your own team, then 5% of traffic,
then everyone, with a record of who changed what. The name comes from the old
telephone switchboard, where an operator routed each call to the right line;
here the flags route each user to the right variant.

I wanted something that behaves like real software: several tenants, roles
that actually restrict things, and a screen whose state is awkward to manage.
The targeting engine is the part worth reading.

![The flags list, showing per-environment state](docs/screenshots/flags-list.jpg)

## Running it

You need Node 24 (`nvm use` reads the `.nvmrc`). No Docker: the database is
the local Postgres that Prisma runs for you. It takes two terminals.

1. Clone and install:

   ```bash
   git clone https://github.com/Brunoskyy/switchboard.git && cd switchboard
   nvm use
   npm install
   ```

2. **Terminal 1, from the repo root:** start the database and leave it running.
   It prints a `DATABASE_URL`.

   ```bash
   npm run db:dev
   ```

3. **Terminal 2, from the repo root:** create `.env`, paste that URL into
   `DATABASE_URL` and set `AUTH_SECRET` (any random string, for example the
   output of `openssl rand -base64 32`). Then migrate, seed and start the app:

   ```bash
   cp .env.example .env
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

4. Open http://localhost:3000 and sign in as `ana@northwind.test` /
   `switchboard123`. `diego@northwind.test` (same password) is a Viewer, for
   the read-only side of the UI.

To stop, press Ctrl+C in both terminals. `npm run db:reset` drops, migrates
and reseeds the database. Any hosted Postgres (Neon, Supabase) works too: put
its URL in `DATABASE_URL` and skip step 2.

| Command (repo root) | |
| --- | --- |
| `npm test` | the test suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:studio` | Prisma Studio |

## How targeting works

A flag holds one configuration per environment. The evaluator walks it top to
bottom:

1. Flag off? Serve the off variant.
2. Rules in order; the first one whose conditions all match wins.
3. Nothing matched? Serve the default, or bucket the context through a
   percentage rollout.

Conditions in a rule are ANDed; for OR, add another rule. Fifteen operators
cover strings, numbers, sets, presence and regex. Rollouts bucket on a Murmur3
hash, so the same user always lands in the same bucket, and you can bucket on
an attribute (an account id) to keep a whole account on one side of a split.

![The targeting editor with the live evaluator](docs/screenshots/targeting.jpg)

The panel on the right runs the same evaluator the server calls, against the
saved config, and answers "what would *this* user get, and why".

## Tests

88 tests, no database and no mocks, aimed at where the logic lives: operator
semantics, fail-closed behaviour on bad input, rollout stability, and a
distribution test that asserts a 10% rollout lands between 8.5% and 11.5% over
20k samples (it catches a hash that clusters). Also the targeting reducer, the
membership rules, SDK key generation and config diffing, where `jsonb`
reordering keys on write is a trap worth pinning down.

## Layout

```
src/
  lib/flags/       evaluation engine, pure
  lib/members/     who may change whom, pure
  server/          auth, tenancy, and the audited mutations
  components/ui/   primitives over Radix
  app/             routes
```

![The audit log](docs/screenshots/audit-log.jpg)

## What's missing

- No SDK yet: the evaluator is ready to be extracted, but nothing delivers
  config to clients, so SDK keys exist without an endpoint to use them.
- Members must already have an account; there are no email invitations.
- Environments can't be added or renamed after a project is created.
- No scheduled or approval-gated changes.
