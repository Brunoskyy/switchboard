# Switchboard

A multi-tenant feature flag platform: targeting rules, staged rollouts,
per-environment configuration and an audit trail.

Built as a portfolio piece to show front-end work at depth — complex interactive
state, accessibility, optimistic updates and a tested pure-logic core — on top
of a backend that is real rather than mocked.

---

## What it does

- **Per-environment configuration.** One flag has independent state in
  Development, Staging and Production. The selected environment lives in the
  URL, so a link to a production flag is shareable.
- **Targeting rules.** Ordered rules, first match wins. Conditions are ANDed
  inside a rule; 15 operators covering strings, numbers, sets, presence and
  regex.
- **Staged rollouts.** Deterministic percentage bucketing, optionally by an
  attribute like `accountId` so whole accounts move together instead of
  individual users.
- **Multivariate flags.** Not just booleans — string, number and JSON variants
  for A/B/n tests.
- **Roles.** Owner / Admin / Member / Viewer, enforced server-side on every
  mutation, reflected in the UI so a Viewer sees why a control is disabled.
- **Audit trail.** Who changed what, in which environment, with a before/after
  diff. Filterable by action, environment and person, all held in the URL.
- **SDK keys.** Generated per environment, shown once, stored only as a hash,
  revocable.

## Running it

Requires Node 24 (`.nvmrc` is provided; `nvm use` picks it up).

```bash
nvm use
npm install

# Starts a local Postgres — no Docker or system install needed.
# It prints DATABASE_URL and SHADOW_DATABASE_URL; paste both into .env.
npm run db:dev

cp .env.example .env     # then fill in the two URLs and AUTH_SECRET

npm run db:migrate
npm run db:seed
npm run dev
```

Sign in with `ana@northwind.test` / `switchboard123`. The seed creates four
users with different roles — sign in as `diego@northwind.test` (same password)
to see the read-only Viewer experience.

Any Postgres works instead of `db:dev`; drop a Neon, Supabase or RDS URL into
`DATABASE_URL` and the rest is unchanged.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate and re-seed |

## How it is put together

```
src/
  lib/flags/       Evaluation engine — pure, dependency-free, unit tested
    types.ts       The targeting model
    hash.ts        Murmur3 bucketing
    evaluate.ts    The evaluator
    schema.ts      Zod schemas guarding the Json columns
  lib/members/     Who may change whom — pure, unit tested
  server/
    auth/          Password hashing, JWT session cookie, auth actions
    tenancy/       Org scoping and the permission model
    flags/         Mutations, each one scoped + permission-checked + audited
    members/       Role changes and removals
    settings/      Org, projects and SDK key generation
  components/
    ui/            Primitives over Radix
    flags/         Feature components
  app/             Routes (App Router)
```

### Decisions worth explaining

**The evaluator never throws.** A flag platform whose client can crash the
application it is embedded in is worse than one that is briefly wrong. A
malformed config degrades to the off variant and reports `reason: 'ERROR'`, so
the caller always gets a value and the mistake is still visible.

**Tolerant evaluator, strict writes.** Because the evaluator degrades instead of
rejecting, it cannot be what keeps the database clean. Every write path runs the
payload through Zod (`src/lib/flags/schema.ts`) before it reaches Prisma, and
`updateTargeting` additionally cross-checks that every variant key a rule
references actually exists on the flag — a relationship a schema cannot express.

**Tenant scoping is centralised, not per-query.** `requireOrg` and
`requireProject` resolve the tenant from the URL slug *through the caller's
membership*, and every later query filters on the resolved id. No mutation ever
accepts an org or project id from the client. A missing membership returns 404
rather than 403, because "this org exists but you cannot see it" leaks the
customer list.

**The last owner cannot be removed or demoted.** That rule, and the rest of
who-may-change-whom, lives in `src/lib/members/rules.ts` as pure functions
rather than inline in a handler — an organization locking itself out is the
kind of bug that only shows up on the path nobody reads. The count that guards
it is read inside the same transaction as the write, so two owners leaving
simultaneously cannot both see a count of two and both succeed. The UI runs the
same functions, but only to explain a disabled control; the server check is the
one that decides.

**SDK keys are hashed with SHA-256, not bcrypt.** bcrypt exists to make
low-entropy secrets — passwords people choose — expensive to brute force. A
generated key carries 256 bits of CSPRNG entropy, so there is nothing to brute
force and a slow hash would only tax every SDK request. Passwords in this same
app do use bcrypt, for the opposite reason.

**Bucketing is Murmur3, not a cryptographic hash.** It has to be deterministic
across the server, the SDK and the UI preview, and uniform enough that a 10%
rollout really is ~10% — both of which Murmur3 gives at a fraction of the cost.
It is not collision-resistant and is never used for anything security-bearing.
There is a distribution test asserting the 10% case lands within 8.5–11.5%,
which is what catches a hash that clusters.

**Sessions are stateless JWTs.** This buys edge-compatible middleware and no
database round trip per request, and costs per-session revocation; the window is
capped at seven days. Adding a `tokenVersion` column on `User` and checking it
in `readSession` is the smallest change that restores "sign out everywhere" —
noted in the code at the point where it would go.

**Optimistic toggles revert themselves.** `useOptimistic` holds the pending
value only for the life of the transition. When the route revalidates, server
state becomes the source of truth again, so a rejected write snaps back with no
rollback code — only the reason has to be surfaced.

### Accessibility

Not a retrofit; it is the reason several components are shaped the way they are.

- Interactive components are built on Radix primitives, so focus management,
  escape handling and ARIA wiring are correct rather than approximated.
- `Field` uses a render-prop specifically so `aria-invalid` and
  `aria-describedby` cannot be forgotten at a call site.
- Disabled controls keep an explanation reachable — a `Viewer` hovering a
  locked toggle is told why, through a wrapper, because a disabled control
  receives no pointer events of its own.
- Focus rings are `:focus-visible` only; `aria-current` marks the active nav
  item; a skip link bypasses the sidebar; search results announce through a
  live region; `prefers-reduced-motion` is honoured globally.

## Tests

```bash
npm test
```

75 tests, all against pure modules — no database, no rendering, no mocks:

- **The evaluator.** Operator semantics including array attributes and the
  negative-operator case (`not_in` means *none of these*), fail-closed
  behaviour on invalid regex and non-numeric comparisons, rollout stability and
  distribution, and the degradation paths that must never throw.
- **The targeting reducer.** Rule ordering is behaviour, not decoration, and
  rollout weights have an invariant (exactly 100) worth asserting directly.
- **Membership rules.** Every way an org could lock itself out.
- **SDK key generation.** Uniqueness, prefix handling, and that a near miss
  fails rather than matching on a prefix.

## Known gaps

Honest list of what a production deployment would still need:

- No SDK yet. The evaluator is written to be extracted into one (pure, no
  imports from the app), but the delivery layer — polling or streaming config to
  clients — is not built.
- SDK keys can be created and revoked, but nothing authenticates against them
  yet — there is no public evaluation endpoint for them to open.
- No scheduled or approval-gated changes.
- Adding a member requires them to already have an account. Emailed invitations
  are not built, and the dialog says so rather than pretending otherwise.
- Environments are created with a project and cannot yet be added or renamed.
