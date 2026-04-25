import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { auth } from './lib/auth';

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PATTERNS = [/^\/(?:[a-z]{2}\/)?(?:dashboard|admin)(?:\/.*)?$/];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATTERNS.some((re) => re.test(pathname));
}

function localeFromPath(pathname: string): string {
  const seg = pathname.split('/')[1];
  if (seg && (routing.locales as readonly string[]).includes(seg)) return seg;
  return routing.defaultLocale;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtected(pathname)) {
    const session = await auth();
    if (!session?.user) {
      const locale = localeFromPath(pathname);
      const loginPath = locale === routing.defaultLocale ? '/login' : `/${locale}/login`;
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Skip Next internals and API routes; everything else goes through next-intl.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
