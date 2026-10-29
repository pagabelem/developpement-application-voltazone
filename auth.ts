import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { Lot, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'

declare module 'next-auth' {
  interface User {
    role: Role
    lot: Lot | null
  }
  interface Session {
    user: { id: string; name: string; email: string; role: Role; lot: Lot | null }
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const isProduction = process.env.NODE_ENV === 'production'

// L'aperçu v0 est servi dans une iframe : les cookies doivent être SameSite=None; Secure en développement.
const cookieOptions = { httpOnly: true, sameSite: 'none' as const, secure: true, path: '/' }

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? (isProduction ? undefined : 'voltazone-dev-only-secret-change-me'),
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/connexion' },
  cookies: isProduction
    ? undefined
    : {
        sessionToken: { name: 'voltazone.session', options: cookieOptions },
        csrfToken: { name: 'voltazone.csrf', options: cookieOptions },
        callbackUrl: { name: 'voltazone.callback', options: { ...cookieOptions, httpOnly: false } },
      },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) throw new CredentialsSignin()
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
        if (!user || !user.active || user.deletedAt) throw new CredentialsSignin()
        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) throw new CredentialsSignin()
        return { id: user.id, name: user.name, email: user.email, role: user.role, lot: user.lot }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.role = user.role
        token.lot = user.lot
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.uid as string
      session.user.role = token.role as Role
      session.user.lot = (token.lot as Lot | null) ?? null
      return session
    },
  },
})
