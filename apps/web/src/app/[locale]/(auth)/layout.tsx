import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="px-6 py-6">
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          AI API Aggregator
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
