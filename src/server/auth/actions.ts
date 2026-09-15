'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { db } from '@/lib/db'
import { Role } from '@/generated/prisma/enums'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { createSession, destroySession } from '@/server/auth/session'

export interface AuthFormState {
  error?: string
  fieldErrors?: Record<string, string[]>
  /**
   * What the user typed, echoed back so the form can repopulate itself.
   *
   * React resets an uncontrolled form once its action resolves, so without
   * this a rejected login would silently wipe the email field and make the
   * user retype it. Passwords are deliberately never echoed.
   */
  values?: { email?: string; name?: string; organization?: string }
}

const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

const SignupSchema = z.object({
  name: z.string().min(2, 'Enter your name').max(80),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200, 'That is longer than 200 characters'),
  organization: z.string().min(2, 'Name your organization').max(60),
})

/**
 * A bcrypt hash of a value nobody can supply. Compared against when the email
 * is unknown, so a request for a non-existent account takes the same ~250ms as
 * a real one and cannot be distinguished by timing.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7Q6cKUOmU8EdDsUFHCbqO1tgcKmz/3O'

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  const submittedEmail = String(formData.get('email') ?? '')

  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values: { email: submittedEmail },
    }
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, passwordHash: true },
  })

  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH)

  // One message for both "no such user" and "wrong password": anything more
  // specific turns the login form into an account-enumeration oracle.
  if (!user || !valid) {
    return { error: 'Email or password is incorrect.', values: { email: submittedEmail } }
  }

  await createSession({ userId: user.id, email: user.email })

  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    select: { org: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  })

  redirect(membership ? `/${membership.org.slug}` : '/onboarding')
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    organization: formData.get('organization'),
  })

  const submitted = {
    email: String(formData.get('email') ?? ''),
    name: String(formData.get('name') ?? ''),
    organization: String(formData.get('organization') ?? ''),
  }

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: submitted }
  }

  const email = parsed.data.email.toLowerCase()

  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return {
      fieldErrors: { email: ['An account with this email already exists'] },
      values: submitted,
    }
  }

  const slug = await uniqueSlug(parsed.data.organization)

  // One transaction: a user without an org, or an org without an owner, would
  // both be unreachable states for the rest of the app.
  const { user, orgSlug } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true },
    })

    const org = await tx.organization.create({
      data: {
        name: parsed.data.organization,
        slug,
        memberships: { create: { userId: user.id, role: Role.OWNER } },
        projects: {
          create: {
            name: 'Default',
            key: 'default',
            environments: {
              create: [
                { key: 'development', name: 'Development', color: '#22c55e', sortOrder: 0 },
                { key: 'staging', name: 'Staging', color: '#f59e0b', sortOrder: 1 },
                { key: 'production', name: 'Production', color: '#ef4444', sortOrder: 2 },
              ],
            },
          },
        },
      },
      select: { slug: true },
    })

    return { user, orgSlug: org.slug }
  })

  await createSession({ userId: user.id, email: user.email })
  redirect(`/${orgSlug}`)
}

export async function logout(): Promise<never> {
  await destroySession()
  redirect('/login')
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Slugs are in the URL, so they have to be unique org-wide. The unique index
 * on Organization.slug is the real guarantee; this just picks a candidate that
 * usually avoids hitting it.
 */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'org'

  const taken = await db.organization.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  })
  const used = new Set(taken.map((o) => o.slug))

  if (!used.has(base)) return base

  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) return candidate
  }

  return `${base}-${Date.now()}`
}
