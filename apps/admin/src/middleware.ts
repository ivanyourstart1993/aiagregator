import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { auth } from './lib/auth';

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATTERNS = [/^\/(?:[a-z]{2}\/)?login(?:\/.*)?$/];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

function localeFromPath(pathname: string): string {
  const seg = pathname.split('/')[1];
  if (seg && (routing.locales as readonly string[]).includes(seg)) return seg;
  return routing.defaultLocale;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Everything except /login requires session with admin role.
  if (!isPublic(pathname)) {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user || (role !== 'ADMIN' && role !== 'SUPER_ADMIN')) {
      const locale = localeFromPath(pathname);
      const loginPath = locale === routing.defaultLocale ? '/login' : `/${locale}/login`;
      // strip locale from callbackUrl so router.push doesn't double-prefix it
      const stripped = pathname.replace(
        new RegExp(`^/(?:${(routing.locales as readonly string[]).join('|')})(?=/|$)`),
        '',
      );
      const callbackUrl = stripped || pathname;
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.search = `?callbackUrl=${encodeURIComponent(callbackUrl)}`;
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|txt|xml|json|woff2?|ttf|eot)$).*)',
  ],
};
