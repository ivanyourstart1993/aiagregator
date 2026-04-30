import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface QuickAction {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  external?: boolean;
  primary?: boolean;
}

interface Props {
  title: string;
  actions: QuickAction[];
}

export function QuickActions({ title, actions }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => {
          const Icon = a.icon;
          const inner = (
            <div
              className={cn(
                'group flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors',
                a.primary
                  ? 'border-info/40 bg-info/5 hover:border-info hover:bg-info/10'
                  : 'border-border/60 bg-card hover:border-border hover:bg-accent/40',
              )}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md',
                    a.primary ? 'bg-info/15 text-info' : 'bg-muted text-foreground/80',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium leading-none text-foreground">{a.title}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">{a.description}</p>
              </div>
            </div>
          );
          if (a.external) {
            return (
              <a key={a.href} href={a.href} target="_blank" rel="noreferrer" className="block">
                {inner}
              </a>
            );
          }
          return (
            <Link key={a.href} href={a.href} className="block">
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
