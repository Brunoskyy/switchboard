import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

import { PrismaClient } from '../src/generated/prisma/client'
import { AuditAction, FlagType, Role } from '../src/generated/prisma/enums'

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/** Everyone in the demo org shares this password. Dev fixture only. */
const DEMO_PASSWORD = 'switchboard123'

const ENVIRONMENTS = [
  { key: 'development', name: 'Development', color: '#22c55e', sortOrder: 0 },
  { key: 'staging', name: 'Staging', color: '#f59e0b', sortOrder: 1 },
  { key: 'production', name: 'Production', color: '#ef4444', sortOrder: 2 },
]

const PEOPLE = [
  { email: 'ana@northwind.test', name: 'Ana Ribeiro', role: Role.OWNER, color: '#6366f1' },
  { email: 'bruno@northwind.test', name: 'Bruno Salles', role: Role.ADMIN, color: '#ec4899' },
  { email: 'carla@northwind.test', name: 'Carla Menezes', role: Role.MEMBER, color: '#14b8a6' },
  { email: 'diego@northwind.test', name: 'Diego Prado', role: Role.VIEWER, color: '#f97316' },
]

const BOOLEAN_VARIANTS = [
  { key: 'off', name: 'Off', value: false, sortOrder: 0 },
  { key: 'on', name: 'On', value: true, sortOrder: 1 },
]

async function main() {
  console.log('Resetting demo data...')
  // Ordered by dependency; cascades cover the rest.
  await db.auditEvent.deleteMany()
  await db.flagConfig.deleteMany()
  await db.variant.deleteMany()
  await db.flag.deleteMany()
  await db.sdkKey.deleteMany()
  await db.environment.deleteMany()
  await db.project.deleteMany()
  await db.membership.deleteMany()
  await db.organization.deleteMany()
  await db.user.deleteMany()

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  const users = await Promise.all(
    PEOPLE.map((person) =>
      db.user.create({
        data: {
          email: person.email,
          name: person.name,
          passwordHash,
          avatarColor: person.color,
        },
      }),
    ),
  )

  const org = await db.organization.create({
    data: { name: 'Northwind', slug: 'northwind' },
  })

  await db.membership.createMany({
    data: users.map((user, i) => ({
      userId: user.id,
      orgId: org.id,
      role: PEOPLE[i].role,
    })),
  })

  const project = await db.project.create({
    data: {
      name: 'Web App',
      key: 'web-app',
      orgId: org.id,
      environments: { create: ENVIRONMENTS },
    },
    include: { environments: true },
  })

  const envByKey = Object.fromEntries(project.environments.map((e) => [e.key, e]))

  const [ana, bruno, carla] = users

  // --- new-checkout: a staged rollout, further along in each environment ----
  const newCheckout = await db.flag.create({
    data: {
      key: 'new-checkout',
      name: 'New checkout flow',
      description: 'Single-page checkout replacing the three-step wizard.',
      type: FlagType.BOOLEAN,
      tags: ['checkout', 'revenue'],
      projectId: project.id,
      createdById: ana.id,
      variants: { create: BOOLEAN_VARIANTS },
    },
  })

  await db.flagConfig.createMany({
    data: [
      {
        flagId: newCheckout.id,
        environmentId: envByKey.development.id,
        enabled: true,
        defaultVariantKey: 'on',
        offVariantKey: 'off',
        rules: [],
      },
      {
        flagId: newCheckout.id,
        environmentId: envByKey.staging.id,
        enabled: true,
        defaultVariantKey: 'on',
        offVariantKey: 'off',
        rules: [],
      },
      {
        flagId: newCheckout.id,
        environmentId: envByKey.production.id,
        enabled: true,
        defaultVariantKey: 'off',
        offVariantKey: 'off',
        rules: [
          {
            id: 'rule-internal',
            description: 'Always on for the team',
            conditions: [
              { attribute: 'email', operator: 'ends_with', values: ['@northwind.test'] },
            ],
            serve: { variantKey: 'on' },
          },
          {
            id: 'rule-beta',
            description: 'Beta programme accounts',
            conditions: [{ attribute: 'segments', operator: 'in', values: ['beta'] }],
            serve: { variantKey: 'on' },
          },
        ],
        rollout: {
          seed: 'new-checkout-2026-q1',
          bucketBy: 'accountId',
          buckets: [
            { variantKey: 'on', weight: 25 },
            { variantKey: 'off', weight: 75 },
          ],
        },
      },
    ],
  })

  // --- checkout-theme: multivariate experiment -----------------------------
  const theme = await db.flag.create({
    data: {
      key: 'checkout-theme',
      name: 'Checkout button treatment',
      description: 'Three-way test on the primary CTA.',
      type: FlagType.STRING,
      tags: ['checkout', 'experiment'],
      projectId: project.id,
      createdById: carla.id,
      variants: {
        create: [
          { key: 'control', name: 'Control (blue)', value: 'blue', sortOrder: 0 },
          { key: 'treatment-a', name: 'Treatment A (green)', value: 'green', sortOrder: 1 },
          { key: 'treatment-b', name: 'Treatment B (high contrast)', value: 'contrast', sortOrder: 2 },
        ],
      },
    },
  })

  await db.flagConfig.createMany({
    data: [
      {
        flagId: theme.id,
        environmentId: envByKey.development.id,
        enabled: true,
        defaultVariantKey: 'treatment-a',
        offVariantKey: 'control',
        rules: [],
      },
      {
        flagId: theme.id,
        environmentId: envByKey.staging.id,
        enabled: false,
        defaultVariantKey: 'control',
        offVariantKey: 'control',
        rules: [],
      },
      {
        flagId: theme.id,
        environmentId: envByKey.production.id,
        enabled: true,
        defaultVariantKey: 'control',
        offVariantKey: 'control',
        rules: [],
        rollout: {
          seed: 'theme-test-01',
          buckets: [
            { variantKey: 'control', weight: 34 },
            { variantKey: 'treatment-a', weight: 33 },
            { variantKey: 'treatment-b', weight: 33 },
          ],
        },
      },
    ],
  })

  // --- a few more flags so the list has texture ----------------------------
  const extras = [
    {
      key: 'dark-mode',
      name: 'Dark mode',
      description: 'User-selectable dark theme.',
      type: FlagType.BOOLEAN,
      tags: ['ui'],
      enabledIn: ['development', 'staging', 'production'],
      createdById: bruno.id,
    },
    {
      key: 'ai-support-agent',
      name: 'AI support agent',
      description: 'Replaces the contact form with a chat agent.',
      type: FlagType.BOOLEAN,
      tags: ['support', 'ai'],
      enabledIn: ['development'],
      createdById: bruno.id,
    },
    {
      key: 'bulk-export',
      name: 'Bulk CSV export',
      description: 'Async export of the orders table.',
      type: FlagType.BOOLEAN,
      tags: ['reporting'],
      enabledIn: ['development', 'staging'],
      createdById: carla.id,
    },
  ]

  for (const extra of extras) {
    const flag = await db.flag.create({
      data: {
        key: extra.key,
        name: extra.name,
        description: extra.description,
        type: extra.type,
        tags: extra.tags,
        projectId: project.id,
        createdById: extra.createdById,
        variants: { create: BOOLEAN_VARIANTS },
      },
    })

    await db.flagConfig.createMany({
      data: ENVIRONMENTS.map((env) => ({
        flagId: flag.id,
        environmentId: envByKey[env.key].id,
        enabled: extra.enabledIn.includes(env.key),
        defaultVariantKey: extra.enabledIn.includes(env.key) ? 'on' : 'off',
        offVariantKey: 'off',
        rules: [],
      })),
    })
  }

  // An archived flag, to exercise the archived filter.
  const legacy = await db.flag.create({
    data: {
      key: 'legacy-search',
      name: 'Legacy search backend',
      description: 'Kill switch for the pre-Elasticsearch search. Retired.',
      type: FlagType.BOOLEAN,
      tags: ['search', 'deprecated'],
      archived: true,
      projectId: project.id,
      createdById: ana.id,
      variants: { create: BOOLEAN_VARIANTS },
    },
  })

  await db.flagConfig.createMany({
    data: ENVIRONMENTS.map((env) => ({
      flagId: legacy.id,
      environmentId: envByKey[env.key].id,
      enabled: false,
      defaultVariantKey: 'off',
      offVariantKey: 'off',
      rules: [],
    })),
  })

  // --- audit trail ---------------------------------------------------------
  const now = Date.now()
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000)

  await db.auditEvent.createMany({
    data: [
      {
        orgId: org.id,
        actorId: ana.id,
        action: AuditAction.CREATED,
        entityType: 'Flag',
        entityId: newCheckout.id,
        entityLabel: 'new-checkout',
        createdAt: hoursAgo(72),
      },
      {
        orgId: org.id,
        actorId: bruno.id,
        action: AuditAction.TOGGLED,
        entityType: 'FlagConfig',
        entityId: newCheckout.id,
        entityLabel: 'new-checkout',
        environmentKey: 'staging',
        diff: { enabled: { from: false, to: true } },
        createdAt: hoursAgo(30),
      },
      {
        orgId: org.id,
        actorId: carla.id,
        action: AuditAction.RULES_CHANGED,
        entityType: 'FlagConfig',
        entityId: newCheckout.id,
        entityLabel: 'new-checkout',
        environmentKey: 'production',
        diff: { rules: { from: 1, to: 2 } },
        createdAt: hoursAgo(8),
      },
      {
        orgId: org.id,
        actorId: ana.id,
        action: AuditAction.ROLLOUT_CHANGED,
        entityType: 'FlagConfig',
        entityId: newCheckout.id,
        entityLabel: 'new-checkout',
        environmentKey: 'production',
        diff: { rollout: { from: '10%', to: '25%' } },
        createdAt: hoursAgo(3),
      },
      {
        orgId: org.id,
        actorId: ana.id,
        action: AuditAction.ARCHIVED,
        entityType: 'Flag',
        entityId: legacy.id,
        entityLabel: 'legacy-search',
        createdAt: hoursAgo(1),
      },
    ],
  })

  console.log(`Seeded org "${org.slug}" with ${users.length} users and 6 flags.`)
  console.log(`Sign in as ${PEOPLE[0].email} / ${DEMO_PASSWORD}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
