import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type MethodView, type ProviderView } from '@/lib/server-api';
import { DocsSidebar } from '@/components/docs/DocsSidebar';

async function loadProviders(): Promise<ProviderView[]> {
  try {
    const providers = await serverApi.catalogListProviders();
    let allMethods: MethodView[] = [];
    try {
      allMethods = await serverApi.catalogListMethods();
    } catch {
      allMethods = [];
    }
    return providers.map((p) => ({
      ...p,
      models: (p.models ?? []).map((m) => ({
        ...m,
        methods:
          m.methods ??
          allMethods.filter(
            (mt) => mt.providerCode === p.code && mt.modelCode === m.code,
          ),
      })),
    }));
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('docs');
  const providers = await loadProviders();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold">
            Aigenway
          </Link>
          <span className="text-sm text-muted-foreground">{t('title')}</span>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="w-72 shrink-0 border-r p-6">
          <DocsSidebar providers={providers} />
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
