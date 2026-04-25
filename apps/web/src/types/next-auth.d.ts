import 'next-auth';
import 'next-auth/jwt';

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: UserRole;
      emailVerified: string | null;
      locale?: string | null;
    };
  }

  interface User {
    role?: UserRole;
    emailVerified?: string | null;
    locale?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
    emailVerified?: string | null;
  }
}
