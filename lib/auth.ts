import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/sign-in',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email).toLowerCase().trim() },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!valid) return null;
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        const userId = (token.id as string) ?? '';
        session.user.id = userId;
        // Re-validate the role against the DB rather than trusting the JWT, so
        // a demoted/suspended admin loses access immediately instead of at
        // token expiry. Falls back to the token value if the lookup fails.
        let role = (token.role as string) ?? 'USER';
        if (userId) {
          try {
            const fresh = await prisma.user.findUnique({
              where: { id: userId },
              select: { role: true, accountStatus: true },
            });
            if (fresh) {
              role = fresh.accountStatus === 'SUSPENDED' ? 'USER' : fresh.role;
            }
          } catch {
            /* keep token role on transient DB error */
          }
        }
        session.user.role = role;
      }
      return session;
    },
  },
  trustHost: true,
});
