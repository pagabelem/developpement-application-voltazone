import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const p = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
        if (!p.success) return null;
        const u = await prisma.user.findUnique({ where: { email: p.data.email.toLowerCase() } });
        if (!u || !u.active) return null;
        if (!(await bcrypt.compare(p.data.password, u.passwordHash))) return null;
        return { id: u.id, name: u.name, email: u.email, role: u.role, lot: u.lot } as any;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        (token as any).role = (user as any).role;
        (token as any).lot = (user as any).lot;
      }
      return token;
    },
    session({ session, token }) {
      const u = session.user as any;
      u.id = token.id;
      u.role = (token as any).role;
      u.lot = (token as any).lot;
      return session;
    },
  },
});