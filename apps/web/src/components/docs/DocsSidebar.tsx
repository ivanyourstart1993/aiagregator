'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { ProviderView } from '@/lib/server-api';

interface Props {
  providers: ProviderView[];
}

export function DocsSidebar({ providers }: Props) {
  const t = useTranslations('docs');
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of providers) {
      init[p.code] = pathname.includes(`/docs/methods/${p.code}`);
    }
    return init;
  });

  function toggle(code: string) {
    setOpen((s) => ({ ...s, [code]: !s[code] }));
  }

  return (
    <nav className="flex flex-col gap-1 text-sm">
      <Link href="/docs" className={linkClass(pathname === '/docs')}>
        {t('navIntro')}
      </Link>
      <Link
        href="/docs/getting-started"
        className={linkClass(pathname === '/docs/getting-started')}
      >
        {t('gettingStarted')}
      </Link>
      <Link
        href="/docs/authentication"
        className={linkClass(pathname === '/docs/authentication')}
      >
        {t('authentication')}
      </Link>
      <Link href="/docs/errors" className={linkClass(pathname === '/docs/errors')}>
        {t('errors')}
      </Link>
      <div className="mt-3 mb-1 text-xs uppercase tracking-wide text-muted-foreground">
        {t('navMethods')}
      </div>
      <Link
        href="/docs/methods"
        className={linkClass(pathname === '/docs/methods')}
      >
        {t('navAllProviders')}
      </Link>
      {providers.map((p) => {
        const isOpen = open[p.code] ?? false;
        return (
          <div key={p.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggle(p.code)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span className="font-medium">{p.publicName}</span>
            </button>
            {isOpen ? (
              <div className="ml-5 flex flex-col gap-0.5 border-l pl-2">
                <Link
                  href={`/docs/methods/${p.code}`}
                  className={linkClass(
                    pathname === `/docs/methods/${p.code}`,
                    'text-xs',
                  )}
                >
                  {t('navOverview')}
                </Link>
                {(p.models ?? []).map((m) => (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                      {m.publicName}
                    </div>
                    {(m.methods ?? []).map((mt) => {
                      const href = `/docs/methods/${p.code}/${m.code}/${mt.code}`;
                      return (
                        <Link
                          key={mt.id}
                          href={href}
                          className={linkClass(pathname === href, 'text-xs')}
                        >
                          {mt.publicName}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function linkClass(active: boolean, extra?: string) {
  return cn(
    'rounded-md px-2 py-1 hover:bg-muted',
    active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
    extra,
  );
}
