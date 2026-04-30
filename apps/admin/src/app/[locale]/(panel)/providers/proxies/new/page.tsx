import Link from 'next/link';
import { ProxyForm } from '@/components/admin/ProxyForm';

export default function NewProxyPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/providers/proxies"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Назад
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Новый прокси</h1>
        <p className="text-sm text-muted-foreground">
          Добавь прокси, который будешь привязывать к ProviderAccount-ам.
        </p>
      </header>
      <div className="rounded-lg border border-border bg-card p-6">
        <ProxyForm mode="create" />
      </div>
    </div>
  );
}
