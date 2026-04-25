import NextAuth, { type DefaultSession, type NextAuthConfig, type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { SignJWT, jwtVerify } from 'jose';
import { env, getJwtSecretBytes } from './env';

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

interface InternalUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: string | null;
  locale: string | null;
}

interface LoginResponse {
  user: InternalUser;
}

async function loginViaApi(email: string, password: string): Promise<InternalUser | null> {
  const res = await fetch(`${env.API_URL}/internal/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    let code = 'invalid_credentials';
    try {
      const body = (await res.json()) as { error?: { code?: string } };
      if (body?.error?.code) code = body.error.code;
    } catch {
      // ignore
    }
    // Surface a stable code to NextAuth for the UI to translate.
    throw new Error(code);
  }

  const data = (await res.json()) as LoginResponse;
  return data.user;
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: env.AUTH_JWT_ACCESS_TTL },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;
        const user = await loginViaApi(email, password);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          locale: user.locale,
        };
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  jwt: {
    // Custom HS256 encoder — emits a token that the NestJS API
    // can validate with the same shared secret.
    async encode({ token }) {
      if (!token) throw new Error('No token to encode');
      const sub = (token.sub as string | undefined) ?? '';
      const role = ((token as { role?: UserRole }).role ?? 'USER') as UserRole;
      const emailVerified = (token as { emailVerified?: string | null }).emailVerified ?? null;
      const email = (token as { email?: string | null }).email ?? null;
      const name = (token as { name?: string | null }).name ?? null;

      return await new SignJWT({
        role,
        emailVerified,
        email,
        name,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(sub)
        .setIssuer(env.AUTH_JWT_ISSUER)
        .setAudience(env.AUTH_JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${env.AUTH_JWT_ACCESS_TTL}s`)
        .sign(getJwtSecretBytes());
    },
    async decode({ token }) {
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
          issuer: env.AUTH_JWT_ISSUER,
          audience: env.AUTH_JWT_AUDIENCE,
        });
        return payload as Record<string, unknown> & {
          sub: string;
          role: UserRole;
          emailVerified: string | null;
        };
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // First sign-in (Credentials): user is provided.
      if (user) {
        const u = user as Partial<InternalUser> & { id?: string };
        if (u.id) token.sub = u.id;
        token.role = (u.role ?? 'USER') as UserRole;
        token.emailVerified = u.emailVerified ?? null;
        token.email = u.email ?? null;
        token.name = u.name ?? null;
      }
      // Google sign-in: bridge into our backend so we end up with a
      // local User row + role/emailVerified mirror in the JWT.
      // Stage 1: keep this minimal — if backend has the endpoint we use it,
      // otherwise we fall through with a USER role. The backend agent owns
      // /internal/auth/oauth-bridge; if not implemented yet, this is a no-op.
      if (account?.provider === 'google' && profile) {
        try {
          const res = await fetch(`${env.API_URL}/internal/auth/oauth-bridge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              provider: 'google',
              providerAccountId: account.providerAccountId,
              email: profile.email,
              name: profile.name,
            }),
            cache: 'no-store',
          });
          if (res.ok) {
            const data = (await res.json()) as { user?: InternalUser };
            if (data.user) {
              token.sub = data.user.id;
              token.role = data.user.role;
              token.emailVerified = data.user.emailVerified;
              token.email = data.user.email;
              token.name = data.user.name;
            }
          }
        } catch {
          // Backend may not implement the bridge yet; leave token as-is.
        }
      }
      return token;
    },
    async session({ session, token }) {
      // The session.user shape comes from a TS intersection of AdapterUser and
      // our augmented Session.user — emailVerified collapses to (Date & string)
      // which is uninhabited. Cast through unknown to assign our string-based
      // representation in the JWT strategy (no adapter / no DB User row).
      const u = session.user as unknown as {
        id: string;
        email: string;
        name?: string | null;
        role: UserRole;
        emailVerified: string | null;
      };
      if (token.sub) u.id = token.sub;
      if (token.email) u.email = token.email as string;
      if (token.name !== undefined) u.name = (token.name as string | null) ?? null;
      u.role = (token.role as UserRole | undefined) ?? 'USER';
      u.emailVerified = (token.emailVerified as string | null | undefined) ?? null;
      return session;
    },
    authorized({ auth }) {
      // Used by middleware; we do extra path-based checks there.
      return !!auth?.user;
    },
  },
};

const result: NextAuthResult = NextAuth(authConfig);

export const auth: NextAuthResult['auth'] = result.auth;
export const handlers: NextAuthResult['handlers'] = result.handlers;
export const signIn: NextAuthResult['signIn'] = result.signIn;
export const signOut: NextAuthResult['signOut'] = result.signOut;

export type { Session } from 'next-auth';
export type SessionUser = NonNullable<DefaultSession['user']> & {
  id: string;
  role: UserRole;
  emailVerified: string | null;
};
