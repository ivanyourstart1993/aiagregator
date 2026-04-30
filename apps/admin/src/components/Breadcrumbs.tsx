'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

interface Crumb {
  href: string;
  label: string;
}

/**
 * Derives breadcrumbs from pathname. /providers/accounts/[id] →
 * [Dashboard] / Providers / Accounts / {id}. The dashboard root
 * is always the first crumb. Locale prefix is stripped by usePathname.
 */
function deriveCrumbs(
  pathname: string,
  t: (key: string) => string,
): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  // Strip locale segment if present.
  if (segments[0] && /^[a-z]{2}$/.test(segments[0])) segments.shift();

  const crumbs: Crumb[] = [{ href: '/', label: t('dashboard') }];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += `/${segments[i]}`;
    const seg = segments[i] ?? '';
    // Try translation first; fall back to raw segment.
    let label = seg;
    try {
      label = t(`crumb.${seg}`);
    } catch {
      // pass
    }
    if (label === `crumb.${seg}`) label = seg; // missing key returns the key
    crumbs.push({ href: acc, label });
  }
  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const crumbs = deriveCrumbs(pathname, t);

  if (crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumbs"
      className="flex items-center gap-1 text-xs text-muted-foreground"
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={c.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            {isLast ? (
              <span className="font-medium text-foreground">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
