import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/db";
import { ensureDefaultOrgForUser } from "@/lib/tenancy";

/**
 * Auth.js v5 configuration.
 *
 * PROVENANCE: the target gates /overview behind a redirect to /login with a
 * `callbackUrl` query parameter — the standard NextAuth pattern — and offers
 * Google sign-in. We therefore implement equivalent behavior on Auth.js v5.
 *
 * Session strategy: database sessions (server-revocable, standard for
 * org-scoped SaaS). Tokens live in the Session table; the cookie is HttpOnly.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies e-mail ownership, so linking by e-mail is safe here.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      // Optional allowlist: when AUTH_ALLOWED_EMAILS is set, only those e-mails may sign in.
      const allowed = (process.env.AUTH_ALLOWED_EMAILS ?? "")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (allowed.length > 0 && !allowed.includes(user.email.toLowerCase())) return false;
      // Bootstrap tenancy on first login: default org + OWNER if allowlisted.
      await ensureDefaultOrgForUser(user.email, user.name ?? null);
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
